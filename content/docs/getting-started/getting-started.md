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
brew tap velocitykode/tap
brew install velocity
```
{{< /tab >}}

{{< tab name="Go" >}}
```bash
go install github.com/velocitykode/velocity-cli@latest
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
Building an API without a frontend? Use `velocity new myapi --api` to create an API-only project. See the [Installer Commands](/docs/cli/installer/) page for the full `velocity new` flag reference.
{{< /callout >}}

- **Go server**: http://localhost:4000
- **Vite dev server**: http://localhost:5173

### Project Structure

```
myapp/
├── internal/
│   ├── app/             # app.Bootstrap: middleware, providers, event listeners
│   ├── handlers/        # HTTP handlers
│   ├── middleware/      # Custom middleware
│   └── models/          # Database models
├── config/              # Configuration files
├── database/
│   └── migrations/      # Database migrations
├── public/              # Static assets
├── resources/
│   ├── js/              # JavaScript/React files
│   ├── css/             # Stylesheets
│   └── views/           # Root HTML template (Inertia)
├── routes/              # Route definitions
├── storage/
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
`internal/app`) where you configure middleware, providers, and event
listeners. `routes.Register(v)` registers your routes against
`v.Router`, and `v.Serve()` starts the HTTP server.

{{< callout type="info" >}}
`*velocity.App` also exposes a fluent bootstrap chain -
`v.Providers(...)`, `v.Middleware(...)`, `v.Routes(...)`,
`v.Events(...)`, `v.Schedule(...)`, `v.Commands(...)`, and
`v.Exceptions(...)` - if you prefer to wire everything from `main.go`.
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

Start the development server with hot reload:

```bash
vel serve
```

The development server includes:
- **Hot Reload**: Automatically restarts when Go files change
- **Error Pages**: Detailed error messages with stack traces
- **Request Logging**: Logs all requests and responses

### Serve Options

```bash
# Custom port
vel serve --port 8080

# Disable hot reload
vel serve --no-watch

# Specify environment
vel serve --env production
```

## Building for Production

Create an optimized production build:

```bash
vel build
```

This produces a single binary with:
- Stripped debug symbols for smaller size
- Static linking for portability
- Ready for deployment

### Build Options

```bash
# Custom output path
vel build --output ./bin/myapp

# Cross-compile for Linux
vel build --os linux --arch amd64

# Build with Go build tags
vel build --tags prod
```

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
vel key:generate
```

This generates a fresh 32-byte key, base64-encodes it with a `base64:`
prefix, and writes it to `APP_KEY` in `.env` (creating the file if it
doesn't exist) - useful if you need to rotate the key or the installer
didn't run `key:generate` for you.

## Next Steps

- [CLI Reference](/docs/cli/) - Full CLI command documentation
- [Routing](/docs/core/routing/) - Learn about routing and middleware
- [Database](/docs/database/) - Set up database connections and models
- [Frontend](/docs/frontend/) - Configure Vite and Inertia.js
