---
title: HTTP Client
description: Instrumented, secure-by-default outbound HTTP client with APM events and trace propagation.
weight: 60
---

The `httpclient` package wraps `net/http` and dispatches APM events on
every outbound request. Latency, status, and body sizes flow into your
observability stack automatically. Its defaults are hardened: TLS 1.2
minimum, a capped redirect chain that strips credentials on cross-origin
hops, an SSRF dial guard, a response-body size cap, and per-stage
transport timeouts (see [Secure defaults](#secure-defaults)).

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

Default timeout is 30 seconds. The default transport caps redirect
chains at 10 hops; tighten or disable that with `WithMaxRedirects` (see
[Secure defaults](#secure-defaults)).

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
c.SetEventDispatcher(func(ctx context.Context, event interface{}) error {
    return v.Events.Dispatch(event)
})
```

The dispatcher receives the request-scoped `context.Context` so
listeners can observe request-scoped values; the `event` is one of the
types above.

Once wired, APM agents subscribing to `http.request.sent` and
`http.request.failed` events will record every outbound request.

## Secure defaults

`httpclient.New()` is hardened out of the box. The defaults apply on the
framework-built transport; when you supply your own via `WithHTTPClient`,
transport-level fields stay under your control (the TLS minimum and dial
guard are still applied in place when your transport is a plain
`*http.Transport`).

| Protection | Default | Tune with |
|------------|---------|-----------|
| Minimum TLS version | TLS 1.2 | `WithMinTLSVersion(tls.VersionTLS13)` |
| Redirect cap | 10 hops | `WithMaxRedirects(n)` (`n <= 0` disables redirect following) |
| Cross-origin credential stripping | `Authorization`, `Cookie`, `Proxy-Authorization` removed when an eTLD+1 host changes (or on an `https` to `http` downgrade) | always on |
| SSRF dial guard | refuses loopback, RFC1918, link-local, CGNAT, and cloud-metadata IPs (IPv4 + IPv6); resolved IP is pinned to defeat DNS rebinding | `WithAllowedHosts(...)`, `WithoutPrivateIPDeny()` |
| Env proxy | `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` ignored while the dial guard is on | `WithProxyAllowed()` |
| Response body cap | 32 MiB; reads past it return `ErrResponseTooLarge` | `WithMaxResponseBytes(n)` (`n <= 0` disables) |
| TLS handshake timeout | 10s | `WithTLSHandshakeTimeout(d)` |
| Response header timeout | 30s | `WithResponseHeaderTimeout(d)` |
| Idle connection timeout | 90s | `WithIdleConnTimeout(d)` |
| Expect-continue timeout | 1s | `WithExpectContinueTimeout(d)` |

The SSRF gate runs both at the URL-host level (so it covers proxy mode)
and at dial time. To reach a known internal service while still blocking
everything else, allowlist its eTLD+1 host:

```go
c := httpclient.New(httpclient.WithAllowedHosts("internal.svc.cluster.local"))
```

The response cap is enforced on the read stream, not the
`Content-Length` header, so a server that lies about its length cannot
bypass it. When the cap is hit, the read returns `httpclient.ErrResponseTooLarge`:

```go
resp, err := c.Get(ctx, "/big")
if err != nil {
    return err
}
defer resp.Body.Close()

data, err := io.ReadAll(resp.Body)
if errors.Is(err, httpclient.ErrResponseTooLarge) {
    // payload exceeded WithMaxResponseBytes
}
```

{{% callout type="warning" %}}
`WithoutPrivateIPDeny()` disables the SSRF guard entirely, and
`WithProxyAllowed()` re-enables honouring proxy environment variables.
Use them only for tests or trusted egress paths. Prefer
`WithAllowedHosts` for a targeted exception.
{{% /callout %}}

## Shutdown

`Shutdown` closes idle keep-alive connections held by the underlying
transport, honouring the context deadline. In-flight requests are not
cancelled, so drive that through the request context:

```go
if err := c.Shutdown(ctx); err != nil {
    return err
}
```

## Design notes

- **One call = one event.** No sampling inside the client. Filter in
  listeners if volume is a concern.
- **No retries.** `httpclient` doesn't retry failed requests; compose a
  retry loop in your caller when you need it, or plug in a custom
  `*http.Client` via `WithHTTPClient`.
- **No middleware chain.** Wrap the client if you need cross-cutting
  behavior (auth headers, circuit breakers) rather than extending it.
