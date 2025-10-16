#!/usr/bin/env bash
set -euo pipefail

# ========= User-configurable defaults =========
# Repo name to create (no spaces)
REPO_NAME="${REPO_NAME:-mcpcert}"
# Owner to create under; leave blank to create under the authenticated user.
# If you set an org here, the token must have permission to create repos in that org.
GITHUB_OWNER="${GITHUB_OWNER:-}"     # e.g. "your-org" or leave empty
# Private repo by default
VISIBILITY="${VISIBILITY:-private}"  # private|public|internal
# Optional description
DESCRIPTION="${DESCRIPTION:-Initial import of mcpcert}"
# GitHub host (change if using GitHub Enterprise)
GITHUB_HOST="${GITHUB_HOST:-github.com}"
API_BASE="https://api.${GITHUB_HOST}"

# ========= Preconditions =========
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1" >&2; exit 1; }; }
need git
need curl
need sed
# jq is optional; we’ll parse minimally without it, but nicer if present
HAS_JQ=0; command -v jq >/dev/null 2>&1 && HAS_JQ=1

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GITHUB_TOKEN is not set. Export a PAT with at least 'repo' scope." >&2
  echo "  export GITHUB_TOKEN=ghp_************************" >&2
  exit 1
fi

# Must run inside your project root
if [[ ! -d . ]]; then
  echo "ERROR: run this script from your project root (where your code lives)." >&2
  exit 1
fi

echo "==> Repository to create: ${GITHUB_OWNER:+$GITHUB_OWNER/}$REPO_NAME ($VISIBILITY)"
echo "==> GitHub host: $GITHUB_HOST"

# ========= Resolve authenticated user (if owner not given) =========
if [[ -z "$GITHUB_OWNER" ]]; then
  me_json="$(curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" "$API_BASE/user")" || {
    echo "ERROR: failed to query /user. Check GITHUB_TOKEN and network." >&2
    exit 1
  }
  if (( HAS_JQ )); then
    GITHUB_OWNER="$(printf '%s' "$me_json" | jq -r '.login')"
  else
    GITHUB_OWNER="$(printf '%s' "$me_json" | sed -n 's/.*"login":"\([^"]*\)".*/\1/p')"
  fi
  [[ -n "$GITHUB_OWNER" ]] || { echo "ERROR: could not resolve username from /user." >&2; exit 1; }
  echo "==> Creating under user: $GITHUB_OWNER"
else
  echo "==> Creating under org:  $GITHUB_OWNER"
fi

# ========= Create the repo (idempotent) =========
create_payload=$(cat <<JSON
{
  "name": "$REPO_NAME",
  "private": $( [[ "$VISIBILITY" == "private" ]] && echo true || echo false ),
  "description": "$DESCRIPTION",
  "has_issues": true,
  "has_projects": false,
  "has_wiki": false,
  "auto_init": false
}
JSON
)

create_url="$API_BASE/user/repos"
# If owner is an org, use the org endpoint
if [[ -n "$GITHUB_OWNER" ]]; then
  # Detect if owner is the same as the authenticated user; if not, assume org
  auth_is_owner=0
  auth_login="$GITHUB_OWNER"
  # We already have GITHUB_OWNER final; try creating under org endpoint if owner != authenticated user
  # Simpler: try org endpoint first when owner is set explicitly
  create_url="$API_BASE/orgs/$GITHUB_OWNER/repos"
fi

echo "==> Creating repo via: $create_url"
set +e
create_resp="$(curl -sS -w "\n%{http_code}\n" -X POST "$create_url" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "$create_payload")"
set -e

# Split body and status
http_status="$(printf '%s' "$create_resp" | tail -n1)"
body="$(printf '%s' "$create_resp" | sed '$d')"

if [[ "$http_status" == "201" ]]; then
  echo "==> Repo created."
elif [[ "$http_status" == "422" && "$body" == *"name already exists"* ]]; then
  echo "==> Repo already exists; continuing."
else
  # For user endpoint fallback if org failed due to permissions
  if [[ "$create_url" == *"/orgs/"* ]]; then
    echo "==> Org creation failed (status $http_status). Trying under user instead…"
    create_resp="$(curl -sS -w "\n%{http_code}\n" -X POST "$API_BASE/user/repos" \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -d "$create_payload")"
    http_status="$(printf '%s' "$create_resp" | tail -n1)"
    body="$(printf '%s' "$create_resp" | sed '$d')"
    if [[ "$http_status" == "201" ]]; then
      echo "==> Repo created under user."
    elif [[ "$http_status" == "422" && "$body" == *"name already exists"* ]]; then
      echo "==> Repo already exists under user; continuing."
    else
      echo "ERROR: create repo failed (HTTP $http_status): $body" >&2
      exit 1
    fi
  else
    echo "ERROR: create repo failed (HTTP $http_status): $body" >&2
    exit 1
  fi
fi

# ========= Ensure git repo initialized =========
if [[ ! -d .git ]]; then
  echo "==> Initializing git repository"
  git init
  # Set default branch to main (in case git < 2.28)
  git checkout -b main 2>/dev/null || git branch -M main
else
  # Ensure we’re on main (optional)
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "main" ]]; then
    git branch -M main
  fi
fi

# ========= Create a .gitignore if none exists =========
if [[ ! -f .gitignore ]]; then
  echo "==> Creating .gitignore (you can edit this as needed)"
  cat > .gitignore <<'IGN'
# OS junk
.DS_Store
Thumbs.db

# Python
__pycache__/
*.pyc
*.pyo
*.pyd
.venv/
venv/
.env
.env.*

# Node / UI builds
node_modules/
dist/
build/

# Docker & Compose artifacts
*.log
*.pid
*.sock

# Credentials / Keys (avoid committing secrets)
*.pem
*.key
*.pfx
*.crt
id_*
*.kubeconfig
.kube/
.secrets/
secret*/**

# Local tooling
.idea/
.vscode/
IGN
fi

# ========= Safety: show what will be committed =========
echo "==> Preview of files to commit:"
git add -A
git status --short

read -r -p "Continue and push to GitHub? (y/N) " ans
ans="${ans:-N}"
if [[ ! "$ans" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# ========= Commit =========
# If nothing staged (e.g., repo already committed), skip commit
if ! git diff --cached --quiet; then
  git commit -m "Initial import from $(hostname) on $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
else
  echo "==> Nothing new to commit; proceeding to push."
fi

# ========= Push =========
REMOTE_URL="https://${GITHUB_HOST}/${GITHUB_OWNER}/${REPO_NAME}.git"

# Use a one-off push with token in URL to avoid storing the token in git config.
echo "==> Pushing to $REMOTE_URL (branch: main)"
git push "https://${GITHUB_TOKEN}@${GITHUB_HOST}/${GITHUB_OWNER}/${REPO_NAME}.git" HEAD:refs/heads/main

# Now set a clean remote without token for future pulls/pushes (you may later add a credential helper/SSH)
if git remote | grep -q '^origin$'; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "==> Done."
echo "Repo: https://${GITHUB_HOST}/${GITHUB_OWNER}/${REPO_NAME}"
