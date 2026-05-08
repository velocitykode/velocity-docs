---
title: Events
description: Build event-driven applications with Velocity's observer pattern for decoupled, extensible architecture.
weight: 80
---

Velocity provides a powerful event system that allows you to decouple various parts of your application using the observer pattern. Events enable clean, maintainable code by separating concerns and making your application more extensible.

{{< callout type="warning" title="Breaking change: ctx is now the first arg" >}}
Every callback in the events package takes `context.Context` as its first
positional argument. Migrate your code as follows:

```text
Handle(event)         -> Handle(ctx, event)
Dispatch(event)       -> Dispatch(ctx, event)
Created(model)        -> Created(ctx, model)
SetEventDispatcher(fn func(any) error) ->
    SetEventDispatcher(fn func(context.Context, any) error)
```

The same shape applies to `DispatchNow`, `DispatchAsync`, `DispatchAfter`,
`Until`, every `ModelObserver` lifecycle method, `MiddlewareFunc`,
`HandleWithResult`, `HandleWithPropagation`, `AsyncDispatcher.Push`,
`TransactionalDispatcher.Commit` / `DispatchAfterCommit`,
`ObserverRegistry.Fire` / `FireModelEvent`, `ObservableModel.FireEvent`,
and `QueueDispatcher.Push`. Subsystems that implement
`contract.EventDispatcherAware` plumb their own ctx into the bridge instead
of dropping to `context.Background()`.
{{< /callout >}}

## Quick Start

{{< tabs items="Basic Events,Event Listeners,Wildcard Listeners,Async Events" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/events"

// Define an event
type UserRegistered struct {
    UserID int
    Email  string
}

func (e UserRegistered) Name() string {
    return "user.registered"
}

// Dispatch the event from a handler. ctx.Events() returns the
// app-wide events.Dispatcher wired up at boot. Pass the request ctx
// so listeners observe deadlines, trace IDs, and tx scopes.
func (h *AuthHandler) Register(ctx *router.Context) error {
    user := createUser(ctx.FormValue("email"), ctx.FormValue("password"))

    return ctx.Events().Dispatch(ctx.Request.Context(), UserRegistered{
        UserID: user.ID,
        Email:  user.Email,
    })
}
```
{{< /tab >}}

{{< tab >}}
```go
// Define a listener. Handle now takes ctx as the first argument.
type SendWelcomeEmail struct{}

func (l *SendWelcomeEmail) Handle(ctx context.Context, event interface{}) error {
    e := event.(UserRegistered)

    // Send welcome email; honour ctx.Done() if the sink supports it.
    return sendEmail(ctx, e.Email, "Welcome to our platform!")
}

func (l *SendWelcomeEmail) ShouldQueue() bool {
    return true // Process asynchronously
}

// Register the listener through the App.Events hook.
func (a *App) Events(d events.Dispatcher) {
    d.Listen("user.registered", &SendWelcomeEmail{})
}
```
{{< /tab >}}

{{< tab >}}
```go
// Create a logger that handles all user events.
type UserActivityLogger struct{}

func (l *UserActivityLogger) Handle(ctx context.Context, event interface{}) error {
    log.InfoContext(ctx, "User event occurred", "event", event)
    return nil
}

func (l *UserActivityLogger) ShouldQueue() bool {
    return false
}

// Listen to wildcards via the App.Events hook
func (a *App) Events(d events.Dispatcher) {
    // All user events
    d.Listen("user.*", &UserActivityLogger{})

    // All "created" events
    d.Listen("*.created", &AuditLogger{})

    // All events
    d.Listen("*", &GlobalLogger{})
}
```
{{< /tab >}}

{{< tab >}}
```go
// Dispatch events asynchronously from a handler
func (h *OrderHandler) Place(ctx *router.Context, order *Order) error {
    rctx := ctx.Request.Context()

    // Save order synchronously
    if err := h.db.Create(rctx, order); err != nil {
        return err
    }

    // Dispatch asynchronously (queue or panic-safe goroutine fallback).
    // Async paths derive ctx via context.WithoutCancel: trace IDs flow
    // through to listeners but cancellation/deadline are stripped.
    if err := ctx.Events().DispatchAsync(rctx, OrderPlaced{
        OrderID: order.ID,
        Total:   order.Total,
    }); err != nil {
        return err
    }

    // Or dispatch after a delay
    return ctx.Events().DispatchAfter(
        rctx,
        OrderFollowUp{OrderID: order.ID},
        24*time.Hour,
    )
}
```
{{< /tab >}}

{{< /tabs >}}

## Async ctx semantics

Async paths -- `Dispatcher.DispatchAsync`, `Dispatcher.DispatchAfter`,
`AsyncDispatcher.Push`, and the `BatchingDispatcher` /
`DebouncingDispatcher` / `CoalescingDispatcher.Dispatch` wrappers -- derive
the listener ctx from the caller via `context.WithoutCancel`. That means:

- Request-scoped values (trace IDs, tenant IDs, anything stored via
  `context.WithValue`) propagate through to listeners.
- The caller's cancellation and deadline are **stripped** before dispatch,
  because the listener may legitimately outlive the caller (a 30s delayed
  listener kicked off from an HTTP handler keeps running long after the
  response flushed).

If you need cancellation to reach the listener, do not use the async
methods. Use `Dispatch` synchronously and let the listener spawn its own
goroutine that observes `ctx.Done()`, or push to a queue with the
cancellation contract you want.

The synchronous `Dispatch` / `DispatchNow` / `Until` paths pass ctx through
unchanged.

## Transactional dispatch buffer

Domain events that announce state changes (`OrderPlaced`, `UserRegistered`, `InvoicePaid`) should fire if-and-only-if the database transaction that produced the change actually commits. Dispatching them inside the transaction risks listeners reacting to writes that get rolled back; dispatching them after `Transaction` returns leaks transaction boundaries into every caller. The events package and `orm.Manager.Transaction` cooperate to give you commit-only semantics with no callback signature changes.

### How it fits together

Three pieces wire up the buffer:

1. `events.PrepareBuffer(ctx)` attaches a mutable holder to `ctx`. The returned `ctx` is the one you must thread into the transaction.
2. `orm.Manager.Transaction(ctx, fn)` installs a per-transaction `*events.BufferedDispatcher` into that holder for the lifetime of the call. Any `events.Buffer(ctx)` lookup inside `fn` (or any descendant call that received the same `ctx`) finds the buffer.
3. On successful `tx.Commit()` the buffer is flushed; on `fn` returning an error, the deferred panic recovery, or a commit failure, the buffer is dropped and no events fire.

`Manager.SetTxEventBus(bus)` wires the kind-aware sink the buffer drains into. The framework calls it during boot so `DispatchAsync`, `DispatchAfter`, and `Until` recorded inside the transaction route back through the matching ctx-aware method on the underlying dispatcher when the buffer flushes, so `ShouldQueue`, the recorded delay, and the until-first-non-nil contract all survive the buffer boundary. The flush uses the parent transaction ctx so trace IDs, deadlines, and request-scoped values propagate all the way through to listeners. Without a tx event bus, the buffer falls back to the legacy untyped sink set by `SetEventDispatcher` (now itself ctx-aware) and every kind collapses onto `Dispatch`.

### Recipe: emit `OrderPlaced` only on tx commit

```go
func (h *OrderHandler) Place(ctx *router.Context) error {
    // Prepare the buffer holder on the request ctx ONCE, before
    // entering the transaction. The returned ctx must be the one
    // passed to Transaction.
    reqCtx := events.PrepareBuffer(ctx.Request.Context())

    return h.db.Transaction(reqCtx, func(tx *sql.Tx) error {
        order, err := insertOrder(tx, ctx.FormValue("sku"))
        if err != nil {
            return err // buffer dropped, OrderPlaced never fires
        }

        // Recorded into the per-tx buffer; fires on commit. The ctx
        // arg is captured at flush time, not at record time.
        return events.Buffer(reqCtx).Dispatch(reqCtx, OrderPlaced{
            OrderID: order.ID,
            Total:   order.Total,
        })
    })
}
```

If `insertOrder` returns an error, `Transaction` rolls back and calls `Drop` on the buffer; `OrderPlaced` never reaches a listener. If the commit itself fails, the buffer is dropped for the same reason. Listeners on `order.placed` only ever observe orders that actually exist in the database.

### Nested transactions and savepoints

A nested `Transaction` call on the same prepared `ctx` reuses the outermost buffer with savepoint semantics. The inner scope captures a baseline at the parent's current event count, so an inner rollback truncates only events emitted past that checkpoint while the outer scope retains everything recorded before the nesting. Inner `Flush` is a no-op, so forwarding stays owned by the outermost commit and the entire transaction tree fires (or doesn't) atomically.

### Partial failure and retry

`FlushFunc` receives a `BufferedEvent` per recorded entry: `Event()` returns the user payload, `Kind()` returns the `DispatchKind` (`KindDispatch`, `KindDispatchNow`, `KindDispatchAsync`, `KindDispatchAfter`, `KindUntil`), and `Delay()` returns the requested delay for `KindDispatchAfter` (zero otherwise). If the flush callback returns an error for entry N, the failing entry plus every entry after it are swapped back into the buffer and the buffer is left in a non-flushed state. Calling `Flush` again resumes from the failed event; entries 0..N-1 are not redelivered. Re-entrant `Flush` invocations from inside a `FlushFunc` are silent no-ops so the outer drain retains control.

{{< callout type="warning" title="Use the prepared ctx everywhere" >}}
`events.Buffer(ctx)` returns a fresh standalone buffer when `ctx` carries no holder, and events recorded on a standalone buffer are silently discarded on flush (no underlying dispatcher is wired). Always thread the `ctx` returned by `PrepareBuffer` through to the call site that records events. A derived ctx without the holder will buffer into the void.
{{< /callout >}}

## DispatchAfterCommit

`TransactionalDispatcher.DispatchAfterCommit(ctx, event)` is the explicit
form for "fire this only if the current tx commits."

- Inside a tx (between `BeginTransaction` and `Commit` / `Rollback`) the
  event is queued and fires on `Commit(ctx)`.
- Outside a tx the event is dispatched immediately and any error from the
  underlying dispatcher is returned to the caller.

Both branches now return error. Previously the non-tx branch swallowed
dispatcher failures, which made the contract silently weaker outside a tx
than inside one. Wrap with `_ = dispatcher.DispatchAfterCommit(ctx, evt)`
if you genuinely want fire-and-forget semantics.

## Event Definition

### Using Structs

Define events as structs that implement the `Event` interface:

```go
type UserRegistered struct {
    UserID    int
    Email     string
    Timestamp time.Time
}

func (e UserRegistered) Name() string {
    return "user.registered"
}

type OrderPlaced struct {
    OrderID  string
    UserID   int
    Total    float64
    Items    []OrderItem
}

func (e OrderPlaced) Name() string {
    return "order.placed"
}
```

### Using Strings

For simple events, you can use strings directly. Resolve the dispatcher from the
`router.Context` (or the closure passed into `App.Events`) and call `Dispatch` on it.

```go
// Dispatch string events from a handler
ctx.Events().Dispatch(ctx.Request.Context(), "cache.cleared")
ctx.Events().Dispatch(ctx.Request.Context(), "maintenance.started")

// Listen to string events at boot
func (a *App) Events(d events.Dispatcher) {
    d.Listen("cache.cleared", &CacheListener{})
}
```

### Auto-Generated Names

If you don't implement the `Name()` method, Velocity will generate a name from the struct type:

```go
type UserRegistered struct {
    UserID int
    Email  string
}

// Automatically generates name: "user.registered"
// (CamelCase converted to dot.notation)
```

## Listeners

### Basic Listener

```go
type MyListener struct{}

func (l *MyListener) Handle(ctx context.Context, event interface{}) error {
    // Type assert to get event data
    e, ok := event.(UserRegistered)
    if !ok {
        return fmt.Errorf("unexpected event type")
    }

    // Process the event; honour ctx for cancellation when applicable.
    log.InfoContext(ctx, "Processing event", "user_id", e.UserID)
    return nil
}

func (l *MyListener) ShouldQueue() bool {
    return false // Synchronous processing
}
```

### Queued Listener

For long-running tasks, use queued listeners:

```go
type SendWelcomeEmail struct {
    events.QueuedBaseListener
}

func (l *SendWelcomeEmail) Handle(ctx context.Context, event interface{}) error {
    e := event.(UserRegistered)

    // Send email (time-consuming operation)
    return emailService.Send(ctx, e.Email, "Welcome!")
}

func (l *SendWelcomeEmail) ShouldQueue() bool {
    return true
}

func (l *SendWelcomeEmail) OnQueue() string {
    return "emails" // Queue name
}

func (l *SendWelcomeEmail) Tries() int {
    return 3 // Retry attempts
}

func (l *SendWelcomeEmail) WithDelay() time.Duration {
    return 5 * time.Second // Processing delay
}
```

### Conditional Listener

Execute listener logic only when conditions are met:

```go
type NotifyPremiumUsers struct{}

func (l *NotifyPremiumUsers) Handle(ctx context.Context, event interface{}) error {
    e := event.(FeatureReleased)
    return notificationService.NotifyPremium(ctx, e.FeatureName)
}

func (l *NotifyPremiumUsers) ShouldQueue() bool {
    return true
}

func (l *NotifyPremiumUsers) ShouldHandle(event interface{}) bool {
    e, ok := event.(FeatureReleased)
    if !ok {
        return false
    }
    // Only handle premium features
    return e.IsPremium
}
```

## Event Subscribers

Subscribers let you group multiple event listeners in a single class:

```go
type UserEventSubscriber struct{}

func (s *UserEventSubscriber) Subscribe(dispatcher events.Dispatcher) {
    dispatcher.Listen("user.registered", &SendWelcomeEmail{})
    dispatcher.Listen("user.registered", &UpdateStatistics{})
    dispatcher.Listen("user.updated", &SyncUserData{})
    dispatcher.Listen("user.deleted", &CleanupUserData{})
}

// Register the subscriber via App.Events
func (a *App) Events(d events.Dispatcher) {
    d.Subscribe(&UserEventSubscriber{})
}
```

### Auto Subscriber

Automatically register methods as listeners based on naming convention.
Both the legacy `(event)` shape and the preferred `(ctx, event)` shape are
accepted; new code should write the ctx-aware form.

```go
type UserSubscriber struct{}

// HandleUserRegistered -> listens to "user.registered"
func (s *UserSubscriber) HandleUserRegistered(ctx context.Context, event interface{}) error {
    e := event.(UserRegistered)
    log.InfoContext(ctx, "User registered", "user_id", e.UserID)
    return nil
}

// HandleUserUpdated -> listens to "user.updated"
func (s *UserSubscriber) HandleUserUpdated(ctx context.Context, event interface{}) error {
    e := event.(UserUpdated)
    log.InfoContext(ctx, "User updated", "user_id", e.UserID)
    return nil
}

// Register auto subscriber
func (a *App) Events(d events.Dispatcher) {
    d.Subscribe(events.NewAutoSubscriber(&UserSubscriber{}, "Handle"))
}
```

### Mapped Subscriber

Explicitly map methods to events:

```go
type OrderSubscriber struct{}

func (s *OrderSubscriber) ProcessOrder(ctx context.Context, event interface{}) error {
    // Handle order.placed event
    return nil
}

func (s *OrderSubscriber) CancelOrder(ctx context.Context, event interface{}) error {
    // Handle order.cancelled event
    return nil
}

// Register with explicit mapping
func (a *App) Events(d events.Dispatcher) {
    d.Subscribe(events.NewMappedSubscriber(&OrderSubscriber{}, events.EventMap{
        "ProcessOrder": "order.placed",
        "CancelOrder":  "order.cancelled",
    }))
}
```

## Listening to Model Lifecycle Events

`Dispatcher` is not just for app-level domain events. The framework ships a parallel `ModelObserver` contract for per-record hooks (`Creating`, `Created`, `Updating`, `Updated`, `Saving`, `Saved`, `Deleting`, `Deleted`, `Restoring`, `Restored`) plus an `ObservableDispatcher` that owns an `ObserverRegistry` keyed by model type name. Every callback receives the caller-supplied `context.Context` so observers see request-scoped values (transactions, trace IDs, deadlines) without the model carrying them.

```go
import (
    "context"
    "github.com/velocitykode/velocity/events"
)

type User struct {
    ID    int
    Email string
}

// Implement only the hooks you need. BaseObserver no-ops the rest.
type UserObserver struct {
    events.BaseObserver
}

func (o *UserObserver) Created(ctx context.Context, model interface{}) error {
    u := model.(*User)
    log.InfoContext(ctx, "user created", "user_id", u.ID)
    return nil
}

func (o *UserObserver) Deleted(ctx context.Context, model interface{}) error {
    u := model.(*User)
    return cache.Forget(ctx, "user:"+strconv.Itoa(u.ID))
}
```

Wire it up against an `ObservableDispatcher`. The registry keys by the unqualified type name (`"User"`), so register either by name or by passing an instance:

```go
func (a *App) Events(d events.Dispatcher) {
    obs, ok := d.(*events.ObservableDispatcher)
    if !ok {
        return // dispatcher does not support model observers
    }

    // By type name
    obs.Observe("User", &UserObserver{})

    // Or by instance (type name extracted via reflection)
    obs.ObserveModel(&User{}, &UserObserver{})
}
```

Lifecycle hooks fire only when the calling code invokes
`obs.FireModelEvent(ctx, "created", &user)` (typically from a service-layer
wrapper around your repository writes). `FireModelEvent` runs the observers
and *also* dispatches a regular `*ModelEvent` under the name
`<modeltype>.<action>` (e.g. `user.created`) using the same ctx, so a
wildcard listener on `*.created` still sees it. Use
`events.NewConditionalObserver(observer, predicate)` -- where the
predicate is `func(ctx context.Context, event string, model interface{}) bool`
-- to gate hooks on runtime state, or `events.NewAutoObserver(instance)` to
map struct methods named `Creating` / `Created` / ... onto the contract via
reflection. `AutoObserver` accepts both the legacy `(model)` shape and the
preferred `(ctx, model)` shape.

`ObservableModel` implementations expose
`FireEvent(ctx context.Context, event string) error` so the model itself
can be the trigger when that fits the design better than a service-layer
call. `ObserverRegistry.Fire(ctx, event, model)` is the lower-level entry
point.

## Dispatching Events

All dispatch calls are methods on the `events.Dispatcher` resolved from
`ctx.Events()` (in handlers) or the `d` parameter of `App.Events`. Every
method takes `context.Context` as its first argument.

### Synchronous Dispatch

```go
// Dispatch and wait for all listeners to complete. Listeners that
// return ShouldQueue() == true are still pushed to the queue dispatcher.
err := ctx.Events().Dispatch(ctx.Request.Context(), UserRegistered{
    UserID: 123,
    Email:  "user@example.com",
})
if err != nil {
    log.ErrorContext(ctx.Request.Context(), "Event dispatch failed", "error", err)
}
```

### Force Synchronous

```go
// Always run synchronously, ignoring ShouldQueue.
err := ctx.Events().DispatchNow(ctx.Request.Context(), OrderPlaced{
    OrderID: "ORD-123",
})
```

### Asynchronous Dispatch

```go
// Dispatch without waiting. Uses the configured QueueDispatcher when
// available, otherwise falls back to a panic-safe goroutine (async.Go).
// Listeners receive a ctx derived via context.WithoutCancel: values
// propagate, cancellation does not.
err := ctx.Events().DispatchAsync(ctx.Request.Context(), EmailSent{
    To:      "user@example.com",
    Subject: "Welcome",
})
```

### Delayed Dispatch

```go
// Dispatch after a delay. Uses the queue when available; otherwise
// schedules via time.AfterFunc with a context.WithoutCancel-derived ctx.
err := ctx.Events().DispatchAfter(
    ctx.Request.Context(),
    OrderFollowUp{OrderID: "ORD-123"},
    24*time.Hour,
)
```

### Dispatch Until Result

```go
// Dispatch until first non-nil result. Listeners that want to short-circuit
// must implement
//   HandleWithResult(ctx context.Context, event interface{}) (interface{}, error).
result, err := ctx.Events().Until(ctx.Request.Context(), ValidatePayment{
    Amount: 99.99,
    Method: "credit_card",
})

if result != nil {
    paymentResult := result.(*PaymentResult)
    // Use result
}
```

## Wildcard Patterns

Velocity supports flexible wildcard patterns for event matching:

### Prefix Matching

```go
func (a *App) Events(d events.Dispatcher) {
    // Listen to all user events
    d.Listen("user.*", &UserActivityLogger{})
}

// Matches:
// - user.registered
// - user.updated
// - user.deleted
// - user.anything
```

### Suffix Matching

```go
func (a *App) Events(d events.Dispatcher) {
    // Listen to all "created" events
    d.Listen("*.created", &CreatedLogger{})
}

// Matches:
// - user.created
// - order.created
// - product.created
```

### Match Everything

```go
func (a *App) Events(d events.Dispatcher) {
    // Listen to every event the dispatcher routes
    d.Listen("*", &GlobalLogger{})
}
```

### Multiple Patterns

```go
func (a *App) Events(d events.Dispatcher) {
    // Listen to multiple event names with one registration
    d.Listen([]string{
        "user.registered",
        "user.updated",
        "order.placed",
    }, &MultiEventListener{})
}
```

## Dispatcher API Cheat Sheet

Every operation is a method on the `events.Dispatcher` returned by
`ctx.Events()` (or passed into `App.Events`). `Listen` returns an `int` ID
that can be passed to `Off` to unregister later.

```go
func (a *App) Events(d events.Dispatcher) {
    // Register a listener (returns an int ID for later removal)
    id := d.Listen("user.registered", &MyListener{})

    // Register a subscriber (or auto/mapped/group)
    d.Subscribe(&MySubscriber{})

    // Remove a single listener by ID
    d.Off(id)

    // Remove all listeners for an event (Flush == Forget)
    d.Flush("user.registered")
    d.Forget("user.registered")

    // Inspect listeners
    if d.HasListeners("user.registered") {
        listeners := d.GetListeners("user.registered")
        _ = listeners
    }
}

// Dispatch from anywhere that has access to the dispatcher and a ctx.
func (h *Handler) Do(ctx *router.Context) error {
    d := ctx.Events()
    rctx := ctx.Request.Context()

    _ = d.Dispatch(rctx, UserRegistered{UserID: 1})
    _ = d.DispatchNow(rctx, OrderPlaced{OrderID: "123"})
    _ = d.DispatchAsync(rctx, EmailSent{})
    _ = d.DispatchAfter(rctx, Reminder{}, 1*time.Hour)

    result, _ := d.Until(rctx, ValidateData{})
    _ = result
    return nil
}
```

## Common Use Cases

### User Registration Flow

```go
// Event
type UserRegistered struct {
    UserID    int
    Email     string
    Name      string
    IPAddress string
}

func (e UserRegistered) Name() string {
    return "user.registered"
}

// Listeners
type SendWelcomeEmail struct{}
func (l *SendWelcomeEmail) Handle(ctx context.Context, event interface{}) error {
    e := event.(UserRegistered)
    return emailService.SendWelcome(ctx, e.Email, e.Name)
}
func (l *SendWelcomeEmail) ShouldQueue() bool { return true }

type CreateUserProfile struct{}
func (l *CreateUserProfile) Handle(ctx context.Context, event interface{}) error {
    e := event.(UserRegistered)
    return profileService.Create(ctx, e.UserID)
}
func (l *CreateUserProfile) ShouldQueue() bool { return false }

type TrackRegistration struct{}
func (l *TrackRegistration) Handle(ctx context.Context, event interface{}) error {
    e := event.(UserRegistered)
    return analytics.Track(ctx, "user_registered", map[string]interface{}{
        "user_id": e.UserID,
        "ip":      e.IPAddress,
    })
}
func (l *TrackRegistration) ShouldQueue() bool { return true }

// Setup
func (a *App) Events(d events.Dispatcher) {
    d.Listen("user.registered", &SendWelcomeEmail{})
    d.Listen("user.registered", &CreateUserProfile{})
    d.Listen("user.registered", &TrackRegistration{})
}

// Usage in handler
func (c *AuthHandler) Register(ctx *router.Context) error {
    user := createUser(email, password)

    if err := ctx.Events().Dispatch(ctx.Request.Context(), UserRegistered{
        UserID:    user.ID,
        Email:     user.Email,
        Name:      user.Name,
        IPAddress: ctx.Request.RemoteAddr,
    }); err != nil {
        return err
    }

    return ctx.JSON(user)
}
```

### Order Processing Pipeline

```go
type OrderPlaced struct {
    OrderID   string
    UserID    int
    Total     float64
    Items     []OrderItem
    CreatedAt time.Time
}

func (e OrderPlaced) Name() string {
    return "order.placed"
}

// Listeners for different responsibilities
func (a *App) Events(d events.Dispatcher) {
    d.Listen("order.placed", &ProcessPayment{})
    d.Listen("order.placed", &SendOrderConfirmation{})
    d.Listen("order.placed", &UpdateInventory{})
    d.Listen("order.placed", &NotifyWarehouse{})
    d.Listen("order.placed", &UpdateAnalytics{})
}
```

### Audit Logging

```go
type AuditLogger struct{}

func (l *AuditLogger) Handle(ctx context.Context, event interface{}) error {
    // Log all model changes
    return auditLog.Record(ctx, event)
}

func (l *AuditLogger) ShouldQueue() bool {
    return true
}

// Register for all creation events
func (a *App) Events(d events.Dispatcher) {
    d.Listen("*.created", &AuditLogger{})
    d.Listen("*.updated", &AuditLogger{})
    d.Listen("*.deleted", &AuditLogger{})
}
```

### Cache Invalidation

```go
type CacheInvalidator struct{}

func (l *CacheInvalidator) Handle(ctx context.Context, event interface{}) error {
    switch e := event.(type) {
    case UserUpdated:
        cache.Forget(ctx, "user:"+strconv.Itoa(e.UserID))
    case ProductUpdated:
        cache.Forget(ctx, "product:"+e.ProductID)
    }
    return nil
}

func (l *CacheInvalidator) ShouldQueue() bool {
    return false // Invalidate immediately
}

func (a *App) Events(d events.Dispatcher) {
    d.Listen("*.updated", &CacheInvalidator{})
}
```

## Middleware

`MiddlewareDispatcher` runs events through a pipeline of `EventMiddleware`
before they reach listeners. The ctx threads through every stage so
deadlines, cancellation, and trace context survive the chain.

```go
type EventMiddleware interface {
    Handle(ctx context.Context, event interface{},
        next func(context.Context, interface{}) error) error
}

// MiddlewareFunc adapts a plain func to the interface.
type MiddlewareFunc func(ctx context.Context, event interface{},
    next func(context.Context, interface{}) error) error
```

Built-in middleware (`LoggingMiddleware`, `TimingMiddleware`,
`RetryMiddleware`, `FilterMiddleware`, `ValidationMiddleware`,
`TransformMiddleware`) all use the ctx-aware shape. `RetryMiddleware`
honours `ctx.Done()` between attempts so a cancelled caller stops the
retry loop instead of sleeping out the configured delay.

## Testing

### Using Fake Dispatcher

`events.NewFakeDispatcher()` records dispatched events without invoking
listeners. Wire it into a test app via `velocity.WithFakeEvents(fake)` so
every `ctx.Events()` call inside the handler resolves to the fake.

```go
import (
    "context"

    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/events"
    "github.com/velocitykode/velocity/velocitytest"
)

func TestUserRegistration(t *testing.T) {
    // Create fake dispatcher and inject it into the test app
    fake := events.NewFakeDispatcher()
    app, _ := velocitytest.NewApp(velocity.WithFakeEvents(fake))

    // Perform action that dispatches events (using the test app)
    registerUser(app, "test@example.com", "password")

    // Assert event was dispatched
    if err := fake.AssertDispatched(UserRegistered{}, func(e interface{}) bool {
        event := e.(UserRegistered)
        return event.Email == "test@example.com"
    }); err != nil {
        t.Fatal(err)
    }

    // Assert specific number of times
    if err := fake.AssertDispatchedTimes(UserRegistered{}, 1); err != nil {
        t.Fatal(err)
    }

    // Assert not dispatched
    if err := fake.AssertNotDispatched(UserDeleted{}); err != nil {
        t.Fatal(err)
    }
}
```

### Testing Listeners

```go
func TestSendWelcomeEmail(t *testing.T) {
    listener := &SendWelcomeEmail{}

    event := UserRegistered{
        UserID: 1,
        Email:  "test@example.com",
        Name:   "Test User",
    }

    err := listener.Handle(context.Background(), event)
    assert.NoError(t, err)

    // Verify email was sent
    assert.True(t, emailService.WasSent("test@example.com"))
}
```

### Integration Tests

```go
func TestEventFlow(t *testing.T) {
    // Spin up a real dispatcher and register tracking listeners on it directly.
    dispatcher := events.NewDispatcher()

    var (
        called []string
        mu     sync.Mutex
    )

    trackingListener := func(name string) events.Listener {
        return &testListener{
            handle: func(ctx context.Context, e interface{}) error {
                mu.Lock()
                called = append(called, name)
                mu.Unlock()
                return nil
            },
        }
    }

    dispatcher.Listen("user.registered", trackingListener("email"))
    dispatcher.Listen("user.registered", trackingListener("profile"))
    dispatcher.Listen("user.registered", trackingListener("analytics"))

    // Dispatch event
    if err := dispatcher.Dispatch(context.Background(), UserRegistered{UserID: 1}); err != nil {
        t.Fatal(err)
    }

    // Verify all listeners were called
    assert.Equal(t, 3, len(called))
    assert.Contains(t, called, "email")
    assert.Contains(t, called, "profile")
    assert.Contains(t, called, "analytics")
}
```

## Best Practices

1. **Use Meaningful Event Names**: Follow dot notation (e.g., `user.registered`, `order.placed`)
2. **Include All Necessary Data**: Events should contain all data listeners need
3. **Keep Listeners Focused**: Each listener should have a single responsibility
4. **Use Queues for Heavy Tasks**: Queue emails, notifications, and API calls
5. **Make Listeners Idempotent**: Listeners should handle duplicate events gracefully
6. **Handle Errors Gracefully**: Don't let one listener failure affect others
7. **Document Your Events**: Clearly document what events exist and when they're fired
8. **Test Event Flows**: Use the fake dispatcher to test event dispatching
9. **Pass the right ctx**: Use the request ctx (or tx ctx) on dispatch so listeners observe deadlines and trace IDs; remember async paths strip cancellation.

## Performance Considerations

### Async vs Sync

```go
d := ctx.Events()
rctx := ctx.Request.Context()

// Synchronous: blocks until every listener completes
d.DispatchNow(rctx, event)

// Asynchronous: returns immediately (queue or async.Go fallback)
d.DispatchAsync(rctx, event)
```

**Use synchronous when:**
- Event handling must complete before continuing
- Order of execution matters
- Error handling is critical
- You need cancellation/deadline to reach listeners

**Use asynchronous when:**
- Event handling can happen in background
- Performance is critical
- Failures can be retried
- It is OK that ctx cancellation does NOT propagate to listeners

### Queue Integration

For high-volume applications, back queued listeners with a real queue. Build a
`*events.DefaultDispatcher`, wire a `QueueDispatcher` into it, then expose it
to the app (typically by registering a service provider that overrides
`Services.Events`, or by constructing the dispatcher in your `main` and
swapping it in via your own option).

```go
import (
    "context"

    "github.com/velocitykode/velocity/events"
    "github.com/velocitykode/velocity/queue"
)

// QueueDispatcher.Push now takes ctx as its first argument.
type QueueEventDispatcher struct {
    queue queue.Driver
}

func (q *QueueEventDispatcher) Push(ctx context.Context, event interface{},
    listener events.Listener, delay time.Duration) error {
    // ... push to your queue, propagating ctx through to PushCtx/PushDelayedCtx
    return nil
}

dispatcher := events.NewDispatcher()
dispatcher.SetQueueDispatcher(&QueueEventDispatcher{
    queue: queue.Connection("redis"),
})

// `dispatcher` now pushes ShouldQueue() listeners through Redis instead of
// running them inline. Inject it as the app's events service at boot.
```

### Batching Events

```go
// Collect events and dispatch in batches
type EventBatcher struct {
    dispatcher events.Dispatcher
    pending    []interface{}
    mu         sync.Mutex
}

func (b *EventBatcher) Add(event interface{}) {
    b.mu.Lock()
    b.pending = append(b.pending, event)
    b.mu.Unlock()
}

func (b *EventBatcher) Flush(ctx context.Context) error {
    b.mu.Lock()
    defer b.mu.Unlock()

    for _, event := range b.pending {
        if err := b.dispatcher.Dispatch(ctx, event); err != nil {
            return err
        }
    }

    b.pending = nil
    return nil
}
```

The framework also ships purpose-built wrappers for this space:
`events.NewBatchingDispatcher`, `events.NewDebouncingDispatcher`,
`events.NewThrottlingDispatcher`, and `events.NewCoalescingDispatcher`
implement the same patterns without hand-rolled bookkeeping. Each `Dispatch`
captures the caller's ctx via `context.WithoutCancel` because the actual
fan-out happens on a background goroutine after the batching/debounce/coalesce
window elapses.

## Troubleshooting

### Events Not Firing

**Check:**
1. Listeners are registered before events are dispatched
2. Event names match exactly (case-sensitive)
3. Global dispatcher is initialized
4. No errors in listener registration

### Listeners Not Called

**Check:**
1. Wildcard patterns are correct
2. `ShouldHandle()` method isn't preventing execution
3. Event is being dispatched on the correct dispatcher instance
4. Listener implements the `Listener` interface correctly (note: `Handle(ctx, event)` -- legacy `Handle(event)` no longer satisfies the interface)

### Performance Issues

**Solutions:**
1. Use `DispatchAsync()` for non-critical events
2. Implement queue-based event handling
3. Batch events when possible
4. Profile listener execution times
5. Remove unnecessary listeners

### Listener Cancelled Mid-Dispatch (sync only)

`Dispatch` / `DispatchNow` / `Until` propagate the caller's cancellation.
A listener observing `ctx.Done()` will return early when the request ctx
is cancelled. If you don't want that, dispatch on a derived ctx:

```go
detached := context.WithoutCancel(ctx.Request.Context())
ctx.Events().Dispatch(detached, evt)
```

## Recipe: Audit every domain event with one listener

**When:** You want a single auditor to capture every event the app dispatches (`*.created`, `*.updated`, payment events, login events, anything) without enumerating them or coupling auditing to each producer.

**Code:**
```go
type AuditAll struct{ writer audit.Writer }

func (l *AuditAll) Handle(ctx context.Context, event interface{}) error {
    name, _ := event.(events.Event)
    return l.writer.Record(ctx, audit.Entry{
        Name:    name.Name(),
        Payload: event,
        At:      time.Now(),
    })
}

func (l *AuditAll) ShouldQueue() bool { return true }

func (a *App) Events(d events.Dispatcher) {
    d.Listen("*", &AuditAll{writer: a.Audit})
}
```

**Why this shape:** The `*` pattern in `Dispatcher.Listen` matches every event the dispatcher routes, including model lifecycle events emitted via `FireModelEvent` and framework events like `query.executed` or `request.failed`. One listener instance is cheaper than per-event registrations and impossible to forget when a new event type is introduced. `ShouldQueue() == true` keeps audit writes off the request path so a slow audit sink cannot stall handlers; the dispatcher transparently pushes the work through whatever `QueueDispatcher` is wired (memory, Redis, etc.). Make the writer idempotent on `(name, payload-hash)` so retries do not double-record.

**See also:**
- [Wildcard Patterns](#wildcard-patterns) for prefix/suffix variants when you want to scope the auditor
- [Listening to Model Lifecycle Events](#listening-to-model-lifecycle-events) for the per-record hook contract that `*.created` rides on
- [Notifications](/docs/advanced/notifications/) for fan-out patterns that pair well with auditing

## Related

- [Notifications](/docs/advanced/notifications/) for turning an event into a multi-channel user notification
- [Cache](/docs/core/cache/) for invalidating cache entries from `*.updated` / `*.deleted` listeners
- [Queue](/docs/advanced/queue/) for backing queued listeners with a durable driver and picking the right primitive for long-running work
