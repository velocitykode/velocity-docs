---
title: Local Development
description: What Velocity does for you during local development - one command runs Go and Vite, Go changes rebuild and restart the server, frontend edits hot-reload, and new migrations compile straight into the app with no registration step.
weight: 13
---

Local development is one command. `./vel serve` starts everything, watches
your source, and keeps the running app current while you work. This page
describes exactly what happens in the background so you know what you never
have to do by hand.

```bash
./vel serve
```

## One command runs the whole app

On start, `vel serve`:

1. Loads `.env`, resolves `APP_PORT` (default `4000`) and `APP_ENV`
   (default `development`); `--port` and `--env` override both.
2. Starts the Vite dev server when a `package.json` exists, with
   `npm run dev`, or `bun run dev` when `bun` is on your `PATH` and a
   `bun.lock` file is present. API kits have no `package.json`, so this
   step is skipped.
3. Compiles your Go app to `.vel/tmp/server` and launches it.

`Ctrl-C` stops the Go server and the Vite process together. `--no-watch`
runs the server once without the file watcher.

## Go changes rebuild and restart automatically

The watcher tracks every `.go` file under the project, skipping `vendor`,
`node_modules`, `.git`, `.vel`, and `tmp`. When you save:

- Changes are debounced for 500ms, so a burst of saves triggers one rebuild.
- The running server is stopped, the app is rebuilt with `go build`, and the
  new binary starts on the same port.
- The project's `./vel` binary is rebuilt too. Go's build cache makes this
  near-instant since the same source was just compiled. One-shot commands in
  another terminal, such as `./vel routes`, `./vel migrate`, or
  `./vel gen ...`, always see your current code.

If the build fails, the compiler output is printed and the watcher waits for
your next save; there is no stale server left running on old code.

`.env` is read when the server process starts. It is not watched, so after
editing it restart `./vel serve` or save any Go file to trigger a restart.

## Frontend changes hot-reload

For the React and Vue kits, Vite serves your assets during development with
hot module replacement. Editing a page, component, or stylesheet updates the
browser in place without a full reload and without touching the Go process.

The wiring is automatic. The Velocity Vite plugin writes a `public/hot`
marker holding the dev-server origin while Vite runs, and the `vite` template
helper in `resources/views/app.html` reads it: with the marker present it
emits the `@vite/client` script and the dev entry; without it, in production,
it emits the hashed `<link>` and `<script>` tags from the build manifest.
The marker is removed when Vite stops.

## Migrations need no registration

Migrations are Go code, compiled into your binary. Each file in
`database/migrations` registers itself in an `init()` function, and the
starter kits blank-import that package from `main.go`, so the package is
always linked in.

```bash
./vel gen migration create_posts_table --create posts
```

That is the whole workflow. The generator writes the file, `vel serve`
notices the new `.go` file and rebuilds, and the refreshed `./vel` binary
already knows the migration:

```bash
./vel migrate
```

There is no manifest to edit, no list to append to, and nothing to cache or
clear. Ordering comes from the 14-digit timestamp in each migration's
`Version`, and registering the same version twice fails at startup rather
than at migrate time.

## Generators for the rest

Every other piece of an app scaffolds the same way and lands in the
conventional directory, ready to compile on the next save:

```bash
./vel gen handler PostHandler
./vel gen model Post
./vel gen middleware RateLimit
./vel gen job SendDigest
./vel gen policy PostPolicy
```

See the [CLI reference]({{< relref "/docs/cli/commands" >}}) for the full
generator list and flags.

## Give your AI agent the same view

[Arrow]({{< relref "/docs/ai/arrow" >}}) runs alongside the project and
exposes the live app to AI coding agents: registered routes, resolved
config, database schema, recent logs, and the documentation index. The
agent reads the real state of your app instead of guessing from source.
