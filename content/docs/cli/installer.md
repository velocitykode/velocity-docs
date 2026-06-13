---
title: velocity Commands
description: Reference for the global `velocity` installer - scaffold new projects, manage CLI defaults, and keep the installer up to date.
weight: 3
keywords: [velocity new, velocity config, velocity self-update, installer]
---

`velocity` is the global installer CLI. You install it once
([installation](/docs/cli/installation)) and use it to create new
projects, configure defaults, and update itself.

Per-project commands (`serve`, `build`, `migrate`, `make:*`) live on
the `vel` binary inside each project - see [vel commands](/docs/cli/commands).

## velocity new

Create a new Velocity project.

```bash
velocity new <project-name> [flags]
```

| Flag                     | Default  | Description                                               |
| ------------------------ | -------- | --------------------------------------------------------- |
| `--database`             | `sqlite` | Database driver: `postgres`, `mysql`, `sqlite`            |
| `--cache`                | `memory` | Cache driver: `redis`, `memory`                           |
| `--stack`                | `react`  | Frontend stack for full-stack projects: `react`, `vue`    |
| `--api`                  | `false`  | API-only project (no frontend)                            |
| `--ssr`                  | `false`  | Enable Inertia SSR (sets `VIEW_SSR_ENABLED=true`, wires Vite SSR) |
| `-y`, `--non-interactive`| `false`  | Skip all prompts; use flag values or defaults             |

```bash
velocity new myapp
velocity new myapp --database postgres --cache redis
velocity new myapp --stack vue
velocity new myapi --api --database postgres
velocity new myapp --ssr
velocity new myapp -y --database postgres   # no prompts
```

### Interactive prompts

Run without `-y`/`--non-interactive`, any flag you don't pass is asked
interactively: project type (full stack vs API only), database, cache,
frontend stack (full-stack only), and SSR. A flag you _do_ pass is taken
as-is and not prompted. Pass `-y` (or set every relevant flag) to skip
prompts entirely - useful for scripts and CI.

### What `new` does

1. Fails fast if the destination path already exists.
2. Downloads the appropriate starter template as a tarball from GitHub
   (`velocity-template-react`, `velocity-template-vue`, or
   `velocity-template-api`), resolved live to that template's newest
   released tag (falling back to `main` when no tag is found). Falls back
   to `git clone` if the tarball fetch fails.
3. Rewrites the Go module name to match the project, and strips any local
   `replace` directive for the framework from `go.mod`.
4. Re-initialises git (removes the template's history, creates a fresh
   repo with an initial commit).
5. Creates default migrations when the template doesn't ship its own.
6. Writes `.env` from `.env.example` and seeds freshly generated
   `APP_KEY`, `QUEUE_SIGNING_KEY`, and `AUTH_JWT_SECRET`, then patches the
   chosen database, cache, and SSR settings.
7. Installs Go dependencies (`go mod tidy`) - plus JS dependencies
   (`bun install`, or `npm install` when bun is absent) on full-stack
   projects - and builds the project's `vel` binary concurrently.
8. Checks the database is reachable, then runs the initial migrations. If
   the database isn't ready, scaffolding still completes and the installer
   prints the remaining steps (`./vel migrate`, `./vel serve`) instead of
   failing.

When it finishes, the installer prints the next steps rather than starting
a server. `cd` into the project and run `./vel serve` (Go on `:4000`, Vite
on `:5173` for full-stack).

### API vs full-stack

The `--api` flag picks a different starter:

| Aspect           | Full-stack (default)              | `--api`                          |
| ---------------- | --------------------------------- | -------------------------------- |
| Frontend         | Vite + Inertia (React or Vue)     | None                             |
| CSRF             | Enabled                           | Disabled (stateless)             |
| Auth guard       | `web` (`AUTH_GUARD=web`)          | `api` (`AUTH_GUARD=api`)         |
| Responses        | Inertia-rendered pages            | JSON (`ensure_json` middleware)  |
| Starter routes   | `/`, `/login`, `/register`, `/dashboard`, `/logout`, `/health` | `/health`, `/api/health` |

The `--stack` flag (`react` or `vue`) only applies to full-stack projects;
it's ignored with `--api`. You can't flip between modes after scaffolding -
choose up front.

## velocity config

Manage global CLI defaults stored on disk.

```bash
velocity config set <key> <value>
velocity config get <key>
velocity config list
velocity config reset
```

### Keys

Every key is unset until you set it - there are no seeded defaults. `set`
validates the value against the accepted set and rejects unknown keys.

| Key                 | Accepted values                  |
| ------------------- | -------------------------------- |
| `default.database`  | `postgres`, `mysql`, `sqlite`    |
| `default.cache`     | `redis`, `memory`                |
| `default.queue`     | `redis`, `database`              |
| `default.auth`      | `true`, `false`                  |
| `default.api`       | `true`, `false`                  |

### Examples

```bash
velocity config set default.database postgres
velocity config set default.cache redis
velocity config set default.api true

velocity config get default.database    # → postgres
velocity config list                    # all set values
velocity config reset                   # delete the config file
```

`get` prints the value, or `(not set)` for keys that are empty or `false`.
`list` shows only keys that have been set.

Configuration is stored at `~/.vel/config.yaml` (created with `0600`
permissions, written under a file lock so concurrent runs don't clobber
each other).

## velocity self-update

Fetch and install the latest installer release.

```bash
velocity self-update
```

It checks the latest GitHub release, and if you're already on it, reports
"Already up to date" and stops. Otherwise it downloads the archive for your
OS/architecture, verifies it against the release `checksums.txt`, extracts
the binary, and atomically replaces the running executable in place. On
macOS it also clears the download quarantine attribute.

{{% callout type="info" %}}
If the installer was installed via Homebrew, `self-update` detects this and
declines, pointing you to `brew upgrade --cask velocity` instead - let the
package manager own the binary it installed.
{{% /callout %}}

## velocity --version

Print the installer version followed by the template tags it would scaffold.
Each stack resolves to its newest released tag (or `main` when no tag can be
resolved), so the output reflects the exact build coordinates of a fresh
project:

```bash
velocity --version
```

```
velocity 0.21.14
templates:
  api -> v0.x.y
  react -> v0.x.y
  vue -> v0.x.y
```

## Go version check

The installer verifies that Go is installed and meets the minimum
version (1.26 or higher) on every run. When the check fails it prints one
of the following and exits:

```
Go is not installed or not in PATH. Velocity requires Go 1.26 or higher.

Please install Go:
  brew install go

Or download from: https://go.dev/dl/
```

```
Go version go1.24.2 is not supported. Velocity requires Go 1.26 or higher.

Please upgrade Go:
  brew upgrade go

Or download from: https://go.dev/dl/
```

Install or upgrade Go and run the command again.
