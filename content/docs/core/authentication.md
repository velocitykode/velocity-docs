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

# Session settings
SESSION_DRIVER=cookie
SESSION_NAME=velocity_session
SESSION_LIFETIME=120
SESSION_PATH=/
SESSION_SECURE=false
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

### Initialization

Initialize the auth system in your application bootstrap:

```go
package main

import (
    "os"

    "github.com/velocitykode/velocity/pkg/auth"
    "github.com/velocitykode/velocity/pkg/auth/drivers/guards"
    "github.com/velocitykode/velocity/pkg/crypto"
)

func initAuth() error {
    // Initialize crypto (required for session encryption)
    cryptoKey := os.Getenv("CRYPTO_KEY")
    if cryptoKey != "" {
        crypto.Init(crypto.Config{
            Key:    cryptoKey,
            Cipher: os.Getenv("CRYPTO_CIPHER"),
        })
    }

    // Get auth manager
    manager, err := auth.GetManager()
    if err != nil {
        return err
    }

    // Create session guard with ORM user provider
    sessionConfig := auth.NewSessionConfigFromEnv()
    provider := auth.NewORMUserProvider("user")
    sessionGuard, err := guards.NewSessionGuard(provider, sessionConfig)
    if err != nil {
        return err
    }

    // Register guard with name from AUTH_GUARD env
    guardName := os.Getenv("AUTH_GUARD")
    if guardName == "" {
        guardName = "web"
    }
    manager.RegisterGuard(guardName, sessionGuard)

    return nil
}
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

Using authentication in controllers:

```go
import (
    "github.com/velocitykode/velocity/pkg/auth"
    "github.com/velocitykode/velocity/pkg/router"
    "github.com/velocitykode/velocity/pkg/view"
)

func (c *AuthController) Login(ctx *router.Context) error {
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

    success, _ := auth.Attempt(ctx.Response, ctx.Request, credentials, formData.Remember)

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
// Basic login attempt
credentials := map[string]interface{}{
    "email":    "user@example.com",
    "password": "secret123",
}

success, user := auth.Attempt(ctx.Response, ctx.Request, credentials, false)
if success {
    // User is now logged in
    userID := user.GetAuthIdentifier()
    log.Info("User logged in", "user_id", userID)
}
```

### Remember Me Functionality

```go
// Login with "remember me" for extended sessions
success, user := auth.Attempt(ctx.Response, ctx.Request, credentials, true)
if success {
    // User session will persist longer
    log.Info("User logged in with remember me", "user_id", user.GetAuthIdentifier())
}
```

### Checking Authentication Status

```go
// Check if user is authenticated
if auth.Check(ctx.Request) {
    // User is logged in
    user := auth.User(ctx.Request)
    if user != nil {
        log.Info("Authenticated user", "user_id", user.GetAuthIdentifier())
    }
} else {
    // User is not authenticated
    return ctx.Redirect("/login", http.StatusFound)
}
```

### Logout

```go
func LogoutHandler(ctx *router.Context) error {
    auth.Logout(ctx.Response, ctx.Request)
    view.Location(ctx.Response, ctx.Request, "/login")
    return nil
}
```

## Password Hashing

### Hash Passwords

```go
// Hash a password for storage
password := "user_password_123"
hashedPassword, err := auth.Hash(password)
if err != nil {
    log.Error("Failed to hash password", "error", err)
    return
}

// Store hashedPassword in database
user.Password = hashedPassword
```

### Verify Passwords

```go
// Verify a password against its hash
providedPassword := "user_password_123"
storedHash := user.Password

if auth.CheckPassword(providedPassword, storedHash) {
    // Password is correct
    log.Info("Password verification successful")
} else {
    // Password is incorrect
    log.Warn("Password verification failed")
}
```

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
func (u User) GetAuthIdentifier() interface{} {
    return u.ID
}

// GetAuthPassword returns the user's hashed password
func (u User) GetAuthPassword() string {
    return u.Password
}
```

### Custom User Providers

```go
// Implement UserProvider interface for custom user retrieval
type CustomUserProvider struct {
    db *sql.DB
}

func (p *CustomUserProvider) RetrieveById(id interface{}) (auth.Authenticatable, error) {
    var user User
    err := p.db.QueryRow("SELECT id, email, password, name FROM users WHERE id = ?", id).
        Scan(&user.ID, &user.Email, &user.Password, &user.Name)
    if err != nil {
        return nil, err
    }
    return user, nil
}

func (p *CustomUserProvider) RetrieveByCredentials(credentials map[string]interface{}) (auth.Authenticatable, error) {
    email := credentials["email"].(string)
    var user User
    err := p.db.QueryRow("SELECT id, email, password, name FROM users WHERE email = ?", email).
        Scan(&user.ID, &user.Email, &user.Password, &user.Name)
    if err != nil {
        return nil, err
    }
    return user, nil
}
```

## Middleware Integration

### Auth Middleware

Protect routes with authentication middleware:

```go
func AuthMiddleware(next router.HandlerFunc) router.HandlerFunc {
    return func(ctx *router.Context) error {
        if !auth.Check(ctx.Request) {
            // Redirect to login if not authenticated
            redirectURL := url.QueryEscape(ctx.Request.URL.String())
            view.Location(ctx.Response, ctx.Request, "/login?redirect="+redirectURL)
            return nil
        }

        // User is authenticated, continue
        return next(ctx)
    }
}

// Apply to routes
r.Get("/dashboard", AuthMiddleware(dashboardController.Index))
```

### Guest Middleware

Restrict access for already authenticated users:

```go
func GuestMiddleware(next router.HandlerFunc) router.HandlerFunc {
    return func(ctx *router.Context) error {
        if auth.Check(ctx.Request) {
            // User is already authenticated, redirect to dashboard
            view.Location(ctx.Response, ctx.Request, "/dashboard")
            return nil
        }

        // User is not authenticated, continue
        return next(ctx)
    }
}

// Apply to login/register routes
r.Get("/login", GuestMiddleware(authController.ShowLoginForm))
r.Get("/register", GuestMiddleware(authController.ShowRegisterForm))
```

## Session Management

### Session Configuration

Configure sessions in your `.env` file:

```env
# Session settings
SESSION_DRIVER=cookie          # Options: cookie, file, redis
SESSION_LIFETIME=120           # Minutes
SESSION_SECURE=false          # HTTPS only
SESSION_HTTP_ONLY=true        # No JavaScript access
SESSION_SAME_SITE=lax         # CSRF protection

# Cookie settings
COOKIE_NAME=velocity_session
COOKIE_DOMAIN=localhost
COOKIE_PATH=/
```

### Custom Session Handling

```go
// Get session data
sessionData, err := auth.GetSession(ctx.Request, "user_preferences")
if err == nil {
    preferences := sessionData.(map[string]interface{})
    // Use preferences
}

// Set session data
auth.SetSession(ctx.Response, ctx.Request, "user_preferences", map[string]interface{}{
    "theme": "dark",
    "language": "en",
})

// Remove session data
auth.ForgetSession(ctx.Response, ctx.Request, "user_preferences")

// Regenerate session ID (security best practice)
auth.RegenerateSession(ctx.Response, ctx.Request)
```

## Registration & User Creation

### User Registration

```go
func RegisterHandler(ctx *router.Context) error {
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
    hashedPassword, err := auth.Hash(password)
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

    success, _ := auth.Attempt(ctx.Response, ctx.Request, credentials, false)
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

```go
func LoginRateLimitMiddleware(next router.HandlerFunc) router.HandlerFunc {
    limiter := make(map[string]*rate.Limiter)
    mu := sync.RWMutex{}

    return func(ctx *router.Context) error {
        ip := ctx.Request.RemoteAddr

        mu.RLock()
        l, exists := limiter[ip]
        mu.RUnlock()

        if !exists {
            mu.Lock()
            limiter[ip] = rate.NewLimiter(1, 3) // 3 attempts per minute
            l = limiter[ip]
            mu.Unlock()
        }

        if !l.Allow() {
            return ctx.Error("Too many login attempts", http.StatusTooManyRequests)
        }

        return next(ctx)
    }
}
```

## Testing Authentication

```go
func TestAuthentication(t *testing.T) {
    // Test password hashing
    password := "test123"
    hash, err := auth.Hash(password)
    assert.NoError(t, err)
    assert.True(t, auth.CheckPassword(password, hash))
    assert.False(t, auth.CheckPassword("wrong", hash))

    // Test authentication attempt
    user := &models.User{
        Email: "test@example.com",
        Password: hash,
    }

    credentials := map[string]interface{}{
        "email": "test@example.com",
        "password": "test123",
    }

    // Mock request/response
    req := httptest.NewRequest("POST", "/login", nil)
    rec := httptest.NewRecorder()

    success, authUser := auth.Attempt(rec, req, credentials, false)
    assert.True(t, success)
    assert.Equal(t, user.Email, authUser.(*models.User).Email)
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

