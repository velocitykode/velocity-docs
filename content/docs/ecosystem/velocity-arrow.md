---
title: Velocity Arrow
description: A first-party MCP server that gives AI coding agents live, grounded context about your Velocity application - routes, config, database schema, queries, recent logs, and documentation search.
weight: 20
---

Velocity Arrow is a first-party, ready-to-run [MCP](https://modelcontextprotocol.io) server for
your Velocity application. It runs alongside your project and exposes a set of
tools that an AI coding agent can call to read **live context** about the app it
is helping you build: the registered routes, the resolved configuration, the
database schema and ad-hoc read-only queries, the most recent log entries and
errors, and a search index over the Velocity documentation.

Instead of guessing at your app's shape from stale training data, an agent can
ask Arrow what is actually there - the tables that exist right now, the value of
a config key, the last error in the log - and write code grounded in that
reality.

{{% callout type="info" %}}
Arrow speaks the Model Context Protocol over stdio. Any MCP-capable client
(Claude Code, Cursor, Codex, and others) can launch the `arrow` binary and call
its tools. The protocol details are defined by the
[MCP specification](https://modelcontextprotocol.io); this page covers Arrow's
tools and how to wire it up.
{{% /callout %}}

Arrow is built on Velocity itself. It reads configuration through
`velocity.ConfigFromEnv()`, connects to your database with Velocity's ORM
manager, and registers the standard ORM drivers (postgres, mysql, sqlite) so its
database tools work against any project - not just sqlite.

- **Module**: `github.com/velocitykode/velocity-arrow`
- **Binary**: `arrow`
- **Transport**: stdio

## Install

Install the `arrow` binary with `go install`:

```bash
go install github.com/velocitykode/velocity-arrow/cmd/arrow@latest
```

This places `arrow` in your `$GOBIN` (typically `~/go/bin`). Make sure that
directory is on your `PATH`.

You can also build it from a checkout:

```bash
git clone https://github.com/velocitykode/velocity-arrow
cd velocity-arrow
go build -o arrow ./cmd/arrow
```

{{% callout type="info" %}}
Several tools shell out to the per-project `vel` CLI when it is available (for
example, `velocity_routes` prefers `vel routes` for an accurate route table and
falls back to static analysis otherwise). Installing `vel` in your project gives
the most accurate results. See {{< relref "/docs/cli/commands" >}}.
{{% /callout %}}

## Run as an MCP server

Arrow runs as an MCP server over stdio. Start it from your Velocity project
directory with the `mcp` subcommand:

```bash
cd /path/to/your/velocity-app
arrow mcp
```

The server reads the current working directory's `go.mod`, `.env`, route files,
log files, and database. Run it from the root of the Velocity project you want
the agent to reason about.

Most of the time you will not run `arrow mcp` by hand - your MCP client launches
it for you (see below). Running it directly is useful for a quick smoke test.

## Wire it into an MCP client

MCP clients discover servers from an `.mcp.json` file (the exact filename and
location depend on the client). Point the client at the `arrow` binary and pass
the `mcp` subcommand as an argument:

```json
{
  "mcpServers": {
    "velocity-arrow": {
      "command": "/Users/you/go/bin/arrow",
      "args": ["mcp"]
    }
  }
}
```

Use the absolute path to the `arrow` binary (the output of `which arrow`), or
just `"arrow"` if it is on the client's `PATH`. The client launches the process
with your project directory as the working directory, so Arrow sees the right
`go.mod`, `.env`, logs, and database.

{{% callout type="warning" %}}
Arrow reads your `.env` and connects to your database. The database tools are
**read-only** - `velocity_db_query` rejects anything other than `SELECT`,
`SHOW`, `EXPLAIN`, `DESCRIBE`, and `WITH ... SELECT`, and blocks `INSERT`,
`UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`, and
`REVOKE`. Secret keys (`APP_KEY`, `DB_PASSWORD`, anything containing `SECRET`,
`PASSWORD`, or `TOKEN`, and similar) are redacted from `velocity_config`
output. Point Arrow at development environments, not production.
{{% /callout %}}

## Tools

Arrow registers eight tools. Tool names are prefixed `velocity_` so they read
clearly in a client's tool list.

| Tool | Arguments | What it returns |
| ---- | --------- | --------------- |
| `velocity_app_info` | (none) | Application info parsed from `go.mod`: module path, Go version, detected Velocity version, the full dependency list, and any registered providers it can find by scanning `app/`, `cmd/`, and `main.go`. |
| `velocity_db_schema` | `summary` (bool, default `true`), `filter` (string), `database` (string) | The database schema via Velocity's ORM introspection. Summary mode lists table names and column types; with `summary=false` it emits a full table with nullability, default, and primary-key columns. `filter` narrows to tables whose name contains a substring. |
| `velocity_db_query` | `query` (string, required), `database` (string) | The rows from a read-only SQL query, rendered as JSON with a row count. Only `SELECT`, `SHOW`, `EXPLAIN`, `DESCRIBE`, and `WITH ... SELECT` are permitted; write/DDL statements are rejected. |
| `velocity_routes` | (none) | The registered routes - method, path, handler, and middleware. Prefers the `vel routes` CLI for accuracy and falls back to static analysis of `routes/`, `app/routes.go`, and `main.go`. |
| `velocity_search_docs` | `queries` (array of strings, required), `packages` (array of strings), `token_limit` (number, default `3000`) | Ranked matches from the embedded Velocity documentation, scored with TF-IDF. `packages` filters by package name (e.g. `orm`, `cache`, `queue`); `token_limit` caps the response size. |
| `velocity_last_error` | (none) | The most recent `ERROR` entry from the application log file, truncated to 500 characters. |
| `velocity_log_entries` | `entries` (number, default `10`, max `100`) | The last N parsed entries from the application log file. |
| `velocity_config` | `key` (string) | Configuration from `.env` and resolved config. With `key`, returns that single value (redacted if it is a secret); without it, returns a non-secret summary plus the grouped raw `.env` values. |

### How the tools find your data

- **Config** (`velocity_config`, and the database tools) is resolved with
  `velocity.ConfigFromEnv()`, the same loader your app uses, reading `.env` from
  the working directory.
- **Database** (`velocity_db_schema`, `velocity_db_query`) connects through
  Velocity's ORM manager built from `config.DB`, so the same connection settings
  your app uses apply here. Schema introspection uses the ORM's dialect-aware
  grammars, so it works identically across postgres, mysql, and sqlite.
- **Logs** (`velocity_last_error`, `velocity_log_entries`) read from the log
  directory in your log config (`Log.Config["path"]`), defaulting to
  `./storage/logs`. Arrow looks for today's `velocity-YYYY-MM-DD.log` first,
  then the most recent `velocity-*.log`, then a single `velocity.log`.
- **Routes** (`velocity_routes`) prefer the `vel routes` CLI when it is on the
  `PATH`, falling back to parsing route registration calls (`Get`, `Post`,
  `Resource`, and friends) out of your source.

## A typical agent session

With Arrow wired in, an agent working on a feature might:

1. Call `velocity_app_info` to learn the module path, Velocity version, and
   installed packages.
2. Call `velocity_routes` to see what endpoints already exist before adding a
   new one.
3. Call `velocity_db_schema` (summary first, then a specific table) to model
   data correctly, and `velocity_db_query` to inspect sample rows.
4. Call `velocity_search_docs` with `queries` like `["queue dispatch"]` to pull
   the relevant Velocity documentation into context.
5. Call `velocity_last_error` or `velocity_log_entries` when something breaks,
   to read the actual failure instead of guessing.

Every answer is grounded in the live state of your project, so the code the
agent writes matches the app you actually have.

## See also

- {{< relref "/docs/cli/commands" >}} - the per-project `vel` CLI that Arrow
  shells out to for route listing.
- {{< relref "/docs/advanced/events" >}} - Velocity's event system, one of the
  many features an agent can discover through `velocity_search_docs`.
