---
title: HTTP Router
description: Low-level router reference - Context API, route definition, parameters, JSON binding, and named routes.
weight: 51
---

This page documents the underlying `router` package - the
`*router.Context` API, route definition primitives, and helpers for
working with requests and responses.

For app-level routing (web/API stacks, declarative `v.Routes(...)`),
see [Routing](/docs/core/routing).

Import path: `github.com/velocitykode/velocity/router`

## Quick start

Most apps register routes through `v.Routes(...)`. To use the router
directly - typically in tests or when embedding Velocity into a bare
`net/http` server:

```go
package main

import (
    "net/http"

    "github.com/velocitykode/velocity/router"
)

func main() {
    r := router.New()

    r.Get("/users/{id}", func(c *router.Context) error {
        return c.JSON(http.StatusOK, map[string]any{
            "id": c.Param("id"),
        })
    })

    http.ListenAndServe(":4000", r)
}
```

`router.New()` returns a `*router.VelocityRouterV2` that satisfies
`http.Handler`.

## Defining routes

### HTTP methods

```go
r.Get("/users", listUsers)
r.Post("/users", createUser)
r.Put("/users/{id}", replaceUser)
r.Patch("/users/{id}", updateUser)
r.Delete("/users/{id}", deleteUser)
r.Options("/users", listOptions)
r.Head("/users/{id}", headUser)

// Match every method:
r.Any("/health", healthCheck)

// Match a custom set:
r.Match([]string{http.MethodGet, http.MethodPost}, "/webhook", handleWebhook)
```

Each verb returns a `RouteConfig` for chaining `.Name(...)` and
`.Use(...)`.

### Route parameters

`{name}` segments capture path values:

```go
r.Get("/users/{id}", func(c *router.Context) error {
    id := c.Param("id")
    return c.String(http.StatusOK, "user "+id)
})
```

Typed accessors return `(value, error)`:

```go
id, err := c.ParamInt("id")
big, err := c.ParamInt64("id")
```

### Groups and middleware

Sub-groups inherit middleware from their parent and add their own:

```go
api := r.Group("/api/v1")
api.Use(authMiddleware)

api.Get("/me", showProfile)
api.Get("/posts", listPosts)
```

Or pass a closure to scope the group:

```go
r.Group("/admin", func(admin router.Router) {
    admin.Use(adminAuth)
    admin.Get("/dashboard", dashboard)
    admin.Post("/users", createUser)
})
```

### Static files

Serve a directory of static assets:

```go
r.Static("public")  // serves ./public at /
```

## The Context

`*router.Context` wraps the request, response, and helpers. Every
handler has signature `func(*router.Context) error`.

### Reading parameters

```go
id := c.Param("id")              // string
n, err := c.ParamInt("page")     // int
big, err := c.ParamInt64("id")   // int64
```

### Query strings

```go
q       := c.Query("q")                       // string
sort    := c.QueryDefault("sort", "newest")    // string with default
page    := c.QueryInt("page", 1)              // int with default
limit   := c.QueryInt64("limit", 25)          // int64 with default
amount  := c.QueryFloat64("amount", 0.0)      // float64 with default
verbose := c.QueryBool("verbose")             // accepts 1/0, true/false, t/f, etc.
```

### Headers

```go
ua    := c.Header("User-Agent")               // read
size  := c.HeaderInt64("Content-Length", 0)   // read as int64

c.SetHeader("X-Request-ID", requestID)        // write
```

`SetHeader` rejects values containing CR/LF to prevent header
injection.

### Cookies

```go
sess, err := c.Cookie("session_id")

c.SetCookie(&http.Cookie{
    Name:     "session_id",
    Value:    id,
    Path:     "/",
    HttpOnly: true,
    Secure:   true,
})
```

### JSON binding

`c.Bind` decodes the request body as JSON:

```go
type CreateUser struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}

r.Post("/users", func(c *router.Context) error {
    var req CreateUser
    if err := c.Bind(&req); err != nil {
        return c.BadRequest("invalid body")
    }
    // ...
    return c.JSON(http.StatusCreated, req)
})
```

The body is wrapped with a 10MB limit by default - adjust by setting
`MAX_BODY_SIZE` middleware or using `http.MaxBytesReader` directly.

### Form data

For URL-encoded or multipart forms, fall through to the request:

```go
if err := c.Request.ParseForm(); err != nil {
    return c.BadRequest("invalid form")
}
name := c.Request.FormValue("name")
```

### Responses

```go
c.JSON(http.StatusOK, payload)
c.String(http.StatusOK, "hello")
c.HTML(http.StatusOK, "<h1>Hi</h1>")  // raw - sanitize user input
c.Resource(userResource)              // calls ToResource() and serializes
c.NoContent()                         // 204
c.Status(http.StatusAccepted)         // header only

// For a streamed body or full control, write to the writer directly:
c.Response.Header().Set("Content-Type", "application/octet-stream")
c.Response.Write(data)
```

### Redirects

```go
c.Redirect(http.StatusSeeOther, "/dashboard")
```

`Redirect` sanitizes the URL - only relative paths and same-host URLs
are allowed. External absolute URLs are rewritten to `"/"` to prevent
open redirects.

### Errors

Convenience constructors return JSON-shaped errors with the standard
status text or your message:

```go
return c.NotFound()                      // {"code":404,"message":"Not Found"}
return c.BadRequest("missing field")     // {"code":400,"message":"missing field"}
return c.Unauthorized("expired token")
return c.Forbidden()
return c.Error(http.StatusConflict, "duplicate email")
```

For richer error handling - typed exceptions, custom renderers, dev
pages - see [Exceptions](/docs/core/exceptions).

### Request inspection

```go
method := c.Method()      // GET, POST, ...
path   := c.Path()        // /users/42
ip     := c.IP()          // honors X-Forwarded-For from trusted proxies

if c.IsAjax() { /* X-Requested-With: XMLHttpRequest */ }
if c.WantsJSON() { /* Accept includes application/json or X-Inertia set */ }
```

### Per-request storage

Pass values from middleware to handlers using `Set`/`Get`:

```go
func auth(next router.HandlerFunc) router.HandlerFunc {
    return func(c *router.Context) error {
        user, err := authenticate(c.Request)
        if err != nil {
            return c.Unauthorized()
        }
        c.Set("user", user)
        return next(c)
    }
}

r.Get("/me", func(c *router.Context) error {
    user := c.Get("user").(*models.User)
    return c.JSON(http.StatusOK, user)
})
```

`GetString(key)` is a typed shortcut. For complex types, type-assert
the result of `Get`.

### Service accessors

When the router is attached to a Velocity app (the usual case), the
context exposes the service container:

```go
c.DB()           // *orm.Manager
c.Cache()        // *cache.Manager
c.Log()          // log.Logger
c.Queue()        // queue.Driver
c.Storage()      // *storage.Manager
c.Mail()         // mail.Mailer
c.Notification() // *notification.Manager
c.Events()       // events.Dispatcher
c.Crypto()       // crypto.Encryptor
c.Services()     // *app.Services (the whole container)
```

These return zero values when the router runs standalone.

## Named routes and URL generation

```go
r.Get("/posts/{id}", showPost).Name("posts.show")
```

After all routes are registered, generate URLs from the name:

```go
url, err := r.RouteURL("posts.show", map[string]string{"id": "42"})
// url == "/posts/42"
```

`RouteURL` returns `*RouteNotFoundError` if the name is unknown or if
called before the route table is committed. Velocity commits the table
on first request - for tests, you may need to call the router once
before `RouteURL` works.

## Tracing

The router does not magically populate `TraceID` / `RequestID` fields
on the context. Use the `trace` package to read trace state from the
request context:

```go
import "github.com/velocitykode/velocity/trace"

r.Get("/api/log", func(c *router.Context) error {
    traceID, spanID, parent := trace.GetTraceContext(c.Request.Context())

    c.Log().Info("processing", "trace_id", traceID, "span_id", spanID, "parent", parent)
    return c.NoContent()
})
```

Velocity's middleware injects fresh trace IDs per request - see
[Tracing](/docs/advanced/trace) for end-to-end propagation.

## Embedding into net/http

The router is an `http.Handler` directly:

```go
http.ListenAndServe(":4000", r)
```

To use it inside a larger mux, mount it under a path prefix:

```go
mux := http.NewServeMux()
mux.Handle("/api/", http.StripPrefix("/api", r))
http.ListenAndServe(":4000", mux)
```

## Testing routes

Use `httptest`:

```go
func TestShowPost(t *testing.T) {
    r := router.New()
    r.Get("/posts/{id}", func(c *router.Context) error {
        return c.JSON(http.StatusOK, map[string]string{"id": c.Param("id")})
    })

    req := httptest.NewRequest(http.MethodGet, "/posts/42", nil)
    rec := httptest.NewRecorder()
    r.ServeHTTP(rec, req)

    if rec.Code != http.StatusOK {
        t.Fatalf("status = %d, want 200", rec.Code)
    }

    if !strings.Contains(rec.Body.String(), `"id":"42"`) {
        t.Fatalf("body = %q, want id=42", rec.Body.String())
    }
}
```

For full app-level tests that exercise middleware, providers, and
services, use the in-progress `testing` package (Phase 1).

## Adapting standard handlers

Wrap a `router.HandlerFunc` to use it with stdlib mux:

```go
http.Handle("/health", router.Wrap(myHandler))
```

The wrapped handler returns 500 if the inner handler returns an error.
For richer error handling, attach the route to a router so the
exception handler runs.
