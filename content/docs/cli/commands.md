---
title: vel Commands
description: Complete reference for the per-project `vel` CLI - serve, build, migrations, queues, code generation, maintenance, and keys.
weight: 2
keywords: [vel commands, velocity cli, migrations, code generation, hot reload]
---

`vel` is the per-project binary. It's created in your project root when
you scaffold an app with `velocity new`. Run `./vel <command>` - or
alias `vel` to `./vel` in your shell - from the project directory.

For the installer CLI (`velocity new`, `velocity self-update`, etc.),
see [Installer Commands](/docs/cli/installer/).

## Server

### vel serve

Start the development server with live reload.

```bash
vel serve [flags]
```

| Flag        | Short | Default       | Description                               |
| ----------- | ----- | ------------- | ----------------------------------------- |
| `--port`    | `-p`  | `4000`        | HTTP port                                 |
| `--env`     | `-e`  | `development` | Environment name (sets `APP_ENV`)         |
| `--no-watch`|       | off           | Disable file-watching / auto-rebuild      |
| `--tags`    |       | (none)        | Build tags passed to `go build`            |

```bash
vel serve
vel serve --port 3000
vel serve --env staging --no-watch
vel serve --tags="integration"
```

On start:

1. Vite dev server launches on `:5173` (full-stack projects only).
2. The Go app compiles to `.vel/tmp/server`.
3. `.go` files are watched; a change rebuilds and restarts.

### vel build

Compile a production binary.

```bash
vel build [flags]
```

| Flag        | Short | Default       | Description                     |
| ----------- | ----- | ------------- | ------------------------------- |
| `--output`  | `-o`  | `./dist/app`  | Output path                     |
| `--os`      |       | (host)        | Target `GOOS`                   |
| `--arch`    |       | (host)        | Target `GOARCH`                 |
| `--tags`    |       | (none)        | Go build tags                   |

```bash
vel build
vel build --output ./bin/myapp
vel build --os linux --arch amd64
```

## Database

### vel migrate

Run all pending migrations.

```bash
vel migrate [--pretend]
```

`--pretend` prints the SQL that would run without executing it - useful
for reviewing migration output before committing.

### vel migrate:fresh

Drop all tables, then run every migration from scratch.

```bash
vel migrate:fresh
```

{{< callout type="warning" >}}
Destructive - deletes all data. Development / testing only.
{{< /callout >}}

### vel migrate:rollback

Roll back the most recent batch of migrations.

```bash
vel migrate:rollback [--step N]
```

| Flag     | Short | Default | Description                      |
| -------- | ----- | ------- | -------------------------------- |
| `--step` | `-s`  | `1`     | Number of batches to roll back   |

### vel migrate:status

Show which migrations have run.

```bash
vel migrate:status
```

### vel db:wipe

Drop every table in the current database without running migrations.

```bash
vel db:wipe
```

{{< callout type="warning" >}}
Destructive. No confirmation prompt. Use only when you know the
database is disposable.
{{< /callout >}}

## Queue and Scheduler

### vel queue:work

Start a worker that processes queued jobs.

```bash
vel queue:work [--queue NAME] [--tries N] [--timeout S]
```

| Flag        | Short | Default      | Description                                |
| ----------- | ----- | ------------ | ------------------------------------------ |
| `--queue`   | `-q`  | `default`    | Queue to consume from                      |
| `--tries`   |       | (driver)     | Max attempts per job before marking failed |
| `--timeout` |       | (driver)     | Per-job timeout in seconds                 |

```bash
vel queue:work
vel queue:work --queue emails --tries 3 --timeout 60
```

### vel schedule:work

Run the scheduler loop - picks up scheduled jobs defined via
`v.Schedule(...)` and dispatches them when due.

```bash
vel schedule:work
```

Typically run under a process supervisor (systemd, Docker, etc.) rather
than manually.

## Cache

### vel cache:clear

Flush the configured cache store.

```bash
vel cache:clear
```

## Maintenance Mode

### vel down

Put the app into maintenance mode. All requests return 503 except
those bearing the bypass secret.

```bash
vel down [--secret TOKEN] [--retry N]
```

| Flag       | Default | Description                                            |
| ---------- | ------- | ------------------------------------------------------ |
| `--secret` | (none)  | Token clients can use at `?__maintenance=TOKEN` to bypass |
| `--retry`  | (none)  | Value for the `Retry-After` response header (seconds)  |

```bash
vel down --secret "abc123" --retry 60
```

### vel up

Exit maintenance mode.

```bash
vel up
```

## Keys

### vel key:generate

Generate a fresh 32-byte encryption key and write it to `.env` under
`CRYPTO_KEY` (falls back to `APP_KEY` if that's what the project uses).

```bash
vel key:generate
```

## Routes

### vel route:list

Print every registered route with method, path, name, and middleware.

```bash
vel route:list
```

Rebuilds the bootstrap lifecycle internally before printing - the
output always reflects the current `v.Routes(...)` definition.

## Code Generation

All `make:*` commands scaffold a file into the conventional location
for that type. Names are converted to the right case for the artifact
(snake_case for migration files, PascalCase for types).

### vel make:handler

```bash
vel make:handler <name> [--resource] [--api]
```

| Flag         | Short | Default | Description                                      |
| ------------ | ----- | ------- | ------------------------------------------------ |
| `--resource` | `-r`  | off     | Scaffold CRUD methods (Index/Show/Store/Update/Destroy) |
| `--api`      |       | off     | JSON responses instead of view rendering         |

Output: `internal/handlers/<name>.go`.

```bash
vel make:handler User
vel make:handler Post --resource
vel make:handler Admin/Dashboard
vel make:handler Product --api --resource
```

### vel make:model

```bash
vel make:model <name> [--uuid] [--soft-deletes] [--migration]
```

| Flag              | Short | Default | Description                          |
| ----------------- | ----- | ------- | ------------------------------------ |
| `--uuid`          |       | off     | Use UUID primary key                 |
| `--soft-deletes`  |       | off     | Add deleted_at column and scope      |
| `--migration`     | `-m`  | off     | Also scaffold the migration          |

Output: `internal/models/<name>.go`.

### vel make:migration

```bash
vel make:migration <name> [--create TABLE] [--table TABLE] [--uuid] [--soft-deletes]
```

| Flag             | Accepts             | Description                                         |
| ---------------- | ------------------- | --------------------------------------------------- |
| `--create`       | `=VALUE` or space   | Generate a "create" migration for the given table   |
| `--table`        | `=VALUE` or space   | Generate an "alter" migration for the given table   |
| `--uuid`         | flag                | Use UUID primary key in the create template        |
| `--soft-deletes` | flag                | Include deleted_at in the create template          |

Output: `database/migrations/<timestamp>_<name>.go`.

```bash
vel make:migration create_posts --create=posts
vel make:migration add_slug_to_posts --table=posts
```

### Other make commands

All take a name argument and scaffold a file into the conventional
directory.

| Command                | Output path                          |
| ---------------------- | ------------------------------------ |
| `vel make:middleware`  | `internal/middleware/<name>.go`      |
| `vel make:event`       | `internal/events/<name>.go`          |
| `vel make:listener`    | `internal/listeners/<name>.go`       |
| `vel make:job`         | `internal/jobs/<name>.go`            |
| `vel make:mail`        | `internal/mail/<name>.go`            |
| `vel make:notification`| `internal/notifications/<name>.go`   |
| `vel make:resource`    | `internal/resources/<name>.go`       |
| `vel make:policy`      | `internal/policies/<name>.go`        |
| `vel make:provider`    | `internal/providers/<name>.go`       |
| `vel make:command`     | `internal/commands/<name>.go`        |

```bash
vel make:middleware RateLimit
vel make:listener SendWelcomeEmail
vel make:policy PostPolicy
```

## Help

```bash
vel help
vel --help
vel -h
```

Prints a grouped list of every command.
