---
title: Authentication
description: Implement user login, registration, password hashing, and session management with Velocity's auth system.
weight: 10
---

Velocity provides a powerful authentication system that handles user login, registration, password hashing, and session management out of the box.

## Setup

### Environment Configuration

Configure authentication in your `.env` file:

```env
# Crypto settings (required for session encryption)
CRYPTO_KEY=base64:your-32-byte-base64-encoded-key
CRYPTO_CIPHER=AES-256-CBC

# Auth settings
AUTH_GUARD=web
AUTH_MODEL=User
HASH_BCRYPT_COST=10

# Session settings
SESSION_NAME=velocity_session
SESSION_LIFETIME=120
SESSION_PATH=/
SESSION_SECURE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

### Initialization

When you boot the app via `velocity.New()`, the framework reads `AUTH_GUARD`, `HASH_BCRYPT_COST`, and the `SESSION_*` variables, builds an `auth.Manager`, registers an ORM-backed user provider, and wires a `SessionGuard` against the encrypted-cookie store. No manual wiring is required for the common case.

If you need to construct the manager yourself (custom guard, embedded use, tests), the underlying API is:

```go
package main

import (
    "database/sql"
    "net/http"

    "github.com/velocitykode/velocity/auth"
    "github.com/velocitykode/velocity/auth/drivers/guards"
    "github.com/velocitykode/velocity/crypto"
)

func buildAuth(db *sql.DB, enc crypto.Encryptor) (*auth.Manager, error) {
    manager := auth.NewManager()

    // Provider: ORM-backed user lookup against the "users" table.
    provider := auth.NewORMUserProvider(db, "User", manager.GetHasher())
    manager.RegisterProvider("users", provider)

    // Guard: encrypted-cookie session store.
    sessionGuard, err := guards.NewSessionGuard(provider, auth.SessionConfig{
        Name:     "velocity_session",
        Lifetime: 120,
        Path:     "/",
        Secure:   true,
        HttpOnly: true,
        SameSite: http.SameSiteLaxMode,
    }, enc)
    if err != nil {
        return nil, err
    }
    manager.RegisterGuard("web", sessionGuard)
    manager.SetDefaultGuard("web")

    return manager, nil
}
```

Inside a handler you reach the manager through `auth.FromContext(ctx)`:

```go
import "github.com/velocitykode/velocity/auth"

m := auth.FromContext(ctx) // *auth.Manager, or nil if auth is not configured
```

### User Model Requirements

Your User model must implement the `Authenticatable` interface:

```go
type User struct {
    orm.Model[User]
    Name     string `orm:"column:name" json:"name"`
    Email    string `orm:"column:email" json:"email"`
    Password string `orm:"column:password" json:"-"`
}

// GetAuthIdentifier returns the user's unique identifier
func (u *User) GetAuthIdentifier() interface{} {
    return u.ID
}

// GetAuthPassword returns the user's hashed password
func (u *User) GetAuthPassword() string {
    return u.Password
}

// GetRememberToken returns the remember token
func (u *User) GetRememberToken() string {
    return "" // Implement if using remember me
}

// SetRememberToken sets the remember token
func (u *User) SetRememberToken(token string) {
    // Implement if using remember me
}
```

## Quick Start

Using authentication in handlers:

```go
import (
    "github.com/velocitykode/velocity/auth"
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/view"
)

func (c *AuthHandler) Login(ctx *router.Context) error {
    var formData struct {
        Email    string `json:"email"`
        Password string `json:"password"`
        Remember bool   `json:"remember"`
    }

    if err := ctx.Bind(&formData); err != nil {
        formData.Email = ctx.Request.FormValue("email")
        formData.Password = ctx.Request.FormValue("password")
        formData.Remember = ctx.Request.FormValue("remember") == "on"
    }

    credentials := map[string]interface{}{
        "email":    formData.Email,
        "password": formData.Password,
    }

    m := auth.FromContext(ctx)
    success, _ := m.Attempt(ctx.Response, ctx.Request, credentials, formData.Remember)

    if success {
        view.Location(ctx.Response, ctx.Request, "/dashboard")
    } else {
        view.Render(ctx.Response, ctx.Request, "Auth/Login", view.Props{
            "errors": map[string]string{
                "email": "These credentials do not match our records.",
            },
        })
    }
    return nil
}
```

## User Authentication

### Login Attempts

```go
m := auth.FromContext(ctx)

credentials := map[string]interface{}{
    "email":    "user@example.com",
    "password": "secret123",
}

success, err := m.Attempt(ctx.Response, ctx.Request, credentials, false)
if err != nil {
    // err is auth.ErrLoginThrottled when the configured throttler rejected
    // the attempt before credentials were even checked.
    return err
}
if success {
    user := m.User(ctx.Request)
    log.Info("User logged in", "user_id", user.GetAuthIdentifier())
}
```

### Remember Me Functionality

```go
// Login with "remember me" for extended sessions
m := auth.FromContext(ctx)
success, _ := m.Attempt(ctx.Response, ctx.Request, credentials, true)
if success {
    user := m.User(ctx.Request)
    log.Info("User logged in with remember me", "user_id", user.GetAuthIdentifier())
}
```

### Checking Authentication Status

```go
m := auth.FromContext(ctx)

if m.Check(ctx.Request) {
    user := m.User(ctx.Request)
    if user != nil {
        log.Info("Authenticated user", "user_id", user.GetAuthIdentifier())
    }
} else {
    return ctx.Redirect(http.StatusFound, "/login")
}
```

### Logout

```go
func LogoutHandler(ctx *router.Context) error {
    m := auth.FromContext(ctx)
    if err := m.Logout(ctx.Response, ctx.Request); err != nil {
        return err
    }
    view.Location(ctx.Response, ctx.Request, "/login")
    return nil
}
```

## Password Hashing

Password hashing lives on the manager so the bcrypt cost configured in `HASH_BCRYPT_COST` is honored uniformly.

### Hash Passwords

```go
m := auth.FromContext(ctx)

password := "user_password_123"
hashedPassword, err := m.Hash(password)
if err != nil {
    log.Error("Failed to hash password", "error", err)
    return err
}

// Store hashedPassword in database
user.Password = hashedPassword
```

### Verify Passwords

```go
m := auth.FromContext(ctx)

if m.Verify(providedPassword, user.Password) {
    log.Info("Password verification successful")
} else {
    log.Warn("Password verification failed")
}
```

If you need a hasher outside a request (a CLI seeder, for example), construct one directly with `auth.NewBcryptHasher(cost)` and call `Hash` / `Verify` on it. The minimum cost is clamped to 10 with a warning.

## User Interface

### Authenticatable Interface

Implement the `Authenticatable` interface for your user models:

```go
type User struct {
    ID       uint   `json:"id"`
    Email    string `json:"email"`
    Password string `json:"-"` // Hidden from JSON
    Name     string `json:"name"`
}

// GetAuthIdentifier returns the user's unique identifier
func (u *User) GetAuthIdentifier() interface{} {
    return u.ID
}

// GetAuthPassword returns the user's hashed password
func (u *User) GetAuthPassword() string {
    return u.Password
}

// GetRememberToken returns the remember token
func (u *User) GetRememberToken() string { return "" }

// SetRememberToken sets the remember token
func (u *User) SetRememberToken(token string) {}
```

### Custom User Providers

```go
// Implement UserProvider interface for custom user retrieval
type CustomUserProvider struct {
    db *sql.DB
}

func (p *CustomUserProvider) FindByID(id interface{}) (auth.Authenticatable, error) {
    var user User
    err := p.db.QueryRow("SELECT id, email, password, name FROM users WHERE id = ?", id).
        Scan(&user.ID, &user.Email, &user.Password, &user.Name)
    if err != nil {
        return nil, err
    }
    return &user, nil
}

func (p *CustomUserProvider) FindByCredentials(credentials map[string]interface{}) (auth.Authenticatable, error) {
    email := credentials["email"].(string)
    var user User
    err := p.db.QueryRow("SELECT id, email, password, name FROM users WHERE email = ?", email).
        Scan(&user.ID, &user.Email, &user.Password, &user.Name)
    if err != nil {
        return nil, err
    }
    return &user, nil
}

func (p *CustomUserProvider) ValidateCredentials(user auth.Authenticatable, credentials map[string]interface{}) bool {
    password, _ := credentials["password"].(string)
    return auth.NewBcryptHasher(10).Verify(password, user.GetAuthPassword())
}

func (p *CustomUserProvider) UpdateRememberToken(user auth.Authenticatable, token string) error {
    user.SetRememberToken(token)
    _, err := p.db.Exec("UPDATE users SET remember_token = ? WHERE id = ?", token, user.GetAuthIdentifier())
    return err
}
```

## Middleware Integration

### Auth Middleware

Use `auth.AuthMiddleware` to require authentication on a route. It returns 401 JSON for API requests and redirects to `/login?redirect=...` for HTML requests.

```go
import "github.com/velocitykode/velocity/auth"

r.Get("/dashboard", dashboardHandler.Index, auth.AuthMiddleware(manager))
```

For role- or ability-based gates, the package also exposes `auth.RequireRole`, `auth.RequireAnyRole`, `auth.RequireAllRoles`, and `auth.AuthorizeMiddleware`. All of them deny with 401 when the request is unauthenticated and 403 when the policy fails.

### Guest Middleware

`auth.GuestMiddleware` blocks already-authenticated users from login/register pages. Pass a redirect path with `auth.GuestMiddlewareWithRedirect`.

```go
r.Get("/login",    authHandler.ShowLoginForm,    auth.GuestMiddlewareWithRedirect(manager, "/dashboard"))
r.Get("/register", authHandler.ShowRegisterForm, auth.GuestMiddlewareWithRedirect(manager, "/dashboard"))
```

## Session Management

### Session Configuration

Configure sessions in your `.env` file:

```env
# Session settings
SESSION_NAME=velocity_session
SESSION_LIFETIME=120          # Minutes
SESSION_PATH=/
SESSION_DOMAIN=
SESSION_SECURE=true           # HTTPS only
SESSION_HTTP_ONLY=true        # No JavaScript access
SESSION_SAME_SITE=lax         # CSRF protection
```

### Session Backends

Cookie-encrypted sessions are the default, but they are not the only option. The framework defines a `SessionStore` interface so you can swap in a server-side store (for example a Redis- or DB-backed implementation) without changing handler code. The interface lives in `auth/session.go`:

```go
// auth.Session is the value handed to handlers.
type Session interface {
    ID() string
    Get(key string) interface{}
    Put(key string, value interface{})
    Has(key string) bool
    Remove(key string)
    Clear()
    Regenerate() error
    Invalidate() error
    Flash(key string, value interface{})
    GetFlash(key string) interface{}
    Save(w http.ResponseWriter) error
}

// auth.SessionStore is what backends implement.
type SessionStore interface {
    Create(id string) (Session, error)
    Get(r *http.Request, id string) (Session, error)
    Save(w http.ResponseWriter, session Session) error
    Destroy(id string) error
    GarbageCollect(maxLifetime time.Duration) error
}
```

The shipped implementation is `auth/drivers/session.CookieStore` (encrypted cookies, with `auth.SessionConfig` controlling cookie attributes). To plug in a custom backend, implement `SessionStore`, construct a `SessionGuard` against it, and register that guard with the manager. `SessionGuard` accepts whichever store it is given because it talks to the interface, not the cookie struct directly.

For ad-hoc reads you can also call `auth.GetSessionFromRequest(r, store, cookieName)` to resolve a session from a request when you have a store reference outside of guard code.

`auth.SessionConfig.Validate(env)` enforces safe defaults: `HttpOnly` must be true unless `AllowJSAccess` is explicitly set, `Secure` must be true outside `testing`/`development`, `SameSite` must be non-zero, and `SameSite=None` requires `Secure=true`. Failing this returns `auth.ErrInsecureSessionConfig`, so bootstrap code can fail fast in production and log-then-continue in dev.

### LoginThrottler

`SessionGuard.Attempt` (and `JWTGuard.Attempt`) consult a `contract.LoginThrottler` before checking credentials. The interface is the seam for credential-stuffing defense:

```go
// contract.LoginThrottler
type LoginThrottler interface {
    Allow(r *http.Request, key string) bool
    RecordFailure(r *http.Request, key string)
    RecordSuccess(r *http.Request, key string)
}
```

Contract:

- `Allow(r, key)` runs before the credential check. Returning `false` short-circuits the attempt with `auth.ErrLoginThrottled`.
- `RecordFailure(r, key)` runs when credential validation fails.
- `RecordSuccess(r, key)` runs after a successful login; a good implementation clears the failure counter for that key.

The default throttler is `auth.NoopLoginThrottler{}`, which permits every attempt. Install a real one with `guard.SetLoginThrottler(yourThrottler)` (passing `nil` reverts to the no-op).

The framework also exposes `auth.ThrottleKey(r, credentials)`, which derives the rate-limit key as `"<identifier>|<ip>"`. The `identifier` is the first non-empty value among `email`, `username`, `name`, `login` in the credentials map, falling back to IP-only when no identifier is present. Use it so a custom guard wrapper produces keys consistent with the built-in guards.

## Registration & User Creation

### User Registration

```go
func RegisterHandler(ctx *router.Context) error {
    m := auth.FromContext(ctx)

    // Get form data
    name := ctx.Request.FormValue("name")
    email := ctx.Request.FormValue("email")
    password := ctx.Request.FormValue("password")
    passwordConfirmation := ctx.Request.FormValue("password_confirmation")

    // Validate passwords match
    if password != passwordConfirmation {
        view.Render(ctx.Response, ctx.Request, "auth/register", view.Props{
            "error": "Passwords do not match",
            "old": map[string]string{
                "name": name,
                "email": email,
            },
        })
        return nil
    }

    // Hash password
    hashedPassword, err := m.Hash(password)
    if err != nil {
        return ctx.Error("Internal Server Error", http.StatusInternalServerError)
    }

    // Create user (using your user model)
    user, err := models.User{}.Create(map[string]any{
        "name":     name,
        "email":    email,
        "password": hashedPassword,
    })
    if err != nil {
        view.Render(ctx.Response, ctx.Request, "auth/register", view.Props{
            "error": "Failed to create account",
        })
        return nil
    }

    // Auto-login the new user
    credentials := map[string]interface{}{
        "email":    email,
        "password": password, // Use original password for login
    }

    success, _ := m.Attempt(ctx.Response, ctx.Request, credentials, false)
    if success {
        view.Location(ctx.Response, ctx.Request, "/dashboard")
    } else {
        view.Location(ctx.Response, ctx.Request, "/login")
    }
    return nil
}
```

## Security Features

### Password Requirements

```go
func validatePassword(password string) []string {
    var errors []string

    if len(password) < 8 {
        errors = append(errors, "Password must be at least 8 characters")
    }

    hasUpper := regexp.MustCompile(`[A-Z]`).MatchString(password)
    if !hasUpper {
        errors = append(errors, "Password must contain uppercase letter")
    }

    hasLower := regexp.MustCompile(`[a-z]`).MatchString(password)
    if !hasLower {
        errors = append(errors, "Password must contain lowercase letter")
    }

    hasNumber := regexp.MustCompile(`\d`).MatchString(password)
    if !hasNumber {
        errors = append(errors, "Password must contain a number")
    }

    return errors
}
```

### Rate Limiting

Per-attempt throttling lives in the `LoginThrottler` seam (see above). For coarser route-level limits, for example capping requests to `/login` regardless of credentials, reach for `middleware.RateLimitByKey` from `core/middleware`, which composes cleanly with `auth.AuthMiddleware`.

## Testing Authentication

```go
func TestAuthentication(t *testing.T) {
    hasher := auth.NewBcryptHasher(10)

    // Test password hashing
    password := "test123"
    hash, err := hasher.Hash(password)
    assert.NoError(t, err)
    assert.True(t, hasher.Verify(password, hash))
    assert.False(t, hasher.Verify("wrong", hash))

    // Test authentication attempt against an in-memory manager.
    manager := auth.NewManager()
    manager.SetHasher(hasher)
    // ... register a fake provider + guard, then:

    credentials := map[string]interface{}{
        "email":    "test@example.com",
        "password": "test123",
    }

    req := httptest.NewRequest("POST", "/login", nil)
    rec := httptest.NewRecorder()

    success, err := manager.Attempt(rec, req, credentials, false)
    assert.NoError(t, err)
    assert.True(t, success)

    user := manager.User(req)
    assert.Equal(t, "test@example.com", user.(*models.User).Email)
}
```

## Best Practices

1. **Always Hash Passwords**: Never store plain text passwords
2. **Use HTTPS**: Enable secure cookies in production
3. **Implement Rate Limiting**: Prevent brute force attacks
4. **Validate Input**: Always validate and sanitize user input
5. **Session Security**: Regenerate session IDs after login
6. **Remember Me**: Use secure tokens for persistent sessions
7. **Logout Everywhere**: Provide ability to logout from all devices

## Recipe: Throttle login attempts by email + IP

**When:** You want to slow down credential-stuffing without locking out an entire office NAT or letting an attacker spray a single IP across thousands of accounts.

**Code:**

```go
// myapp/auth/throttler.go
type EmailIPThrottler struct {
    cache cache.Store // any cache.Store; Redis-backed in prod
}

func (t *EmailIPThrottler) Allow(r *http.Request, key string) bool {
    n, _ := t.cache.Get("login:fail:" + key).(int)
    return n < 5
}

func (t *EmailIPThrottler) RecordFailure(r *http.Request, key string) {
    n, _ := t.cache.Get("login:fail:" + key).(int)
    t.cache.Put("login:fail:"+key, n+1, 15*time.Minute)
}

func (t *EmailIPThrottler) RecordSuccess(r *http.Request, key string) {
    t.cache.Forget("login:fail:" + key)
}

// during bootstrap, after building the SessionGuard:
sessionGuard.SetLoginThrottler(&EmailIPThrottler{cache: cacheStore})
```

**Why this shape:** The framework hands you the composite key for free via `auth.ThrottleKey(r, credentials)`, which produces `"<email>|<ip>"`. Keying on the composite means a single attacker IP cannot exhaust attempts for an unrelated user, and a shared IP (NAT, corporate egress) does not collectively lock out everyone behind it. The 5/15-minute window is a starting point: tune to your traffic. Keying on email-only invites enumeration; IP-only invites NAT lockout; the composite is the load-bearing detail. `RecordSuccess` clearing the counter is what lets a legitimate user recover after a typo storm.

**See also:**

- [`core/middleware`]({{< relref "/docs/core/middleware" >}}) for `RateLimitByKey` (route-level, complements per-attempt throttling)
- [`core/cache`]({{< relref "/docs/core/cache" >}}) for the `Store` interface used above
- [`core/csrf`]({{< relref "/docs/core/csrf" >}}) for the other half of session-based form defense

## Related

- [`core/csrf`]({{< relref "/docs/core/csrf" >}}) for CSRF protection on session-based forms
- [`core/cache`]({{< relref "/docs/core/cache" >}}) for the `cache.Store` interface used by Redis-backed throttlers and (eventually) Redis-backed session stores
- [`core/middleware`]({{< relref "/docs/core/middleware" >}}) for `RateLimitByKey`, the route-level rate limiter that composes with `auth.AuthMiddleware`
