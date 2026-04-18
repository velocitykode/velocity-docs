---
title: Middleware
description: Add middleware for authentication, logging, CORS, rate limiting, and custom request processing in Velocity.
weight: 40
---

Middleware wraps Velocity handlers to add cross-cutting concerns —
auth, logging, CORS, rate limiting, CSRF. Each middleware receives
the next handler in the chain and returns a new handler.

## Signature

Velocity middleware uses the `router.MiddlewareFunc` type:

```go
type HandlerFunc    func(*router.Context) error
type MiddlewareFunc func(next HandlerFunc) HandlerFunc
```

A minimal middleware:

```go
package middleware

import "github.com/velocitykode/velocity/router"

func Logging(next router.HandlerFunc) router.HandlerFunc {
    return func(c *router.Context) error {
        c.Log().Info("request",
            "method", c.Request.Method,
            "path",   c.Request.URL.Path,
        )
        return next(c)
    }
}
```

## Stacks: global, web, API

Applications typically split middleware into three scopes:

- **Global** — runs on every request (logging, CORS, recovery,
  maintenance mode)
- **Web** — runs on browser/HTML routes (sessions, CSRF, view engine)
- **API** — runs on JSON API routes (rate limiting, JSON enforcement)

You declare them in a single function passed to `v.Middleware(...)`:

```go
// internal/app/middleware.go
package app

import (
    "myapp/internal/middleware"

    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/csrf"
    "github.com/velocitykode/velocity/view"
)

func Middleware(m *velocity.MiddlewareStack) {
    // Runs on every request.
    m.Global(
        middleware.LoggingMiddleware,
        middleware.TrustProxiesMiddleware,
        middleware.CORSMiddleware,
        middleware.PreventRequestsDuringMaintenanceMiddleware,
        middleware.ValidatePostSizeMiddleware(10<<20),
        middleware.TrimStringsMiddleware,
        middleware.ConvertEmptyStringsToNullMiddleware,
    )

    // The CSRF and view middleware need their service instances —
    // pull them from the *app.Services container.
    s := m.Services()
    csrfInstance := s.CSRF.(*csrf.CSRF)
    viewEngine := s.View.(*view.Engine)

    // Runs on routes inside r.Web(...).
    m.Web(
        middleware.SessionMiddleware,    // session cookie before CSRF
        middleware.CSRFTokenMiddleware,  // expose token to templates
        csrfInstance.RouterMiddleware(), // validate CSRF on unsafe methods
        viewEngine.Middleware(),         // Inertia version + headers
    )

    // Runs on routes inside r.API(prefix, ...).
    m.API(
        middleware.EnsureJSONMiddleware,
    )
}
```

Wire it into `main.go` via the bootstrap chain:

```go
chain := v.
    Providers(app.Configure).
    Middleware(app.Middleware).        // <— this function
    Routes(routes.Register).
    Events(app.Events(v.Log))
```

When you register routes through `v.Routes(...)`, the `r.Web(...)`
group automatically gets the web stack and `r.API(prefix, ...)` gets
the API stack — see [Routing](/docs/core/routing).

## Per-group and per-route middleware

Inside a `Web` or `API` closure, attach middleware to a sub-group or
a single route:

```go
func Register(r *velocity.Routing) {
    r.Web(func(web router.Router) {
        // Group with middleware — applies to every route in the closure.
        web.Group("", func(auth router.Router) {
            auth.Get("/dashboard", handlers.Dashboard).Name("dashboard")
            auth.Get("/account", handlers.Account)
        }).Use(middleware.Auth)

        // Single route with middleware.
        web.Post("/contact", handlers.Contact).Use(middleware.RateLimit(5))
    })
}
```

`Group("", fn).Use(mw)` is the idiom for grouping routes purely so
they share middleware. `.Use(mw)` after a verb method attaches
middleware to just that one route.

## Order of execution

Middleware wraps from the outside in. The first middleware in the
list runs first on the way in and last on the way out:

```go
m.Global(
    middleware.RecoveryMiddleware,  // outermost — catches panics from everything below
    middleware.LoggingMiddleware,   // logs the request
    middleware.AuthMiddleware,      // innermost — runs just before the handler
)
```

Within a request, scopes run in this order:
**global → web/API → group → route → handler**.

## Parameterized middleware

Middleware that needs configuration returns a `MiddlewareFunc`:

```go
func RateLimit(requestsPerMinute int) router.MiddlewareFunc {
    limiter := rate.NewLimiter(rate.Limit(requestsPerMinute)/60, requestsPerMinute)

    return func(next router.HandlerFunc) router.HandlerFunc {
        return func(c *router.Context) error {
            if !limiter.Allow() {
                return c.JSON(http.StatusTooManyRequests, map[string]string{
                    "error": "rate limit exceeded",
                })
            }
            return next(c)
        }
    }
}

// Usage — call once at registration to capture the limiter, then attach.
m.API(middleware.RateLimit(100))
```

The limiter is built once in the outer call. Every request shares it
— exactly what you want for rate limiting.

## Passing data through context

Use the request context to hand data from middleware to the handler:

```go
func Auth(next router.HandlerFunc) router.HandlerFunc {
    return func(c *router.Context) error {
        user, err := authenticate(c.Request)
        if err != nil {
            return c.Redirect(http.StatusSeeOther, "/login")
        }

        ctx := context.WithValue(c.Request.Context(), "user", user)
        c.Request = c.Request.WithContext(ctx)
        return next(c)
    }
}

// In the handler
func Dashboard(c *router.Context) error {
    user := c.Request.Context().Value("user").(*models.User)
    return c.JSON(http.StatusOK, user)
}
```

For request-scoped values that don't need to flow into downstream
handlers, `c.Set(key, value)` / `c.Get(key)` is the lighter option —
see [HTTP Router > Per-request storage](/docs/core/http-router#per-request-storage).

## Common patterns

### Short-circuit

Return without calling `next` to stop the chain. Useful for
auth/guest gates:

```go
func Guest(next router.HandlerFunc) router.HandlerFunc {
    return func(c *router.Context) error {
        if auth.FromContext(c).Check(c.Request) {
            return c.Redirect(http.StatusSeeOther, "/dashboard")
        }
        return next(c)
    }
}
```

### Recover from panics

```go
func Recovery(next router.HandlerFunc) router.HandlerFunc {
    return func(c *router.Context) (err error) {
        defer func() {
            if r := recover(); r != nil {
                c.Log().Error("panic recovered",
                    "value", r,
                    "stack", debug.Stack(),
                )
                err = fmt.Errorf("internal server error")
            }
        }()
        return next(c)
    }
}
```

Register `Recovery` first in the global stack so it wraps everything.

### CORS

```go
func CORS(next router.HandlerFunc) router.HandlerFunc {
    return func(c *router.Context) error {
        c.Response.Header().Set("Access-Control-Allow-Origin", "*")
        c.Response.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        c.Response.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

        if c.Request.Method == http.MethodOptions {
            c.Response.WriteHeader(http.StatusOK)
            return nil
        }
        return next(c)
    }
}
```

## Testing middleware

For unit tests, call the middleware directly with a stub next-handler:

```go
func TestAuthRedirectsGuests(t *testing.T) {
    called := false
    next := func(c *router.Context) error {
        called = true
        return nil
    }

    req := httptest.NewRequest(http.MethodGet, "/dashboard", nil)
    rec := httptest.NewRecorder()
    c := router.NewContext(rec, req)

    if err := middleware.Auth(next)(c); err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if called {
        t.Fatal("next handler should not run for unauthenticated request")
    }
    if rec.Code != http.StatusSeeOther {
        t.Errorf("expected 303, got %d", rec.Code)
    }
}
```

For end-to-end tests through the full middleware chain, register the
middleware on a fresh router and exercise it via `httptest`.

## Best practices

- Keep each middleware focused on a single concern.
- Register `Recovery` first in the global stack so it wraps everything.
- Prefer context values over package globals for per-request state.
- For expensive setup (rate limiter, DB pool), build once in the outer
  function and capture it in the closure — don't construct it inside
  the inner handler on every request.
