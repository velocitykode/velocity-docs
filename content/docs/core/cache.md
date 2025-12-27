---
title: Cache
weight: 40
---

Velocity provides a unified caching interface supporting multiple drivers. The cache system auto-initializes from your environment configuration and provides simple, Laravel-like APIs for storing and retrieving data.

## Quick Start

{{% callout type="info" %}}
**Zero Configuration**: The cache package automatically initializes from your `.env` file. No setup required!
{{% /callout %}}

{{< tabs items="Basic Usage,Remember Pattern,Bulk Operations" >}}

{{< tab >}}
```go
import (
    "time"
    "github.com/velocitykode/velocity/pkg/cache"
)

func main() {
    // Store a value with TTL
    cache.Put("user:123", userData, 1*time.Hour)

    // Retrieve a value
    var user User
    if val, found := cache.Get("user:123"); found {
        user = val.(User)
    }

    // Store permanently
    cache.Forever("app_version", "1.0.0")

    // Remove a value
    cache.Forget("user:123")
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "time"
    "github.com/velocitykode/velocity/pkg/cache"
)

func getUser(userID int) (*User, error) {
    key := fmt.Sprintf("user:%d", userID)

    // Get from cache or compute and store
    result, err := cache.Remember(key, 15*time.Minute, func() interface{} {
        // Expensive database query
        user, _ := fetchUserFromDB(userID)
        return user
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
    "github.com/velocitykode/velocity/pkg/cache"
)

func bulkOperations() {
    // Store multiple values
    items := map[string]interface{}{
        "key1": "value1",
        "key2": "value2",
        "key3": "value3",
    }
    cache.PutMany(items, 30*time.Minute)

    // Retrieve multiple values
    keys := []string{"key1", "key2", "key3"}
    results := cache.Many(keys)

    for key, value := range results {
        fmt.Printf("%s: %v\n", key, value)
    }
}
```
{{< /tab >}}

{{< /tabs >}}

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
import (
    "time"
    "github.com/velocitykode/velocity/pkg/cache"
)

// Store string
cache.Put("username", "john_doe", 1*time.Hour)

// Store struct
user := User{ID: 123, Name: "John Doe"}
cache.Put("user:123", user, 30*time.Minute)

// Store with longer TTL
cache.Put("config", configData, 24*time.Hour)
```

#### Get

Retrieve a value from the cache:

```go
// Get value
value, found := cache.Get("username")
if found {
    username := value.(string)
    fmt.Println("Username:", username)
}

// Get string value directly
username, found := cache.GetString("username")
if found {
    fmt.Println("Username:", username)
}
```

#### Forever

Store a value permanently (no expiration):

```go
// Store without expiration
cache.Forever("app_name", "Velocity")
cache.Forever("build_number", "1234")
```

#### Forget

Remove a value from the cache:

```go
// Remove single key
cache.Forget("user:123")

// Check if removed
if !cache.Has("user:123") {
    fmt.Println("User cache cleared")
}
```

#### Flush

Clear all values from the cache:

```go
// Clear entire cache
cache.Flush()
```

### Advanced Operations

#### Remember

Get from cache or compute and store:

```go
import (
    "time"
    "github.com/velocitykode/velocity/pkg/cache"
)

func getExpensiveData(id int) (*Data, error) {
    key := fmt.Sprintf("data:%d", id)

    result, err := cache.Remember(key, 15*time.Minute, func() interface{} {
        // This callback is only executed if cache miss
        data, _ := queryDatabase(id)
        return data
    })

    if err != nil {
        return nil, err
    }

    return result.(*Data), nil
}
```

#### RememberForever

Get from cache or compute and store permanently:

```go
func getAppConfig() (*Config, error) {
    result, err := cache.RememberForever("app_config", func() interface{} {
        // Load configuration from file or database
        return loadConfig()
    })

    if err != nil {
        return nil, err
    }

    return result.(*Config), nil
}
```

#### Increment / Decrement

Atomic increment or decrement of numeric values:

```go
// Increment counter
newValue, err := cache.Increment("page_views", 1)
if err != nil {
    log.Error("Failed to increment", "error", err)
}

// Increment by custom amount
cache.Increment("total_sales", 150)

// Decrement counter
cache.Decrement("items_remaining", 1)

// Decrement by custom amount
cache.Decrement("stock_level", 10)
```

#### Has

Check if a key exists in the cache:

```go
if cache.Has("user:123") {
    fmt.Println("User is cached")
} else {
    fmt.Println("User not in cache")
}
```

### Bulk Operations

#### PutMany

Store multiple values at once:

```go
import (
    "time"
    "github.com/velocitykode/velocity/pkg/cache"
)

func cacheUserData(users []User) {
    items := make(map[string]interface{})

    for _, user := range users {
        key := fmt.Sprintf("user:%d", user.ID)
        items[key] = user
    }

    // Store all users with 1 hour TTL
    cache.PutMany(items, 1*time.Hour)
}
```

#### Many

Retrieve multiple values at once:

```go
func getUserBatch(userIDs []int) map[string]interface{} {
    keys := make([]string, len(userIDs))
    for i, id := range userIDs {
        keys[i] = fmt.Sprintf("user:%d", id)
    }

    // Get all users at once
    results := cache.Many(keys)

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
import "github.com/velocitykode/velocity/pkg/cache"

func useMultipleStores() {
    // Get named store
    sessionStore, err := cache.GetStore("session")
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

For complex applications, use the Manager directly:

```go
import (
    "github.com/velocitykode/velocity/pkg/cache"
)

func setupCaching() {
    // Get cache manager
    manager := cache.GetManager()

    // Get specific store
    apiCache, _ := manager.Store("api")
    sessionCache, _ := manager.Store("session")

    // Use different stores for different purposes
    apiCache.Put("api:users", users, 5*time.Minute)
    sessionCache.Put("session:123", sessionData, 30*time.Minute)
}
```

## Usage Patterns

### User Profile Caching

Reduce database queries by caching user profiles:

```go
func getUserProfile(userID int) (*User, error) {
    key := fmt.Sprintf("user:profile:%d", userID)

    result, err := cache.Remember(key, 1*time.Hour, func() interface{} {
        user, _ := db.QueryUser(userID)
        return user
    })

    if err != nil {
        return nil, err
    }

    return result.(*User), nil
}

func updateUserProfile(userID int, updates map[string]interface{}) error {
    // Update database
    if err := db.UpdateUser(userID, updates); err != nil {
        return err
    }

    // Invalidate cache
    key := fmt.Sprintf("user:profile:%d", userID)
    cache.Forget(key)

    return nil
}
```

### API Response Caching

Cache expensive API responses:

```go
func fetchWeatherData(city string) (*Weather, error) {
    key := fmt.Sprintf("weather:%s", city)

    result, err := cache.Remember(key, 15*time.Minute, func() interface{} {
        // Expensive API call
        weather, _ := callWeatherAPI(city)
        return weather
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
func checkRateLimit(userID int) (bool, error) {
    key := fmt.Sprintf("rate_limit:user:%d", userID)

    // Increment request counter
    count, err := cache.Increment(key, 1)
    if err != nil {
        return false, err
    }

    // Set expiration on first request
    if count == 1 {
        cache.Put(key, count, 1*time.Minute)
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
func storeSession(sessionID string, data map[string]interface{}) error {
    key := fmt.Sprintf("session:%s", sessionID)
    return cache.Put(key, data, 30*time.Minute)
}

func getSession(sessionID string) (map[string]interface{}, error) {
    key := fmt.Sprintf("session:%s", sessionID)

    val, found := cache.Get(key)
    if !found {
        return nil, fmt.Errorf("session not found")
    }

    return val.(map[string]interface{}), nil
}

func destroySession(sessionID string) error {
    key := fmt.Sprintf("session:%s", sessionID)
    return cache.Forget(key)
}
```

### Query Result Caching

Cache database query results:

```go
func getPopularPosts() ([]Post, error) {
    key := "posts:popular"

    result, err := cache.Remember(key, 10*time.Minute, func() interface{} {
        posts, _ := db.Query(`
            SELECT * FROM posts
            WHERE published = true
            ORDER BY views DESC
            LIMIT 10
        `)
        return posts
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
    // Memory driver is automatically used
    // Clear cache before each test
    cache.Flush()

    // Test cache operations
    cache.Put("test_key", "test_value", 1*time.Minute)

    val, found := cache.Get("test_key")
    assert.True(t, found)
    assert.Equal(t, "test_value", val.(string))

    // Test expiration
    cache.Put("expire_key", "value", 1*time.Millisecond)
    time.Sleep(2 * time.Millisecond)

    _, found = cache.Get("expire_key")
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

### Complete Controller Example

```go
import (
    "time"
    "github.com/velocitykode/velocity/pkg/cache"
    "github.com/velocitykode/velocity/pkg/router"
)

type ProductController struct{}

func (c *ProductController) Show(ctx *router.Context) error {
    productID := ctx.Param("id")
    key := fmt.Sprintf("product:%s", productID)

    // Try to get from cache
    if val, found := cache.Get(key); found {
        return ctx.JSON(200, val)
    }

    // Fetch from database
    product, err := fetchProduct(productID)
    if err != nil {
        return ctx.Error("Product not found", 404)
    }

    // Store in cache for 1 hour
    cache.Put(key, product, 1*time.Hour)

    return ctx.JSON(200, product)
}

func (c *ProductController) Update(ctx *router.Context) error {
    productID := ctx.Param("id")

    // Update product in database
    if err := updateProduct(productID, ctx.Body); err != nil {
        return ctx.Error("Failed to update product", 500)
    }

    // Invalidate cache
    cache.Forget(fmt.Sprintf("product:%s", productID))

    return ctx.JSON(200, map[string]string{"status": "updated"})
}
```
