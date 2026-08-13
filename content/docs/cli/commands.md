---
title: vel Commands
description: Complete reference for the per-project `vel` CLI - serve, build, migrations, queues, code generation, maintenance, routes, and keys.
weight: 2
keywords: [vel commands, velocity cli, migrations, code generation, hot reload]
---

`vel` is the per-project binary. It's created in your project root when
you scaffold an app with `velocity new`. Run `./vel <command>` - or
alias `vel` to `./vel` in your shell - from the project directory.

For the installer CLI (`velocity new`, `velocity self-update`, etc.),
see [Installer Commands](/docs/cli/installer/).

## Command grammar

Command names are plain words separated by spaces: `migrate`,
`migrate fresh`, `gen model`, `gen grpc service`. Nothing in the CLI uses
a colon.

The dispatcher joins the leading arguments into a candidate name (at most
three words, the length of the longest registered name) and resolves
longest match first:

- A subcommand beats its bare parent. `vel migrate fresh` runs the fresh
  command; it is never `migrate` with a `fresh` argument.
- Token joining stops at the first flag-like argument, so
  `vel migrate --pretend` resolves to `migrate` with `--pretend` handed
  through as an argument, and `vel run seed` resolves to `run` with
  `seed` (plus any trailing arguments) passed to your custom command.
- An unknown command reports the full unmatched token sequence:
  `vel migrate frsh` fails with `vel: unknown command "migrate frsh"`,
  not just `migrate`.

Unrecognised arguments are rejected rather than silently dropped. An
unknown flag errors with `unknown flag: <flag>`, a stray positional with
`unexpected argument: <arg>`, and a value-taking flag with nothing after
it with `flag <flag> needs a value`. Value-taking flags accept both
`--flag value` and `--flag=value`.

{{< callout type="info" >}}
Arguments are parsed **before** the application bootstraps, so a typo
fails immediately without running your module lifecycle.
{{< /callout >}}

## Server

### vel serve

Start the development server with live reload.

```bash
vel serve [flags]
```

| Flag        | Short | Default       | Description                               |
| ----------- | ----- | ------------- | ----------------------------------------- |
| `--port`    | `-p`  | `4000`        | HTTP port (falls back to `APP_PORT`)      |
| `--env`     | `-e`  | `development` | Environment name (sets `APP_ENV`)         |
| `--no-watch`|       | off           | Disable file-watching / auto-rebuild      |
| `--tags`    |       | (none)        | Build tags passed to `go build`           |

```bash
vel serve
vel serve --port 3000
vel serve --env staging --no-watch
vel serve --tags="integration"
```

On start:

1. `.env` is loaded and `APP_PORT` / `APP_ENV` are read; flags override
   both. With no environment resolved, `vel serve` defaults to
   `development` and warns that `APP_ENV` was unset.
2. When a `package.json` is present, the Vite dev server is started with
   `npm run dev` (or `bun run dev` when `bun` is on `PATH` and a
   `bun.lock` file exists).
3. The Go app compiles to `.vel/tmp/server`, which is created
   owner-only because the binary embeds build-time configuration.
4. `.go` files are watched; a change debounces for 500ms, then rebuilds
   and restarts the server. The rebuild also refreshes the project's
   `./vel` binary, so one-shot commands in another terminal
   (`vel routes`, `vel migrate`, `vel gen ...`) see current source.

{{< callout type="info" >}}
`vel serve run` is the internal entry point the watcher uses to launch
the compiled child process. It's dispatchable but not meant to be typed
by hand, so it's omitted from `vel help`.
{{< /callout >}}

### vel build

Compile a production binary.

```bash
vel build [flags]
```

| Flag        | Short | Default          | Description                                          |
| ----------- | ----- | ---------------- | ---------------------------------------------------- |
| `--output`  | `-o`  | project dir name | Output path (`.exe` appended when `--os windows`)    |
| `--os`      |       | (host)           | Target `GOOS`                                        |
| `--arch`    |       | (host)           | Target `GOARCH`                                      |
| `--tags`    |       | (none)           | Go build tags                                        |

```bash
vel build
vel build --output ./bin/myapp
vel build --os linux --arch amd64
```

The build runs with `CGO_ENABLED=0` and stamps version metadata into
`velocity.BuildInfo` via `-ldflags` (`Version`, `Commit`, `Date`).
`Version` defaults to `devel` and `Commit` to the short SHA from
`git rev-parse --short HEAD`, falling back to `devel` when git is
unavailable.

## Database

### vel migrate

Run all pending migrations.

```bash
vel migrate [--pretend]
```

`--pretend` prints the SQL that would run without executing it - useful
for reviewing migration output before committing. It is the only flag
`migrate` accepts; anything else errors.

With no database configured (`DB_CONNECTION` unset) the command warns
and exits cleanly instead of failing.

### vel migrate fresh

Drop all tables, then run every migration from scratch.

```bash
vel migrate fresh [--force]
```

In a production-class environment this command refuses to run unless
`--force` (`-f`) is passed. The guard treats `production`, `prod`,
`staging`, and any unrecognised `APP_ENV` value as production, so a
typo'd `APP_ENV` cannot disable it. `development`, `dev`, `test`,
`testing`, `local`, and an unset `APP_ENV` are non-production.

`--force` / `-f` is the only argument this command accepts.

{{< callout type="warning" >}}
Destructive - deletes all data. Development / testing only.
{{< /callout >}}

### vel migrate rollback

Roll back the most recent batch of migrations.

```bash
vel migrate rollback [--step N] [--force]
```

| Flag      | Short | Default | Description                                                   |
| --------- | ----- | ------- | ------------------------------------------------------------- |
| `--step`  | `-s`  | `1`     | Number of batches to roll back (must be >= 1)                 |
| `--force` | `-f`  | off     | Bypass the production-environment guard                       |

`--step N`, `-s N`, and `--step=N` are equivalent and compose with
`--force` in any order. A non-integer or below-1 value errors.

Like `migrate fresh`, this is gated in production-class environments;
pass `--force` to proceed.

### vel migrate status

Show which migrations have run.

```bash
vel migrate status
```

Takes no arguments.

### vel db wipe

Drop every table in the current database without running migrations.

```bash
vel db wipe [--force]
```

In a production-class environment this command refuses to run unless
`--force` (`-f`) is passed (same guard as `migrate fresh`), and `--force`
/ `-f` is the only argument it accepts.

{{< callout type="warning" >}}
Destructive. Outside production there is no confirmation prompt. Use
only when you know the database is disposable.
{{< /callout >}}

## Queue and Scheduler

### vel queue work

Start a worker that processes queued jobs.

```bash
vel queue work [--queue NAME] [--tries N] [--timeout S]
```

| Flag        | Short | Default      | Description                                |
| ----------- | ----- | ------------ | ------------------------------------------ |
| `--queue`   | `-q`  | `default`    | Queue to consume from                      |
| `--tries`   |       | `3`          | Max attempts per job before marking failed |
| `--timeout` |       | `30`         | Per-job timeout in seconds                 |

`--tries` and `--timeout` require integer values; when omitted the
worker's own defaults apply. Worker errors are routed through the
application logger. `SIGINT` / `SIGTERM` stops the worker gracefully.

```bash
vel queue work
vel queue work --queue emails --tries 3 --timeout 60
```

### vel schedule work

Run the scheduler loop - picks up scheduled tasks defined via
`v.Schedule(...)` and dispatches them when due.

```bash
vel schedule work
```

Takes no arguments. Typically run under a process supervisor (systemd,
Docker, etc.) rather than manually; `SIGINT` / `SIGTERM` shuts it down
gracefully.

## Cache

### vel cache clear

Flush the configured cache store.

```bash
vel cache clear
```

Takes no arguments. With no cache configured it warns and exits cleanly.

## Maintenance Mode

### vel down

Put the app into maintenance mode. Requests return a `503` JSON
response unless they carry the bypass secret (or hit a path the
maintenance middleware is configured to exclude, such as health probes
and webhooks).

```bash
vel down [--secret TOKEN] [--retry N]
```

| Flag       | Default | Description                                            |
| ---------- | ------- | ------------------------------------------------------ |
| `--secret` | (none)  | Bypass token. Send it in the `X-Maintenance-Bypass` header (or visit `/<secret>`) to mint a signed `velocity_maintenance_bypass` cookie that exempts the browser for 12 hours |
| `--retry`  | (none)  | Recorded as `retry_after` in the maintenance marker     |

```bash
vel down --secret "abc123" --retry 60
```

The command writes a `.vel/down` marker file holding the secret, the
retry value, and a UTC timestamp. Both the file (`0600`) and its
directory (`0700`) are owner-only because the marker carries the bypass
secret. The location is resolved independently of the current working
directory and can be moved with `VELOCITY_MAINTENANCE_ROOT`, so the
writer and the runtime middleware always agree on one path.

{{< callout type="tip" >}}
Prefer the `X-Maintenance-Bypass` header over the legacy `/<secret>`
path: a secret in the URL leaks into access logs, proxy logs, `Referer`
headers, and browser history.
{{< /callout >}}

### vel up

Exit maintenance mode by removing the marker file.

```bash
vel up
```

Takes no arguments. A missing marker is not an error.

## Keys

### vel key generate

Generate a fresh 32-byte encryption key and write it to `.env` under
`APP_KEY`, base64-encoded with a `base64:` prefix. If `.env` does not
exist it's created; an existing `APP_KEY=` line is replaced in place,
and a file without one gets the key prepended as its first line. The
`.env` file is written with owner-only (`0600`) permissions.

```bash
vel key generate
```

Takes no arguments.

## Routes

### vel routes

Print every registered route with method, path, and name.

```bash
vel routes
```

Takes no arguments. Runs the bootstrap lifecycle internally before
printing - the output always reflects the current `v.Routes(...)`
definition.

## Code Generation

All generators live under `gen <artifact>`. Each scaffolds a file into
the conventional location for that type, converting the name to the
right case for the artifact (snake_case for file names, PascalCase for
types).

Every `gen` command accepts a `--dir <path>` flag to override the
default output directory (the artifact's conventional folder). The value
must be project-relative, is cleaned, and is rejected if it escapes the
project tree or routes through a symlink. Existing files are never
overwritten.

Names are normalised before use: the artifact's own kind suffix is
stripped and the rest is PascalCased, so `vel gen policy PostPolicy` and
`vel gen policy Post` both write `internal/policies/post.go` holding
`type PostPolicy`. File names are the snake_case form of the normalised
name. Passing nothing but the suffix (for example `vel gen module
Module`) errors rather than writing a file named `.go`.

### vel gen handler

```bash
vel gen handler <name> [--resource] [--api] [--dir PATH]
```

| Flag         | Short | Default | Description                                      |
| ------------ | ----- | ------- | ------------------------------------------------ |
| `--resource` | `-r`  | off     | Scaffold CRUD handlers (Index/Create/Store/Show/Edit/Update/Destroy) |
| `--api`      |       | off     | JSON responses instead of string/view responses  |
| `--dir`      |       | `internal/handlers` | Output root override                 |

Output: `internal/handlers/<name>.go`, holding
`func <Name>Index(ctx *router.Context) error`-style functions.
Namespaced names like `Admin/Dashboard` nest under the output root, with
the package taken from the parent segment.

```bash
vel gen handler User
vel gen handler Post --resource
vel gen handler Admin/Dashboard
vel gen handler Product --api --resource
vel gen handler User --dir internal/web/handlers
```

### vel gen model

```bash
vel gen model <name> [--uuid] [--soft-deletes] [--migration] [--dir PATH]
```

| Flag              | Short | Default | Description                          |
| ----------------- | ----- | ------- | ------------------------------------ |
| `--uuid`          |       | off     | Use UUID primary key                 |
| `--soft-deletes`  |       | off     | Add deleted_at column and scope      |
| `--migration`     | `-m`  | off     | Also scaffold the create migration   |
| `--dir`           |       | `internal/models` | Output directory override  |

Output: `internal/models/<name>.go`. The model embeds `orm.Model[T]`,
`orm.UUIDModel[T]`, `orm.SoftDeleteModel[T]`, or
`orm.SoftDeleteUUIDModel[T]` depending on the flags, declares
`TableName()` (pluralised snake_case), and ships a commented-out
`AssignableFields()` allowlist - mass assignment is deny-by-default, so
fill it in (or declare `ProtectedFields()`) before writing to the model
from a map.

With `--migration`, a `create_<table>` migration is generated with the
same `--uuid` / `--soft-deletes` settings. That migration always lands
in `database/migrations`; `--dir` applies to the model file only.

### vel gen migration

```bash
vel gen migration <name> [--create TABLE] [--table TABLE] [--uuid] [--soft-deletes] [--dir PATH]
```

| Flag             | Accepts             | Description                                         |
| ---------------- | ------------------- | --------------------------------------------------- |
| `--create`       | `=VALUE` or space   | Generate a "create" migration for the given table   |
| `--table`        | `=VALUE` or space   | Generate an "alter" migration for the given table   |
| `--uuid`         | flag                | Use UUID primary key in the create template         |
| `--soft-deletes` | flag                | Include deleted_at in the create template           |
| `--dir`          | `=VALUE` or space   | Output directory override (default `database/migrations`) |

Table names passed to `--create` / `--table` must match
`[A-Za-z_][A-Za-z0-9_]*`. Output:
`database/migrations/<timestamp>_<name>.go`.

The timestamp has second resolution. When a file with that version
already exists, the generator walks the version forward a second at a
time so two migrations scaffolded back to back cannot collide.

```bash
vel gen migration create_posts --create=posts
vel gen migration add_slug_to_posts --table=posts
```

### Other gen commands

All take a name argument and scaffold a file into the conventional
directory. Each also accepts `--dir <path>` to override that directory,
and takes no other flags.

| Command                              | Output path                                 | Generated symbol                                   |
| ------------------------------------ | ------------------------------------------- | -------------------------------------------------- |
| `vel gen middleware RateLimit`       | `internal/middleware/rate_limit.go`         | `func RateLimit(next router.HandlerFunc) router.HandlerFunc` |
| `vel gen event UserRegistered`       | `internal/events/user_registered.go`        | `type UserRegistered`, `Name()` returns `user.registered` |
| `vel gen listener SendWelcomeEmail`  | `internal/listeners/send_welcome_email.go`  | `func SendWelcomeEmail(event interface{}) error`   |
| `vel gen job ProcessPayment`         | `internal/jobs/process_payment.go`          | `type ProcessPayment` (`Handle` / `Failed` / `MaxAttempts`) |
| `vel gen mail OrderShipped`          | `internal/mail/order_shipped.go`            | `type OrderShipped` (`Envelope` / `Content`)       |
| `vel gen notification InvoicePaid`   | `internal/notifications/invoice_paid.go`    | `type InvoicePaid` (`Via` / `ToMail`)              |
| `vel gen resource Post`              | `internal/resources/post.go`                | `type PostResource`                                |
| `vel gen policy Post`                | `internal/policies/post.go`                 | `type PostPolicy`                                  |
| `vel gen module Billing`             | `internal/modules/billing.go`               | `type BillingModule`                               |
| `vel gen command SyncInventory`      | `internal/commands/sync_inventory.go`       | `type SyncInventoryCommand`                        |

`vel gen module` writes a `<Name>Module` type in package `modules` with
the full module lifecycle already stubbed:

```go
func (m *BillingModule) Init(s *velocity.Services) error { return nil }
func (m *BillingModule) Start(s *velocity.Services) error { return nil }
func (m *BillingModule) Shutdown(ctx context.Context) error { return nil }
```

`vel gen command` writes a custom command implementing `Name()`,
`Description()`, and `Handle(s *velocity.Services, args []string) error`,
with the invocation name derived in kebab-case (`SyncInventory` becomes
`sync-inventory`). The generated file carries its own registration hint
(`r.Add(&SyncInventoryCommand{})`); once registered it runs through
[`vel run`](#vel-run).

### vel gen grpc service

```bash
vel gen grpc service <Name> [flags]
```

Scaffolds a gRPC service end-to-end in one call:

- `api/proto/<leaf>/v1/<name>.proto` - empty service block
- `api/proto/buf.yaml` + `api/proto/buf.gen.yaml` (first run only)
- `internal/grpc/services/<name>.go` - `<Name>Service` impl with a `New<Name>Service()` constructor and the `<alias>.Unimplemented<Name>ServiceServer` embed
- `internal/modules/grpc_module.go` - created on first call (unless `--no-module`), then **injected at** `// vel:grpc:imports` and `// vel:grpc:services` markers on every subsequent call. The module wires the service via `velgrpc.NewServer(...)` and `Register<Name>ServiceServer(...)`.

| Flag              | Default                     | Description                                                  |
| ----------------- | --------------------------- | ------------------------------------------------------------ |
| `--package`       | derived from `<Name>`       | Directory leaf under `api/proto/` and `api/gen/go/`          |
| `--proto-package` | `<leaf>.v1`                 | Full wire package, e.g. `velship.admin.v1`                   |
| `--dir`           | `internal/grpc/services`    | Go impl output directory                                     |
| `--alias`         | `<leaf>pb`                  | Import alias for the generated proto package                 |
| `--proto-name`    | lower-cased `<Name>` base   | Proto file base name (no extension)                          |
| `--impl-name`     | snake_case `<Name>` base    | Go impl file base name (no extension)                        |
| `--no-module`     | off                         | Skip module scaffolding / wiring (proto + impl only)         |

Name normalisation: `vel gen grpc service Foo`, `FooService`, `foo`, and `fooService` all produce the Go type `FooService` with proto package `foo.v1` and default import alias `foopb`. The proto file uses `option go_package = "<module>/api/gen/go/<leaf>/v1;<leaf>v1"` derived from the host project's `go.mod` (so the generated package itself is named `<leaf>v1`, referenced through the `foopb` alias).

`buf.yaml` / `buf.gen.yaml` are written **before** the proto file, so a config-write failure leaves no partial scaffold on disk. The generated `GRPCModule` does **not** hard-code `WithReflection(true)`; it reads `GRPC_PORT` (default `50051`) and otherwise takes the framework defaults, including reflection off unless `GRPC_REFLECTION=true`.

Wiring guards:

- If `internal/modules/grpc_module.go` already exists **without** the
  marker comments (legacy hand-written module), the command prints a
  manual wire snippet instead of mutating user code.
- If the existing module imports a services package other than this
  service's impl directory, the command stops **before** writing any
  file and tells you to re-run with `--no-module` and wire it by hand.
- When the module already imports the generated proto package under a
  different alias, that alias is reused rather than emitting a duplicate
  import.

```bash
vel gen grpc service Foo
vel gen grpc service ChatService
vel gen grpc service TemplateControl --package admin \
  --proto-package velship.admin.v1 --dir internal/shared/grpc/services --no-module
```

After scaffolding, register `&modules.GRPCModule{}` in
`internal/app/bootstrap.go` (printed as a hint on first run).

### vel gen grpc rpc

```bash
vel gen grpc rpc <Service> <RPC> [--stream | --client-stream | --bidi]
```

Appends a new rpc to an existing service's `.proto` and a matching method stub on the Go impl. The service must already exist; run `vel gen grpc service <Name>` first.

{{< callout type="warning" >}}
Both paths are derived from the service name alone, matching what
`vel gen grpc service` writes by default:
`api/proto/<name>/v1/<name>.proto` (lower-cased, no underscores) and
`internal/grpc/services/<name>.go` (snake_case). A service scaffolded
with `--package`, `--dir`, `--proto-name`, or `--impl-name` is not found
under those paths and has to be extended by hand; the error message
prints the exact path that was expected.
{{< /callout >}}

| Flag              | Aliases             | RPC shape produced                                |
| ----------------- | ------------------- | ------------------------------------------------- |
| _(none)_          |                     | Unary: `rpc X(XRequest) returns (XResponse)`      |
| `--stream`        | `--server-stream`   | Server-streaming: `returns (stream XResponse)`    |
| `--client-stream` |                     | Client-streaming: `(stream XRequest) returns (X)` |
| `--bidi`          | `--bidirectional`   | Bidi: `(stream XRequest) returns (stream X)`      |

Only one streaming flag may be set per invocation; combining them errors out.

The proto scanner walks the file with brace counting that respects `//` line comments, `/* block */` comments, and `"..."` string literals at every position (header keyword, between keyword and name, between name and `{`, and inside the body). That means rpc-with-options blocks (grpc-gateway HTTP annotations) and commented-out draft headers do not corrupt insertion.

On the Go side, the generated method signature matches the RPC shape (for service `Foo`, impl type `FooService`, default proto alias `foopb`):

| Shape         | Signature                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Unary         | `func (s *FooService) X(ctx context.Context, req *foopb.XRequest) (*foopb.XResponse, error)`    |
| Server stream | `func (s *FooService) X(req *foopb.XRequest, stream foopb.FooService_XServer) error`             |
| Client stream | `func (s *FooService) X(stream foopb.FooService_XServer) error`                                  |
| Bidi          | `func (s *FooService) X(stream foopb.FooService_XServer) error`                                  |

`context` is added to the impl's imports for unary only; streaming variants pull ctx from `stream.Context()` and do not need the import.

Idempotent: re-running with the same `<Service> <RPC>` pair detects the existing rpc and skips.

```bash
vel gen grpc rpc Foo Hello
vel gen grpc rpc Foo Tail --stream
vel gen grpc rpc Foo Upload --client-stream
vel gen grpc rpc Foo Chat --bidi
```

### vel gen grpc gen

```bash
vel gen grpc gen
```

Runs `buf generate` inside `api/proto`. Streams buf's stdout and stderr to your terminal so plugin errors are visible in real time. Takes no arguments, and fails with a clear message when:

- `api/proto/` does not exist (run `vel gen grpc service <Name>` first)
- `buf` is not on `PATH` (links to install docs)
- `buf generate` exits non-zero

```bash
vel gen grpc gen
# cd api/proto && buf generate
# Generated Go code in api/gen/go/
```

## Custom Commands

### vel run

Run a command your application registered.

```bash
vel run <command> [arguments]
```

Everything after the command name is passed straight through to the
command's `Handle(s *velocity.Services, args []string) error`, so
`vel run seed --fresh` reaches your code with `["--fresh"]`.

```bash
vel run              # list every registered command
vel run seed
vel run seed --fresh
```

`vel run` with no arguments prints the registered commands (or a hint to
create one with `vel gen command <Name>`). An unknown name prints the
same list and errors, and a flag-like first token (`vel run --bogus`) is
rejected as an unknown flag before the app bootstraps.

Custom commands are reachable only through `vel run`: typing one as a
bare `vel <name>` is an unknown command, so a command sharing a name
with a built-in never shadows it.

## Help

```bash
vel help
vel --help
vel -h
```

Prints a grouped list of every command: Server, Database, Queue &
Scheduler, Cache, Code Generation, Custom Commands, and Other. Running
`vel` with no arguments prints the same listing.
