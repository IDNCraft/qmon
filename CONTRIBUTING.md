# Contributing to Qmon

Thank you for contributing to Qmon. Qmon is a monorepo with a Go API daemon, a Bun and React Ink CLI, and an optional Flutter mobile app.

## Prerequisites

- [Git](https://git-scm.com/) 2.0 or newer
- [Go](https://go.dev/dl/) 1.21 or newer
- [Bun](https://bun.sh/) 1.0 or newer
- [Make](https://www.gnu.org/software/make/)
- [Flutter](https://flutter.dev/) and Android or iOS tooling for mobile changes only

## Setup

Fork the repository, clone your fork, then install CLI dependencies and build the core binaries:

```bash
git clone <your-fork-url>
cd qmon
cd cli && bun install
cd ..
make build
```

`make install` copies binaries to `~/.local/bin`; use it only when you need a local installation. It is not required for normal development.

## Development Workflow

1. Create a branch using the `dev#<lowercase-kebab-context>` format.
2. Keep each change focused on one feature, fix, or documentation update.
3. Run the component-specific checks before opening a pull request.
4. Describe affected components and validation results in the pull request.

### API

Run the API without live reload from the `api` directory:

```bash
cd api
make dev-plain
```

Run Go tests:

```bash
cd api
go test ./...
```

Use the existing API Makefile for migrations and seeders. Never include credentials, provider data, or local database values in commits.

### CLI

From the `cli` directory:

```bash
bun run typecheck
bun run lint
bun run format:check
```

### Mobile

For mobile changes from the `mobile` directory:

```bash
flutter pub get
flutter analyze
flutter test
```

## Checks

Run the checks relevant to the area you changed. For a core build, run:

```bash
make build
```

For a cross-layer change, run the API, CLI, and mobile checks listed above when the required toolchains are available.

## Graphify (Optional)

Graphify is optional and is not required for setup, development, checks, or pull requests.

- If `graphify-out/graph.json` and `graphify-out/manifest.json` already exist after cloning, reuse them and skip extraction.
- If either file is missing and you want a repository graph, run this from the repository root:

```bash
graphify . --update --code-only
```

- Shared graph output may be committed; do not commit local Graphify metadata.

## Commit Messages

Use Conventional Commits:

```text
<type>(<scope>): <imperative summary>
```

Keep the commit body focused on what changed, why it changed, and the impact. Do not commit generated secrets, local configuration, or unrelated formatting changes.

## Pull Requests

- Explain the problem, the solution, and the affected layer.
- List the checks you ran and note any unavailable toolchain.
- Include screenshots or recordings for CLI or mobile UI changes when useful.
- Mention migration, configuration, or compatibility impact.
- Update documentation when behavior or setup changes.

## Project Structure

| Directory | Purpose                                         |
| --------- | ----------------------------------------------- |
| `api/`    | Go API daemon, storage, migrations, and seeders |
| `cli/`    | Bun and React Ink terminal interface            |
| `mobile/` | Flutter mobile companion app and Android widget |
| `docs/`   | Documentation and images                        |
| `build/`  | Local build artifacts                           |

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
