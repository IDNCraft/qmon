# AGENTS

Agent-facing guide for the Qmon monorepo. Read this before touching code.

## Project Overview

Qmon = monorepo of 4 components for monitoring AI provider quotas (Claude, Codex, Antigravity, Copilot, OpenCode).

| Component | Path | Stack | Role |
| --- | --- | --- | --- |
| API daemon | `api/` | Go + Gin + SQLite (embedded goose migrations) | **Source of truth**: auth, credentials, quota probes, app settings |
| TUI | `cli/` | Bun + OpenTUI (React) | Talks to API via REST; auto-spawns local `qmon-server` (sidecar) |
| Mobile app | `mobile/` | Flutter | Companion dashboard → same API |
| Home widget | `mobile/android/` | Native Android widget | Real-time quota view on home screen |

Key invariants:

- API daemon is the only component that touches provider data; CLI/mobile consume it via REST under `api/v1` (JWT-protected except intentionally-public routes — see `api/internal/router/router.go`).
- Probes are read-only scans of external providers' files, run in parallel, with isolated `XDG_CONFIG_HOME`/`XDG_DATA_HOME` — the user's real provider config is never mutated.
- The provider list lives in one place: `GetSnapshot` (`api/internal/quota/service.go`). Grep there for the current set — this doc does not track it.
- Two local state locations matter: qmon's own DB/config under `~/.local/share/qmon` (sidecar `sidecar.pid`/`sidecar.log` live here too, XDG-aware) and the CLI config `~/.qmon-cli.json` (see `cli/src/sidecar.ts`, `cli/src/config.ts`).

### Adding a Provider (checklist)

Generic shape — copy an existing provider (`claude` or `opencode`) as reference:

1. Probe logic in `api/internal/quota/`.
2. Login handler in `api/internal/provider/*_login.go` (if OAuth).
3. Register auth routes in `api/internal/router/router.go` + add to the probe list in `GetSnapshot`.
4. UI labels/rendering in `cli/` and `mobile/`.

## Do

- Use Bun for everything JS/TS: `bun install`, `bun run <script>`, `bunx <tool>`.
- Follow Go layering: `router → handler → service → repository`; inject deps via constructor (`NewService`).
- Co-locate Go tests (`*_test.go`) next to the code under test.
- Put UI components in `cli/src/components/`, hooks in `cli/src/hooks/`.
- Keep Flutter structure: `lib/screens/`, `lib/widgets/`, `lib/services/`, `lib/theme/`, `lib/models/`.
- When adding a key to `.env.example`, always add the same key to the local `.env` too — filled with a real working value. Never leave `.env` behind `.env.example`; the app must run immediately after the change.
- Check `graphify-out/graph.json` for code topology instead of re-scanning the repo.

## Don't

- Don't use `npm`, `npx`, `yarn`, or `pnpm` anywhere in this project.
- Don't mutate the user's real provider config/DBs — always go through XDG-isolated probes.
- Don't bypass the API daemon: no direct provider-DB reads/writes from `cli/` or `mobile/`.
- Don't add a key to `.env.example` without also adding a real value for it in `.env`.
- Don't commit secrets/credentials to `.env.example`, source code, or docs.
- Don't make clone, setup, or CI checks depend on Graphify — it is optional.
- Don't add a protected endpoint without `middleware.Auth()` unless intentionally public.

## Build & Run

From repo root:

```bash
make build          # build api + cli into build/ (qmon-server, qmon)
make install        # build + copy binaries to ~/.local/bin
make clean          # remove build/
make mobile-dev     # flutter run against host IP:8080 (override: HOST_IP=<ip>)
```

Individual:

```bash
# API
cd api && make dev-plain        # go run main.go (no live reload)
cd api && air                   # dev with live reload
cd api && go build -o ../build/qmon-server main.go

# CLI
cd cli && bun run dev           # run TUI from source
```

## Testing & Checks

```bash
# Go
cd api && go test ./...

# CLI (TS)
cd cli && bun run lint          # eslint
cd cli && bun run typecheck     # tsc --noEmit
cd cli && bun run format:check  # prettier

# Flutter
cd mobile && flutter test
```

Run the narrowest check that covers your change; rerun after fixing.

## Database & Migrations

- qmon DB: `~/.local/share/qmon/database.sqlite` (override via `DATABASE_URL`). WAL + `busy_timeout=5000`.
- Migrations: `api/database/migrations/*.sql` (goose, embedded in the binary).

```bash
cd api && make migrate-up        # apply pending migrations
cd api && make migrate-down      # rollback last migration
cd api && make migrate-status    # show migration status
cd api && make migrate-create name=xxx sql   # scaffold a new migration
cd api && make seed              # run all seeders (api/database/seeders/)
```

## Git

After vibecode:

- Commit title → Conventional Commit: `<type>(<scope>): <imperative summary>`.
- Commit body → what changed, why, main impact; blank line after title.
- Branch → `dev#<lowercase-kebab-context>`, max 3 hyphens after `#`. Example: `dev#hello-world-foryou`.
- Final result → report title + body + branch.

## Graphify Team Sync

- Graphify is optional; nothing in clone/setup/dev/checks may depend on it.
- On a fresh clone, check `graphify-out/graph.json` and `graphify-out/manifest.json`. Both exist → reuse the shared graph, skip extraction.
- Either missing and Graphify needed → run `graphify . --update --code-only` from the repo root.
- Keep shared graph outputs in Git; keep machine-local Graphify metadata ignored.

## Engineering Loop

All provider-backed tools/workflows → support loop:

`prompt scan` → missing/ambiguous/explicit choice? → `vscode_askQuestions` → execute → validate → recommend.

- Ask feature supports freeform/options/multi-select, provider-independent.
- Unclear or destructive risk → ask, never guess.
- Secrets (password/token/API key) → terminal only; never via ask feature.
- Useful follow-up → `Next Recommended Prompt` + highest-value action + prereq/blocker + 1 ready-to-copy prompt.
- Self-contained done → `No follow-up needed`.
- No filler/invented work.
