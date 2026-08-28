#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_URL="${QMON_REPO_URL:-https://github.com/IDNCraft/qmon.git}"
REPOSITORY_REF="${QMON_REPO_REF:-main}"
INSTALL_DIR="${QMON_INSTALL_DIR:-$HOME/.local/bin}"
CONFIGURE_PATH="${QMON_CONFIGURE_PATH:-1}"
LOG_FILE="${TMPDIR:-/tmp}/qmon-install-$(date +%Y%m%d-%H%M%S).log"
TEMP_ROOT=""

if [[ -z "${BASH_VERSION:-}" ]]; then
    echo "This installer requires bash. Run with: curl -fsSL https://raw.githubusercontent.com/IDNCraft/qmon/main/scripts/install.sh | bash"
    exit 1
fi

cleanup() {
    if [[ -n "$TEMP_ROOT" && -d "$TEMP_ROOT" ]]; then
        rm -rf "$TEMP_ROOT"
    fi
}

fail() {
    echo "Qmon installation failed: $1"
    echo "See $LOG_FILE for details."
    exit 1
}

run_with_spinner() {
    local message="$1"
    shift
    if [[ ! -t 2 ]]; then
        "$@" >>"$LOG_FILE" 2>&1
        return $?
    fi
    local spinner_chars='|/-\'
    local i=0
    (
        while true; do
            printf "  %s [%s]  \r" "$message" "${spinner_chars:$i:1}" >&2
            i=$(( (i + 1) % 4 ))
            sleep 0.1
        done
    ) &
    local spinner_pid=$!
    "$@" >>"$LOG_FILE" 2>&1
    local exit_code=$?
    kill "$spinner_pid" 2>/dev/null
    wait "$spinner_pid" 2>/dev/null || true
    printf "   \r" >&2
    return $exit_code
}

install_cli_dependencies() {
    cd "$BUILD_ROOT/cli"
    bun install --frozen-lockfile
}

build_and_install() {
    make -C "$BUILD_ROOT" install "BIN_DIR=$INSTALL_DIR"
}

configure_shell_path() {
    local install_dir="$1"
    local shell_name="${SHELL##*/}"
    local shell_rc=""
    local path_value="$install_dir"

    case "$shell_name" in
        zsh) shell_rc="${ZDOTDIR:-$HOME}/.zshrc" ;;
        bash)
            if [[ "$OSTYPE" == darwin* ]]; then
                shell_rc="$HOME/.bash_profile"
            else
                shell_rc="$HOME/.bashrc"
            fi
            ;;
        *) return 0 ;;
    esac

    if [[ "$install_dir" == "$HOME/"* ]]; then
        path_value="\$HOME/${install_dir#"$HOME/"}"
    fi

    local path_line="export PATH=\"$path_value:\$PATH\""
    if [[ ! -f "$shell_rc" ]] && ! touch "$shell_rc" 2>/dev/null; then
        echo "Warning: unable to update PATH in $shell_rc."
        return 0
    fi

    if ! grep -Fqx "$path_line" "$shell_rc" 2>/dev/null; then
        if printf '\n%s\n' "$path_line" >>"$shell_rc"; then
            echo "PATH updated in $shell_rc."
        else
            echo "Warning: unable to update PATH in $shell_rc."
            return 0
        fi
    fi

    case ":${PATH:-}:" in
        *":$install_dir:"*) ;;
        *) export PATH="$install_dir:${PATH:-}" ;;
    esac
}

trap cleanup EXIT

for dependency in go bun make; do
    command -v "$dependency" >/dev/null 2>&1 || fail "$dependency is required."
done

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
LOCAL_ROOT=""
if [[ -f "$SCRIPT_PATH" ]]; then
    CANDIDATE_ROOT="$(cd -- "$(dirname -- "$SCRIPT_PATH")/.." && pwd)"
    if [[ -f "$CANDIDATE_ROOT/Makefile" && -d "$CANDIDATE_ROOT/api" && -d "$CANDIDATE_ROOT/cli" ]]; then
        LOCAL_ROOT="$CANDIDATE_ROOT"
    fi
fi

if [[ -n "$LOCAL_ROOT" ]]; then
    BUILD_ROOT="$LOCAL_ROOT"
else
    command -v git >/dev/null 2>&1 || fail "git is required when installing via curl."
    TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/qmon-install.XXXXXX")"
    if ! run_with_spinner "Cloning repository..." git clone --depth 1 --branch "$REPOSITORY_REF" "$REPOSITORY_URL" "$TEMP_ROOT/qmon"; then
        fail "unable to clone $REPOSITORY_URL ($REPOSITORY_REF)."
    fi
    BUILD_ROOT="$TEMP_ROOT/qmon"
fi

mkdir -p "$INSTALL_DIR" || fail "unable to create install directory $INSTALL_DIR."

if ! run_with_spinner "Installing CLI dependencies..." install_cli_dependencies; then
    fail "unable to install CLI dependencies."
fi

if ! run_with_spinner "Building and installing qmon and qmon-server..." build_and_install; then
    fail "unable to build or install Qmon."
fi

[[ -x "$INSTALL_DIR/qmon" ]] || fail "qmon was not installed to $INSTALL_DIR."
[[ -x "$INSTALL_DIR/qmon-server" ]] || fail "qmon-server was not installed to $INSTALL_DIR."

if [[ "$CONFIGURE_PATH" == "1" ]]; then
    configure_shell_path "$INSTALL_DIR"
fi

hash -r 2>/dev/null || true

echo "Qmon installed successfully in $INSTALL_DIR."
echo "Run: qmon"
echo "Server: qmon-server"
echo "Open a new terminal to use the commands from your PATH."
