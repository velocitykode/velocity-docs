---
title: velocity Commands
description: Reference for the global `velocity` installer — scaffold new projects, manage CLI defaults, and keep the installer up to date.
weight: 3
keywords: [velocity new, velocity config, velocity self-update, installer]
---

`velocity` is the global installer CLI. You install it once
([installation](/docs/cli/installation)) and use it to create new
projects, configure defaults, and update itself.

Per-project commands (`serve`, `build`, `migrate`, `make:*`) live on
the `vel` binary inside each project — see [vel commands](/docs/cli/commands).

## velocity new

Create a new Velocity project.

```bash
velocity new <project-name> [flags]
```

| Flag          | Default   | Description                                               |
| ------------- | --------- | --------------------------------------------------------- |
| `--database`  | `sqlite`  | Database driver: `postgres`, `mysql`, `sqlite`            |
| `--cache`     | `memory`  | Cache driver: `redis`, `memory`                           |
| `--api`       | `false`   | API-only project (no frontend)                            |
| `--ssr`       | `false`   | Enable Inertia SSR (sets `INERTIA_SSR_ENABLED=true`, wires Vite SSR) |

```bash
velocity new myapp
velocity new myapp --database postgres --cache redis
velocity new myapi --api --database postgres
velocity new myapp --ssr
```

### What `new` does

1. Fails fast if the destination path already exists.
2. Clones the appropriate starter template (`velocity-template` or
   `velocity-template-api`).
3. Rewrites the Go module name to match the project.
4. Installs Go dependencies — plus npm dependencies on full-stack
   projects.
5. Runs `vel key:generate` to seed `.env`.
6. Runs the initial migrations against the configured database.
7. Builds the project's `vel` binary.
8. Launches the dev server — Go on `:4000`, Vite on `:5173` for
   full-stack.

### API vs full-stack

The `--api` flag picks a different starter:

| Aspect           | Full-stack (default)              | `--api`                          |
| ---------------- | --------------------------------- | -------------------------------- |
| Frontend         | Vite + Inertia + React            | None                             |
| CSRF             | Enabled                           | Disabled (stateless)             |
| Auth guard       | `session`                         | `api` (token-based)              |
| Error responses  | Inertia-rendered error pages      | JSON 401 / 403 / 404             |
| Starter routes   | `/`, `/login`, `/register`, ...   | `/api/health`, `/api/users`, ... |

You can't flip between modes after scaffolding — choose up front.

## velocity config

Manage global CLI defaults. Defaults are loaded on every run of
`velocity new` and pre-fill the interactive prompts.

```bash
velocity config set <key> <value>
velocity config get <key>
velocity config list
velocity config reset
```

### Keys

| Key                 | Accepted values                  | Default   |
| ------------------- | -------------------------------- | --------- |
| `default.database`  | `postgres`, `mysql`, `sqlite`    | `sqlite`  |
| `default.cache`     | `redis`, `memory`                | `memory`  |
| `default.queue`     | `redis`, `database`              | `database`|
| `default.auth`      | `true`, `false`                  | `true`    |
| `default.api`       | `true`, `false`                  | `false`   |

### Examples

```bash
velocity config set default.database postgres
velocity config set default.cache redis
velocity config set default.api true

velocity config get default.database    # → postgres
velocity config list                    # all values
velocity config reset                   # wipe the config file
```

Configuration is stored at `~/.vel/config.yaml` (platform-conventional
location on other systems).

## velocity self-update

Fetch and install the latest installer release.

```bash
velocity self-update
```

Updates the binary in place. The running process exits after the new
binary is downloaded — rerun any command to pick it up.

## velocity --version

Print the installer version.

```bash
velocity --version
```

## Go version check

The installer verifies that Go is installed and meets the minimum
version (1.26 or higher) on every run. When the check fails
you'll see one of:

```
Go is not installed or not in PATH. Velocity requires Go 1.26 or higher.
```

```
Go version go1.24.2 is not supported. Velocity requires Go 1.26 or higher.
```

Install or upgrade Go (`brew upgrade go` or [go.dev/dl](https://go.dev/dl))
and run the command again.
