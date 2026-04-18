---
title: CSRF Protection
description: Protect your Velocity application against cross-site request forgery attacks with built-in CSRF middleware.
weight: 60
---

Velocity provides comprehensive CSRF (Cross-Site Request Forgery) protection to secure your application against unauthorized form submissions and state-changing requests.

## Quick Start

{{< tabs items="Basic Setup,Middleware,Template Usage,API Protection" >}}

{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity/csrf"
    "github.com/velocitykode/velocity/csrf/stores"
)

// Build a CSRF instance with the default configuration and a session store.
config := csrf.DefaultConfig()
config.Store = stores.NewSessionStore()

protection := csrf.New(config)
```

Assign it to your Velocity app so other services (view engine, middleware)
can reach it:

```go
v.CSRF = protection
```
{{< /tab >}}

{{< tab >}}
```go
// Apply CSRF to the web middleware stack
v.Middleware(func(m *velocity.MiddlewareStack) {
    csrfInstance := v.CSRF.(*csrf.CSRF)

    m.Web(
        middleware.Session,               // must run before CSRF
        csrfInstance.RouterMiddleware(),  // validates token on unsafe methods
    )
})
```

`RouterMiddleware()` returns a `router.MiddlewareFunc` that reads the
session cookie, looks up the token, and validates the request.
{{< /tab >}}

{{< tab >}}
```html
<!-- Meta tag: rendered by the view engine from shared props -->
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

The token is obtained via `protection.GetToken(sessionID)`. Plug it into
the view engine's shared props (or your own render pipeline) under the
key your template reads:

```go
engine.SetSharePropsFunc(func(r *http.Request) (view.Props, error) {
    props := view.Props{}
    if cookie, err := r.Cookie("my_session"); err == nil {
        if token, err := protection.GetToken(cookie.Value); err == nil {
            props["csrf_token"] = token
        }
    }
    return props, nil
})
```
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
//     SameSite:          http.SameSiteLaxMode,
//     Secure:            true,
//     HTTPOnly:          true,
//     SingleUse:         false,
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

    // Security settings
    SameSite:  http.SameSiteStrictMode,     // CSRF protection level
    Secure:    true,                         // HTTPS only
    HTTPOnly:  true,                         // No JavaScript access
    SingleUse: false,                        // Reusable tokens

    // Storage
    Store: csrf_stores.NewSessionStore(),    // Token storage

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

```go
type CustomStore struct {
    cache map[string]string
    mu    sync.RWMutex
}

func (s *CustomStore) Get(id string) (string, error) {
    s.mu.RLock()
    defer s.mu.RUnlock()

    token, exists := s.cache[id]
    if !exists {
        return "", csrf.ErrTokenNotFound
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

// Use custom store
config.Store = &CustomStore{
    cache: make(map[string]string),
}
```

## Template integration

The token is exposed to templates as the shared prop `csrfToken`.
Include it in your root template's meta tag and in any form that submits
to an unsafe method:

```html
<meta name="csrf-token" content="{{ .csrfToken }}">

<form method="POST" action="/submit">
    <input type="hidden" name="_token" value="{{ .csrfToken }}">
    <!-- other fields -->
</form>
```

The default config looks for the token in:

1. The `X-CSRF-Token` header (settable via `config.HeaderName`)
2. The `_token` form field (settable via `config.FormField`)

## Middleware integration

### Applying CSRF to the web stack

Add `RouterMiddleware()` to the web middleware list so it runs on all
browser routes:

```go
v.Middleware(func(m *velocity.MiddlewareStack) {
    csrfInstance := v.CSRF.(*csrf.CSRF)

    m.Web(
        middleware.Session,               // session cookie first
        csrfInstance.RouterMiddleware(),  // then CSRF validation
    )
})
```

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
// Bootstrap: configure the CSRF instance
config := csrf.DefaultConfig()
config.ExcludePaths = []string{"/csrf/token"}
v.CSRF = csrf.New(config)

// Routes: register the refresh handler
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
  "error": "CSRF token invalid",
  "code": 419,
  "message": "CSRF token validation failed. Please refresh and try again."
}
```

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

### Token Lifetime

```go
// Short lifetime for high-security applications
config.TokenLifetime = 1 * time.Hour

// Longer lifetime for better UX
config.TokenLifetime = 24 * time.Hour
```

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
    protection := csrf.New(csrf.DefaultConfig())
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
   setting `csrf_token` - see [Template integration](#template-integration)
2. Confirm the session cookie is being sent with the request
3. Confirm `v.CSRF` is assigned in `Bootstrap` before the view engine
   shared-props closure runs

### AJAX Requests Failing

**Problem:** AJAX POST/PUT/DELETE returns 419

**Solutions:**
1. Include token in `X-CSRF-Token` header
2. Ensure token is fetched from meta tag or API
3. Check token hasn't expired
4. Verify content-type header is set correctly
