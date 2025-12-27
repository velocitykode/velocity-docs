---
title: Getting Started
weight: 10
---

## Installation

### Prerequisites

- Go 1.25.1 or higher
- Git

### Install Velocity CLI

```bash
go install github.com/velocitykode/velocity/cmd/velocity@latest
```

Verify the installation:

```bash
velocity --version
```

## Creating Your First Project

### Quick Start Example

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
    log.Info("Server starting", "port", 3000)
    http.ListenAndServe(":3000", router.Get())
}
```

Define your routes in `routes/web.go`:

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

### Create a New Application

```bash
velocity new myapp
```

This creates a new Velocity application with:
- Automatic route discovery from `routes/` directory
- Auto-initialized logging with multiple drivers
- RESTful controller examples
- Environment-based configuration
- Basic project structure
- Ready-to-use controllers and models

### Project Structure

```
myapp/
├── app/
│   ├── controllers/     # HTTP controllers
│   ├── middleware/       # Custom middleware
│   └── models/          # Database models
├── config/              # Configuration files
├── database/
│   ├── migrations/      # Database migrations
│   └── seeders/        # Database seeders
├── public/             # Static assets
├── resources/
│   └── views/          # View templates
├── routes/             # Route definitions
├── storage/            # File storage
├── .env                # Environment variables
├── go.mod              # Go module file
└── main.go             # Application entry point
```

## Running Your Application

### Development Server

Start the development server with hot reload:

```bash
cd myapp
velocity serve
```

Your application will be available at `http://localhost:3000`.

The development server features:
- **Hot Reload**: Automatically restarts on code changes
- **Error Pages**: Detailed error pages with stack traces
- **Request Logging**: Detailed request/response logging

### Building for Production

Create an optimized production build:

```bash
velocity build
```

This creates a single binary with:
- Embedded templates and assets
- Optimized for performance
- Ready for deployment

Run the production binary:

```bash
./myapp
```

## Configuration

### Environment Variables

Velocity uses `.env` files for configuration:

```bash
APP_NAME=MyApp
APP_ENV=development
APP_URL=http://localhost:3000

# Logging
LOG_DRIVER=console      # console, file
LOG_PATH=./storage/logs
LOG_LEVEL=debug

DB_CONNECTION=postgres
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=myapp
DB_USERNAME=user
DB_PASSWORD=password

CACHE_DRIVER=redis
QUEUE_CONNECTION=redis
```

### Configuration Files

Configuration files are stored in the `config/` directory:

```go
// config/app.go
package config

import "github.com/velocitykode/velocity/config"

func App() config.Config {
    return config.Config{
        "name": config.Env("APP_NAME", "Velocity"),
        "env":  config.Env("APP_ENV", "production"),
        "url":  config.Env("APP_URL", "http://localhost"),
    }
}
```

