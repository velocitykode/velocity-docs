---
title: Getting Started
description: Install Velocity CLI, create your first Go web application, and run the development server with hot reload.
weight: 10
---

## Installation

### Prerequisites

- Go 1.26 or higher
- Node.js 18+ (for frontend assets)
- Git

### Install the Velocity CLI

{{< tabs items="Homebrew,Go" >}}

{{< tab name="Homebrew" >}}
```bash
brew install --cask velocitykode/tap/velocity
```
{{< /tab >}}

{{< tab name="Go" >}}
```bash
go install github.com/velocitykode/velocity-installer@latest
```
{{< /tab >}}

{{< /tabs >}}

Verify the installation:

```bash
velocity --version
```

## Creating Your First Project

Create a new Velocity application:

```bash
velocity new myapp
```

This creates a new project and automatically starts the development servers. Your application will be available at:

{{< callout type="tip" >}}
Building an API without a frontend? Use `velocity new myapi --api` to create an API-only project. See the [Velocity Installer]({{< relref "installer" >}}) page for the full `velocity new` flag reference.
{{< /callout >}}

- **Go server**: http://localhost:4000
- **Vite dev server**: http://localhost:5173

### Project Structure

```
myapp/
├── internal/
│   ├── app/             # app.Bootstrap: middleware, modules, event listeners
│   ├── commands/        # Custom vel commands
│   ├── handlers/        # HTTP handlers
│   ├── middleware/      # Custom middleware
│   └── models/          # Database models
├── config/              # Configuration files
├── database/
│   ├── factories/       # Model factories for tests and seeding
│   ├── migrations/      # Database migrations
│   └── seeders/         # Database seeders
├── public/              # Static assets
├── resources/
│   ├── js/              # JavaScript/React files
│   ├── css/             # Stylesheets
│   └── views/           # Root HTML template (Inertia)
├── routes/              # Route definitions
├── storage/
│   ├── app/             # Local file storage
│   └── logs/            # Application logs
├── .env                 # Environment variables
├── go.mod               # Go module file
├── package.json         # Node.js dependencies (full-stack only)
├── vite.config.ts       # Vite configuration
└── main.go              # Application entry point
```

## Quick Start Example

Here's what the generated `main.go` looks like:

```go
package main

import (
    "log"

    "myapp/internal/app"
    "myapp/routes"

    "github.com/velocitykode/velocity"
)

func main() {
    v, err := velocity.New()
    if err != nil {
        log.Fatal(err)
    }

    if err := app.Bootstrap(v); err != nil {
        log.Fatal(err)
    }

    routes.Register(v)

    if err := v.Serve(); err != nil {
        log.Fatal(err)
    }
}
```

`velocity.New()` builds the application container (logger, crypto, DB,
cache, queue, router, …) and returns an `*velocity.App`.
`app.Bootstrap(v)` is your own bootstrap function (scaffolded into
`internal/app`) where you configure middleware, modules, and event
listeners. `routes.Register(v)` registers your routes against
`v.Router`, and `v.Serve()` starts the HTTP server.

{{< callout type="info" >}}
`*velocity.App` also exposes a fluent bootstrap chain -
`v.Modules(...)`, `v.Middleware(...)`, `v.Routes(...)`,
`v.Events(...)`, `v.Schedule(...)`, `v.Commands(...)`, `v.Seeders(...)`,
and `v.Exceptions(...)` - if you prefer to wire everything from `main.go`.
Call `v.Run()` to dispatch a `vel ...` command from `os.Args`, or
`v.Serve()` to start the server.
{{< /callout >}}

Define routes in `routes/web.go`:

```go
package routes

import (
    "myapp/internal/handlers"

    "github.com/velocitykode/velocity"
)

func Register(v *velocity.App) {
    r := v.Router

    r.Get("/", handlers.Home)
}
```

Handlers have the signature `func(ctx *router.Context) error`:

```go
package handlers

import (
    "github.com/velocitykode/velocity/router"
)

func Home(ctx *router.Context) error {
    return ctx.String(200, "Welcome to Velocity!")
}
```

See [Routing](/docs/core/routing) for groups, middleware stacks, API
routes, and the full reference.

## Development Server

Start the development server with live reload:

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

See [Local Development]({{< relref "local-development" >}}) for what
this feels like day to day.

{{< callout type="info" >}}
`vel serve run` is the internal entry point the watcher uses to launch
the compiled child process. It's dispatchable but not meant to be typed
by hand, so it's omitted from `vel help`.
{{< /callout >}}

## Building for Production

Compile a single production binary:

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

## Configuration

### Environment Variables

Velocity uses `.env` files for configuration. The installer writes a
full `.env` with random keys; the most commonly edited values:

```bash
APP_NAME=MyApp
APP_ENV=development
APP_URL=http://localhost:4000
APP_PORT=4000

# Logging
LOG_DRIVER=console      # console, file
LOG_LEVEL=debug

# Encryption / signing - installer populates these at scaffold time
APP_KEY=
QUEUE_SIGNING_KEY=
AUTH_JWT_SECRET=
CRYPTO_CIPHER=AES-256-GCM

# Database
DB_CONNECTION=sqlite    # postgres, mysql, sqlite
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=database.sqlite
DB_USERNAME=
DB_PASSWORD=

# Cache
CACHE_DRIVER=memory     # memory, file, redis, database
```

`APP_KEY` doubles as the crypto key. Set `CRYPTO_KEY` explicitly only
if you want a dedicated encryption key separate from the app key.

### Regenerating the application key

```bash
vel key generate
```

Generates a fresh 32-byte encryption key and writes it to `.env` under
`APP_KEY`, base64-encoded with a `base64:` prefix. If `.env` does not
exist it is created; an existing `APP_KEY=` line is replaced in place,
and a file without one gets the key prepended as its first line. The
file is written owner-only (`0600`). Takes no arguments. Use it to
rotate the key or when the installer did not run it for you.

## Next Steps

- [Starter Kits]({{< relref "starter-kits" >}}) - What the React, Vue, and API kits ship and how to pick one
- [CLI Reference]({{< relref "/docs/cli" >}}) - Full CLI command documentation
- [Routing]({{< relref "/docs/core/routing" >}}) - Learn about routing and middleware
- [Database]({{< relref "/docs/database" >}}) - Set up database connections and models
- [Frontend]({{< relref "/docs/frontend" >}}) - Configure Vite and Inertia.js
- [Testing]({{< relref "/docs/testing" >}}) - HTTP tests, factories, and database refresh
- [Arrow]({{< relref "/docs/ai/arrow" >}}) - Give AI coding agents live context about your app
