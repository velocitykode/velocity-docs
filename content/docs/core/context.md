---
title: Request & Response
description: The *router.Context API - route parameters, query strings, headers, cookies, JSON and form binding, responses, files, streaming, redirects, errors, and service accessors.
weight: 51
aliases: ["/docs/core/http-router/"]
keywords: [router.Context, request, response, JSON binding, redirects, server-sent events]
---

Every handler has the signature `func(*router.Context) error`. The
`*router.Context` wraps the request and response and carries the
helpers below. Route definition, groups, and named routes are on
[Routing]({{< relref "routing" >}}); handler organisation is on
[Handlers]({{< relref "handlers" >}}).

Import path: `github.com/velocitykode/velocity/router`

`*router.Context` wraps the request, response, and helpers. Every
handler has signature `func(*router.Context) error`.

## Reading parameters

```go
id := c.Param("id")              // string
n, err := c.ParamInt("page")     // int
big, err := c.ParamInt64("id")   // int64
```

## Query strings

```go
q       := c.Query("q")                       // string
sort    := c.QueryDefault("sort", "newest")    // string with default
page    := c.QueryInt("page", 1)              // int with default
limit   := c.QueryInt64("limit", 25)          // int64 with default
amount  := c.QueryFloat64("amount", 0.0)      // float64 with default
verbose := c.QueryBool("verbose")             // accepts 1/0, true/false, t/f, etc.
```

## Headers

```go
ua    := c.Header("User-Agent")               // read
size  := c.HeaderInt64("Content-Length", 0)   // read as int64

c.SetHeader("X-Request-ID", requestID)        // write (replaces)
c.AddHeader("Vary", "Accept")                 // append (list-valued)
```

`SetHeader` and `AddHeader` reject names or values containing CR/LF to
prevent header injection.

## Cookies

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

## JSON binding

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

The body is wrapped with a 10MB limit by default
(`router.DefaultMaxBodySize`). Routes that must accept larger payloads
should install the `router.BodyLimit(N)` middleware for their chain;
when present it sets the cap for `Bind`, `BindForm`, `BindXML`,
`FormValue`, and `FormFile` instead of the default.

## Form data

`c.FormValue` reads a single URL-encoded or multipart value (capping the
body at `DefaultMaxBodySize` unless `BodyLimit` is installed), and
`c.FormFile` returns the first uploaded file for a key:

```go
name := c.FormValue("name")

fh, err := c.FormFile("avatar")
if err != nil {
    return c.BadRequest("invalid upload")
}
```

To map an entire form into a struct, use `c.BindForm` (`form` tags),
`c.BindQuery` (`query` tags), `c.BindXML`, or `c.BindAuto` (which picks a
binder from the `Content-Type`, defaulting to JSON):

```go
type Filter struct {
    Sort string `form:"sort"`
    Page int    `form:"page"`
}

var f Filter
if err := c.BindForm(&f); err != nil {
    return c.BadRequest("invalid form")
}
```

`c.BindValid` binds JSON and then runs the struct's own
`ValidationRules()` if it implements `Validatable`.

## Responses

```go
c.JSON(http.StatusOK, payload)
c.XML(http.StatusOK, payload)         // application/xml
c.String(http.StatusOK, "hello")
c.HTML(http.StatusOK, "<h1>Hi</h1>")  // raw - sanitize user input
c.Resource(userResource)              // calls ToResource() and serializes
c.NoContent()                         // 204
c.Status(http.StatusAccepted)         // header only

// For a streamed body or full control, write to the writer directly:
c.Response.Header().Set("Content-Type", "application/octet-stream")
c.Response.Write(data)
```

`c.JSON` also sets `X-Content-Type-Options: nosniff`.

## Serving files

`File` and `Download` serve a path resolved relative to the router's
configured `FileRoot` (set via `SetFileRoot`, defaulting to the process
working directory). Containment is kernel-enforced via `*os.Root`, so a
`..` segment or a symlink escaping the root is rejected:

```go
c.File("reports/q3.pdf")                 // inline; ServeContent
c.Download("reports/q3.pdf", "Q3.pdf")   // Content-Disposition: attachment
c.Attachment("reports/q3.pdf", "Q3.pdf") // alias for Download
```

Both default to `Cache-Control: private, no-store` (a caller-set header
is preserved).

## Streaming and Server-Sent Events

`c.SSE` writes one `event:`/`data:` frame (JSON-encoded) and flushes,
setting the streaming headers and clearing the write deadline on the
first call:

```go
r.Get("/stream", func(c *router.Context) error {
    for ev := range updates {
        if err := c.SSE("update", ev); err != nil {
            return err
        }
    }
    return nil
})
```

For hand-rolled streams (NDJSON, custom frames), call `c.PrepareStream()`
once and then write to `c.Response` directly.

## Redirects

```go
c.Redirect(http.StatusSeeOther, "/dashboard")
```

`Redirect` sanitizes the URL: relative paths are always allowed, and
absolute URLs are allowed only when their host is in the router's
`RedirectAllowedHosts` allowlist. Everything else (cross-host URLs,
protocol-relative `//evil`, `javascript:`/`data:` schemes, and
backslash/Unicode-slash lookalikes) is rewritten to `"/"` to prevent
open redirects. The same logic is exported as `router.SanitizeRedirect`.

For post-login flows, `c.RedirectToIntended(fallback)` issues a 303 to
the safe "intended" destination stashed by the auth middleware (or the
sanitized fallback). `c.Intended(fallback)` returns that target without
redirecting. Never feed a raw `?redirect=` query value to `c.Redirect`
directly - route it through these helpers so the open-redirect sanitizer
runs.

## Errors

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

## Request inspection

```go
method := c.Method()      // GET, POST, ...
path   := c.Path()        // /users/42
ip     := c.IP()          // honors X-Forwarded-For from trusted proxies

if c.IsAjax() { /* X-Requested-With: XMLHttpRequest */ }
if c.WantsJSON() { /* Accept == application/json, or X-Inertia set */ }
```

## Per-request storage

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

## Service accessors

When the router is attached to a Velocity app (the usual case), the
context exposes the service container:

```go
c.DB()           // contract.Database
c.Cache()        // contract.CacheManager
c.Log()          // contract.Logger
c.Queue()        // contract.QueueDriver
c.Storage()      // contract.StorageManager
c.Mail()         // contract.Mailer
c.Notification() // contract.Notifier
c.Events()       // contract.Dispatcher
c.Crypto()       // contract.Encryptor
c.Validator()    // contract.Validator
c.Exceptions()   // contract.ExceptionHandler
c.Scheduler()    // scheduler.TaskScheduler
c.Auth()         // contract.AuthManager
c.CSRF()         // contract.CSRFProtector
c.View()         // contract.ViewEngine
c.Services()     // *app.Services (the whole container)
```

Each accessor returns a narrow stdlib-only `contract` interface so the
`router` package carries no heavy driver dependencies. They **panic**
when the corresponding service is not configured (e.g. a raw
`router.New()` with no Velocity app wired in). To probe the container
without panicking, use `c.ServicesIfSet()`, which returns `nil` when
services have not been wired.
