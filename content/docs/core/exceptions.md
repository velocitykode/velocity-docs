---
title: Exceptions
description: Structured error handling with rich dev pages, safe production responses, content negotiation, and pluggable reporters.
weight: 65
---

The `exceptions` package turns errors returned from handlers into
correctly negotiated HTTP responses — verbose stack traces in
development, safe minimal responses in production — and runs reporters
so errors reach your logs or monitoring service.

Import path: `github.com/velocitykode/velocity/exceptions`

## The Handler

`*exceptions.Handler` is the central type. Velocity constructs one in
`velocity.New()` and stores it at `app.Services.Exceptions`. You can
reconfigure it via `v.Exceptions(...)` during bootstrap.

```go
v.Exceptions(func(h *exceptions.Handler) {
    // add reporters, renderers, custom handlers
})
```

Build one yourself with `NewHandler(opts...)`:

```go
h := exceptions.NewHandler(
    exceptions.WithDebug(true),
    exceptions.WithEnvironment("development"),
)
```

Debug mode is **force-disabled in production** regardless of the
`WithDebug` flag — the handler logs a warning and continues without
exposing stack traces.

### Available options

| Option                          | Effect                                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| `WithDebug(bool)`               | Include stack traces and source context in responses                   |
| `WithEnvironment(string)`       | Environment name; `"production"` force-disables debug                  |
| `WithReporters(...Reporter)`    | Replace the default log reporter                                       |
| `WithRenderers(map[string]Renderer)` | Replace HTML/JSON renderers                                       |
| `WithDontReport(...string)`     | Exception type names that should be silenced                           |
| `WithAPIMode(bool)`             | Always respond with JSON                                               |
| `WithAPIPrefixes(...string)`    | URL prefixes treated as API routes (JSON by default)                   |
| `WithHandlerLogger(Logger)`     | Logger used for internal handler warnings                              |

## The Exception interface

Any error satisfying `Exception` participates in the exception
lifecycle:

```go
type Exception interface {
    error
    GetMessage() string
    GetCode() int
    GetPrevious() error
    GetContext() map[string]any
}
```

Two optional interfaces opt in to more behavior:

- `Reportable` — returns whether the exception should be sent to
  reporters
- `Renderable` — renders its own response

## BaseException

`*BaseException` is the starter implementation. Use it directly or
embed it in a custom type:

```go
e := exceptions.NewBaseException("payment declined", 402).
    WithPrevious(err).
    WithContext("user_id", user.ID).
    WithContext("order_id", order.ID)
```

Context data is serialized into dev-mode responses and passed to
reporters.

## HTTP-specific exceptions

Preconstructed exceptions cover the common HTTP failure cases. Each
carries a status code and a sensible default message; most accept an
optional override:

| Constructor                                      | Status |
| ------------------------------------------------ | ------ |
| `NewHttpException(code, msg)`                    | any    |
| `NewBadRequestHttpException(msg?)`               | 400    |
| `NewUnauthorizedHttpException(msg?)`             | 401    |
| `NewForbiddenHttpException(msg?)`                | 403    |
| `NewNotFoundHttpException(msg?)`                 | 404    |
| `NewMethodNotAllowedHttpException(methods, msg?)`| 405    |
| `NewConflictHttpException(msg?)`                 | 409    |
| `NewGoneHttpException(msg?)`                     | 410    |
| `NewTooManyRequestsException(retryAfter, msg?)`  | 429    |
| `NewInternalServerErrorException(msg?)`          | 500    |
| `NewServiceUnavailableException(retryAfter, msg?)` | 503  |
| `NewValidationException(errors, msg?)`           | 422    |

All 4xx HTTP exceptions return `false` from `ShouldReport()` — they
aren't surfaced to reporters by default. 5xx and non-HTTP exceptions
report by default.

Attach headers with `.WithHeader()` or `.WithHeaders()`:

```go
return exceptions.NewTooManyRequestsException(60, "slow down").
    WithHeader("Retry-After", "60")
```

## Abort helpers

Three free functions let you bail out of a handler concisely:

```go
func Show(c *router.Context) error {
    post, err := models.FindPost(c.Param("id"))
    if err != nil {
        return exceptions.Abort(http.StatusNotFound, "post not found")
    }

    if err := exceptions.AbortUnless(post.Published, http.StatusForbidden, "draft"); err != nil {
        return err
    }

    return c.JSON(http.StatusOK, post)
}
```

- `Abort(code, msg?)` — always returns an `HttpException`
- `AbortIf(condition, code, msg?)` — exception when condition is `true`, else `nil`
- `AbortUnless(condition, code, msg?)` — exception when condition is `false`, else `nil`

## ValidationException

```go
return exceptions.NewValidationException(map[string][]string{
    "email":    {"must be a valid email"},
    "password": {"must be at least 8 characters"},
}, "the given data was invalid")
```

Rendered as a 422 response with the error map serialized alongside the
top-level message. Use this type when you need to surface per-field
validation errors without running the full `validation` pipeline.

## Content negotiation

The handler picks a renderer based on the request:

1. `WithAPIMode(true)` — always JSON.
2. Request path matches any `WithAPIPrefixes` entry — JSON.
3. `Accept` header contains `application/json` — JSON.
4. `X-Requested-With: XMLHttpRequest` — JSON.
5. Otherwise — HTML.

Swap the defaults with `WithRenderers(...)` if you need a custom
serialization (protobuf, XML) or a templated HTML error page.

## Custom handlers per type

Register behavior for specific error types:

```go
v.Exceptions(func(h *exceptions.Handler) {
    h.Register(&sql.ErrNoRows, func(ctx exceptions.RenderContext, err error, ec *exceptions.ExceptionContext) {
        ctx.WriteHeader(http.StatusNotFound)
        ctx.Write([]byte(`{"error":"not found"}`))
    })
})
```

The handler consults this map before falling back to the default
renderer.

## Reporters

Reporters are called for every exception that opts into reporting.
The default is `LogReporter` — writes a structured log line via the
app's logger.

```go
type Reporter interface {
    Report(err error, ctx *ExceptionContext)
}
```

Build your own by implementing the interface:

```go
type SentryReporter struct { /* ... */ }

func (s *SentryReporter) Report(err error, ctx *exceptions.ExceptionContext) {
    sentry.CaptureException(err, sentry.WithExtras(ctx.Extras))
}

v.Exceptions(func(h *exceptions.Handler) {
    h.AddReporter(&SentryReporter{})
})
```

For lightweight side-effects, use `NewCallbackReporter(fn)`.

### ExceptionContext

`*ExceptionContext` carries request metadata into reporters:

```go
ec := exceptions.NewExceptionContext().
    WithRequestInfo("POST", "/checkout", "10.0.0.1", "curl/8.0").
    WithIDs("req_123", "trace_abc").
    WithUserID(strconv.Itoa(user.ID)).
    WithExtra("order_id", order.ID)
```

The request middleware populates this automatically; you only build
one directly when reporting outside the request path (e.g. from a
queue worker).

## Silencing exception types

`WithDontReport(types...)` matches on the runtime type name:

```go
h := exceptions.NewHandler(
    exceptions.WithDontReport(
        "*exceptions.NotFoundHttpException",
        "*mypkg.ClientCanceledError",
    ),
)
```

Reporter calls are skipped; the response is still rendered normally.

## Dev-mode pages

When `WithDebug(true)` is set outside production, the HTML renderer
includes:

- Exception type, message, and code
- Stack trace with source context (3 lines either side of each frame)
- Request method, path, IP, user-agent
- Attached context from `WithContext` / `WithExtra`

In production the response shows only the status text and message.

## Middleware integration

The exception middleware is applied automatically when you run
`velocity.New()`; you rarely wire it yourself. If you're embedding
Velocity's handler in a bare `net/http` server, use:

```go
mw := exceptions.Middleware(h)
srv := &http.Server{Handler: mw(myMux)}
```

For per-handler wrapping use `MiddlewareFunc` or pass
`ErrorHandler(h)` anywhere you need a plain `func(http.ResponseWriter, *http.Request, error)`.
