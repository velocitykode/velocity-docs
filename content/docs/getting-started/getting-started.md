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
│   ├── app/             # Bootstrap: CSRF, view engine, middleware stacks
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
    "os"

    "myapp/internal/app"
    "myapp/routes"

    "github.com/velocitykode/velocity"

    // Blank import so each migration file's init() runs - otherwise
    // `vel migrate` finds nothing.
    _ "myapp/database/migrations"
)

func main() {
    v, err := velocity.New()
    if err != nil {
        log.Fatal(err)
    }

    chain := v.
        Providers(app.Configure).      // auth, CSRF, view engine setup
        Middleware(app.Middleware).    // global / web / API stacks
        Routes(routes.Register).       // your route definitions
        Events(app.Events(v.Log))      // your event listeners

    // With CLI args - dispatch a `vel ...` command.
    if len(os.Args) > 1 {
        if err := chain.Run(); err != nil {
            log.Fatal(err)
        }
        return
    }

    // Otherwise - start the HTTP server.
    if err := chain.Serve(); err != nil {
        log.Fatal(err)
    }
}
```

The four callbacks (`app.Configure`, `app.Middleware`, `app.Events`,
`routes.Register`) live in your own `app` and `routes` packages -
`velocity new` scaffolds them for you. See
[Routing](/docs/core/routing) and [Middleware](/docs/core/middleware)
for the shapes.

Define routes in `routes/web.go`:

```go
package routes

import (
    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/router"
)

func Register(r *velocity.Routing) {
    r.Web(func(web router.Router) {
        web.Get("/", func(ctx *router.Context) error {
            ctx.Response.Write([]byte("Welcome to Velocity!"))
            return nil
        })
    })
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
PORT=4000

# Logging
LOG_DRIVER=console      # console, file
LOG_LEVEL=info

# Encryption / signing - installer populates these at scaffold time
APP_KEY=
QUEUE_SIGNING_KEY=
JWT_SECRET=
CRYPTO_CIPHER=AES-256-CBC

# Database
DB_CONNECTION=sqlite    # postgres, mysql, sqlite
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=database.sqlite
DB_USERNAME=
DB_PASSWORD=

# Cache
CACHE_DRIVER=memory     # redis, memory
```

`APP_KEY` doubles as the crypto key. Set `CRYPTO_KEY` explicitly only
if you want a dedicated encryption key separate from the app key.

### Regenerating the application key

```bash
vel key:generate
```

This generates a fresh 32-byte base64 key and writes it to `.env` -
useful if you need to rotate the key or the installer didn't run
`key:generate` for you.

## Next Steps

- [CLI Reference](/docs/cli/) - Full CLI command documentation
- [Routing](/docs/core/routing/) - Learn about routing and middleware
- [Database](/docs/database/) - Set up database connections and models
- [Frontend](/docs/frontend/) - Configure Vite and Inertia.js
