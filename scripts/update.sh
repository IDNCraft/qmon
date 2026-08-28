#!/usr/bin/env bash

set -euo pipefail

RELEASE_URL="${QMON_RELEASE_URL:-https://github.com/IDNCraft/qmon/releases/latest}"
REPOSITORY_REF="${1:-${QMON_REPO_REF:-}}"
INSTALLER_URL="${QMON_INSTALLER_URL:-}"
TEMP_INSTALLER=""

fail() {
    echo "Qmon update failed: $1" >&2
    exit 1
}

cleanup() {
    if [[ -n "$TEMP_INSTALLER" && -f "$TEMP_INSTALLER" ]]; then
        rm -f "$TEMP_INSTALLER"
    fi
}

if [[ -z "${BASH_VERSION:-}" ]]; then
    echo "This updater requires bash. Run with: curl -fsSL https://raw.githubusercontent.com/IDNCraft/qmon/main/scripts/update.sh | bash" >&2
    exit 1
fi

if [[ $# -gt 1 ]]; then
    fail "usage: update.sh [release-ref]"
fi

command -v curl >/dev/null 2>&1 || fail "curl is required."

if [[ -z "$REPOSITORY_REF" ]]; then
    RELEASE_TARGET="$(curl -fsSL -o /dev/null -w '%{url_effective}' "$RELEASE_URL")" || fail "unable to resolve the latest release."
    REPOSITORY_REF="${RELEASE_TARGET##*/}"
    REPOSITORY_REF="${REPOSITORY_REF%%\?*}"
fi

if [[ ! "$REPOSITORY_REF" =~ ^v[0-9]+(\.[0-9]+){2}([.-][0-9A-Za-z.-]+)?$ ]]; then
    fail "invalid release ref '$REPOSITORY_REF'. Expected a tag like v1.5.0."
fi

if [[ -z "$INSTALLER_URL" ]]; then
    INSTALLER_URL="https://raw.githubusercontent.com/IDNCraft/qmon/${REPOSITORY_REF}/scripts/install.sh"
fi

TEMP_INSTALLER="$(mktemp "${TMPDIR:-/tmp}/qmon-update.XXXXXX")" || fail "unable to create a temporary file."
trap cleanup EXIT

printf 'Updating Qmon to %s...\n' "$REPOSITORY_REF"
curl -fsSL "$INSTALLER_URL" -o "$TEMP_INSTALLER" || fail "unable to download the installer."
QMON_REPO_REF="$REPOSITORY_REF" bash "$TEMP_INSTALLER"
