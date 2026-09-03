#!/usr/bin/env bash
# scripts/rehearse-pending-migrations.sh
#
# Rehearses the "release-like upgrade path" required by CONTRIBUTING.md and
# docs/Tracknologia_Supabase_Migration_Rules.md (section 25 "Rules After
# Acceptance"):
#
#   existing release-like database (shared history applied)
#   -> apply ONLY the pending migrations of this branch
#   -> verify behavior with the database integration suite
#
# The script also FAILS if any already-shared (base) migration has been
# edited: accepted/shared migration history is forward-only and immutable.
#
# What it does:
#  1. Resolves the base ref (REHEARSAL_BASE_REF, or <remote>/staging).
#  2. Detects the pending migrations (files ADDED relative to the base ref)
#     and verifies no shared migration changed.
#  3. Boots a scratch Supabase lab on offset ports so the running dev stack
#     is never disturbed.
#  4. Applies the BASE migration history only (release-like previous state).
#  5. Copies the pending migration(s) in and runs `db push --local`, i.e. the
#     apply-pending-only upgrade.
#  6. Runs the full database integration suite against the upgraded lab.
#     With no integrations-relevant changes the suite passes as-is. On local
#     dev stacks the environment-specific "anon can SELECT raw providers"
#     failure (local images auto-grant anon defaults) is only tolerated when
#     REHEARSAL_ALLOW_ANON_QUIRK=1 is set; otherwise it is treated like any
#     other failure (fail-closed). CI stacks do not exhibit the quirk.
#  7. If no migration is pending relative to the base ref, the rehearsal is
#     INAPPLICABLE and exits 0; shared migration edits/deletions are still
#     fatal (forward-only is immutable) so the check cannot be silently
#     skipped.
#  8. Tears the lab down (trap) and prints an evidence summary.
#
# Usage:  pnpm rehearse:migrations [--base <git-ref>]
# Env:    REHEARSAL_BASE_REF           base git ref (default: staging via a remote)
#         REHEARSAL_PORT_OFFSET        offset added to every lab port (default 4000)
#         REHEARSAL_TMPDIR             parent dir for the scratch lab (default: $TMPDIR or /tmp)
#         REHEARSAL_ALLOW_ANON_QUIRK   set to 1 to tolerate the local-only
#                                      "anon cannot SELECT raw providers" quirk
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

: "${REHEARSAL_PORT_OFFSET:=4000}"

log() { printf '[rehearse] %s\n' "$*"; }
die() { printf '[rehearse] ERROR: %s\n' "$*" >&2; exit 1; }

supabase_bin="supabase"
if ! command -v supabase >/dev/null 2>&1; then
  supabase_bin="npx supabase"
  log "supabase CLI not on PATH; falling back to: npx supabase"
fi

# Every CLI invocation runs from the lab project root so the scratch project
# (config, containers, state) is fully self-contained and the repo's running
# dev stack is never touched.
cli() { ( cd "$lab_root" && $supabase_bin "$@" ); }

base_ref="${REHEARSAL_BASE_REF:-}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      if [ -z "${2:-}" ]; then
        die "--base requires a git ref (e.g. --base staging)"
      fi
      base_ref="$2"
      shift 2
      ;;
    --base=*)
      base_ref="${1#--base=}"
      shift
      ;;
    *)
      die "unexpected argument: $1 (usage: pnpm rehearse:migrations [--base <git-ref>])"
      ;;
  esac
done
if [ -z "$base_ref" ]; then
  base_ref="staging"
fi

has_ref() { git rev-parse --verify --quiet "$1" >/dev/null 2>&1; }

if has_ref "$base_ref"; then
  log "using base ref $base_ref"
else
  resolve_to=
  for remote in $(git remote); do
    candidate="$remote/$base_ref"
    if has_ref "$candidate"; then
      resolve_to="$candidate"
      break
    fi
  done
  if [ -n "$resolve_to" ]; then
    base_ref="$resolve_to"
    log "using base ref $base_ref"
  else
    log "fetching origin/$base_ref (shallow) to resolve the base baseline"
    git fetch --depth 1 origin "$base_ref" >/dev/null 2>&1 || true
    if has_ref "FETCH_HEAD"; then
      base_ref="FETCH_HEAD"
      log "using base ref FETCH_HEAD from origin/$base_ref"
    else
      die "cannot resolve base ref '$base_ref' (set REHEARSAL_BASE_REF or ensure a staging remote exists)"
    fi
  fi
fi

base_sha="$(git rev-parse --short "$base_ref")"
log "base baseline: $base_ref ($base_sha)"

changed="$(git diff --name-only "$base_ref" -- supabase/migrations || true)"
pending="$(git diff --name-only --diff-filter=A "$base_ref" -- supabase/migrations || true)"
deleted="$(git diff --name-only --diff-filter=D "$base_ref" -- supabase/migrations || true)"
modified="$(git diff --name-only --diff-filter=M "$base_ref" -- supabase/migrations || true)"

if [ -n "$deleted" ] || [ -n "$modified" ]; then
  die "shared migration history must stay immutable (forward-only). Modified/deleted base migrations:\n$(printf '%s\n' $deleted $modified)"
fi

if [ -z "$pending" ]; then
  log "no pending (added) migrations relative to $base_ref"
  printf '============ rehearsal summary ============\n'
  printf 'base baseline   : %s (%s)\n' "$base_ref" "$base_sha"
  printf 'pending set     : (none)\n'
  printf 'shared changes  : none (forward-only verified)\n'
  printf 'suite result    : INAPPLICABLE (no migration to rehearse)\n'
  printf '===========================================\n'
  exit 0
fi

log "shared migrations unchanged relative to base (forward-only verified)"
log "pending migrations to apply on upgrade:"
printf '  %s\n' $pending

lab_base_dir="${REHEARSAL_TMPDIR:-${TMPDIR:-/tmp}}"
mkdir -p "$lab_base_dir"
lab_root="$(mktemp -d "$lab_base_dir/tracknologia-rehearsal-XXXXXX")"
mkdir -p "$lab_root/supabase/migrations"
touch "$lab_root/supabase/seed.sql"

cleanup() {
  log "tearing down rehearsal lab ($lab_root)"
  cli stop --no-backup >/dev/null 2>&1 || true
  rm -rf "$lab_root"
}
trap cleanup EXIT

log "initializing scratch Supabase lab"
cli init >/dev/null

log "remapping lab ports by +$REHEARSAL_PORT_OFFSET (dev stack untouched)"
export REHEARSAL_PORT_OFFSET
perl -pi -e 'if (/^(\s*(?:port|shadow_port))\s*=\s*(\d+)\s*$/) { my $n = $2 + $ENV{"REHEARSAL_PORT_OFFSET"}; $_ = "$1 = $n\n"; }' "$lab_root/supabase/config.toml"

for m in supabase/migrations/*.sql; do
  case " $pending " in
    *" $m "*) ;;
    *) cp "$m" "$lab_root/supabase/migrations/" ;;
  esac
done

log "starting lab stack"
cli start >/dev/null

log "applying BASE migration history only (release-like previous state)"
cli db reset >/dev/null

log "copying pending migration(s) and applying ONLY pending (upgrade path)"
for m in $pending; do
  cp "$m" "$lab_root/supabase/migrations/"
done
( cd "$lab_root" && printf 'y\n' | $supabase_bin --yes db push --local ) >/dev/null

# db push does not restart the API/PostgREST, so its cached schema (loaded at
# start time) would miss the newly applied functions. Real upgrades refresh the
# API the same way; bounce the lab stack so the integration suite exercises
# the post-upgrade schema, exactly like `supabase db reset` does for the dev
# stack in the clean-replay path. `stop` preserves the database volume, so the
# base + pending state survives the bounce.
log "bouncing lab stack so the API reloads the upgraded schema"
cli stop >/dev/null 2>&1 || true
cli start >/dev/null

log "exporting lab environment"
lab_env="$(cli status -o env)"
eval "$lab_env"
# Always target the LAB, even if stale SUPABASE_TEST_* values were inherited
# from the environment (e.g. the dev-stack export earlier in a CI job).
export SUPABASE_TEST_URL="$API_URL"
export SUPABASE_TEST_ANON_KEY="$ANON_KEY"
export SUPABASE_TEST_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
log "lab API URL: $SUPABASE_TEST_URL"

results="$lab_root/db-suite.log"
log "running the database integration suite against the upgraded lab"
set +e
pnpm exec vitest run tests/integration >"$results" 2>&1
rc=$?
set -e

if [ "$rc" -eq 0 ]; then
  log "database integration suite PASSED against the upgraded lab"
elif [ "${REHEARSAL_ALLOW_ANON_QUIRK:-0}" = "1" ]; then
  known_anon_failure=0
  if grep -q "Tests  1 failed | " "$results" \
     && grep -q "anon cannot SELECT raw providers" "$results" \
     && ! grep -qE "Tests  [2-9][0-9]* failed" "$results"; then
    known_anon_failure=1
  fi
  if [ "$known_anon_failure" -eq 1 ]; then
    printf '[rehearse] warning: exactly one suite failure is the known local env-specific\n'
    printf '            "anon cannot SELECT raw providers" default-grant quirk (CI stacks are green).\n'
    printf '            Treating the rehearsal as passed (REHEARSAL_ALLOW_ANON_QUIRK=1).\n'
    rc=0
  fi
fi

if [ "$rc" -ne 0 ]; then
  log "database integration suite FAILED against the upgraded lab:"
  sed -n '/RUN /,$p' "$results" | tail -40 >&2
fi

printf '============ rehearsal summary ============\n'
printf 'base baseline   : %s (%s)\n' "$base_ref" "$base_sha"
printf 'pending set     : %s\n' "$(printf '%s ' $pending)"
printf 'shared changes  : none (forward-only verified)\n'
printf 'lab api url     : %s\n' "${SUPABASE_TEST_URL:-}"
printf 'suite result    : %s\n' "$([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
printf '===========================================\n'

exit "$rc"