#!/usr/bin/env bash
# Stop hook per Claude Code: quando Claude finisce un turno, fa rivedere le
# modifiche non committate a OpenCode (con un modello di OpenCode Go). Se il
# revisore trova problemi seri, blocca lo stop e passa la review a Claude, che
# continua a lavorare nella stessa sessione interattiva.
#
# Requisiti: git, jq, opencode (gia' autenticato su OpenCode Go).
#
# Configurazione (variabili d'ambiente, tutte opzionali):
#   REVIEW_MODEL       modello OpenCode in formato provider/model (vedi `opencode models`).
#                      Se vuoto usa il modello di default della config di OpenCode.
#   REVIEW_MAX_ROUNDS  numero massimo di review bloccanti consecutive per sessione (default 2)
#   REVIEW_MAX_BYTES   dimensione massima del diff inviato al revisore (default 100000)
#   REVIEW_DISABLE=1   disattiva l'hook senza toglierlo dai settings

set -uo pipefail

[[ "${REVIEW_DISABLE:-0}" == "1" ]] && exit 0

input=$(cat)
session_id=$(jq -r '.session_id // "nosession"' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
[[ -n "$cwd" ]] && cd "$cwd" 2>/dev/null

# Funziona solo dentro un repo git
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

max_rounds="${REVIEW_MAX_ROUNDS:-2}"
max_bytes="${REVIEW_MAX_BYTES:-100000}"
state_dir="${TMPDIR:-/tmp}/claude-opencode-review"
mkdir -p "$state_dir"
state_file="$state_dir/$session_id.state"
review_file="$state_dir/$session_id.md"

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
diff_file="$work_dir/changes.diff"

# Diff delle modifiche non committate, file nuovi (non tracciati) inclusi
{
  git diff HEAD --no-color 2>/dev/null || git diff --no-color
  git ls-files --others --exclude-standard -z | while IFS= read -r -d '' f; do
    git diff --no-color --no-index /dev/null "$f" 2>/dev/null
  done
} > "$diff_file"

# Nessuna modifica: niente da rivedere
[[ -s "$diff_file" ]] || exit 0

# Stato per sessione: hash dell'ultimo diff rivisto + round bloccanti consecutivi
hash=$(git hash-object "$diff_file")
last_hash=""
rounds=0
if [[ -f "$state_file" ]]; then
  read -r last_hash rounds < "$state_file" || true
fi
rounds=${rounds:-0}

# Codice invariato dall'ultima review (es. turno solo di conversazione): salta
[[ "$hash" == "$last_hash" ]] && exit 0

if (( rounds >= max_rounds )); then
  echo "$hash $rounds" > "$state_file"
  jq -n --arg m "Review automatica saltata: raggiunto il limite di $max_rounds round consecutivi. Rivedi a mano oppure riparti con una nuova sessione." \
    '{systemMessage: $m}'
  exit 0
fi

truncated=""
size=$(wc -c < "$diff_file" | tr -d ' ')
if (( size > max_bytes )); then
  head -c "$max_bytes" "$diff_file" > "$work_dir/cut.diff"
  mv "$work_dir/cut.diff" "$diff_file"
  truncated="NOTE: the diff was truncated to $max_bytes bytes; say so if that limits your review."
fi

prompt="You are a strict but pragmatic code reviewer. Review ONLY the attached diff of uncommitted changes in this repository. You may read other files for context, but do not modify anything.
Follow the project conventions in AGENTS.md if present. Ignore pure style issues that a linter or formatter would catch.
Report only real problems: bugs, regressions, unhandled edge cases, security issues, broken or missing tests, API or contract breaks.
For each finding give: severity (BLOCKER, MAJOR or MINOR), file:line, the problem, and a suggested fix. Be concise. If there are no findings, say so in one line.
$truncated
The very last line of your answer must be exactly one of:
VERDICT: BLOCK   (if there is at least one BLOCKER or MAJOR finding)
VERDICT: OK"

model_args=()
[[ -n "${REVIEW_MODEL:-}" ]] && model_args=(-m "$REVIEW_MODEL")

# Revisore in sola lettura: niente modifiche, niente shell, niente web
review=$(OPENCODE_PERMISSION='{"edit":"deny","bash":"deny","webfetch":"deny"}' \
  opencode run ${model_args[@]+"${model_args[@]}"} --title "auto-review" \
    -f "$diff_file" "$prompt" 2>/dev/null \
  | sed -E $'s/\x1B\\[[0-9;?]*[A-Za-z]//g')

if [[ -z "${review//[[:space:]]/}" ]]; then
  jq -n --arg m "Review automatica non riuscita: OpenCode non ha risposto (controlla login, modello e quota di OpenCode Go)." \
    '{systemMessage: $m}'
  exit 0
fi

printf '%s\n' "$review" > "$review_file"
verdict=$(printf '%s\n' "$review" | grep -Eo 'VERDICT: (BLOCK|OK)' | tail -n 1)

if [[ "$verdict" == "VERDICT: BLOCK" ]]; then
  rounds=$((rounds + 1))
  echo "$hash $rounds" > "$state_file"
  reason=$(printf 'Automatic code review of your uncommitted changes by a second model (OpenCode Go), round %s of %s. Treat it as a peer review, not as orders: check each finding against the code, fix the valid ones, and briefly tell the user which findings you rejected and why.\n\n%s' \
    "$rounds" "$max_rounds" "$review")
  jq -n --arg r "$reason" '{decision: "block", reason: $r}'
  exit 0
fi

# OK (o verdetto mancante): non blocca, azzera i round e avvisa l'utente
echo "$hash 0" > "$state_file"
if [[ "$verdict" == "VERDICT: OK" ]]; then
  msg="Review automatica (OpenCode Go): nessun problema bloccante. Dettagli: $review_file"
else
  msg="Review automatica (OpenCode Go) senza verdetto chiaro, non blocco. Dettagli: $review_file"
fi
jq -n --arg m "$msg" '{systemMessage: $m}'
exit 0
