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
    "github.com/velocitykode/velocity/pkg/csrf"
    "github.com/velocitykode/velocity/pkg/router"
)

func main() {
    // Create CSRF protection with default configuration
    csrfConfig := csrf.DefaultConfig()
    csrfProtection := csrf.New(csrfConfig)

    // Set global instance for template helpers
    csrf.SetGlobalCSRF(csrfProtection)

    // Create router
    r := router.Get()

    // Apply CSRF middleware globally
    r.Use(csrf.Middleware())

    // Your routes
    r.Post("/submit-form", handleFormSubmission)
    r.Post("/update-profile", handleProfileUpdate)

    router.LoadRoutes()
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity/pkg/csrf"
    "github.com/velocitykode/velocity/pkg/router"
)

func setupCSRF() {
    // Configure CSRF with custom settings
    config := csrf.DefaultConfig()
    config.ExcludePaths = []string{
        "/api/webhooks/*",  // Webhook endpoints
        "/health",          // Health check
        "/metrics",         // Metrics endpoint
    }

    // Custom error handler for API responses
    config.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(419)
        json.NewEncoder(w).Encode(map[string]string{
            "error": "CSRF token validation failed",
            "code":  "CSRF_INVALID",
        })
    }

    protection := csrf.New(config)
    csrf.SetGlobalCSRF(protection)
}
```
{{< /tab >}}

{{< tab >}}
```html
<!-- In your HTML forms -->
<form method="POST" action="/submit">
    {{ csrfField .SessionID }}

    <input type="text" name="email" />
    <button type="submit">Submit</button>
</form>

<!-- Or using meta tag for JavaScript -->
<head>
    {{ csrfMeta .SessionID }}
</head>

<script>
    // Access token in JavaScript
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
{{< /tab >}}

{{< tab >}}
```go
// For SPA/API applications
func setupAPICSRF() {
    config := csrf.DefaultConfig()

    // Use header-based token validation
    config.HeaderName = "X-CSRF-Token"

    // Exclude read-only API endpoints
    config.ExcludeFunc = func(r *http.Request) bool {
        // Skip CSRF for API keys
        return r.Header.Get("Authorization") != ""
    }

    protection := csrf.New(config)
    csrf.SetGlobalCSRF(protection)

    // Provide token refresh endpoint
    r := router.Get()
    r.Get("/csrf/token", protection.RefreshHandler())
}
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
import "github.com/velocitykode/velocity/pkg/csrf/stores"

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

## Template Helpers

Velocity provides template functions for easy CSRF token inclusion:

### CSRFField

Generates a hidden input field with the CSRF token:

```go
// In your controller
func ShowForm(ctx *router.Context) error {
    sessionID := getSessionID(ctx.Request)

    return view.Render(ctx.Response, ctx.Request, "form", view.Props{
        "SessionID": sessionID,
    })
}
```

```html
<!-- In your template -->
<form method="POST" action="/submit">
    {{ csrfField .SessionID }}

    <input type="email" name="email" />
    <button type="submit">Submit</button>
</form>

<!-- Renders as: -->
<!-- <input type="hidden" name="_token" value="generated-token-here"> -->
```

### CSRFMeta

Generates a meta tag for JavaScript/AJAX:

```html
<head>
    {{ csrfMeta .SessionID }}
</head>

<!-- Renders as: -->
<!-- <meta name="csrf-token" content="generated-token-here"> -->
```

### CSRFToken

Returns the raw token value:

```go
token := csrf.CSRFToken(sessionID)
// Use token directly in code
```

## Middleware Integration

### Global Middleware

Apply CSRF protection to all routes:

```go
func main() {
    r := router.Get()

    // Apply globally
    r.Use(csrf.Middleware())

    // All routes protected
    r.Post("/submit", handleSubmit)
    r.Put("/update", handleUpdate)
}
```

### Route-Specific Middleware

Apply to specific routes or groups:

```go
func init() {
    router.Register(func(r router.Router) {
        // Public routes without CSRF
        r.Get("/", homeController.Index)

        // Protected routes with CSRF
        protected := r.Group("/account")
        protected.Use(csrf.Middleware())
        {
            protected.Post("/update", accountController.Update)
            protected.Delete("/delete", accountController.Delete)
        }
    })
}
```

### Conditional Middleware

```go
func ConditionalCSRF(next router.HandlerFunc) router.HandlerFunc {
    return func(ctx *router.Context) error {
        // Skip CSRF for API requests with bearer tokens
        if strings.HasPrefix(ctx.Request.Header.Get("Authorization"), "Bearer ") {
            return next(ctx)
        }

        // Apply CSRF for session-based requests
        return csrf.Middleware()(next)(ctx)
    }
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

```go
// Provide token endpoint
func setupSPA() {
    r := router.Get()

    // Token refresh endpoint (excluded from CSRF)
    config := csrf.DefaultConfig()
    config.ExcludePaths = []string{"/csrf/token"}

    protection := csrf.New(config)
    csrf.SetGlobalCSRF(protection)

    r.Get("/csrf/token", protection.RefreshHandler())
}
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

Velocity uses status code `419 Authentication Timeout` for CSRF failures, following Laravel's convention. This distinguishes CSRF errors from other validation errors.

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
    // Create CSRF protection
    config := csrf.DefaultConfig()
    protection := csrf.New(config)
    csrf.SetGlobalCSRF(protection)

    // Create test handler
    handler := csrf.Middleware()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    }))

    // Test POST without token (should fail)
    req := httptest.NewRequest("POST", "/submit", nil)
    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)
    assert.Equal(t, 419, rec.Code)

    // Test POST with valid token (should succeed)
    sessionID := "test-session"
    token, _ := protection.GetToken(sessionID)

    req = httptest.NewRequest("POST", "/submit", nil)
    req.Header.Set("X-CSRF-Token", token)
    req.AddCookie(&http.Cookie{
        Name:  "session_id",
        Value: sessionID,
    })

    rec = httptest.NewRecorder()
    handler.ServeHTTP(rec, req)
    assert.Equal(t, http.StatusOK, rec.Code)

    // Test GET request (should always pass)
    req = httptest.NewRequest("GET", "/page", nil)
    rec = httptest.NewRecorder()
    handler.ServeHTTP(rec, req)
    assert.Equal(t, http.StatusOK, rec.Code)
}
```

## Troubleshooting

### Token Validation Always Failing

**Problem:** CSRF validation fails even with valid tokens

**Solutions:**
1. Verify session cookie is being sent
2. Check `SessionCookieName` matches your session cookie
3. Ensure cookies are not blocked by browser
4. Verify HTTPS if `Secure: true` is set

### Tokens Not Generated in Templates

**Problem:** `csrfField` returns empty string

**Solutions:**
1. Call `csrf.SetGlobalCSRF()` during initialization
2. Verify sessionID is passed to template
3. Check CSRF middleware is registered

### AJAX Requests Failing

**Problem:** AJAX POST/PUT/DELETE returns 419

**Solutions:**
1. Include token in `X-CSRF-Token` header
2. Ensure token is fetched from meta tag or API
3. Check token hasn't expired
4. Verify content-type header is set correctly
