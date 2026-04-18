---
title: HTTP Client
description: Instrumented outbound HTTP client with APM events and trace propagation.
weight: 60
---

The `httpclient` package is a thin wrapper around `net/http` that
dispatches APM events on every outbound request. Latency, status, and
body sizes flow into your observability stack automatically.

Import path: `github.com/velocitykode/velocity/httpclient`

## Creating a client

```go
c := httpclient.New()
```

Options:

```go
c := httpclient.New(
    httpclient.WithBaseURL("https://api.example.com"),
    httpclient.WithTimeout(10 * time.Second),
    httpclient.WithHTTPClient(&http.Client{ /* custom transport */ }),
)
```

Default timeout is 30 seconds. The default transport rejects chains
with more than 10 redirects.

## Methods

All methods take a `context.Context` as the first argument so that
cancellation, deadlines, and trace IDs propagate through the call:

```go
ctx := r.Context()

resp, err := c.Get(ctx, "/users/42")
if err != nil {
    return err
}
defer resp.Body.Close()

// POST with JSON
body := strings.NewReader(`{"name":"alice"}`)
resp, err := c.Post(ctx, "/users", "application/json", body)

// PUT, PATCH, DELETE also available
resp, err := c.Put(ctx, "/users/42", "application/json", body)
resp, err := c.Patch(ctx, "/users/42", "application/json", body)
resp, err := c.Delete(ctx, "/users/42")
```

For full control, build an `*http.Request` yourself and call `Do`:

```go
req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "/search", nil)
req.Header.Set("Authorization", "Bearer "+token)
req.URL.RawQuery = "q=velocity"

resp, err := c.Do(ctx, req)
```

### Base URL resolution

When `WithBaseURL(...)` is set, relative paths starting with `/` are
resolved against the base URL. Absolute URLs are used as-is:

```go
c := httpclient.New(httpclient.WithBaseURL("https://api.example.com"))

c.Get(ctx, "/users")                    // → https://api.example.com/users
c.Get(ctx, "https://other.example/x")   // → https://other.example/x
```

## Events

Every call dispatches one of two events through the application's event
dispatcher:

- `*httpclient.RequestSent` - fired on every successful response
- `*httpclient.RequestFailed` - fired on transport errors

```go
type RequestSent struct {
    Context      context.Context
    Method       string
    URL          string
    StatusCode   int
    DurationMs   int64
    RequestSize  int64
    ResponseSize int64
    TraceID      string
    SpanID       string
    ParentID     string
}

type RequestFailed struct {
    Context    context.Context
    Method     string
    URL        string
    Error      string
    DurationMs int64
    TraceID    string
    SpanID     string
    ParentID   string
}
```

Trace IDs are read from the context via the `trace` package - if your
request came in through Velocity's middleware, the outgoing call
automatically carries the incoming trace.

### Wiring a dispatcher

```go
c := httpclient.New()
c.SetEventDispatcher(func(event interface{}) error {
    return v.Events.Dispatch(event)
})
```

Once wired, APM agents subscribing to `http.request.sent` and
`http.request.failed` events will record every outbound request.

## Design notes

- **One call = one event.** No sampling inside the client. Filter in
  listeners if volume is a concern.
- **No retries.** `httpclient` doesn't retry failed requests; compose a
  retry loop in your caller when you need it, or plug in a custom
  `*http.Client` via `WithHTTPClient`.
- **No middleware chain.** Wrap the client if you need cross-cutting
  behavior (auth headers, circuit breakers) rather than extending it.
