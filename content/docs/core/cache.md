---
title: Cache
description: Store and retrieve data with Velocity's multi-driver cache system supporting Redis and in-memory storage.
weight: 40
---

Velocity provides a unified caching interface supporting multiple drivers. The framework reads `CACHE_DRIVER` and the related env vars at boot and constructs a `*cache.Manager` for you, exposed as `app.Cache` (and `ctx.Cache()` from any handler).

## Quick Start

{{% callout type="info" %}}
**No global cache.** All cache operations are methods on `*cache.Manager`. Reach for `app.Cache` outside of requests, `ctx.Cache()` inside a handler. The package-level helpers are limited to `cache.NewManager`, `cache.RememberT`, `cache.RememberTWithContext`, `cache.GetAs`, `cache.GetAsWithContext`, and `cache.Drivers()` (the pluggable driver registry).

Inside a handler always prefer the `*WithContext` variant of every method (`PutWithContext`, `GetWithContext`, `RememberEWithContext`, `StoreWithContext`, ...) so the request's deadline flows through to Redis dials, S3 reaches, and DB connects.
{{% /callout %}}

{{< tabs items="Basic Usage,Remember Pattern,Bulk Operations" >}}

{{< tab >}}
```go
import (
    "time"
    "github.com/velocitykode/velocity/router"
)

func handler(ctx *router.Context) error {
    rctx := ctx.Context()

    // Store a value with TTL. PutWithContext threads ctx through to the
    // driver so a slow Redis write is cancelled when the request is.
    ctx.Cache().PutWithContext(rctx, "user:123", userData, 1*time.Hour)

    // Retrieve a value
    var user User
    if val, found := ctx.Cache().GetWithContext(rctx, "user:123"); found {
        user = val.(User)
    }

    // Store permanently
    ctx.Cache().ForeverWithContext(rctx, "app_version", "1.0.0")

    // Remove a value
    ctx.Cache().ForgetWithContext(rctx, "user:123")
    return nil
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "time"
    "github.com/velocitykode/velocity/router"
)

func getUser(ctx *router.Context, userID int) (*User, error) {
    key := fmt.Sprintf("user:%d", userID)

    // Get from cache or compute and store. Use RememberEWithContext so a
    // transient DB error is propagated instead of poisoning the slot, and
    // the request's deadline flows into both the cache lookup and the
    // upstream call.
    result, err := ctx.Cache().RememberEWithContext(ctx.Context(), key, 15*time.Minute, func() (interface{}, error) {
        return fetchUserFromDB(ctx.Context(), userID)
    })
    if err != nil {
        return nil, err
    }

    return result.(*User), nil
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "time"
    "github.com/velocitykode/velocity/velocity"
)

func bulkOperations(app *velocity.App) {
    // Store multiple values
    items := map[string]interface{}{
        "key1": "value1",
        "key2": "value2",
        "key3": "value3",
    }
    app.Cache.PutMany(items, 30*time.Minute)

    // Retrieve multiple values
    keys := []string{"key1", "key2", "key3"}
    results := app.Cache.Many(keys)

    for key, value := range results {
        fmt.Printf("%s: %v\n", key, value)
    }
}
```
{{< /tab >}}

{{< /tabs >}}

## Decision matrix

Pick the `Remember*` variant that matches your error and context needs. Default to `RememberEWithContext` (or the typed `RememberTWithContext[T]`) inside any handler that already has a `ctx`.

| Situation | Helper |
|---|---|
| Memoize idempotent fetch; tolerate framework eating callback errors | `Remember` |
| Memoize and propagate callback errors (no cache poison on err) | `RememberE` |
| Inside a handler, propagate request ctx into Redis / S3 / DB lookups | `RememberWithContext` / `RememberEWithContext` |
| Typed return, no `interface{}` assertion at the call site | `RememberT[T]` |
| Typed and ctx-aware (the default for new code) | `RememberTWithContext[T]` |
| Forever cache until explicit `Forget` | `RememberForever` / `RememberForeverWithContext` |
| Forever and error-aware | `RememberForeverE` / `RememberForeverEWithContext` |

{{< callout type="warning" >}}
`Remember` swallows the error you discard inside the callback. If `fetchUserFromDB` fails, you cache the zero value for the full TTL and every subsequent caller gets garbage back. Use `RememberE` whenever the callback can fail.
{{< /callout >}}

## Callback error path

`Remember` takes a `func() interface{}` callback, so the only way to handle a callback failure is to swallow it with `_`, which writes a zero value into the cache and pins it for the full TTL. That is rarely what you want.

`RememberE` takes a `func() (interface{}, error)`. When the callback returns a non-nil error, the cache slot is left untouched and the error is propagated to the caller. The next request retries from scratch.

```go
import "time"

// WRONG: transient DB hiccup poisons the cache for 15 minutes.
result, err := app.Cache.Remember(key, 15*time.Minute, func() interface{} {
    user, _ := fetchUserFromDB(userID) // err discarded
    return user
})

// RIGHT: error propagates, slot is not written, next call retries.
result, err := app.Cache.RememberE(key, 15*time.Minute, func() (interface{}, error) {
    return fetchUserFromDB(userID)
})
if err != nil {
    return nil, err
}
return result.(*User), nil
```

`RememberForeverE` is the equivalent error-aware variant of `RememberForever`.

## Context propagation

Every cache `Store` exposes a `Ctx`-suffixed variant of each operation (`GetCtx`, `PutCtx`, `AddCtx`, `ForeverCtx`, `ForgetCtx`, `FlushCtx`, `HasCtx`, `IncrementCtx`, `DecrementCtx`, `ManyCtx`, `PutManyCtx`) alongside the non-ctx form. The manager threads `context.Context` through to the driver so a slow Redis lookup is cancelled with the request; memory and file drivers honour the ctx where it affects blocking behaviour and otherwise ignore it transparently.

These methods are declared on the `contract.Cache` interface (aliased into the cache package as `cache.Cache`); `cache.Store` is `contract.CacheStore`, which embeds `Cache` plus `GetPrefix() string`.

```go
// Store is contract.CacheStore: every driver exposes both the plain and the
// Ctx-suffixed form of each operation. The non-ctx methods are deprecated
// shims that call the Ctx variant with context.Background().
type Store interface {
    GetCtx(ctx context.Context, key string) (interface{}, bool)
    GetStringCtx(ctx context.Context, key string) (string, bool)
    PutCtx(ctx context.Context, key string, value interface{}, ttl time.Duration) error
    AddCtx(ctx context.Context, key string, value interface{}, ttl time.Duration) (bool, error)
    ForeverCtx(ctx context.Context, key string, value interface{}) error
    ForgetCtx(ctx context.Context, key string) error
    FlushCtx(ctx context.Context) error
    IncrementCtx(ctx context.Context, key string, value int64) (int64, error)
    DecrementCtx(ctx context.Context, key string, value int64) (int64, error)
    ManyCtx(ctx context.Context, keys []string) map[string]interface{}
    PutManyCtx(ctx context.Context, items map[string]interface{}, ttl time.Duration) error
    HasCtx(ctx context.Context, key string) bool
    GetPrefix() string
    // ... plus the deprecated non-ctx shims (Get, Put, Add, ...)
}
```

{{% callout type="info" %}}
`ContextStore` is now a deprecated alias for `Store`. The ctx-aware methods that once lived on a separate extension interface have been promoted onto `Store` itself, so every driver satisfies them. Use `Store` directly; the alias is kept for one release so existing type assertions keep compiling.
{{% /callout %}}

Every `Manager` operation has a `*WithContext` counterpart: `GetWithContext`, `PutWithContext`, `AddWithContext`, `ForeverWithContext`, `ForgetWithContext`, `RememberWithContext`, `RememberEWithContext`, `RememberForeverWithContext`, `RememberForeverEWithContext`, plus `StoreWithContext(ctx, name)` and `DefaultStoreWithContext(ctx)` for resolving named stores under the caller's deadline. Use them from any handler that already has a `ctx`.

The ctx threads end-to-end: the first call that materialises a store (Redis dial, file mkdir, S3 endpoint check) sees the caller's ctx through the registry's `Resolve(ctx, name, cfg)` path, and every subsequent read/write on a `ContextStore` honours the same ctx. A handler with a 200 ms deadline cancels both the Redis dial AND the Redis `GET` if either runs long.

```go
func handler(ctx *router.Context) error {
    val, err := ctx.Cache().RememberEWithContext(ctx.Context(), "regions", 5*time.Minute, func() (interface{}, error) {
        return upstream.FetchRegions(ctx.Context())
    })
    if err != nil {
        return err
    }
    return ctx.JSON(200, val)
}
```

`Store(name)` and `DefaultStore()` still exist; they call `StoreWithContext(context.Background(), ...)` internally. Reach for them only outside a request scope (boot wiring, scripts, tests).

## Configuration

Configure caching through environment variables in your `.env` file:

```env
# Driver selection
CACHE_DRIVER=memory        # Options: memory, file, redis

# Prefix for cache keys
CACHE_PREFIX=velocity_cache

# Memory driver (default, no additional config needed)

# File driver settings
CACHE_PATH=./storage/cache

# Redis driver settings
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DATABASE=0
REDIS_TLS=false            # set true to dial Redis over TLS (min TLS 1.2)

# Memory driver bounds (optional)
CACHE_MEMORY_MAX_ENTRIES=0  # 0 applies the 1,000,000 default; negative disables the bound
CACHE_MAX_VALUE_BYTES=0     # 0 = unlimited; caps a single serialized value (memory + file)
```

{{% callout type="info" %}}
The framework wires a single `default` store from `CACHE_DRIVER`. There is no `CACHE_STORES` env var: extra named stores require building a `cache.Config` with multiple `Stores` entries yourself (see [Multiple Cache Stores](#multiple-cache-stores)).
{{% /callout %}}

## Drivers

The cache core self-registers its light drivers (`memory`, `file`) from `cache/init.go` at package import time, plus a `database` placeholder whose factory currently returns `velocity/cache: database driver not yet implemented`. The `redis` driver lives in the heavy `cache/redis` leaf (it carries the go-redis dependency) and self-registers from its own `init()`. Blank-import `github.com/velocitykode/velocity/cache/redis`, or `github.com/velocitykode/velocity/cache/standard` to pull in the full set, before selecting `CACHE_DRIVER=redis`. Any extra factory you install via `cache.Drivers().Register(...)` joins the same registry and becomes selectable through `CACHE_DRIVER` like a built-in.

### Memory Driver

The memory driver stores cache data in application memory:

- **Fast**: In-memory access with no I/O overhead
- **Thread-safe**: Concurrent access properly synchronized
- **Auto-cleanup**: Expired items automatically removed
- **Development**: Perfect for development and testing

**Note**: Cache is lost when the application restarts.

```go
// Auto-configured from .env
CACHE_DRIVER=memory
```

### File Driver

The file driver stores cache data on the filesystem:

- **Persistent**: Cache survives application restarts
- **Simple**: No external dependencies
- **Single-server**: Best for single-server deployments

```env
CACHE_DRIVER=file
CACHE_PATH=./storage/cache
```

### Redis Driver

The redis driver provides distributed caching:

- **Distributed**: Share cache across multiple servers
- **Persistent**: Cache survives application restarts
- **Production**: Best for production environments

```env
CACHE_DRIVER=redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DATABASE=0
REDIS_TLS=false
```

Because the Redis driver lives in the `cache/redis` leaf, it is not compiled into the core. Add a blank import somewhere in your binary so its factory is registered before the manager resolves `CACHE_DRIVER=redis`:

```go
import _ "github.com/velocitykode/velocity/cache/redis"
```

The Redis factory takes the caller's ctx and uses it for the initial `Ping`, so a misconfigured cluster fails under the request deadline rather than the go-redis default dial timeout. Construct one directly when you need to bypass the manager:

```go
import (
    "context"
    "github.com/velocitykode/velocity/cache/redis"
)

store, err := redis.NewRedisStore(ctx, "myapp", "127.0.0.1", 6379, "", 0, false)
if err != nil {
    return err
}
```

`NewRedisStore` validates host non-empty / port positive in the factory itself; `cache.StoreConfig.Validate` no longer enforces driver-specific fields, so third-party drivers stay free to define their own config shape. Note that a Redis store configured with an empty prefix disables `Flush` (returning `cache.ErrCannotFlushUnprefixed`) to avoid wiping an entire shared Redis database, and connecting to a non-loopback host without `REDIS_TLS=true` logs a cleartext-traffic warning.

## Custom Drivers

`cache.Drivers()` returns the canonical driver registry. Register a third-party factory from your driver package's `init()` and the manager will resolve it like any built-in:

```go
package dragonfly

import (
    "context"

    "github.com/velocitykode/velocity/cache"
)

func init() {
    cache.Drivers().Register("dragonfly", func(ctx context.Context, cfg cache.StoreConfig) (cache.Store, error) {
        // Validate the driver-specific fields here. The manager has
        // already merged global + per-store prefix into cfg.Prefix.
        if cfg.Host == "" {
            return nil, fmt.Errorf("dragonfly: host required")
        }
        return newDragonflyStore(ctx, cfg)
    })
}
```

Then point the config at the new driver name:

```env
CACHE_DRIVER=dragonfly
```

A few rules the registry enforces (panicking at boot, never at first request):

- Names are case-insensitive and trimmed; `Dragonfly` and `dragonfly` collide.
- `Register` panics on a duplicate registration. Use `Drivers().Override(name, factory)` from tests when you intentionally want to swap a real driver for a fake; it returns the previous factory so a `t.Cleanup` can restore it.
- A `nil` factory or empty name panics immediately.
- `Resolve` returns a typed `*driverregistry.NotFoundError` (with the available names) when `CACHE_DRIVER` points at an unregistered driver, so the failure surface includes a "did you mean?" hint.

`StoreConfig.Validate` only checks that `Driver` is non-empty. It deliberately does NOT consult `Drivers().Names()`: validation runs at config-load time, while the driver package's `init()` may run later (a blank import). Registry lookup is the resolver's job.

For the cross-subsystem story (queue, storage, mail, notification, log, orm all share the same `driverregistry`), see [Driver Registry](/docs/advanced/driver-registry/).

## API Reference

Every method below has a `*WithContext` sibling that takes `ctx context.Context` as the first argument. The non-ctx forms exist for boot wiring and one-off scripts; inside a handler always reach for the ctx-aware variant.

### Basic Operations

#### Put

Store a value in the cache with a TTL:

```go
import "time"

// Store string (request-scoped)
app.Cache.PutWithContext(ctx, "username", "john_doe", 1*time.Hour)

// Store struct
user := User{ID: 123, Name: "John Doe"}
app.Cache.PutWithContext(ctx, "user:123", user, 30*time.Minute)

// Boot-time wiring without a request ctx: use plain Put.
app.Cache.Put("config", configData, 24*time.Hour)
```

#### Get

Retrieve a value from the cache:

```go
// Get value (ctx threads through to Redis when applicable)
value, found := app.Cache.GetWithContext(ctx, "username")
if found {
    username := value.(string)
    fmt.Println("Username:", username)
}

// Get string value directly. GetString is convenience-only and does not
// take a ctx; use GetWithContext + a type assertion when you need both.
username, found := app.Cache.GetString("username")
if found {
    fmt.Println("Username:", username)
}
```

#### GetAs

The serializing drivers (redis, file) round-trip values through JSON, so a struct comes back as `map[string]interface{}` and an integer as `float64`. `cache.GetAs[T]` (and its ctx-aware sibling `cache.GetAsWithContext[T]`) re-decodes the stored value into the concrete `T` regardless of driver. These are package-level functions that take a `Store`, not `*Manager` methods (Go 1.26 method generics have not shipped):

```go
import "github.com/velocitykode/velocity/cache"

store, _ := app.Cache.DefaultStoreWithContext(ctx)
user, found := cache.GetAsWithContext[User](ctx, store, "user:123")
if found {
    fmt.Println(user.Name)
}
```

On the serializing drivers an integer larger than 2^53 may already have lost precision before `GetAs` runs; store such values as strings if you need exact large integers.

#### Add

Atomically store a value only if the key does not already exist (the SETNX primitive). Returns `(true, nil)` on insert and `(false, nil)` on contention; an error is returned only on a backend failure:

```go
import "time"

inserted, err := app.Cache.AddWithContext(ctx, "lock:job:42", "1", 30*time.Second)
if err != nil {
    return err
}
if !inserted {
    // another caller already holds the slot
}
```

#### Forever

Store a value permanently (no expiration):

```go
// Store without expiration, request-scoped
app.Cache.ForeverWithContext(ctx, "app_name", "Velocity")
app.Cache.ForeverWithContext(ctx, "build_number", "1234")
```

#### Forget

Remove a value from the cache:

```go
// Remove single key, request-scoped
app.Cache.ForgetWithContext(ctx, "user:123")

// Check if removed
if !app.Cache.Has("user:123") {
    fmt.Println("User cache cleared")
}
```

#### Flush

Clear all values from the cache:

```go
// Clear entire cache
app.Cache.Flush()
```

### Advanced Operations

#### Remember

Get from cache or compute and store. The callback signature is `func() interface{}`, so any error inside the callback must be discarded. Prefer `RememberE` whenever the callback can fail.

```go
import "time"

// Use only when the callback cannot return a meaningful error.
result, err := app.Cache.Remember("config:flags", 15*time.Minute, func() interface{} {
    return staticFlags()
})
```

#### RememberE

Error-aware variant of `Remember`. The callback returns `(interface{}, error)`; on a non-nil error the cache slot is NOT written and the error is propagated. This prevents transient upstream failures from pinning a zero value for the full TTL. Use `RememberEWithContext` whenever a ctx is in scope.

```go
func getExpensiveData(app *velocity.App, id int) (*Data, error) {
    key := fmt.Sprintf("data:%d", id)

    result, err := app.Cache.RememberE(key, 15*time.Minute, func() (interface{}, error) {
        return queryDatabase(id)
    })
    if err != nil {
        return nil, err
    }
    return result.(*Data), nil
}
```

#### RememberEWithContext

`RememberE` with a `context.Context`. The ctx threads through to the underlying driver via `ContextStore` so a slow Redis lookup is cancelled with the request, AND through the registry's `Resolve(ctx, ...)` step the first time the store is materialised so the initial Redis dial honours the same deadline. Memory and file drivers ignore the ctx transparently.

```go
func getRegions(ctx context.Context, app *velocity.App) ([]Region, error) {
    val, err := app.Cache.RememberEWithContext(ctx, "regions", 5*time.Minute, func() (interface{}, error) {
        return upstream.FetchRegions(ctx)
    })
    if err != nil {
        return nil, err
    }
    return val.([]Region), nil
}
```

#### RememberT

Typed-generic shim over `RememberE` that returns `T` directly, skipping the `interface{}` assertion at the call site. The first argument is anything that satisfies `RememberEable` (the cache `*Manager` does).

```go
import "github.com/velocitykode/velocity/cache"

region, err := cache.RememberT[Region](app.Cache, "regions:eu", 5*time.Minute, func() (Region, error) {
    return upstream.FetchRegion("eu")
})
if err != nil {
    return err
}
// region is Region, no cast needed.
```

`RememberTWithContext[T]` is the ctx-aware counterpart, taking any `RememberEContextable` (the cache `*Manager` again):

```go
region, err := cache.RememberTWithContext[Region](app.Cache, ctx, "regions:eu", 5*time.Minute, func() (Region, error) {
    return upstream.FetchRegion(ctx, "eu")
})
```

On a type mismatch (cache slot holds a different type than `T`), the function returns the zero `T` and an error so callers can detect corruption.

#### RememberForever

Get from cache or compute and store permanently:

```go
func getAppConfig(ctx context.Context, app *velocity.App) (*Config, error) {
    result, err := app.Cache.RememberForeverEWithContext(ctx, "app_config", func() (interface{}, error) {
        return loadConfig(ctx)
    })
    if err != nil {
        return nil, err
    }
    return result.(*Config), nil
}
```

`RememberForeverE` is the error-aware variant; `RememberForeverWithContext` and `RememberForeverEWithContext` add ctx propagation. Prefer `RememberForeverEWithContext` for any callback that hits the network.

#### Increment / Decrement

Atomic increment or decrement of numeric values:

```go
// Increment counter
newValue, err := app.Cache.Increment("page_views", 1)
if err != nil {
    log.Error("Failed to increment", "error", err)
}

// Increment by custom amount
app.Cache.Increment("total_sales", 150)

// Decrement counter
app.Cache.Decrement("items_remaining", 1)

// Decrement by custom amount
app.Cache.Decrement("stock_level", 10)
```

#### Has

Check if a key exists in the cache:

```go
if app.Cache.Has("user:123") {
    fmt.Println("User is cached")
} else {
    fmt.Println("User not in cache")
}
```

#### Distributed Locks

`Lock(key string, ttl ...time.Duration)` returns a `cache.Lock` backed by the default store. The TTL auto-expires the lock so a crashed holder cannot pin the key forever; it must be positive (a zero or negative TTL is rejected with `cache.ErrInvalidLockTTL`). `Lock` returns `nil` when the default store does not implement locking.

```go
lock := app.Cache.Lock("report:nightly", 5*time.Minute)
if lock == nil {
    return fmt.Errorf("store does not support locking")
}

// Run acquires the lock, invokes the callback, then releases it. Returns
// cache.ErrLockNotAcquired if the lock is already held.
err := lock.Run(ctx, func() {
    generateNightlyReport()
})
```

The `Lock` interface also exposes `Get(ctx)` / `GetWithErr(ctx)` to acquire, `Release(ctx)`, `Block(ctx, timeout, callback)` to wait for the lock, `Owner()`, and `ForceRelease(ctx)`. `RestoreLock(key, owner)` rebuilds a lock handle from a previously issued owner token so a different goroutine or process can release it.

### Bulk Operations

#### PutMany

Store multiple values at once:

```go
import "time"

func cacheUserData(app *velocity.App, users []User) {
    items := make(map[string]interface{})

    for _, user := range users {
        key := fmt.Sprintf("user:%d", user.ID)
        items[key] = user
    }

    // Store all users with 1 hour TTL
    app.Cache.PutMany(items, 1*time.Hour)
}
```

#### Many

Retrieve multiple values at once:

```go
func getUserBatch(app *velocity.App, userIDs []int) map[string]interface{} {
    keys := make([]string, len(userIDs))
    for i, id := range userIDs {
        keys[i] = fmt.Sprintf("user:%d", id)
    }

    // Get all users at once
    results := app.Cache.Many(keys)

    return results
}
```

## Multiple Cache Stores

Use different cache stores for different purposes. The framework's `.env` wiring only builds a single `default` store from `CACHE_DRIVER`; to register additional named stores, construct a `cache.Manager` yourself with a multi-store `cache.Config`.

### Configuration

```go
import "github.com/velocitykode/velocity/cache"

mgr := cache.NewManager(&cache.Config{
    Default: "default",
    Prefix:  "velocity_cache",
    Stores: map[string]cache.StoreConfig{
        "default": {Driver: cache.DriverMemory},
        "session": {Driver: cache.DriverMemory},
        "api":     {Driver: cache.DriverRedis, Host: "127.0.0.1", Port: 6379},
    },
})
```

Stores are created lazily on first access, so an unreferenced store never dials its backend.

### Using Named Stores

```go
func useMultipleStores(ctx context.Context, app *velocity.App) {
    // Get named store off the manager. StoreWithContext threads ctx into
    // the driver factory the first time the store is materialised, so a
    // slow Redis dial is cancelled when the request is.
    sessionStore, err := app.Cache.StoreWithContext(ctx, "session")
    if err != nil {
        log.Error("Failed to get session store", "error", err)
        return
    }

    // Use specific store
    sessionStore.Put("session:abc123", sessionData, 30*time.Minute)

    // Get from specific store
    val, found := sessionStore.Get("session:abc123")
}
```

`Store(name)` is the ctx-less form (it calls `StoreWithContext(context.Background(), name)` internally). Prefer the ctx-aware variant inside any handler. Subsequent calls to either form return the cached instance, so you only pay the dial cost on the first call.

### Manager for Advanced Usage

The framework constructs a `*cache.Manager` during `velocity.New()` and exposes it as `app.Cache`. Reach for it directly when you need named stores or distributed locks:

```go
func setupCaching(ctx context.Context, app *velocity.App) {
    // Get specific stores from the manager, ctx-scoped.
    apiCache, _ := app.Cache.StoreWithContext(ctx, "api")
    sessionCache, _ := app.Cache.StoreWithContext(ctx, "session")

    // Use different stores for different purposes
    apiCache.Put("api:users", users, 5*time.Minute)
    sessionCache.Put("session:123", sessionData, 30*time.Minute)
}
```

`DefaultStoreWithContext(ctx)` returns the manager's default store under the same ctx contract. If you ever need a manager outside the framework lifecycle (tests, scripts), build one yourself with `cache.NewManager(&cache.Config{...})`. That is the only package-level constructor.

## Usage Patterns

### User Profile Caching

Reduce database queries by caching user profiles:

```go
func getUserProfile(ctx *router.Context, userID int) (*User, error) {
    key := fmt.Sprintf("user:profile:%d", userID)

    user, err := cache.RememberTWithContext[*User](ctx.Cache(), ctx.Context(), key, 1*time.Hour, func() (*User, error) {
        return db.QueryUser(ctx.Context(), userID)
    })
    if err != nil {
        return nil, err
    }
    return user, nil
}

func updateUserProfile(ctx *router.Context, userID int, updates map[string]interface{}) error {
    // Update database
    if err := db.UpdateUser(ctx.Context(), userID, updates); err != nil {
        return err
    }

    // Invalidate cache under the request ctx so a slow Redis is cancellable.
    key := fmt.Sprintf("user:profile:%d", userID)
    ctx.Cache().ForgetWithContext(ctx.Context(), key)

    return nil
}
```

### API Response Caching

Cache expensive API responses:

```go
func fetchWeatherData(ctx *router.Context, city string) (*Weather, error) {
    key := fmt.Sprintf("weather:%s", city)

    return cache.RememberTWithContext[*Weather](ctx.Cache(), ctx.Context(), key, 15*time.Minute, func() (*Weather, error) {
        return callWeatherAPI(ctx.Context(), city)
    })
}
```

### Rate Limiting

Implement rate limiting with cache counters:

```go
func checkRateLimit(ctx *router.Context, userID int) (bool, error) {
    key := fmt.Sprintf("rate_limit:user:%d", userID)

    // Increment request counter
    count, err := ctx.Cache().Increment(key, 1)
    if err != nil {
        return false, err
    }

    // Set expiration on first request
    if count == 1 {
        ctx.Cache().PutWithContext(ctx.Context(), key, count, 1*time.Minute)
    }

    // Check if over limit (e.g., 60 requests per minute)
    if count > 60 {
        return false, fmt.Errorf("rate limit exceeded")
    }

    return true, nil
}
```

### Session Storage

Use cache for session data:

```go
func storeSession(ctx *router.Context, sessionID string, data map[string]interface{}) error {
    key := fmt.Sprintf("session:%s", sessionID)
    return ctx.Cache().PutWithContext(ctx.Context(), key, data, 30*time.Minute)
}

func getSession(ctx *router.Context, sessionID string) (map[string]interface{}, error) {
    key := fmt.Sprintf("session:%s", sessionID)

    val, found := ctx.Cache().GetWithContext(ctx.Context(), key)
    if !found {
        return nil, fmt.Errorf("session not found")
    }

    return val.(map[string]interface{}), nil
}

func destroySession(ctx *router.Context, sessionID string) error {
    key := fmt.Sprintf("session:%s", sessionID)
    return ctx.Cache().ForgetWithContext(ctx.Context(), key)
}
```

### Query Result Caching

Cache database query results:

```go
func getPopularPosts(ctx *router.Context) ([]Post, error) {
    return cache.RememberTWithContext[[]Post](ctx.Cache(), ctx.Context(), "posts:popular", 10*time.Minute, func() ([]Post, error) {
        return db.QueryWithContext(ctx.Context(), `
            SELECT * FROM posts
            WHERE published = true
            ORDER BY views DESC
            LIMIT 10
        `)
    })
}
```

## Testing

Use the memory driver for testing:

```go
func TestCaching(t *testing.T) {
    // Build a manager directly for tests; no .env required.
    mgr := cache.NewManager(&cache.Config{
        Default: "default",
        Stores: map[string]cache.StoreConfig{
            "default": {Driver: cache.DriverMemory},
        },
    })

    // Clear cache before the assertions
    mgr.Flush()

    // Test cache operations
    mgr.Put("test_key", "test_value", 1*time.Minute)

    val, found := mgr.Get("test_key")
    assert.True(t, found)
    assert.Equal(t, "test_value", val.(string))

    // Test expiration
    mgr.Put("expire_key", "value", 1*time.Millisecond)
    time.Sleep(2 * time.Millisecond)

    _, found = mgr.Get("expire_key")
    assert.False(t, found)
}
```

## Best Practices

1. **Use Appropriate TTLs**: Set reasonable expiration times based on data volatility
2. **Cache Invalidation**: Always invalidate cache when underlying data changes
3. **Key Naming**: Use consistent, hierarchical key naming (e.g., `resource:action:id`)
4. **Cache Prefixes**: Use the `CACHE_PREFIX` to avoid key collisions
5. **Error Handling**: Always handle cache errors gracefully
6. **Memory Management**: Monitor cache size and implement eviction policies
7. **Testing**: Use the memory driver for unit tests
8. **Production**: Use Redis driver for production environments
9. **Documentation**: Document which data is cached and for how long

## Performance Considerations

1. **Driver Selection**:
   - Memory: Fastest, but not persistent or distributed
   - File: Moderate speed, persistent, single-server
   - Redis: Fast, persistent, distributed

2. **TTL Selection**: Balance freshness vs. performance
   - Frequently changing data: 1-5 minutes
   - Moderately changing data: 15-60 minutes
   - Rarely changing data: 1-24 hours

3. **Serialization**: Complex objects have serialization overhead

4. **Bulk Operations**: Use `PutMany` and `Many` for batch operations

## Examples

### Complete Handler Example

```go
import (
    "time"
    "github.com/velocitykode/velocity/cache"
    "github.com/velocitykode/velocity/router"
)

type ProductHandler struct{}

func (c *ProductHandler) Show(ctx *router.Context) error {
    productID := ctx.Param("id")
    key := fmt.Sprintf("product:%s", productID)

    // RememberTWithContext returns *Product directly, propagates the
    // request ctx into both the cache lookup and the upstream fetch, and
    // skips the cache write on error so a transient failure does not
    // poison the slot for the full TTL.
    product, err := cache.RememberTWithContext[*Product](ctx.Cache(), ctx.Context(), key, 1*time.Hour, func() (*Product, error) {
        return fetchProduct(ctx.Context(), productID)
    })
    if err != nil {
        return ctx.Error(404, "Product not found")
    }

    return ctx.JSON(200, product)
}

func (c *ProductHandler) Update(ctx *router.Context) error {
    productID := ctx.Param("id")

    // Update product in database
    if err := updateProduct(ctx.Context(), productID, ctx.Request.Body); err != nil {
        return ctx.Error(500, "Failed to update product")
    }

    // Invalidate cache under the request ctx
    ctx.Cache().ForgetWithContext(ctx.Context(), fmt.Sprintf("product:%s", productID))

    return ctx.JSON(200, map[string]string{"status": "updated"})
}
```

## Related

- [Driver Registry](/docs/advanced/driver-registry/) for the shared `Drivers().Register` pattern across cache, queue, storage, mail, notification, log, and orm.
- [Notifications](/docs/advanced/notifications/) for outbound delivery channels that frequently sit behind a cache.
- [Queue](/docs/advanced/queue/) when work is too long for fire-and-forget caching and needs durable retries.
- [CSRF](/docs/core/csrf/) which leans on the cache manager for token storage in distributed deployments.
