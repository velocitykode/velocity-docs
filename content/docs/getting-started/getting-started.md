---
title: Getting Started
description: Install Velocity CLI, create your first Go web application, and run the development server with hot reload.
weight: 10
---

## Installation

### Prerequisites

- Go 1.25 or higher
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
velocity version
```

## Creating Your First Project

Create a new Velocity application:

```bash
velocity new myapp
```

This creates a new project and automatically starts the development servers. Your application will be available at:

- **Go server**: http://localhost:4000
- **Vite dev server**: http://localhost:5173

### Project Structure

```
myapp/
├── app/
│   ├── handlers/     # HTTP handlers
│   ├── middleware/      # Custom middleware
│   └── models/          # Database models
├── config/              # Configuration files
├── database/
│   ├── migrations/      # Database migrations
│   └── seeders/         # Database seeders
├── public/              # Static assets
├── resources/
│   ├── js/              # JavaScript/React files
│   ├── css/             # Stylesheets
│   └── views/           # View templates
├── routes/              # Route definitions
├── storage/             # File storage and logs
├── .env                 # Environment variables
├── go.mod               # Go module file
├── package.json         # Node.js dependencies
├── vite.config.js       # Vite configuration
└── main.go              # Application entry point
```

## Quick Start Example

Here's what the generated `main.go` looks like:

```go
package main

import (
    "net/http"
    _ "myapp/routes" // Auto-register all routes

    "github.com/velocitykode/velocity/pkg/log"
    "github.com/velocitykode/velocity/pkg/router"
)

func main() {
    // Logger auto-initializes from .env
    log.Info("Application started")

    // Load all registered routes
    router.LoadRoutes()

    // Start server with router
    log.Info("Server starting", "port", 4000)
    http.ListenAndServe(":4000", router.Get())
}
```

Define routes in `routes/web.go`:

```go
package routes

import (
    "github.com/velocitykode/velocity/pkg/router"
)

func init() {
    router.Register(func(r router.Router) {
        r.Get("/", func(ctx *router.Context) error {
            ctx.Response.Write([]byte("Welcome to Velocity!"))
            return nil
        })
    })
}
```

## Development Server

Start the development server with hot reload:

```bash
velocity serve
```

The development server includes:
- **Hot Reload**: Automatically restarts when Go files change
- **Error Pages**: Detailed error messages with stack traces
- **Request Logging**: Logs all requests and responses

### Serve Options

```bash
# Custom port
velocity serve --port 8080

# Disable hot reload
velocity serve --watch=false

# Specify environment
velocity serve --env production
```

## Building for Production

Create an optimized production build:

```bash
velocity build
```

This produces a single binary with:
- Stripped debug symbols for smaller size
- Static linking for portability
- Ready for deployment

### Build Options

```bash
# Custom output path
velocity build --output ./bin/myapp

# Cross-compile for Linux
velocity build --os linux --arch amd64

# Embed version information
velocity build --version 1.0.0
```

## Configuration

### Environment Variables

Velocity uses `.env` files for configuration:

```bash
APP_NAME=MyApp
APP_ENV=development
APP_URL=http://localhost:4000

# Logging
LOG_DRIVER=console      # console, file
LOG_PATH=./storage/logs
LOG_LEVEL=debug

# Database
DB_CONNECTION=sqlite    # postgres, mysql, sqlite
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=myapp
DB_USERNAME=user
DB_PASSWORD=password

# Cache
CACHE_DRIVER=memory     # redis, memory

# Security
CRYPTO_KEY=             # Run: velocity key:generate
```

### Generate Application Key

Generate a secure encryption key:

```bash
velocity key:generate
```

This updates the `CRYPTO_KEY` in your `.env` file automatically.

## Next Steps

- [CLI Reference](/docs/cli/) - Full CLI command documentation
- [Routing](/docs/core/routing/) - Learn about routing and middleware
- [Database](/docs/database/) - Set up database connections and models
- [Frontend](/docs/frontend/) - Configure Vite and Inertia.js
