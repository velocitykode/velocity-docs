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
CRYPTO_CIPHER=AES-256-GCM

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
        view.Location(ctx, "/dashboard")
    } else {
        view.Render(ctx, "Auth/Login", view.Props{
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
    view.Location(ctx, "/login")
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

The `auth.UserProvider` interface threads a `context.Context` through every method that does I/O so a cancelled request (client disconnect, timeout middleware) aborts the lookup. Each I/O method comes in a pair: a `Ctx`-suffixed variant that does the real work, and a deprecated non-`Ctx` shim that delegates with `context.Background()`. Implement all six methods plus `ValidateCredentials` (pure CPU, so no `Ctx` variant):

```go
// Implement UserProvider interface for custom user retrieval
type CustomUserProvider struct {
    db *sql.DB
}

func (p *CustomUserProvider) FindByIDCtx(ctx context.Context, id interface{}) (auth.Authenticatable, error) {
    var user User
    err := p.db.QueryRowContext(ctx, "SELECT id, email, password, name FROM users WHERE id = $1", id).
        Scan(&user.ID, &user.Email, &user.Password, &user.Name)
    if err != nil {
        return nil, err
    }
    return &user, nil
}

// Deprecated: use FindByIDCtx with a request-scoped context.Context.
func (p *CustomUserProvider) FindByID(id interface{}) (auth.Authenticatable, error) {
    return p.FindByIDCtx(context.Background(), id)
}

func (p *CustomUserProvider) FindByCredentialsCtx(ctx context.Context, credentials map[string]interface{}) (auth.Authenticatable, error) {
    email := credentials["email"].(string)
    var user User
    err := p.db.QueryRowContext(ctx, "SELECT id, email, password, name FROM users WHERE email = $1", email).
        Scan(&user.ID, &user.Email, &user.Password, &user.Name)
    if err != nil {
        return nil, err
    }
    return &user, nil
}

// Deprecated: use FindByCredentialsCtx with a request-scoped context.Context.
func (p *CustomUserProvider) FindByCredentials(credentials map[string]interface{}) (auth.Authenticatable, error) {
    return p.FindByCredentialsCtx(context.Background(), credentials)
}

func (p *CustomUserProvider) ValidateCredentials(user auth.Authenticatable, credentials map[string]interface{}) bool {
    password, _ := credentials["password"].(string)
    return auth.NewBcryptHasher(10).Verify(password, user.GetAuthPassword())
}

func (p *CustomUserProvider) UpdateRememberTokenCtx(ctx context.Context, user auth.Authenticatable, token string) error {
    user.SetRememberToken(token)
    _, err := p.db.ExecContext(ctx, "UPDATE users SET remember_token = $1 WHERE id = $2", token, user.GetAuthIdentifier())
    return err
}

// Deprecated: use UpdateRememberTokenCtx with a request-scoped context.Context.
func (p *CustomUserProvider) UpdateRememberToken(user auth.Authenticatable, token string) error {
    return p.UpdateRememberTokenCtx(context.Background(), user, token)
}
```

For atomic rotate-on-use of the remember-me credential, a provider may additionally implement `auth.RememberTokenCompareAndSwapper` (`CompareAndSwapRememberToken(ctx, user, oldToken, newToken) (swapped bool, err error)`); `SessionGuard` recall persists rotation exclusively through it. A provider that does not implement it fails remember-cookie recall closed.

## Middleware Integration

### Auth Middleware

Use `auth.AuthMiddleware` to require authentication on a route. It returns 401 JSON for API requests and redirects HTML requests to a clean `/login` (303 See Other). The originally requested GET URL is stashed server-side in the session rather than exposed as a `?redirect=` query parameter, so it cannot be tampered with; `ctx.RedirectToIntended(fallback)` pulls it back after a successful login.

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
    FlushFlash() map[string]interface{}
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

#### Server-side session store

The cookie-side `SessionStore` carries per-request state, but it cannot answer two product questions you will eventually need to answer: "log me out everywhere" and "show me my active devices." Both require the server to know which session ids belong to which user, which a stateless cookie cannot tell you. The framework exposes a parallel `auth.ServerSessionStore` interface for that record:

```go
// auth.ServerSessionStore (auth/server_session_store.go)
type ServerSessionStore interface {
    Get(ctx context.Context, id string) (*StoredSession, error)
    Put(ctx context.Context, session *StoredSession) error
    Delete(ctx context.Context, id string) error
    DeleteAllForUser(ctx context.Context, userID string) error
    ListForUser(ctx context.Context, userID string) ([]*SessionMeta, error)
}
```

`auth.StoredSession` is the full record (`ID`, `UserID`, `Data map[string]any`, `CreatedAt`, `LastSeenAt`, `ExpiresAt`, `IPAddress`, `UserAgent`). `auth.SessionMeta` is the listing-only projection: same fields minus `Data`, so administrative listings cannot leak per-session payloads. Sentinel errors are `auth.ErrSessionNotFound`, `auth.ErrSessionExpired` (returned by `Get` after evicting the expired record), and `auth.ErrNoServerSessionStore` (returned by the manager helpers below when no store is installed).

{{< callout type="info" title="Cookie store vs. server store" >}}
You usually want both. The encrypted cookie store handles per-request reads and writes with no I/O. The server store underwrites administrative operations only, without it `RevokeSession` and `ListActiveSessions` return `ErrNoServerSessionStore`.
{{< /callout >}}

The shipped driver is `auth/drivers/session.NewMemoryStore`, an in-process implementation suitable for development, tests, and single-process deployments. It is `sync.RWMutex`-protected, maintains a secondary `userID -> {sessionID}` index so `DeleteAllForUser` and `ListForUser` are O(sessions-for-user), and runs a background sweep goroutine (default cadence 1 minute, override with `session.WithSweepInterval(d)`) that reaps expired records. The sweep is started by `NewMemoryStore` via `async.Go`, so a panic inside the loop is reported through the framework panic handler rather than crashing the process. `Close(ctx)` stops the sweep and is idempotent (safe to call multiple times). Production multi-process deployments should provide a Redis- or DB-backed driver against the same interface.

Wire it once at bootstrap and the manager helpers light up:

```go
import (
    "context"

    "github.com/velocitykode/velocity/auth"
    "github.com/velocitykode/velocity/auth/drivers/session"
)

store := session.NewMemoryStore() // or session.NewMemoryStore(session.WithSweepInterval(30*time.Second))
manager.SetServerSessionStore(store)
```

Once installed, three methods on `*auth.Manager` cover the administrative surface:

- `RevokeSession(ctx, sessionID) error`: single-session logout (e.g. "log out this device").
- `RevokeAllSessions(ctx, userID) error`: bulk revoke (e.g. "log out everywhere", post-password-change).
- `ListActiveSessions(ctx, userID) ([]*SessionMeta, error)`: feed the "your devices" UI.

All three return `auth.ErrNoServerSessionStore` when no store is configured, so callers can branch on missing capability without a nil-check dance. `SetServerSessionStore(nil)` removes a previously installed store.

##### Recipe: Log out all sessions on password change

**When:** A user changes their password from the account settings page. Anyone holding a session cookie issued before the change should be evicted, including other browsers, mobile apps, and the attacker the user is currently kicking out.

**Code:**

```go
func (h *AccountHandler) ChangePassword(ctx *router.Context) error {
    m := auth.FromContext(ctx)
    user := m.User(ctx.Request)
    if user == nil {
        return ctx.Error(http.StatusUnauthorized, "unauthorized")
    }

    // ... validate current password, hash new one, persist ...

    userID := fmt.Sprint(user.GetAuthIdentifier())
    if err := m.RevokeAllSessions(ctx.Request.Context(), userID); err != nil &&
        !errors.Is(err, auth.ErrNoServerSessionStore) {
        return err
    }

    // The current request's cookie is also gone now; re-issue a session
    // for this device so the user is not bounced to /login mid-flow.
    credentials := map[string]interface{}{
        "email":    user.(*models.User).Email,
        "password": newPassword,
    }
    _, _ = m.Attempt(ctx.Response, ctx.Request, credentials, false)
    return nil
}
```

**Why this shape:** `RevokeAllSessions` walks the secondary `userID -> {sessionID}` index and deletes every record in one shot, so the call is cheap even for users with many devices. Tolerating `ErrNoServerSessionStore` keeps the same handler usable in environments that have not yet provisioned a server-side store (e.g. local dev). Re-attempting after the bulk revoke gives the current request a fresh cookie tied to a brand-new server-side record, which is what you want: the password change should not log out the device performing it.

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

The framework also exposes `auth.ThrottleKey(r, credentials, trustedProxies)`, which derives the rate-limit key for the `(identifier, IP)` pair dimension as a length-bounded SHA-256 digest prefixed with `login:`. The `identifier` is the first non-empty value among `email`, `username`, `name`, `login` in the credentials map (normalised: trimmed, NFKC-folded, lowercased), and the client IP is resolved through the trusted-proxy list (pass `nil` to ignore forwarded headers, the secure default). Use it so a custom guard wrapper produces keys consistent with the built-in guards.

The built-in guards actually consult `auth.ThrottleKeys(r, credentials, trustedProxies)`, which returns up to three keys, one per throttle dimension: the `(identifier, IP)` pair (always present, prefix `auth.ThrottleKeyPairPrefix`), the per-identifier key (prefix `auth.ThrottleKeyIdentifierPrefix`, omitted when no identifier is present), and the per-IP key (prefix `auth.ThrottleKeyIPPrefix`, omitted when the IP cannot be resolved). A throttler can branch on those prefixes to apply an independent cap per dimension.

## Two-factor authentication

Velocity ships RFC 6238 TOTP (time-based one-time passwords) plus single-use recovery codes. The surface lives in `auth/totp.go`; everything is HMAC-SHA1, 6-digit, 30-second period by default, matching what Google Authenticator, 1Password, Authy, and friends speak out of the box. The package-level `auth.TOTP` is a pre-configured `*TOTPGenerator` with `Skew: 1` (previous, current, and next windows are accepted on verify), which is the right default for almost every app. Construct your own with `auth.NewTOTP(auth.TOTPConfig{...})` if you need to override `Issuer`, `Digits`, `Period`, or `Skew`.

### Enrollment

Enrollment is two server round-trips: generate a secret, render its `otpauth://` URI as a QR code, then verify the first code the user types from their authenticator app before persisting the secret as enabled.

```go
import "github.com/velocitykode/velocity/auth"

// 1. Begin enrollment: generate a secret and the otpauth:// URI.
secret, qrURL, err := auth.TOTP.Generate("user@example.com")
if err != nil {
    return err
}
// `secret` is base32 (no padding); show qrURL to the user as a QR code,
// and stash secret in a pending-enrollment record (NOT on the user yet).

// 2. User scans the QR with their authenticator and submits the first
//    6-digit code. Use VerifyAndConsume so the matched step gets recorded
//    and replay is rejected from the very first verify.
matched, step := auth.TOTP.VerifyAndConsume(secret, submittedCode, 0)
if !matched {
    return errors.New("invalid code")
}
// Persist secret + step on the user, flip `two_factor_enabled = true`.
user.TOTPSecret = secret
user.TOTPLastUsedStep = step
```

`Generate(label)` returns `(secret, qrURL, err)` where `secret` is a base32-encoded 160-bit value (RFC 6238 section 5.1) and `qrURL` is an `otpauth://totp/<label>?secret=...&issuer=...&algorithm=SHA1&digits=6&period=30` URI. Render that URI to a QR with any QR library; authenticator apps consume it directly.

### Verification at sign-in

Two methods cover verification, with a deliberate split:

- `auth.TOTP.Verify(secret, code) bool`: stateless check across the configured skew window. Fast, but has **no replay protection**: the same code submitted twice in the same 30-second window will succeed twice. Use this only when you have an external replay control (e.g. one-time challenge tokens that already prevent re-submission).
- `auth.TOTP.VerifyAndConsume(secret, code, lastUsedStep) (matched bool, step int64)`: the safe default. Walks the skew window in constant time (no early return, `subtle.ConstantTimeSelect` for the matched step) so timing does not leak which window matched. Rejects replay at the framework level: if the matched step is `<= lastUsedStep`, the call returns `(false, 0)` even though the code itself was valid. The caller persists the returned `step` per user and passes it on the next call.

Pass `lastUsedStep == 0` on first verification (immediately after enrollment); any real TOTP step (`Unix() / period`) is far larger so the comparison still admits the first code. On any rejection (bad code, replay, decode failure) the returned step is always 0; treat `(false, *)` as "do nothing" and never consult the step value.

```go
matched, step := auth.TOTP.VerifyAndConsume(user.TOTPSecret, code, user.TOTPLastUsedStep)
if !matched {
    // Generic error: do not distinguish "bad code" from "replayed code".
    return errors.New("invalid code")
}
user.TOTPLastUsedStep = step
// Persist `user` so the new step is durable before the next attempt.
```

The default `Skew: 1` accepts codes from the previous, current, and next 30-second window, smoothing over clock drift between the user's phone and the server. Set `Skew: 0` for strict current-window-only matching; values greater than 1 widen the acceptance window proportionally.

### Recovery codes

Recovery codes are the user's escape hatch when they lose their authenticator. Generate a batch at enrollment, present them once, and store hashed copies for verification.

```go
codes, err := auth.TOTP.GenerateRecoveryCodes(8)
if err != nil {
    return err
}
// Show `codes` to the user ONCE (download / print). The plaintext is
// never displayed again.

// Hash each code via the manager's Hasher before persisting.
hashed := make([]string, 0, len(codes))
for _, c := range codes {
    h, err := auth.HashRecoveryCode(manager.GetHasher(), c)
    if err != nil {
        return err
    }
    hashed = append(hashed, h)
}
user.RecoveryCodes = hashed // []string of bcrypt hashes
```

Codes are formatted `XXXX-XXXX` from a 31-character unambiguous alphabet (no `0`/`O`, `1`/`I`/`l`), drawn with rejection sampling so the distribution is uniform. `GenerateRecoveryCodes(n)` requires `n > 0` and returns `auth.ErrInvalidRecoveryCount` otherwise.

At redemption time, scan the stored hashes with `ConsumeRecoveryCodeHashed`. The scan is uniform: every call performs `len(stored)` hasher verifications regardless of which (or whether any) hash matches, so timing does not reveal which slot matched. On match the matched hash is removed (single-use semantics) and you persist the trimmed slice.

```go
consumed, remaining, err := auth.TOTP.ConsumeRecoveryCodeHashed(
    manager.GetHasher(), user.RecoveryCodes, submittedCode,
)
if err != nil {
    return err
}
if !consumed {
    return errors.New("invalid recovery code")
}
user.RecoveryCodes = remaining
// Persist user; consider showing a "you have N codes left" warning when
// len(remaining) drops below a threshold.
```

{{< callout type="warning" title="ConsumeRecoveryCode is deprecated" >}}
The plaintext analog `auth.TOTP.ConsumeRecoveryCode(stored []string, supplied string)` is retained for compatibility but compares plaintext codes. Storing recovery codes as plaintext at rest is unsafe. Use `HashRecoveryCode` at issuance and `ConsumeRecoveryCodeHashed` at redemption for any production deployment.
{{< /callout >}}

`HashRecoveryCode(h Hasher, code string)` and `ConsumeRecoveryCodeHashed(h Hasher, hashed []string, supplied string)` both delegate to the supplied `auth.Hasher`. The bcrypt hasher already configured by the manager works directly, no extra crypto dependency needed. Both return errors when the hasher is nil or the input is empty.

### Gating routes on 2FA

Once enrollment is done, you want protected actions (changing email, exporting data, viewing billing) to require that the current request was made by a user who has actually completed the 2FA challenge for this session, not just one who happens to have 2FA enabled in principle. The framework hands you `auth.RequireTwoFactor`, a `BeforeCallback` you register on a `Gate`:

```go
// auth.RequireTwoFactor (auth/totp_gate.go)
func RequireTwoFactor(getStatus func(actor any) bool) BeforeCallback
```

The supplied `getStatus` function receives the `Authenticatable` as `any` (so consumer code can type-assert to its own user model without `auth` depending on it) and returns true when the current actor has satisfied the 2FA challenge for this session. Wire it once on your gate:

```go
gate.Before(auth.RequireTwoFactor(func(actor any) bool {
    u, ok := actor.(*models.User)
    if !ok {
        return false
    }
    // Pull the per-session "2fa_verified_at" flag the login flow set
    // after a successful VerifyAndConsume.
    return u.TwoFactorVerifiedThisSession
}))
```

Semantics: when `getStatus` reports `true`, the callback returns `nil` and the gate falls through to the actual policies and abilities. When it reports `false`, the callback returns a pointer to `false`, denying every ability on this gate. When `getStatus` itself is nil (or the actor is nil), the callback is a no-op and returns nil so it cannot accidentally lock every user out of an app where 2FA is not yet provisioned.

#### Recipe: Enable TOTP for an account

**When:** A signed-in user opens "Security" in account settings and clicks "Enable two-factor authentication." You need a stateful enrollment flow: generate, confirm, then activate.

**Code:**

```go
// Step 1: GET /account/2fa/setup
func (h *TwoFactorHandler) Setup(ctx *router.Context) error {
    user := auth.FromContext(ctx).User(ctx.Request).(*models.User)

    secret, qrURL, err := auth.TOTP.Generate(user.Email)
    if err != nil {
        return err
    }

    // Stash secret in a *pending* slot, not the live TOTPSecret column.
    user.PendingTOTPSecret = secret
    if err := user.Save(); err != nil {
        return err
    }

    return view.Render(ctx, "Account/TwoFactor/Setup", view.Props{
        "qr_url": qrURL,
        "secret": secret, // shown for manual entry
    })
}

// Step 2: POST /account/2fa/confirm  body: { "code": "123456" }
func (h *TwoFactorHandler) Confirm(ctx *router.Context) error {
    m := auth.FromContext(ctx)
    user := m.User(ctx.Request).(*models.User)

    var body struct{ Code string `json:"code"` }
    if err := ctx.Bind(&body); err != nil {
        return err
    }

    matched, step := auth.TOTP.VerifyAndConsume(user.PendingTOTPSecret, body.Code, 0)
    if !matched {
        return ctx.Error(http.StatusUnprocessableEntity, "invalid code")
    }

    // Promote pending -> live, generate recovery codes, hash them.
    plain, err := auth.TOTP.GenerateRecoveryCodes(8)
    if err != nil {
        return err
    }
    hashed := make([]string, 0, len(plain))
    for _, c := range plain {
        h, err := auth.HashRecoveryCode(m.GetHasher(), c)
        if err != nil {
            return err
        }
        hashed = append(hashed, h)
    }

    user.TOTPSecret = user.PendingTOTPSecret
    user.PendingTOTPSecret = ""
    user.TOTPLastUsedStep = step
    user.TwoFactorEnabled = true
    user.RecoveryCodes = hashed
    if err := user.Save(); err != nil {
        return err
    }

    // Show recovery codes ONCE, plaintext, with a download / print prompt.
    return view.Render(ctx, "Account/TwoFactor/Codes", view.Props{
        "codes": plain,
    })
}
```

**Why this shape:** Splitting setup and confirm into two requests is the load-bearing detail. Generating the secret on the GET and persisting it directly to `TOTPSecret` would enable 2FA on the account before the user proves their authenticator can actually produce valid codes, locking them out if their phone clock is wrong or they botched the QR scan. The pending slot keeps the live column untouched until `VerifyAndConsume` succeeds, and passing `lastUsedStep: 0` admits the first code while still recording its step so an attacker cannot replay the same submission. Recovery codes are generated server-side, shown once, and stored hashed via the manager's existing bcrypt hasher, no new crypto dependency, and a constant-time scan at redemption.

**See also:**

- [`core/middleware`]({{< relref "/docs/core/middleware" >}}) for `RateLimitByKey` to throttle 2FA verification attempts the same way you throttle login.

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
        view.Render(ctx, "auth/register", view.Props{
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
        return ctx.Error(http.StatusInternalServerError, "Internal Server Error")
    }

    // Create user (using your user model)
    user, err := models.User{}.Create(map[string]any{
        "name":     name,
        "email":    email,
        "password": hashedPassword,
    })
    if err != nil {
        view.Render(ctx, "auth/register", view.Props{
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
        view.Location(ctx, "/dashboard")
    } else {
        view.Location(ctx, "/login")
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

Per-attempt throttling lives in the `LoginThrottler` seam (see above). For coarser route-level limits, for example capping requests to `/login` regardless of credentials, reach for `router.RateLimitByKey`, which composes cleanly with `auth.AuthMiddleware`.

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
    v, _ := t.cache.GetCtx(r.Context(), "login:fail:"+key)
    n, _ := v.(int)
    return n < 5
}

func (t *EmailIPThrottler) RecordFailure(r *http.Request, key string) {
    v, _ := t.cache.GetCtx(r.Context(), "login:fail:"+key)
    n, _ := v.(int)
    _ = t.cache.PutCtx(r.Context(), "login:fail:"+key, n+1, 15*time.Minute)
}

func (t *EmailIPThrottler) RecordSuccess(r *http.Request, key string) {
    _ = t.cache.ForgetCtx(r.Context(), "login:fail:"+key)
}

// during bootstrap, after building the SessionGuard:
sessionGuard.SetLoginThrottler(&EmailIPThrottler{cache: cacheStore})
```

**Why this shape:** The framework hands you the composite key for free via `auth.ThrottleKey(r, credentials, trustedProxies)`, a length-bounded SHA-256 digest over the normalised identifier and the resolved client IP. Keying on the composite means a single attacker IP cannot exhaust attempts for an unrelated user, and a shared IP (NAT, corporate egress) does not collectively lock out everyone behind it. The 5/15-minute window is a starting point: tune to your traffic. Keying on email-only invites enumeration; IP-only invites NAT lockout; the composite is the load-bearing detail. `RecordSuccess` clearing the counter is what lets a legitimate user recover after a typo storm. For a throttler that caps each dimension independently, consult `auth.ThrottleKeys` instead and branch on the per-key prefix.

**See also:**

- [`core/middleware`]({{< relref "/docs/core/middleware" >}}) for `RateLimitByKey` (route-level, complements per-attempt throttling)
- [`core/cache`]({{< relref "/docs/core/cache" >}}) for the `Store` interface used above
- [`core/csrf`]({{< relref "/docs/core/csrf" >}}) for the other half of session-based form defense

## Related

- [`core/csrf`]({{< relref "/docs/core/csrf" >}}) for CSRF protection on session-based forms
- [`core/cache`]({{< relref "/docs/core/cache" >}}) for the `cache.Store` interface used by Redis-backed throttlers and (eventually) Redis-backed session stores
- [`core/middleware`]({{< relref "/docs/core/middleware" >}}) for `RateLimitByKey`, the route-level rate limiter that composes with `auth.AuthMiddleware`
