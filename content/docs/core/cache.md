---
title: Cache
description: Store and retrieve data with Velocity's multi-driver cache system supporting Redis and in-memory storage.
weight: 40
---

Velocity provides a unified caching interface supporting multiple drivers. The framework reads `CACHE_DRIVER` and the related env vars at boot and constructs a `*cache.Manager` for you, exposed as `app.Cache` (and `ctx.Cache()` from any handler).

## Quick Start

{{% callout type="info" %}}
**No global cache.** All cache operations are methods on `*cache.Manager`. Reach for `app.Cache` outside of requests, `ctx.Cache()` inside a handler. The package-level helpers are limited to `cache.NewManager`, `cache.RememberT`, and `cache.RememberTWithContext`.
{{% /callout %}}

{{< tabs items="Basic Usage,Remember Pattern,Bulk Operations" >}}

{{< tab >}}
```go
import (
    "time"
    "github.com/velocitykode/velocity/router"
)

func handler(ctx *router.Context) error {
    // Store a value with TTL
    ctx.Cache().Put("user:123", userData, 1*time.Hour)

    // Retrieve a value
    var user User
    if val, found := ctx.Cache().Get("user:123"); found {
        user = val.(User)
    }

    // Store permanently
    ctx.Cache().Forever("app_version", "1.0.0")

    // Remove a value
    ctx.Cache().Forget("user:123")
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

    // Get from cache or compute and store. Use RememberE so a transient
    // DB error is propagated instead of being baked into the cache slot.
    result, err := ctx.Cache().RememberE(key, 15*time.Minute, func() (interface{}, error) {
        return fetchUserFromDB(userID)
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

Pick the `Remember*` variant that matches your error and context needs. Default to `RememberE` for any callback that touches the network or a database.

| Situation | Helper |
|---|---|
| Memoize idempotent fetch; tolerate framework eating callback errors | `Remember` |
| Memoize and propagate callback errors (no cache poison on err) | `RememberE` |
| Same, with ctx propagation through the cache backend | `RememberEWithContext` |
| Typed return (skip the `interface{}` assert) | `RememberT[T]` |
| Forever cache until explicit `Forget` | `RememberForever` |

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

Stores that talk to a remote backend (Redis) implement the `ContextStore` interface. The manager threads `context.Context` through to the driver when available so a slow Redis lookup is cancelled with the request.

```go
// ContextStore is satisfied by the Redis driver. Memory and file drivers
// fall back to the plain Store methods automatically.
type ContextStore interface {
    Store
    GetCtx(ctx context.Context, key string) (interface{}, bool)
    PutCtx(ctx context.Context, key string, value interface{}, ttl time.Duration) error
    ForeverCtx(ctx context.Context, key string, value interface{}) error
    ForgetCtx(ctx context.Context, key string) error
    FlushCtx(ctx context.Context) error
    HasCtx(ctx context.Context, key string) bool
    IncrementCtx(ctx context.Context, key string, value int64) (int64, error)
    DecrementCtx(ctx context.Context, key string, value int64) (int64, error)
    ManyCtx(ctx context.Context, keys []string) map[string]interface{}
    PutManyCtx(ctx context.Context, items map[string]interface{}, ttl time.Duration) error
}
```

Every `Manager` operation has a `*WithContext` counterpart: `GetWithContext`, `PutWithContext`, `ForeverWithContext`, `ForgetWithContext`, `RememberWithContext`, `RememberEWithContext`, `RememberForeverWithContext`, `RememberForeverEWithContext`. Use them from any handler that already has a `ctx`.

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

# Multiple stores (optional)
CACHE_STORES=session:memory,api:redis
```

## Drivers

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
```

## API Reference

### Basic Operations

#### Put

Store a value in the cache with a TTL:

```go
import "time"

// Store string
app.Cache.Put("username", "john_doe", 1*time.Hour)

// Store struct
user := User{ID: 123, Name: "John Doe"}
app.Cache.Put("user:123", user, 30*time.Minute)

// Store with longer TTL
app.Cache.Put("config", configData, 24*time.Hour)
```

#### Get

Retrieve a value from the cache:

```go
// Get value
value, found := app.Cache.Get("username")
if found {
    username := value.(string)
    fmt.Println("Username:", username)
}

// Get string value directly
username, found := app.Cache.GetString("username")
if found {
    fmt.Println("Username:", username)
}
```

#### Forever

Store a value permanently (no expiration):

```go
// Store without expiration
app.Cache.Forever("app_name", "Velocity")
app.Cache.Forever("build_number", "1234")
```

#### Forget

Remove a value from the cache:

```go
// Remove single key
app.Cache.Forget("user:123")

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

Error-aware variant of `Remember`. The callback returns `(interface{}, error)`; on a non-nil error the cache slot is NOT written and the error is propagated. This prevents transient upstream failures from pinning a zero value for the full TTL.

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

`RememberE` with a `context.Context`. The ctx threads through to the underlying driver via `ContextStore` so a slow Redis lookup is cancelled with the request. Memory and file drivers ignore the ctx transparently.

```go
func getRegions(app *velocity.App, ctx context.Context) ([]Region, error) {
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
func getAppConfig(app *velocity.App) (*Config, error) {
    result, err := app.Cache.RememberForever("app_config", func() interface{} {
        return loadConfig()
    })
    if err != nil {
        return nil, err
    }
    return result.(*Config), nil
}
```

`RememberForeverE` is the error-aware variant; `RememberForeverWithContext` and `RememberForeverEWithContext` add ctx propagation.

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

Use different cache stores for different purposes:

### Configuration

```env
# Default store
CACHE_DRIVER=memory

# Additional stores
CACHE_STORES=session:memory,api:redis
```

### Using Named Stores

```go
func useMultipleStores(app *velocity.App) {
    // Get named store off the manager
    sessionStore, err := app.Cache.Store("session")
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

### Manager for Advanced Usage

The framework constructs a `*cache.Manager` during `velocity.New()` and exposes it as `app.Cache`. Reach for it directly when you need named stores or distributed locks:

```go
func setupCaching(app *velocity.App) {
    // Get specific stores from the manager
    apiCache, _ := app.Cache.Store("api")
    sessionCache, _ := app.Cache.Store("session")

    // Use different stores for different purposes
    apiCache.Put("api:users", users, 5*time.Minute)
    sessionCache.Put("session:123", sessionData, 30*time.Minute)
}
```

If you ever need a manager outside the framework lifecycle (tests, scripts), build one yourself with `cache.NewManager(&cache.Config{...})`. That is the only package-level constructor.

## Usage Patterns

### User Profile Caching

Reduce database queries by caching user profiles:

```go
func getUserProfile(ctx *router.Context, userID int) (*User, error) {
    key := fmt.Sprintf("user:profile:%d", userID)

    result, err := ctx.Cache().RememberE(key, 1*time.Hour, func() (interface{}, error) {
        return db.QueryUser(userID)
    })
    if err != nil {
        return nil, err
    }
    return result.(*User), nil
}

func updateUserProfile(ctx *router.Context, userID int, updates map[string]interface{}) error {
    // Update database
    if err := db.UpdateUser(userID, updates); err != nil {
        return err
    }

    // Invalidate cache
    key := fmt.Sprintf("user:profile:%d", userID)
    ctx.Cache().Forget(key)

    return nil
}
```

### API Response Caching

Cache expensive API responses:

```go
func fetchWeatherData(ctx *router.Context, city string) (*Weather, error) {
    key := fmt.Sprintf("weather:%s", city)

    result, err := ctx.Cache().RememberE(key, 15*time.Minute, func() (interface{}, error) {
        return callWeatherAPI(city)
    })
    if err != nil {
        return nil, err
    }
    return result.(*Weather), nil
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
        ctx.Cache().Put(key, count, 1*time.Minute)
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
    return ctx.Cache().Put(key, data, 30*time.Minute)
}

func getSession(ctx *router.Context, sessionID string) (map[string]interface{}, error) {
    key := fmt.Sprintf("session:%s", sessionID)

    val, found := ctx.Cache().Get(key)
    if !found {
        return nil, fmt.Errorf("session not found")
    }

    return val.(map[string]interface{}), nil
}

func destroySession(ctx *router.Context, sessionID string) error {
    key := fmt.Sprintf("session:%s", sessionID)
    return ctx.Cache().Forget(key)
}
```

### Query Result Caching

Cache database query results:

```go
func getPopularPosts(ctx *router.Context) ([]Post, error) {
    key := "posts:popular"

    result, err := ctx.Cache().RememberE(key, 10*time.Minute, func() (interface{}, error) {
        return db.Query(`
            SELECT * FROM posts
            WHERE published = true
            ORDER BY views DESC
            LIMIT 10
        `)
    })
    if err != nil {
        return nil, err
    }
    return result.([]Post), nil
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
    "github.com/velocitykode/velocity/router"
)

type ProductHandler struct{}

func (c *ProductHandler) Show(ctx *router.Context) error {
    productID := ctx.Param("id")
    key := fmt.Sprintf("product:%s", productID)

    // Try to get from cache
    if val, found := ctx.Cache().Get(key); found {
        return ctx.JSON(200, val)
    }

    // Fetch from database
    product, err := fetchProduct(productID)
    if err != nil {
        return ctx.Error("Product not found", 404)
    }

    // Store in cache for 1 hour
    ctx.Cache().Put(key, product, 1*time.Hour)

    return ctx.JSON(200, product)
}

func (c *ProductHandler) Update(ctx *router.Context) error {
    productID := ctx.Param("id")

    // Update product in database
    if err := updateProduct(productID, ctx.Body); err != nil {
        return ctx.Error("Failed to update product", 500)
    }

    // Invalidate cache
    ctx.Cache().Forget(fmt.Sprintf("product:%s", productID))

    return ctx.JSON(200, map[string]string{"status": "updated"})
}
```

## Related

- [Notifications](/docs/advanced/notifications/) for outbound delivery channels that frequently sit behind a cache.
- [Queue](/docs/advanced/queue/) when work is too long for fire-and-forget caching and needs durable retries.
- [CSRF](/docs/core/csrf/) which leans on the cache manager for token storage in distributed deployments.
