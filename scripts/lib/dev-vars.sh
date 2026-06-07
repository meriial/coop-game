# Shared helpers for reading server/.dev.vars and validating allowed email domains.
# Source from repo root: source "$(dirname "$0")/scripts/lib/dev-vars.sh"

_DEV_VARS_FILE="${DEV_VARS_FILE:-server/.dev.vars}"

read_dev_var() {
  local name="$1"
  if [ -f "$_DEV_VARS_FILE" ]; then
    local value
    value=$(grep -E "^${name}=" "$_DEV_VARS_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -n "$value" ]; then
      printf '%s' "$value"
      return 0
    fi
  fi
  # shellcheck disable=SC2154
  eval "printf '%s' \"\${$name:-}\""
}

allowed_domains_regex() {
  local raw="${1:-$(read_dev_var ALLOWED_EMAIL_DOMAINS)}"
  if [ -z "$raw" ]; then
    echo "Error: ALLOWED_EMAIL_DOMAINS is not set (server/.dev.vars or env)." >&2
    return 1
  fi
  local IFS=','
  local domain
  local pattern='@('
  local first=1
  for domain in $raw; do
    domain="${domain#"${domain%%[![:space:]]*}"}"
    domain="${domain%"${domain##*[![:space:]]}"}"
    [ -z "$domain" ] && continue
    if [ "$first" -eq 1 ]; then
      first=0
    else
      pattern="${pattern}|"
    fi
    pattern="${pattern}$(printf '%s' "$domain" | sed 's/\./\\./g')"
  done
  pattern="${pattern})$"
  printf '%s' "$pattern"
}

validate_email_domain() {
  local email="$1"
  local domains="${2:-$(read_dev_var ALLOWED_EMAIL_DOMAINS)}"
  local regex
  regex=$(allowed_domains_regex "$domains") || return 2
  if printf '%s' "$email" | grep -qE "$regex"; then
    return 0
  fi
  return 1
}
