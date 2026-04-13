---
title: Routing
description: Define routes in Velocity using the Routing API.
weight: 50
---

Routes are registered through a `Register` function that receives a
`*velocity.Routing` and is wired into your application via `v.Routes(...)`.

## routes/web.go

```go
package routes

import (
    "myapp/internal/handlers"
    "myapp/internal/middleware"

    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/router"
)

func Register(r *velocity.Routing) {
    r.Health("/health")
    r.Static("public")

    r.Web(func(web router.Router) {
        web.Get("/about", handlers.About)

        web.Group("", func(guest router.Router) {
            guest.Get("/login", handlers.AuthShowLoginForm)
            guest.Post("/login", handlers.AuthLogin)
            guest.Get("/register", handlers.AuthShowRegisterForm)
            guest.Post("/register", handlers.AuthRegister)
        }).Use(middleware.Guest)

        web.Post("/logout", handlers.AuthLogout)

        web.Group("", func(auth router.Router) {
            auth.Get("/", handlers.Dashboard)
            auth.Get("/dashboard", handlers.Dashboard).Name("dashboard")
        }).Use(middleware.Auth)
    })

    r.API("/api/v1", func(api router.Router) {
        api.Get("/users", handlers.ListUsers)
        api.Post("/users", handlers.CreateUser)
    })
}
```

## main.go

```go
package main

import (
    "log"
    "os"

    "myapp/internal/app"
    "myapp/routes"

    "github.com/velocitykode/velocity"
)

func main() {
    v, err := velocity.New()
    if err != nil {
        log.Fatal(err)
    }

    chain := v.
        Providers(app.Configure).
        Middleware(app.Middleware).
        Routes(routes.Register).
        Events(app.Events(v.Log))

    if len(os.Args) > 1 {
        if err := chain.Run(); err != nil {
            log.Fatal(err)
        }
        return
    }

    if err := chain.Serve(); err != nil {
        log.Fatal(err)
    }
}
```

## What's available on `*velocity.Routing`

- `r.Health(path)` — register a health-check endpoint
- `r.Static(dir)` — serve static files from a directory
- `r.Web(fn)` — register routes with the web middleware stack
- `r.API(prefix, fn)` — register routes under a prefix with the API middleware stack

## What's available on `router.Router`

- `Get`, `Post`, `Put`, `Delete`, `Patch`, `Options`, `Head` — HTTP method handlers
- `Group(prefix, fn) Router` — sub-group of routes (chain `.Use(...)` to apply middleware)
- `Use(...MiddlewareFunc) Router` — apply middleware to all routes in this scope

Each method handler returns a `RouteConfig` which exposes:

- `.Name(name)` — name the route
- `.Use(...MiddlewareFunc)` — apply middleware to just that route
