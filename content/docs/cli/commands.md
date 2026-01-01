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
| `--database` | `sqlite` | Database driver: `postgres`, `mysql`, `sqlite` |
| `--cache` | `memory` | Cache driver: `redis`, `memory` |
| `--auth` | `false` | Include authentication scaffolding |
| `--api` | `false` | API-only structure (no views) |

**Examples:**

```bash
# Create a basic project
velocity new myapp

# Create with PostgreSQL and Redis
velocity new myapp --database postgres --cache redis

# Create API-only project with auth
velocity new myapi --api --auth
```

After creation, the CLI:
1. Scaffolds the project
2. Installs Go and JS dependencies
3. Runs database migrations
4. Builds the `./vel` binary
5. Starts development servers (Go on :4000, Vite on :5173)

---

### velocity init

Initialize Velocity in an existing Go project.

```bash
velocity init [flags]
```

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--database` | (from config) | Database driver |
| `--cache` | (from config) | Cache driver |
| `--auth` | `false` | Include authentication |
| `--api` | `false` | API-only structure |

**Examples:**

```bash
# Initialize in current directory
velocity init

# Initialize with specific options
velocity init --database postgres --cache redis
```

**Requirements:**
- Must be run in a directory with an existing `go.mod` file

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

### vel make:controller

Generate a new HTTP controller.

```bash
vel make:controller <name> [flags]
```

**Arguments:**
- `name` - Controller name (automatically converts to snake_case)

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--resource` | `false` | Generate CRUD methods |
| `--api` | `false` | Generate API controller (JSON responses) |

**Examples:**

```bash
# Basic controller
vel make:controller User

# Resource controller with CRUD methods
vel make:controller Post --resource

# API controller
vel make:controller Product --api --resource
```

**Generated file:** `app/http/controllers/<name>_controller.go`

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
