#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  run_deerflow_regression.sh [options] [-- <extra playwright args>]

Options:
  --repo PATH            deer-flow git repo root. Defaults to current git root.
  --branch REF           Git ref to test. Default: upstream/main (latest bytedance/deer-flow main when upstream is configured)
  --worktree-dir PATH    Temporary worktree path.
  --suite NAME           mock or live. Default: mock
  --base-url URL         Base URL for Playwright. Defaults by suite.
  --start-cmd CMD        Command to start the app inside the worktree.
  --frontend-subdir DIR  Frontend directory. Default: frontend
  --use-repo-config      Use repo Playwright config instead of skill-bundled runner.
  --no-fetch             Skip git fetch for the selected ref.
  --keep-worktree        Keep temporary worktree after run.
  -h, --help             Show help.

Examples:
  run_deerflow_regression.sh --repo /path/to/deer-flow --suite mock
  run_deerflow_regression.sh --repo /path/to/deer-flow --suite live --base-url http://127.0.0.1:2026 -- --project=chromium
EOF
}

repo_root=""
branch_ref="upstream/main"
worktree_dir=""
suite="mock"
base_url=""
start_cmd=""
frontend_subdir="frontend"
use_repo_config=0
do_fetch=1
keep_worktree=0
declare -a extra_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      repo_root="$2"
      shift 2
      ;;
    --branch)
      branch_ref="$2"
      shift 2
      ;;
    --worktree-dir)
      worktree_dir="$2"
      shift 2
      ;;
    --suite)
      suite="$2"
      shift 2
      ;;
    --base-url)
      base_url="$2"
      shift 2
      ;;
    --start-cmd)
      start_cmd="$2"
      shift 2
      ;;
    --frontend-subdir)
      frontend_subdir="$2"
      shift 2
      ;;
    --use-repo-config)
      use_repo_config=1
      shift
      ;;
    --no-fetch)
      do_fetch=0
      shift
      ;;
    --keep-worktree)
      keep_worktree=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      extra_args=("$@")
      break
      ;;
    *)
      printf 'Unknown argument: %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$repo_root" ]]; then
  repo_root="$(git rev-parse --show-toplevel)"
fi

repo_root="$(cd "$repo_root" && pwd)"
git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null

case "$suite" in
  mock)
    if [[ -z "$base_url" ]]; then
      base_url="http://127.0.0.1:3000"
    fi
    ;;
  live)
    if [[ -z "$base_url" ]]; then
      base_url="http://127.0.0.1:2026"
    fi
    ;;
  *)
    printf 'Unsupported suite: %s\n' "$suite" >&2
    exit 2
    ;;
esac

if [[ ! "$base_url" =~ ^https?:// ]]; then
  printf 'Invalid --base-url %q: must start with http:// or https://\n' "$base_url" >&2
  exit 2
fi

if [[ -z "$worktree_dir" ]]; then
  worktree_dir="${TMPDIR:-/tmp}/deerflow-playwright-regression-main"
fi

timestamp="$(date '+%Y%m%d-%H%M%S')"
server_pid=""
artifact_dir=""
skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runner_dir="$skill_dir/assets/playwright-runner"

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi
  if [[ "$keep_worktree" -eq 0 ]]; then
    git -C "$repo_root" worktree remove --force "$worktree_dir" >/dev/null 2>&1 || true
    rm -rf "$worktree_dir"
  fi
}

trap cleanup EXIT

fetch_remote="upstream"
fetch_branch="main"
if [[ "$branch_ref" == */* ]]; then
  fetch_remote="${branch_ref%%/*}"
  fetch_branch="${branch_ref#*/}"
else
  fetch_branch="$branch_ref"
  branch_ref="upstream/$branch_ref"
fi

if ! git -C "$repo_root" remote get-url "$fetch_remote" >/dev/null 2>&1; then
  printf 'Git remote not found: %s\n' "$fetch_remote" >&2
  if [[ "$branch_ref" == "upstream/main" ]]; then
    printf 'Default mode expects an upstream remote that points to bytedance/deer-flow.\n' >&2
    printf 'Either add upstream or rerun with --repo and --branch for an explicit target.\n' >&2
  fi
  exit 6
fi

if [[ "$do_fetch" -eq 1 ]]; then
  git -C "$repo_root" fetch "$fetch_remote" "$fetch_branch" --prune
fi

if git -C "$repo_root" worktree list --porcelain | awk '/^worktree / {print $2}' | grep -Fxq "$worktree_dir"; then
  git -C "$repo_root" worktree remove --force "$worktree_dir" >/dev/null 2>&1 || true
fi
rm -rf "$worktree_dir"
git -C "$repo_root" worktree add --force --detach "$worktree_dir" "$branch_ref" >/dev/null

artifact_dir="$worktree_dir/.artifacts/playwright/$timestamp"
mkdir -p "$artifact_dir"

config_dir="$runner_dir"
if [[ "$use_repo_config" -eq 1 ]]; then
  if compgen -G "$worktree_dir/playwright.config.*" >/dev/null; then
    config_dir="$worktree_dir"
  elif compgen -G "$worktree_dir/$frontend_subdir/playwright.config.*" >/dev/null; then
    config_dir="$worktree_dir/$frontend_subdir"
  else
    printf 'No playwright.config.* found in %s or %s\n' "$worktree_dir" "$worktree_dir/$frontend_subdir" >&2
    printf 'Either scaffold repo Playwright files or rerun without --use-repo-config.\n' >&2
    exit 3
  fi
fi

if [[ ! -f "$config_dir/package.json" ]]; then
  printf 'No package.json found next to Playwright config at %s\n' "$config_dir" >&2
  exit 4
fi

if [[ ! -d "$config_dir/node_modules" ]]; then
  (
    cd "$config_dir"
    corepack enable >/dev/null 2>&1 || true
    if [[ -f pnpm-lock.yaml ]]; then
      pnpm install --frozen-lockfile
    else
      pnpm install --no-frozen-lockfile
    fi
  ) >"$artifact_dir/install.log" 2>&1
fi

wait_for_url() {
  local url="$1"
  local attempts=60
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if [[ -n "$start_cmd" ]]; then
  (
    cd "$worktree_dir"
    bash -lc "$start_cmd"
  ) >"$artifact_dir/app.log" 2>&1 &
  server_pid="$!"
fi

if ! wait_for_url "$base_url"; then
  printf 'Base URL did not become ready: %s\n' "$base_url" >&2
  printf 'Inspect logs under %s\n' "$artifact_dir" >&2
  exit 5
fi

export CI=1
export PLAYWRIGHT_BASE_URL="$base_url"
export DEERFLOW_E2E_SUITE="$suite"
export DEERFLOW_E2E_BASE_URL="$base_url"
export DEERFLOW_REPO_ROOT="$worktree_dir"
export PLAYWRIGHT_HTML_REPORT="$artifact_dir/html-report"

run_status=0
playwright_cmd=(pnpm exec playwright test --reporter=line,html,junit)
if [[ ${#extra_args[@]} -gt 0 ]]; then
  playwright_cmd+=("${extra_args[@]}")
fi
(
  cd "$config_dir"
  corepack enable >/dev/null 2>&1 || true
  "${playwright_cmd[@]}"
) > >(tee "$artifact_dir/test.log") 2>&1 || run_status=$?

git -C "$worktree_dir" rev-parse HEAD >"$artifact_dir/tested-revision.txt"

cat >"$artifact_dir/run-summary.txt" <<EOF
suite=$suite
ref=$branch_ref
base_url=$base_url
repo_root=$repo_root
worktree_dir=$worktree_dir
config_dir=$config_dir
timestamp=$timestamp
exit_code=$run_status
EOF

printf 'Artifacts: %s\n' "$artifact_dir"
exit "$run_status"
