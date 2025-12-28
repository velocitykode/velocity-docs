---
title: Commands
description: Complete reference for Velocity CLI commands including new, serve, build, migrate, and code generation.
weight: 2
---

Complete reference for all Velocity CLI commands.

## Project Commands

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

# Create with MySQL
velocity new myapp --database mysql
```

After creation, the CLI automatically starts development servers and displays:
- Go server at http://localhost:3000
- Vite dev server at http://localhost:5173

---

### velocity init

Initialize Velocity in an existing Go project. Adds the Velocity directory structure while preserving existing files.

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
| `--no-interaction` | `false` | Skip interactive prompts |

**Examples:**

```bash
# Initialize in current directory
velocity init

# Initialize with specific options
velocity init --database postgres --cache redis

# Non-interactive mode
velocity init --no-interaction --database sqlite
```

**Requirements:**
- Must be run in a directory with an existing `go.mod` file
- Directory must not already have Velocity structure

---

## Development Commands

### velocity serve

Start the development server with hot reload.

```bash
velocity serve [flags]
```

**Flags:**
| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--port` | `-p` | `8080` | Port to run the server on |
| `--env` | `-e` | `development` | Environment mode |
| `--watch` | `-w` | `true` | Enable hot reload |
| `--tags` | | | Build tags to pass to go build |

**Examples:**

```bash
# Start with defaults (port 8080, hot reload enabled)
velocity serve

# Custom port
velocity serve --port 3000

# Production environment, no hot reload
velocity serve --env production --watch=false

# With build tags
velocity serve --tags "sqlite"
```

**How it works:**
1. Builds your application to `.velocity/tmp/server`
2. Watches all `.go` files for changes
3. Automatically rebuilds and restarts on file changes
4. Skips `vendor/` and `.velocity/` directories

---

### velocity build

Build the application for production deployment.

```bash
velocity build [flags]
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
velocity build

# Custom output path
velocity build --output ./bin/myapp

# Cross-compile for Linux
velocity build --os linux --arch amd64

# Build for multiple platforms
velocity build --os linux --arch amd64 --output ./dist/myapp-linux
velocity build --os darwin --arch arm64 --output ./dist/myapp-mac

# With version info
velocity build --version 1.2.0
```

**Optimizations:**
- Strips debug symbols (`-s -w` ldflags)
- Disables CGO for better portability
- Creates a static binary

---

## Database Commands

### velocity migrate

Run all pending database migrations.

```bash
velocity migrate
```

**Requirements:**
- Must be run from project root (where `go.mod` is located)
- Requires `database/migrations/` directory
- Database connection configured in `.env`

**Example:**

```bash
velocity migrate
```

Output shows each migration being applied:

```
Creating migration table .......................... DONE
2024_01_15_000001_create_users_table .............. DONE
2024_01_15_000002_create_posts_table .............. DONE

[SUCCESS] Done
```

---

### velocity migrate:fresh

Drop all database tables and re-run all migrations from scratch.

```bash
velocity migrate:fresh
```

{{< callout type="warning" >}}
This command is destructive and will delete all data. Use only in development.
{{< /callout >}}

**Example:**

```bash
velocity migrate:fresh
```

---

## Code Generation

### velocity make controller

Generate a new HTTP controller.

```bash
velocity make controller <name> [flags]
```

**Aliases:** `velocity generate controller`, `velocity g controller`

**Arguments:**
- `name` - Controller name (automatically appends "Controller" if not present)

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--resource` | `false` | Generate CRUD methods (Index, Create, Store, Show, Edit, Update, Destroy) |
| `--api` | `false` | Generate API controller (JSON responses) |
| `--methods` | | Custom methods (comma-separated) |

**Examples:**

```bash
# Basic controller
velocity make controller User

# Resource controller with CRUD methods
velocity make controller Post --resource

# API controller
velocity make controller API/Product --api --resource

# Custom methods
velocity make controller Payment --methods "process,refund,status"
```

**Generated file:** `app/controllers/<name>.go`

**Resource controller methods:**
- `Index` - List all resources
- `Create` - Show create form
- `Store` - Save new resource
- `Show` - Display single resource
- `Edit` - Show edit form
- `Update` - Update resource
- `Destroy` - Delete resource

---

## Utility Commands

### velocity key:generate

Generate a new 32-byte encryption key for your application.

```bash
velocity key:generate [flags]
```

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--show` | `false` | Only display the key, don't update .env |

**Examples:**

```bash
# Generate and save to .env
velocity key:generate

# Just display the key
velocity key:generate --show
```

**Output:**
```
Application key set successfully.
```

The key is saved to the `CRYPTO_KEY` variable in your `.env` file in the format:
```
CRYPTO_KEY=base64:AbCdEf...
```

---

### velocity version

Display CLI version information.

```bash
velocity version
```

---

## Configuration Commands

### velocity config set

Set a CLI configuration value.

```bash
velocity config set <key> <value>
```

**Available keys:**
| Key | Values | Description |
|-----|--------|-------------|
| `default.database` | `postgres`, `mysql`, `sqlite` | Default database for new projects |
| `default.cache` | `redis`, `memory` | Default cache driver |
| `default.queue` | `redis`, `database`, `sync` | Default queue driver |
| `default.auth` | `true`, `false` | Include auth by default |
| `default.api` | `true`, `false` | Create API-only by default |

**Examples:**

```bash
velocity config set default.database postgres
velocity config set default.cache redis
velocity config set default.auth true
```

---

### velocity config get

Get a configuration value.

```bash
velocity config get <key>
```

**Example:**

```bash
velocity config get default.database
# Output: postgres
```

---

### velocity config list

List all configuration values.

```bash
velocity config list
```

**Example output:**

```
Configuration (~/.velocity/config.yaml):
  default.database: postgres
  default.cache: redis
  default.auth: true
```

---

### velocity config reset

Reset all configuration to defaults.

```bash
velocity config reset
```

This deletes the configuration file at `~/.velocity/config.yaml`.
