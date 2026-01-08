---
title: Commands
description: Complete reference for Velocity CLI commands. Learn how to create projects, run development servers, generate code, and manage database migrations.
weight: 2
keywords: [velocity commands, vel serve, velocity new, go migrations, code generation, hot reload]
---

Complete reference for all Velocity CLI commands.

## Global Commands (velocity)

These commands are available globally after installing via Homebrew.

### velocity new

Create a new Velocity project with full scaffolding.

```bash
velocity new <project-name> [flags]
```

**Arguments:**
- `project-name` - Name of the project directory to create

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--database` | `sqlite` | Database driver: `postgres`, `sqlite` |
| `--cache` | `memory` | Cache driver: `redis`, `memory` |

**Examples:**

```bash
# Create a basic project (SQLite by default)
velocity new myapp

# Create with PostgreSQL and Redis
velocity new myapp --database postgres --cache redis
```

After creation, the CLI:
1. Scaffolds the project
2. Installs Go and JS dependencies
3. Runs database migrations
4. Builds the `./vel` binary
5. Starts development servers (Go on :4000, Vite on :5173)

---

### velocity config

Manage CLI configuration. See [Configuration](../configuration/) for details.

```bash
velocity config set <key> <value>
velocity config get <key>
velocity config list
velocity config reset
```

---

### velocity self-update

Update the velocity installer to the latest version.

```bash
velocity self-update
```

---

## Project Commands (vel)

These commands run from within a Velocity project using `./vel` or `vel` (with shell function).

### vel serve

Start the development server with hot reload.

```bash
vel serve [flags]
```

**Flags:**
| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--port` | `-p` | `4000` | Port to run the server on |
| `--env` | `-e` | `development` | Environment mode |
| `--watch` | `-w` | `true` | Enable hot reload |
| `--tags` | | | Build tags to pass to go build |

**Examples:**

```bash
# Start with defaults (port 4000, hot reload enabled)
vel serve

# Custom port
vel serve --port 3000

# Production environment, no hot reload
vel serve --env production --watch=false
```

**What happens:**
1. Starts Vite dev server (if `package.json` exists)
2. Builds your Go application to `.vel/tmp/server`
3. Watches all `.go` files for changes
4. Automatically rebuilds and restarts on file changes

---

### vel build

Build the application for production deployment.

```bash
vel build [flags]
```

**Flags:**
| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--output` | `-o` | `./dist/app` | Output path for binary |
| `--os` | | (current OS) | Target operating system |
| `--arch` | | (current arch) | Target architecture |
| `--optimize` | | `true` | Enable optimizations |
| `--version` | | | Version to embed in binary |

**Examples:**

```bash
# Default build
vel build

# Custom output path
vel build --output ./bin/myapp

# Cross-compile for Linux
vel build --os linux --arch amd64
```

---

### vel migrate

Run all pending database migrations.

```bash
vel migrate
```

**Requirements:**
- Must be run from project root
- Database connection configured in `.env`

**Example output:**

```
MIGRATE

✓ 20240115000001_create_users_table
✓ 20240115000002_create_posts_table

Done
```

---

### vel migrate:fresh

Drop all database tables and re-run all migrations from scratch.

```bash
vel migrate:fresh
```

{{< callout type="warning" >}}
This command is destructive and will delete all data. Use only in development.
{{< /callout >}}

---

### vel make:handler

Generate a new HTTP handler.

```bash
vel make:handler <name> [flags]
```

**Arguments:**
- `name` - Handler name (automatically converts to snake_case)

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--resource` | `false` | Generate CRUD methods |
| `--api` | `false` | Generate API handler (JSON responses) |

**Examples:**

```bash
# Basic handler
vel make:handler User

# Resource handler with CRUD methods
vel make:handler Post --resource

# API handler
vel make:handler Product --api --resource
```

**Generated file:** `internal/handlers/<name>.go`

---

### vel key:generate

Generate a new 32-byte encryption key for your application.

```bash
vel key:generate [flags]
```

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--show` | `false` | Only display the key, don't update .env |

**Examples:**

```bash
# Generate and save to .env
vel key:generate

# Just display the key
vel key:generate --show
```

The key is saved to the `CRYPTO_KEY` variable in your `.env` file.
