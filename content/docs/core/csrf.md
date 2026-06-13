---
title: CSRF Protection
description: Protect your Velocity application against cross-site request forgery attacks with built-in CSRF middleware.
weight: 60
---

Velocity provides comprehensive CSRF (Cross-Site Request Forgery) protection to secure your application against unauthorized form submissions and state-changing requests.

## Quick Start

{{< tabs items="Basic Setup,Middleware,Template Usage,API Protection" >}}

{{< tab >}}
`velocity.New` builds the CSRF instance for you from `Config.CSRF`
(seeded from `csrf.DefaultConfig()` and overridable via `CSRF_*`
environment variables) and exposes it on the app as `v.CSRF`
(type `contract.CSRFProtector`, concrete `*csrf.CSRF`). It also installs
a `SessionIDResolver` that decrypts the session cookie - the token store
is keyed by the plaintext session ID, never by the raw cookie value.

To build an instance by hand (custom middleware stacks, tests), use the
error-returning constructor and supply a `SessionIDResolver` - it is
**required**:

```go
import (
    "net/http"

    "github.com/velocitykode/velocity/csrf"
    "github.com/velocitykode/velocity/csrf/stores"
)

config := csrf.DefaultConfig()
config.Store = stores.NewSessionStore(config.TokenLifetime)
config.SessionIDResolver = func(r *http.Request) (string, error) {
    // Return the plaintext session ID, or csrf.ErrNoSession when the
    // request carries no session. Keying tokens by an unauthenticated
    // cookie value is rejected at construction time.
    if c, err := r.Cookie("session_id"); err == nil && c.Value != "" {
        return c.Value, nil
    }
    return "", csrf.ErrNoSession
}

protection, err := csrf.NewE(config)
if err != nil {
    // ErrInsecureCSRFConfig: nil resolver or unsupported Mode.
    panic(err)
}
```

`csrf.New(config)` is the panic-on-error variant of `NewE`.
{{< /tab >}}

{{< tab >}}
```go
// Apply CSRF to the web middleware stack
v.Middleware(func(m *velocity.MiddlewareStack) {
    csrfInstance := v.CSRF.(*csrf.CSRF)

    m.Web(
        csrfInstance.RouterMiddleware(), // validates token on unsafe methods
    )
})
```

`RouterMiddleware()` returns a `router.MiddlewareFunc` that resolves the
session ID, looks up the token, and validates the request. The session
middleware is installed globally by `velocity.New`, so it already runs
ahead of the web stack.
{{< /tab >}}

{{< tab >}}
```html
<!-- Meta tag: render the token your shared-props function published -->
<head>
    <meta name="csrf-token" content="{{ .csrfToken }}">
</head>

<!-- Form field: include the token on unsafe requests -->
<form method="POST" action="/submit">
    <input type="hidden" name="_token" value="{{ .csrfToken }}">
    <input type="text" name="email" />
    <button type="submit">Submit</button>
</form>

<script>
    // Read the token for AJAX
    const token = document.querySelector('meta[name="csrf-token"]').content;

    fetch('/api/data', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
</script>
```

The token is obtained via `csrf.TokenForRequest(r)`, which returns the
per-response **masked** form (memoized for the request so the meta tag,
form field, and `XSRF-TOKEN` cookie all carry byte-identical values).
Plug it into the view engine's shared props under the key your template
reads:

```go
engine.SetSharePropsFunc(func(r *http.Request) (view.Props, error) {
    props := view.Props{}
    if token, err := csrf.TokenForRequest(r); err == nil && token != "" {
        props["csrfToken"] = token
    }
    return props, nil
})
```

`TokenForRequest` requires the CSRF middleware to have run on the request
(it attaches the request-scoped token state); it returns
`csrf.ErrNoTokenState` otherwise, which callers treat as "no token to
embed".
{{< /tab >}}

{{< tab >}}
```go
// SPAs read the token from a refresh endpoint
v.Routes(func(r *velocity.Routing) {
    csrfInstance := v.CSRF.(*csrf.CSRF)

    r.Web(func(web router.Router) {
        web.Get("/csrf/token", func(c *router.Context) error {
            csrfInstance.RefreshHandler()(c.Response, c.Request)
            return nil
        })
    })
})
```

Exclude the refresh endpoint from CSRF validation itself:

```go
config.ExcludePaths = []string{"/csrf/token"}
```
{{< /tab >}}

{{< /tabs >}}

## Configuration

### Default Configuration

```go
config := csrf.DefaultConfig()
// Returns:
// {
//     TokenLifetime:     24 * time.Hour,
//     HeaderName:        "X-CSRF-Token",
//     FormField:         "_token",
//     CookieName:        "csrf_token",
//     SessionCookieName: "session_id",
//     MaxFormBodyBytes:  1 << 20, // csrf.DefaultMaxFormBodyBytes (1 MiB)
//     Mode:              csrf.ModeSession,
//     SameSite:          http.SameSiteLaxMode,
//     Secure:            true,
//     HttpOnly:          true,
//     SingleUse:         false,
//     WriteXSRFCookie:   true,
//     XSRFCookieName:    "XSRF-TOKEN",
//     ErrorMessage:      "CSRF token validation failed. Please refresh and try again.",
// }
```

### Custom Configuration

```go
config := &csrf.Config{
    // Token settings
    TokenLifetime:     12 * time.Hour,      // Token expiration
    HeaderName:        "X-CSRF-Token",       // Header name for token
    FormField:         "_token",             // Form field name
    CookieName:        "csrf_token",         // Cookie name
    SessionCookieName: "velocity_session",   // Session cookie name
    MaxFormBodyBytes:  1 << 20,              // urlencoded body cap (default 1 MiB)

    // Binding mode (only ModeSession is implemented today)
    Mode: csrf.ModeSession,

    // Security settings
    SameSite:  http.SameSiteStrictMode,     // CSRF protection level
    Secure:    true,                         // HTTPS only
    HttpOnly:  true,                         // No JavaScript access (matches net/http casing)
    SingleUse: false,                        // Reusable tokens

    // axios/Angular convenience cookie (non-HttpOnly XSRF-TOKEN)
    WriteXSRFCookie: true,
    XSRFCookieName:  "XSRF-TOKEN",

    // Storage
    Store: stores.NewSessionStore(),         // Token storage

    // Required: resolve the plaintext session ID tokens are keyed by.
    SessionIDResolver: resolveSession,

    // Exception handling
    ExcludePaths: []string{                  // Paths to exclude
        "/api/webhooks/*",
        "/health",
    },
    ExcludeFunc: func(r *http.Request) bool {
        // Custom exclusion logic
        return strings.HasPrefix(r.URL.Path, "/public/")
    },

    // Error handling
    ErrorMessage: "Invalid CSRF token",
    ErrorHandler: customErrorHandler,
}
```

{{% callout type="warning" %}}
`SessionIDResolver` is required: `csrf.NewE` (and `csrf.New`) reject a nil
resolver with `ErrInsecureCSRFConfig`. It must return the plaintext
session ID, or `csrf.ErrNoSession` when the request carries no session.
`velocity.New` installs an encrypted-session resolver automatically when
the app encryptor, session cookie name, and `SessionCookieName` all align;
otherwise it installs a strict-reject resolver so the deployment fails
closed (419 on every unsafe request) instead of silently bypassing CSRF.
{{% /callout %}}

### Validation

`Config.Validate(env)` rejects insecure configurations at boot.
`velocity.New` calls it for you. The rules:

- `Mode` must be `ModeSession` (`ModeDoubleSubmit` is reserved).
- `HttpOnly` must be `true` unless `AllowJSAccess` is set.
- `Secure` must be `true` outside a dev/test profile (`APP_ENV` one of
  `development`, `dev`, `test`, `testing`, `local`).
- `SameSite` must be explicit (not the zero/default value).
- `SameSite=None` requires `Secure=true`.

### Environment variables

`velocity.New` overrides the package defaults from these variables:

| Variable | Field |
|----------|-------|
| `CSRF_TOKEN_LIFETIME` | `TokenLifetime` |
| `CSRF_HEADER` | `HeaderName` |
| `CSRF_FORM_FIELD` | `FormField` |
| `CSRF_COOKIE_NAME` | `CookieName` |
| `CSRF_SESSION_COOKIE` | `SessionCookieName` (defaults to the session cookie name) |
| `CSRF_SAME_SITE` | `SameSite` |
| `CSRF_SECURE` | `Secure` (set to `false` to disable) |
| `CSRF_HTTP_ONLY` | `HttpOnly` |
| `CSRF_SINGLE_USE` | `SingleUse` |
| `CSRF_WRITE_XSRF_COOKIE` | `WriteXSRFCookie` |
| `CSRF_XSRF_COOKIE_NAME` | `XSRFCookieName` |
| `CSRF_ERROR_MESSAGE` | `ErrorMessage` |

## Token Storage Strategies

### Session Store (Default)

Server-side token storage using sessions. Most secure for traditional web applications.

```go
import "github.com/velocitykode/velocity/csrf/stores"

config := csrf.DefaultConfig()
config.Store = stores.NewSessionStore()
```

**Pros:**
- Most secure (server-side validation)
- Works with server-side sessions
- Tokens never exposed to client

**Cons:**
- Requires session management
- Not suitable for stateless APIs

### Custom Store Implementation

The `csrf.Store` interface has four methods: `Get`, `Set`, `Delete`, and
`Exists`. `Get` must return `stores.ErrTokenNotFound` for a missing entry
(`GetToken` mints a fresh token only on that sentinel; any other error is
surfaced unchanged).

```go
import "github.com/velocitykode/velocity/csrf/stores"

type CustomStore struct {
    cache map[string]string
    mu    sync.RWMutex
}

func (s *CustomStore) Get(id string) (string, error) {
    s.mu.RLock()
    defer s.mu.RUnlock()

    token, exists := s.cache[id]
    if !exists {
        return "", stores.ErrTokenNotFound
    }
    return token, nil
}

func (s *CustomStore) Set(id string, token string) error {
    s.mu.Lock()
    defer s.mu.Unlock()

    s.cache[id] = token
    return nil
}

func (s *CustomStore) Delete(id string) error {
    s.mu.Lock()
    defer s.mu.Unlock()

    delete(s.cache, id)
    return nil
}

func (s *CustomStore) Exists(id string) bool {
    s.mu.RLock()
    defer s.mu.RUnlock()

    _, ok := s.cache[id]
    return ok
}

// Use custom store
config.Store = &CustomStore{
    cache: make(map[string]string),
}
```

{{% callout type="info" %}}
For cross-process **single-use** enforcement, a store may also implement
the optional `csrf.AtomicConsumer` interface
(`ConsumeIfMatch(id, expected string) (bool, error)`). Without it, the
middleware falls back to a per-process lock and logs a one-time warning -
single-use is then best-effort across replicas.
{{% /callout %}}

## Template integration

Expose the token to templates as a shared prop (e.g. `csrfToken`) by
publishing `csrf.TokenForRequest(r)` from your `SetSharePropsFunc` (see
[Quick Start](#quick-start)). Include it in your root template's meta tag
and in any form that submits to an unsafe method:

```html
<meta name="csrf-token" content="{{ .csrfToken }}">

<form method="POST" action="/submit">
    <input type="hidden" name="_token" value="{{ .csrfToken }}">
    <!-- other fields -->
</form>
```

The middleware looks for the token in this order:

1. The configured header (`config.HeaderName`, default `X-CSRF-Token`).
2. The `X-XSRF-TOKEN` header (axios/Angular convention - clients echo the
   URL-encoded `XSRF-TOKEN` cookie value).
3. The `_token` form field (settable via `config.FormField`), parsed only
   from an `application/x-www-form-urlencoded` body up to
   `config.MaxFormBodyBytes`. Multipart bodies are never parsed - send the
   token in a header instead.

Tokens are emitted in a per-response **masked** form (see `csrf.MaskToken`)
so identical bytes never repeat across responses, defeating BREACH-style
compression-oracle extraction. The middleware accepts both the masked form
and a raw framework-length token.

## Middleware integration

### Applying CSRF to the web stack

Add `RouterMiddleware()` to the web middleware list so it runs on all
browser routes:

```go
v.Middleware(func(m *velocity.MiddlewareStack) {
    csrfInstance := v.CSRF.(*csrf.CSRF)

    m.Web(
        csrfInstance.RouterMiddleware(), // CSRF validation on unsafe methods
    )
})
```

The session middleware is registered globally by `velocity.New` and runs
ahead of the web stack, so the session ID is resolvable by the time CSRF
validation runs.

### Selective application

To apply CSRF only to a subset of routes, omit it from the web stack and
add it to a specific group instead:

```go
v.Routes(func(r *velocity.Routing) {
    csrfInstance := v.CSRF.(*csrf.CSRF)

    r.Web(func(web router.Router) {
        web.Get("/", handlers.Home)

        web.Group("/account", func(acc router.Router) {
            acc.Post("/update", handlers.AccountUpdate)
            acc.Delete("/delete", handlers.AccountDelete)
        }).Use(csrfInstance.RouterMiddleware())
    })
})
```

### Conditional bypass

Use `ExcludeFunc` on the config rather than wrapping middleware:

```go
config.ExcludeFunc = func(r *http.Request) bool {
    // skip CSRF for requests carrying a bearer token
    return strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ")
}
```

## Path Exclusions

### Wildcard Patterns

```go
config.ExcludePaths = []string{
    "/api/webhooks/*",      // All webhook endpoints
    "/health",              // Exact match
    "/metrics",             // Exact match
    "/public/*",            // All public endpoints
}
```

### Custom Exclusion Logic

```go
config.ExcludeFunc = func(r *http.Request) bool {
    // Exclude if API key is present
    if r.Header.Get("X-API-Key") != "" {
        return true
    }

    // Exclude if OAuth bearer token
    if strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
        return true
    }

    // Exclude specific user agents (e.g., monitoring tools)
    if strings.Contains(r.UserAgent(), "Monitoring") {
        return true
    }

    return false
}
```

## AJAX and Single Page Applications

### Setting Up for SPAs

Expose a refresh endpoint and exclude it from CSRF validation:

```go
// Config: exclude the refresh endpoint from validation. With velocity.New
// the CSRF instance is built from Config.CSRF, so set this on the config
// (or via CSRF_* env) rather than constructing a second instance.
cfg.CSRF.ExcludePaths = []string{"/csrf/token"}

// Routes: register the refresh handler off the framework-built v.CSRF.
v.Routes(func(r *velocity.Routing) {
    csrfInstance := v.CSRF.(*csrf.CSRF)
    handler := csrfInstance.RefreshHandler()

    r.Web(func(web router.Router) {
        web.Get("/csrf/token", func(c *router.Context) error {
            handler(c.Response, c.Request)
            return nil
        })
    })
})
```

### JavaScript Integration

```javascript
// Fetch token on page load
async function getCSRFToken() {
    const response = await fetch('/csrf/token');
    const data = await response.json();
    return data.token;
}

// Use in AJAX requests
async function submitForm(formData) {
    const token = await getCSRFToken();

    const response = await fetch('/api/submit', {
        method: 'POST',
        headers: {
            'X-CSRF-Token': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    });

    return response.json();
}

// Or store in meta tag and reuse
const token = document.querySelector('meta[name="csrf-token"]').content;

fetch('/api/data', {
    method: 'POST',
    headers: {
        'X-CSRF-Token': token,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
});
```

### Axios Integration

```javascript
// Set default header for all requests
const token = document.querySelector('meta[name="csrf-token"]').content;

axios.defaults.headers.common['X-CSRF-Token'] = token;

// Now all POST/PUT/DELETE requests include the token
axios.post('/api/submit', data);
```

## Error Handling

### Default Error Response

**HTML Requests:**
```
HTTP/1.1 419 Authentication Timeout
Content-Type: text/plain

CSRF token validation failed. Please refresh and try again.
```

**JSON Requests:**
```json
{
  "code": 419,
  "message": "CSRF token validation failed. Please refresh and try again."
}
```

A request is treated as JSON when its `Content-Type` or `Accept` header
contains `application/json`.

### Custom Error Handler

```go
config.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
    // Log the error
    log.Warn("CSRF validation failed",
        "error", err,
        "ip", r.RemoteAddr,
        "path", r.URL.Path,
    )

    // Check if it's a JSON request
    if strings.Contains(r.Header.Get("Accept"), "application/json") {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(419)
        json.NewEncoder(w).Encode(map[string]interface{}{
            "error": "csrf_validation_failed",
            "message": "Your session has expired. Please refresh the page.",
        })
        return
    }

    // Render custom error page for HTML requests
    w.WriteHeader(419)
    template.Must(template.ParseFiles("views/errors/csrf.html")).Execute(w, nil)
}
```

## Security Considerations

### HTTP Status Code 419

Velocity uses status code `419 Authentication Timeout` for CSRF failures. This distinguishes CSRF errors from other validation errors.

### SameSite Cookie Attribute

```go
// Strict: Maximum CSRF protection, may break cross-site navigation
config.SameSite = http.SameSiteStrictMode

// Lax: Balanced protection (default, recommended)
config.SameSite = http.SameSiteLaxMode

// None: Minimal protection, requires Secure=true
config.SameSite = http.SameSiteNoneMode
```

### Single-Use Tokens

```go
// Enable single-use tokens for maximum security
config.SingleUse = true

// Note: Requires token refresh after each request
// Best for high-security operations
```

When `SingleUse` is enabled the `XSRF-TOKEN` convenience cookie is **not**
written (the value would be consumed by the next unsafe request and go
stale). Use `RefreshHandler` to hand out a new token after each request.

### Token Lifetime

```go
// Short lifetime for high-security applications
config.TokenLifetime = 1 * time.Hour

// Longer lifetime for better UX
config.TokenLifetime = 24 * time.Hour
```

### Session lifecycle

`*csrf.CSRF` implements `contract.CSRFTokenRotator`, which the auth
subsystem uses to keep tokens aligned with the session:

- `RotateToken(oldID, newID)` - delete the old session's token and mint a
  fresh one for the new ID (called after session regeneration on login).
- `RevokeToken(id)` - delete a session's token (called on logout).
- `WriteXSRFCookie(w, sessionID)` / `ClearXSRFCookie(w, r)` - write or
  clear the `XSRF-TOKEN` cookie so SPA clients pick up the rotated token.

Release the token store's background goroutine on shutdown with
`(*csrf.CSRF).Shutdown(ctx)`; `velocity.New` registers this for you.

### Events

When the middleware cannot resolve a session on an unsafe request it
dispatches a `csrf.session_fallback` event (`csrf.SessionFallback`).
Frequent occurrences usually mean the session middleware is not running
ahead of CSRF, or `SessionCookieName` does not match your session cookie.

## Best Practices

1. **Always Use CSRF for State-Changing Operations**: Protect POST, PUT, DELETE, PATCH requests
2. **Exclude Read-Only Operations**: GET, HEAD, OPTIONS don't need CSRF protection
3. **Use HTTPS in Production**: Set `Secure: true` to prevent token interception
4. **Implement Token Refresh**: Provide `/csrf/token` endpoint for SPAs
5. **Set Appropriate SameSite**: Use `Lax` or `Strict` based on your needs
6. **Monitor CSRF Failures**: Log failures to detect potential attacks
7. **Handle Expired Tokens Gracefully**: Show user-friendly error messages

## Testing

```go
func TestCSRFProtection(t *testing.T) {
    config := csrf.DefaultConfig()
    // SessionIDResolver is required; key tokens by the session_id cookie.
    config.SessionIDResolver = func(r *http.Request) (string, error) {
        if c, err := r.Cookie("session_id"); err == nil && c.Value != "" {
            return c.Value, nil
        }
        return "", csrf.ErrNoSession
    }
    protection := csrf.New(config)
    mw := protection.Middleware

    next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    })
    handler := mw(next)

    // POST without token → 419
    req := httptest.NewRequest(http.MethodPost, "/submit", nil)
    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)
    assert.Equal(t, 419, rec.Code)

    // POST with valid token → 200
    sessionID := "test-session"
    token, _ := protection.GetToken(sessionID)

    req = httptest.NewRequest(http.MethodPost, "/submit", nil)
    req.Header.Set("X-CSRF-Token", token)
    req.AddCookie(&http.Cookie{Name: "session_id", Value: sessionID})

    rec = httptest.NewRecorder()
    handler.ServeHTTP(rec, req)
    assert.Equal(t, http.StatusOK, rec.Code)

    // GET → passes (safe method)
    req = httptest.NewRequest(http.MethodGet, "/page", nil)
    rec = httptest.NewRecorder()
    handler.ServeHTTP(rec, req)
    assert.Equal(t, http.StatusOK, rec.Code)
}
```

`Middleware` takes an `http.Handler` (net/http compatible). For the
router-compatible variant, call `RouterMiddleware()` - see the
[testing docs](/docs/core/testing) for end-to-end tests through the
full Velocity middleware chain.

## Troubleshooting

### Token Validation Always Failing

**Problem:** CSRF validation fails even with valid tokens

**Solutions:**
1. Verify session cookie is being sent
2. Check `SessionCookieName` matches your session cookie
3. Ensure cookies are not blocked by browser
4. Verify HTTPS if `Secure: true` is set

### Tokens Not Reaching Templates

**Problem:** `{{ .csrfToken }}` renders empty

**Solutions:**
1. Verify the shared-props function (`engine.SetSharePropsFunc`) is
   publishing `csrf.TokenForRequest(r)` - see
   [Template integration](#template-integration)
2. Confirm the CSRF middleware runs before the handler that renders the
   page; `TokenForRequest` returns `csrf.ErrNoTokenState` otherwise
3. Confirm the session cookie is being sent with the request (an
   anonymous request has no token to embed yet)

### AJAX Requests Failing

**Problem:** AJAX POST/PUT/DELETE returns 419

**Solutions:**
1. Include token in `X-CSRF-Token` header
2. Ensure token is fetched from meta tag or API
3. Check token hasn't expired
4. Verify content-type header is set correctly
