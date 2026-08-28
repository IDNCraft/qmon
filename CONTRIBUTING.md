# Contributing to Qmon

Thank you for contributing to Qmon. Qmon is a monorepo with a Go API daemon, a Bun and OpenTUI CLI, and an optional Flutter mobile app.

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
 bun install
cd cli && bun install
cd ..
make build
```

`make install` copies binaries to `~/.local/bin`; use it only when you need a local installation. It is not required for normal development.

The root package only manages release automation. It does not replace the CLI package or its dependencies.

## Development Workflow

1. Create a branch using the `dev#<lowercase-kebab-context>` format.
2. Keep each change focused on one feature, fix, or documentation update.
3. Run the component-specific checks before opening a pull request.
4. Describe affected components and validation results in the pull request.

### API

Run the API with live reload using Air from the `api` directory:

```bash
cd api
make dev
```

The development API listens on port `8080` by default. Start it in a separate terminal before running the mobile app.

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

To run the TUI during development, use the `dev` script:

```bash
bun run dev
```

### Mobile

For mobile changes, install dependencies and run the standard checks from the `mobile` directory:

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
```

Run the mobile app against the local API without entering the host IP manually on macOS or Linux:

```bash
make mobile-dev
```

`make mobile-dev` detects the host IP from `en0` or `en1` on macOS, or from the first address returned by `hostname -I` on Linux. It then runs Flutter with `QMON_API_URL=http://<host-ip>:8080`. Keep the API daemon running in another terminal, and connect a physical device to the same local network.

On Windows or another unsupported OS, pass the host IP explicitly. This form also works with native Windows `cmd`/PowerShell:

```bash
make mobile-dev HOST_IP=192.168.1.10
```

The injected URL is used only by debug builds; release builds use the saved API URL.

For a focused check after changing quota handling:

```bash
flutter test test/api_service_test.dart test/quota_type_label_test.dart
```

## Checks

Run the checks relevant to the area you changed. For a core build, run:

```bash
make build
```

For a cross-layer change, run the API, CLI, and mobile checks listed above when the required toolchains are available. For a debug APK compile check:

```bash
cd mobile
flutter build apk --debug
```

## Releases

Release automation uses `release-it` with Conventional Commit changelog generation. Install root dependencies first, then run the release command from the repository root:

```bash
bun install
bun run release:patch
```

Use `bun run release:minor`, `bun run release:major`, `bun run release:alpha`, or `bun run release:beta` when appropriate. Release commands run the configured checks, update `CHANGELOG.md`, create a `v<version>` tag, and publish a GitHub Release. Review the proposed version and changelog before confirming the interactive prompt.

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
| `cli/`    | Bun and OpenTUI terminal interface              |
| `mobile/` | Flutter mobile companion app and Android widget |
| `docs/`   | Documentation and images                        |
| `build/`  | Local build artifacts                           |

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
