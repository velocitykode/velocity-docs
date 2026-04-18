---
title: Routing
description: Define routes in Velocity using the declarative Routing API.
weight: 50
---

Velocity organizes routing around a single `Register` function in your
`routes` package. The framework calls it during bootstrap and hands
you a `*velocity.Routing` value - that value knows how to attach the
right middleware stack (web vs API) to each group of routes you
declare.

This page covers:

- Defining web and API routes with their middleware stacks
- Wiring `Register` into `main.go` via the declarative bootstrap chain
- Applying middleware to groups and individual routes
- The reference for `*velocity.Routing` and `router.Router`

For low-level details - the `Context` API, JSON binding, named-route
URL generation - see [HTTP Router](/docs/core/http-router).

## Defining routes

```go
// routes/web.go
package routes

import (
    "myapp/internal/handlers"
    "myapp/internal/middleware"

    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/router"
)

// Register is the single entry point. main.go passes this function to
// v.Routes(...) - the framework calls it with a *velocity.Routing
// already wired with the configured middleware stacks.
func Register(r *velocity.Routing) {
    // Operational endpoints sit at the top level - they don't run any
    // middleware stack so load balancers can probe /health cheaply.
    r.Health("/health")
    r.Static("public")

    r.Web(func(web router.Router) {
        // Public web pages
        web.Get("/", handlers.Home)        // /
        web.Get("/about", handlers.About)  // /about

        // Guest-only - middleware.Guest redirects authenticated users
        // to /dashboard.
        web.Group("", func(guest router.Router) {
            guest.Get("/login", handlers.AuthShowLoginForm)        // /login
            guest.Post("/login", handlers.AuthLogin)               // /login
            guest.Get("/register", handlers.AuthShowRegisterForm)  // /register
            guest.Post("/register", handlers.AuthRegister)         // /register
        }).Use(middleware.Guest)

        web.Post("/logout", handlers.AuthLogout)  // /logout

        // Authenticated - middleware.Auth redirects guests to /login.
        web.Group("", func(auth router.Router) {
            auth.Get("/dashboard", handlers.Dashboard).Name("dashboard")  // /dashboard
            auth.Get("/account", handlers.Account)                        // /account
        }).Use(middleware.Auth)
    })

    // API routes - every route here is prefixed with /api/v1 and runs
    // the API middleware stack (JSON enforcement, etc.). It does NOT
    // run the web stack - no sessions, no CSRF.
    r.API("/api/v1", func(api router.Router) {
        api.Get("/users", handlers.ListUsers)      // /api/v1/users
        api.Post("/users", handlers.CreateUser)    // /api/v1/users
        api.Get("/users/{id}", handlers.ShowUser)  // /api/v1/users/{id}
    })
}
```

## Wiring routes into the app

`main.go` builds the bootstrap chain - Providers (auth, CSRF, view
config), Middleware (the global / web / API stacks), Routes (this
file), Events (your listeners) - then either runs a CLI command or
serves HTTP based on whether arguments were passed.

```go
// main.go
package main

import (
    "log"
    "os"

    "myapp/internal/app"
    "myapp/routes"

    "github.com/velocitykode/velocity"

    // Blank import so each migration file's init() runs and calls
    // migrate.Register() - otherwise `vel migrate` finds nothing.
    _ "myapp/database/migrations"
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

    // With CLI args (`vel migrate`, `vel make:handler`, ...) dispatch
    // the command. Routes still need to be registered before this so
    // `vel route:list` sees them.
    if len(os.Args) > 1 {
        if err := chain.Run(); err != nil {
            log.Fatal(err)
        }
        return
    }

    // No args - start the HTTP server.
    if err := chain.Serve(); err != nil {
        log.Fatal(err)
    }
}
```

The callbacks (`app.Configure`, `app.Middleware`, `app.Events`,
`routes.Register`) live in your own packages. `velocity new`
scaffolds them; the relevant signatures are:

```go
// internal/app/bootstrap.go
func Configure(reg *velocity.ProviderRegistry)

// internal/app/middleware.go
func Middleware(m *velocity.MiddlewareStack)

// internal/app/events.go
func Events(logger log.Logger) func(events.Dispatcher)

// routes/web.go
func Register(r *velocity.Routing)
```

`Events` is a function that returns a function so the listener body
can capture the logger. The other three take a single configuration
value.

## HTTP verb methods

Inside a `r.Web(...)` or `r.API(...)` closure, every verb method
takes a path and a handler:

```go
web.Get("/users", handlers.ListUsers)          // /users
web.Post("/users", handlers.CreateUser)        // /users
web.Put("/users/{id}", handlers.ReplaceUser)   // /users/{id}
web.Patch("/users/{id}", handlers.UpdateUser)  // /users/{id}
web.Delete("/users/{id}", handlers.DeleteUser) // /users/{id}
web.Options("/users", handlers.UsersOptions)   // /users
web.Head("/users/{id}", handlers.HeadUser)     // /users/{id}
```

Path parameters use `{name}`. Read them in the handler with
`c.Param("name")` - see the [HTTP Router page](/docs/core/http-router#reading-parameters)
for the full Context API.

Each verb method returns a `RouteConfig` for chaining `.Name(...)`
and `.Use(...)`:

```go
web.Get("/posts/{id}", handlers.ShowPost).  // /posts/{id}
    Name("posts.show").
    Use(middleware.Cache(5 * time.Minute))
```

`.Name("posts.show")` registers the route under a stable identifier
so you can generate URLs from anywhere in the app - handlers,
templates, redirects - without hardcoding the path. Build a URL with
`r.Router().RouteURL("posts.show", map[string]string{"id": "42"})`
and you get `/posts/42` back. If you later rename the path to
`/articles/{id}`, every callsite using the name keeps working.

## Groups

`Group` opens a sub-router with a shared path prefix and (optionally)
shared middleware. Groups can nest.

### With a path prefix

```go
web.Group("/admin", func(admin router.Router) {
    admin.Get("/dashboard", handlers.AdminDashboard)  // /admin/dashboard
    admin.Post("/users/{id}/ban", handlers.BanUser)   // /admin/users/{id}/ban
}).Use(middleware.RequireAdmin)
```

### With no prefix - middleware grouping

A `""` prefix is the idiom for grouping routes purely so they share
middleware:

```go
web.Group("", func(auth router.Router) {
    auth.Get("/account", handlers.Account)  // /account
    auth.Get("/billing", handlers.Billing)  // /billing
}).Use(middleware.Auth)
```

### Nested groups

```go
r.API("/api", func(api router.Router) {
    api.Group("/v1", func(v1 router.Router) {
        v1.Get("/users", handlers.ListUsers)    // /api/v1/users
        v1.Post("/users", handlers.CreateUser)  // /api/v1/users
    })

    api.Group("/v2", func(v2 router.Router) {
        v2.Get("/users", handlers.ListUsersV2)  // /api/v2/users
    })
})
```

Each level inherits the parent's prefix and middleware.

## Reference: `*velocity.Routing`

The value `Register` receives. Use it to declare the top-level shape
of your routes - health checks, static assets, web group, API groups.

| Method                  | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `r.Web(fn)`             | Open a web group. Inside, the configured **web** middleware stack runs (sessions, CSRF, view engine). Use for browser/HTML routes. |
| `r.API(prefix, fn)`     | Open an API group under `prefix`. Inside, the configured **api** middleware stack runs (JSON enforcement, etc.). Use for JSON APIs. |
| `r.Health(path)`        | Register a `GET path` that returns `200 OK` with body `OK`. Sits outside any middleware stack - load balancers can probe it without paying for sessions/CSRF. |
| `r.Static(dir)`         | Serve every file under `dir` as a static asset at the URL path matching the relative file path. Also outside middleware stacks. |
| `r.Services()`          | Get the `*app.Services` container - useful when you need a service at registration time rather than via the request context. |
| `r.Router()`            | Escape hatch - returns the underlying `*router.VelocityRouterV2`. Reach for this only when none of the above fits. |

## Reference: `router.Router`

The value passed into your `r.Web(...)` / `r.API(...)` / `Group(...)`
closures. The routing primitive - verb methods, sub-groups, middleware.

### Verb methods

| Method                              | Purpose                  |
| ----------------------------------- | ------------------------ |
| `Get(path, handler) RouteConfig`    | Register a `GET` route   |
| `Post(path, handler) RouteConfig`   | Register a `POST` route  |
| `Put(path, handler) RouteConfig`    | Register a `PUT` route   |
| `Patch(path, handler) RouteConfig`  | Register a `PATCH` route |
| `Delete(path, handler) RouteConfig` | Register a `DELETE` route|
| `Options(path, handler) RouteConfig`| Register an `OPTIONS` route |
| `Head(path, handler) RouteConfig`   | Register a `HEAD` route  |

### Composition

| Method                                     | Purpose                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `Group(prefix, fn ...func(Router)) Router` | Open a sub-group. Returns the inner Router so you can chain `.Use(...)`. |
| `Use(mw ...MiddlewareFunc) Router`         | Apply middleware to every route in this scope.                           |

### Per-route configuration: `RouteConfig`

Every verb method returns a `RouteConfig` for chaining:

| Method                                   | Purpose                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `.Name(name) RouteConfig`                | Name the route. Generate URLs with `r.Router().RouteURL(name, params)`. Names must be unique across the app.                         |
| `.Use(mw ...MiddlewareFunc) RouteConfig` | Apply middleware to just this one route - wraps the handler last (innermost).                                                        |
