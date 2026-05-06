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
import "github.com/velocitykode/velocity/async"

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

## Decision matrix

Reach for the helper that matches the situation. Skim this table before writing custom goroutine plumbing.

| Situation | Helper |
|---|---|
| Fire-and-forget side job; framework-default panic log fine | `Go` |
| Need custom recover (close pipe, unblock chan, `wg.Done` in panic frame) | `GoWithRecover` |
| Goroutine lifetime tied to a context | `GoCtx` |
| Bounded fan-out across a slice, blocking | `ForEach` |
| Bounded fan-out across a slice, fire-and-forget | `GoForEach` |
| Per-item errors collected | `TryForEach` |
| Need a result back | `Run` / `RunWithTimeout` / `RunWithContext` |

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

Execute with a custom panic handler. Use this when the panic frame itself needs to do work the package logger cannot, like closing a pipe, unblocking a channel, calling `wg.Done`, or marking a session as failed.

```go
async.GoWithRecover(func() {
    riskyOperation()
}, func(p any) {
    log.Error("Operation panicked", "error", p)
    alertOps(p)
})
```

`recoverFn` may be `nil`. When it is, panics fall back to the package-level handler (the same path `Go` uses), so callers who only need the framework default can pass `nil` instead of writing a wrapper closure. `SetPanicHook` observers still fire either way.

```go
// nil recoverFn: framework logs the panic, no boilerplate needed.
async.GoWithRecover(func() {
    longLivedListener()
}, nil)
```

### GoWithRecoverE

Same shape as `GoWithRecover`, but `recoverFn` receives a typed `*async.PanicError` so callers skip the `any` type-assert dance:

```go
async.GoWithRecoverE(func() {
    riskyOperation()
}, func(p *async.PanicError) {
    log.Error("panic", "msg", p.Error(), "raw", p.Recovered())
})
```

### GoWithLogger

Run `fn` with panics routed to a scoped logger and tagged with a callsite name. Pass `nil` to use the package logger:

```go
async.GoWithLogger(reqLogger, "billing.charge", func() {
    chargeCard(order)
})
```

## Concurrency primitives

These helpers cover the fan-out and context-bound patterns that come up the moment fire-and-forget stops being enough.

### GoCtx

Run `fn` in a panic-recovered goroutine bound to a context. The supervisor returns when `ctx` is canceled or `fn` returns, whichever happens first; cancellation is logged via the package logger so early termination is traceable.

```go
async.GoCtx(ctx, func(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        case msg := <-stream:
            handle(msg)
        }
    }
})
```

`fn` receives `ctx` so it can wire its own `select` on `ctx.Done()`. Without that, `fn` runs to completion even after cancellation, since Go offers no goroutine preemption.

### GoForEach

Fire-and-forget bounded fan-out. Returns immediately while a supervisor goroutine dispatches workers capped at `concurrency`. Panics in `fn` route to the package panic handler.

```go
async.GoForEach(orders, 10, func(o Order) {
    notify(o.Customer)
})
```

The input slice is snapshotted, so the caller can mutate `items` after `GoForEach` returns. Use `ForEach` when you need to wait for completion.

### TryForEach

Bounded fan-out with per-item error collection. Returns a slice the same length as `items`; index `i` holds `fn`'s result for `items[i]`, or `nil` on success. Panics inside `fn` are converted via `FromRecovered` and surfaced in the matching slot.

```go
errs := async.TryForEach(jobs, 5, func(j Job) error {
    return j.Run()
})
for i, err := range errs {
    if err != nil {
        log.Error("job failed", "id", jobs[i].ID, "err", err)
    }
}
```

Blocking; returns once every item has finished.

## Panic-as-error

The async package re-exports two helpers from the framework's internal `panicerr` so adopters can adopt the panic-to-error shape without depending on an internal package.

- `async.PanicError` is the typed recovered-panic error returned by `GoWithRecoverE` and the helpers that surface panics as errors. Call `Recovered()` to inspect the raw value handed to `recover()`. `errors.Is` / `errors.As` walk the chain when the panicked value was itself an error.
- `async.FromRecovered(r any) error` converts a recovered value into a `*PanicError` typed as `error`. Use it inside your own `defer recover()` blocks if you want the framework's panic shape:

```go
func runJob() (err error) {
    defer func() {
        if p := recover(); p != nil {
            err = async.FromRecovered(p)
        }
    }()
    return doWork()
}
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

## Custom Panic Hook

Install a non-logging interceptor invoked for every panic recovered by the async package's helpers (`Run`, `RunWithTimeout`, `RunWithContext`, `Go`, `GoCtx`, `GoWithRecover`, `GoWithRecoverE`, `GoWithLogger`, `ForEach`, `GoForEach`, `TryForEach`). The hook runs in addition to logging, not in place of it. Pass `nil` to clear.

```go
async.SetPanicHook(func(p any) {
    metrics.Counter("async.panics").Inc()
    sentry.CaptureException(fmt.Errorf("%v", p))
})
```

The hook itself is panic-safe: a panic inside the hook is swallowed so observability sinks cannot take down the goroutine they are observing.

## Examples

### Dashboard Handler

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

## Related

- [Queue](/docs/advanced/queue/) - durable background jobs; use the queue (not async) when work must survive process restarts
- [Events](/docs/advanced/events/) - the async dispatcher uses these primitives to fan out listeners off the request path
- [Scheduler](/docs/advanced/scheduler/) - long-lived recurring loops belong in the scheduler, not in raw `async.Go`
