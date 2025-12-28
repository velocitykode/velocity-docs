---
title: "Async"
description: Run concurrent operations with Velocity's Go-idiomatic async wrappers for goroutines and channels.
weight: 40
---

Velocity's async package provides simple, Go-idiomatic wrappers around goroutines and channels for concurrent programming without traditional async/await complexity.

## Quick Start

{{< tabs items="Basic Async,Parallel Execution,Race Condition" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/async"

// Run a function asynchronously
result := async.Run(func() string {
    return expensiveOperation()
})

// Get result (blocks until ready)
value, err := result.Get()
```
{{< /tab >}}

{{< tab >}}
```go
// Execute multiple functions in parallel
results := async.All(
    func() any { return fetchUser(id) },
    func() any { return fetchPosts(id) },
    func() any { return fetchComments(id) },
)

user := results[0].(User)
posts := results[1].([]Post)
comments := results[2].([]Comment)
```
{{< /tab >}}

{{< tab >}}
```go
// Use the first successful result
result := async.Race(
    func() any { return tryCache() },
    func() any { return tryDatabase() },
    func() any { return tryAPI() },
)

data, err := result.Get()
```
{{< /tab >}}

{{< /tabs >}}

## Core Functions

### Run

Execute a function asynchronously and get a result:

```go
result := async.Run(func() int {
    time.Sleep(100 * time.Millisecond)
    return 42
})

// Non-blocking check
if result.Ready() {
    value, _ := result.Get()
}

// Blocking wait
value, err := result.Get()
```

### RunWithTimeout

Execute with a timeout:

```go
result := async.RunWithTimeout(5*time.Second, func() string {
    return slowOperation()
})

value, err := result.Get()
if result.TimedOut() {
    // Handle timeout
}
```

### RunWithContext

Execute with context for cancellation:

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

result := async.RunWithContext(ctx, func() string {
    return operation()
})

value, err := result.Get()
```

## Parallel Execution

### All

Run multiple functions in parallel and wait for all to complete:

```go
results := async.All(
    func() any { return db.Find[User]() },
    func() any { return db.Find[Post]() },
    func() any { return db.Find[Comment]() },
)
```

### AllWithError

Run in parallel with error propagation:

```go
results, err := async.AllWithError(
    func() (User, error) { return userRepo.Find(id) },
    func() ([]Post, error) { return postRepo.FindByUser(id) },
)
if err != nil {
    // Handle first error
}
```

### Race

Return the first completed result:

```go
result := async.Race(
    func() any { return searchElastic(query) },
    func() any { return searchDatabase(query) },
    func() any { return searchCache(query) },
)
```

### RaceWithTimeout

Race with a timeout:

```go
result := async.RaceWithTimeout(3*time.Second,
    func() any { return primaryAPI() },
    func() any { return fallbackAPI() },
)

if result.TimedOut() {
    return []Product{} // Return empty on timeout
}
```

## Fire and Forget

### Go

Execute without waiting for result:

```go
async.Go(func() {
    sendEmail(user)
    logActivity(event)
    updateAnalytics(data)
})
```

### GoWithRecover

Execute with custom panic handler:

```go
async.GoWithRecover(func() {
    riskyOperation()
}, func(p any) {
    log.Error("Operation panicked", "error", p)
    alertOps(p)
})
```

## Collection Operations

### ForEach

Execute function for each item with concurrency limit:

```go
users := []User{user1, user2, user3, user4, user5}

async.ForEach(users, 3, func(user User) {
    sendNotification(user)
})
```

### Map

Transform items in parallel:

```go
userIDs := []int{1, 2, 3, 4, 5}

users := async.Map(userIDs, func(id int) User {
    return userRepo.Find(id)
})
```

## Result Type

The `Result[T]` type wraps async operation outcomes:

```go
type Result[T any] struct {
    // ...
}

// Methods
func (r *Result[T]) Get() (T, error)           // Block until ready
func (r *Result[T]) GetOrDefault(def T) T      // Get or return default
func (r *Result[T]) Ready() bool               // Non-blocking check
func (r *Result[T]) TimedOut() bool            // Check if timed out
```

## Custom Panic Handler

Set a global panic handler for all async operations:

```go
async.SetPanicHandler(func(p any) {
    log.Error("Async panic recovered",
        "error", p,
        "stack", string(debug.Stack()),
    )
})
```

## Examples

### Dashboard Controller

```go
func GetDashboard(w http.ResponseWriter, r *http.Request) {
    userID := auth.UserID(r)

    // Fetch all dashboard data in parallel
    data := async.All(
        func() any { return models.User{}.Find(userID) },
        func() any { return models.GetRecentPosts(userID) },
        func() any { return models.GetNotifications(userID) },
        func() any { return analytics.GetStats(userID) },
    )

    view.Render(w, r, "dashboard", map[string]any{
        "user":          data[0],
        "posts":         data[1],
        "notifications": data[2],
        "stats":         data[3],
    })
}
```

### Background Processing

```go
func ProcessOrder(order Order) error {
    // Save synchronously
    if err := order.Save(); err != nil {
        return err
    }

    // Background tasks - don't wait
    async.Go(func() {
        email.SendConfirmation(order)
        inventory.Update(order.Items)
        analytics.TrackPurchase(order)
    })

    return nil
}
```

### API Aggregation with Fallback

```go
func SearchProducts(query string) []Product {
    result := async.RaceWithTimeout(3*time.Second,
        func() any { return searchElastic(query) },
        func() any { return searchDatabase(query) },
    )

    if result.TimedOut() {
        return []Product{}
    }

    products, _ := result.Get()
    return products.([]Product)
}
```

## Best Practices

1. **Use timeouts**: Always set timeouts for external operations
2. **Handle panics**: Use `GoWithRecover` for critical operations
3. **Limit concurrency**: Use `ForEach` with concurrency limit for large datasets
4. **Check readiness**: Use `Ready()` for non-blocking status checks
5. **Error handling**: Use `AllWithError` when you need error propagation
