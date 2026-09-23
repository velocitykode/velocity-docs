---
title: vel Commands
description: How the per-project `vel` CLI parses commands, and where each command is documented.
weight: 50
keywords: [vel commands, velocity cli, migrations, code generation, hot reload]
aliases: ["/docs/cli/commands/", "/docs/cli/"]
---

`vel` runs your project's commands. Each project builds its own CLI
binary, `./vel`, from its `main.go`, so every command comes from the
framework version the project pins. The global `vel` launcher, installed
with the [Velocity Installer]({{< relref "installer" >}}), finds the
enclosing project from any subdirectory, rebuilds `./vel` when the source
changed, and hands it the command line.

Without the launcher, run `./vel <command>` (`.\vel.exe` on Windows) or
`go run . <command>` from the project root. They behave the same.

For the installer CLI (`velocity new`, `velocity config`, etc.),
see [Velocity Installer]({{< relref "installer" >}}).

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
  through as an argument, and `vel run report` resolves to `run` with
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

## Commands

Each command is documented on the page for the feature it drives.

| Command | Documented in |
| --- | --- |
| `vel serve` | [Getting Started]({{< relref "/docs/getting-started/getting-started#development-server" >}}) |
| `vel build` | [Getting Started]({{< relref "/docs/getting-started/getting-started#building-for-production" >}}) |
| `vel key generate` | [Getting Started]({{< relref "/docs/getting-started/getting-started#regenerating-the-application-key" >}}) |
| `vel migrate`, `migrate fresh`, `migrate rollback`, `migrate status` | [Migrations]({{< relref "/docs/database/migrations#running-migrations" >}}) |
| `vel db seed`, `vel db wipe` | [Seeding]({{< relref "/docs/database/seeding#running-seeders" >}}) |
| `vel queue work` | [Queue]({{< relref "/docs/advanced/queue#the-worker-cli" >}}) |
| `vel schedule work` | [Scheduler]({{< relref "/docs/advanced/scheduler#separate-process-via-the-cli" >}}) |
| `vel cache clear` | [Cache]({{< relref "/docs/core/cache#clearing-from-the-cli" >}}) |
| `vel routes` | [Routing]({{< relref "/docs/core/routing#listing-routes" >}}) |
| `vel down`, `vel up` | [Maintenance Mode]({{< relref "/docs/advanced/maintenance-mode" >}}) |
| `vel run` | [Console Commands]({{< relref "/docs/advanced/commands" >}}) |

### Generators

Every generator lives under `gen <artifact>` and scaffolds one file into
the conventional directory for that artifact. All of them accept
`--dir <path>` to write somewhere else; the value must stay inside the
project tree and must not route through a symlink. Existing files are
never overwritten.

Names are normalised before use: the artifact's own kind suffix is
stripped and the rest is PascalCased, so `vel gen policy PostPolicy` and
`vel gen policy Post` both write `internal/policies/post.go` holding
`type PostPolicy`. File names are the snake_case form. Passing nothing
but the suffix (`vel gen module Module`) errors rather than writing a
file named `.go`.

| Command | Documented in |
| --- | --- |
| `vel gen handler` | [Handlers]({{< relref "/docs/core/handlers#scaffolding-a-handler" >}}) |
| `vel gen model` | [Database: Getting Started]({{< relref "/docs/database/getting-started#scaffolding-a-model" >}}) |
| `vel gen migration` | [Migrations]({{< relref "/docs/database/migrations#creating-migrations" >}}) |
| `vel gen seeder` | [Seeding]({{< relref "/docs/database/seeding#writing-a-seeder" >}}) |
| `vel gen middleware` | [Middleware]({{< relref "/docs/core/middleware#scaffolding-middleware" >}}) |
| `vel gen event`, `vel gen listener` | [Events]({{< relref "/docs/advanced/events#scaffolding-events-and-listeners" >}}) |
| `vel gen job` | [Queue]({{< relref "/docs/advanced/queue#scaffolding-a-job" >}}) |
| `vel gen mail` | [Mail]({{< relref "/docs/advanced/mail#scaffolding-a-mailable" >}}) |
| `vel gen notification` | [Notifications]({{< relref "/docs/advanced/notifications#scaffolding-a-notification" >}}) |
| `vel gen resource` | [Resources]({{< relref "/docs/core/resource#scaffolding-a-resource" >}}) |
| `vel gen policy` | [Authentication]({{< relref "/docs/core/authentication#scaffolding-a-policy" >}}) |
| `vel gen module` | [Modules]({{< relref "/docs/advanced/modules#scaffolding-a-module" >}}) |
| `vel gen command` | [Console Commands]({{< relref "/docs/advanced/commands#scaffold-a-command" >}}) |
| `vel gen grpc service`, `gen grpc rpc`, `gen grpc gen` | [gRPC]({{< relref "/docs/advanced/grpc#generators" >}}) |

## Help

```bash
vel help
vel --help
vel -h
```

Prints a grouped list of every command: Server, Database, Queue &
Scheduler, Cache, Code Generation, Custom Commands, and Other. Running
`vel` with no arguments prints the same listing.
