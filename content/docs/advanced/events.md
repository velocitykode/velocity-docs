---
title: Events
description: Build event-driven applications with Velocity's observer pattern for decoupled, extensible architecture.
weight: 80
---

Velocity provides a powerful event system that allows you to decouple various parts of your application using the observer pattern. Events enable clean, maintainable code by separating concerns and making your application more extensible.

## Quick Start

{{< tabs items="Basic Events,Event Listeners,Wildcard Listeners,Async Events" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/events"

// Define an event
type UserRegistered struct {
    UserID int
    Email  string
}

func (e UserRegistered) Name() string {
    return "user.registered"
}

// Dispatch the event
func registerUser(email string, password string) {
    // Create user...
    user := createUser(email, password)

    // Dispatch event
    events.Dispatch(UserRegistered{
        UserID: user.ID,
        Email:  user.Email,
    })
}
```
{{< /tab >}}

{{< tab >}}
```go
// Define a listener
type SendWelcomeEmail struct{}

func (l *SendWelcomeEmail) Handle(event interface{}) error {
    e := event.(UserRegistered)

    // Send welcome email
    return sendEmail(e.Email, "Welcome to our platform!")
}

func (l *SendWelcomeEmail) ShouldQueue() bool {
    return true // Process asynchronously
}

// Register the listener
func init() {
    events.Listen("user.registered", &SendWelcomeEmail{})
}
```
{{< /tab >}}

{{< tab >}}
```go
// Create a logger that handles all user events
type UserActivityLogger struct{}

func (l *UserActivityLogger) Handle(event interface{}) error {
    log.Info("User event occurred", "event", event)
    return nil
}

func (l *UserActivityLogger) ShouldQueue() bool {
    return false
}

// Listen to all user events
func init() {
    events.Listen("user.*", &UserActivityLogger{})

    // Listen to all "created" events
    events.Listen("*.created", &AuditLogger{})

    // Listen to all events
    events.Listen("*", &GlobalLogger{})
}
```
{{< /tab >}}

{{< tab >}}
```go
// Dispatch events asynchronously
func processOrder(order *Order) error {
    // Save order synchronously
    if err := db.Create(order); err != nil {
        return err
    }

    // Dispatch events asynchronously
    events.DispatchAsync(OrderPlaced{
        OrderID: order.ID,
        Total:   order.Total,
    })

    // Or dispatch after a delay
    events.DispatchAfter(
        OrderFollowUp{OrderID: order.ID},
        24 * time.Hour,
    )

    return nil
}
```
{{< /tab >}}

{{< /tabs >}}

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

For simple events, you can use strings directly:

```go
// Dispatch string events
events.Dispatch("cache.cleared")
events.Dispatch("maintenance.started")

// Listen to string events
events.Listen("cache.cleared", &CacheListener{})
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

func (l *MyListener) Handle(event interface{}) error {
    // Type assert to get event data
    e, ok := event.(UserRegistered)
    if !ok {
        return fmt.Errorf("unexpected event type")
    }

    // Process the event
    log.Info("Processing event", "user_id", e.UserID)
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

func (l *SendWelcomeEmail) Handle(event interface{}) error {
    e := event.(UserRegistered)

    // Send email (time-consuming operation)
    return emailService.Send(e.Email, "Welcome!")
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

func (l *NotifyPremiumUsers) Handle(event interface{}) error {
    e := event.(FeatureReleased)
    // Notify premium users
    return notificationService.NotifyPremium(e.FeatureName)
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

// Register the subscriber
func init() {
    events.Subscribe(&UserEventSubscriber{})
}
```

### Auto Subscriber

Automatically register methods as listeners based on naming convention:

```go
type UserSubscriber struct{}

// Method names starting with "Handle" are auto-registered
// HandleUserRegistered -> listens to "user.registered"
func (s *UserSubscriber) HandleUserRegistered(event interface{}) error {
    e := event.(UserRegistered)
    log.Info("User registered", "user_id", e.UserID)
    return nil
}

// HandleUserUpdated -> listens to "user.updated"
func (s *UserSubscriber) HandleUserUpdated(event interface{}) error {
    e := event.(UserUpdated)
    log.Info("User updated", "user_id", e.UserID)
    return nil
}

// Register auto subscriber
func init() {
    subscriber := events.NewAutoSubscriber(&UserSubscriber{}, "Handle")
    events.Subscribe(subscriber)
}
```

### Mapped Subscriber

Explicitly map methods to events:

```go
type OrderSubscriber struct{}

func (s *OrderSubscriber) ProcessOrder(event interface{}) error {
    // Handle order.placed event
    return nil
}

func (s *OrderSubscriber) CancelOrder(event interface{}) error {
    // Handle order.cancelled event
    return nil
}

// Register with explicit mapping
func init() {
    subscriber := events.NewMappedSubscriber(&OrderSubscriber{}, events.EventMap{
        "ProcessOrder": "order.placed",
        "CancelOrder":  "order.cancelled",
    })
    events.Subscribe(subscriber)
}
```

## Dispatching Events

### Synchronous Dispatch

```go
// Dispatch and wait for all listeners to complete
err := events.Dispatch(UserRegistered{
    UserID: 123,
    Email:  "user@example.com",
})
if err != nil {
    log.Error("Event dispatch failed", "error", err)
}
```

### Force Synchronous

```go
// Always dispatch synchronously, even for queued listeners
err := events.DispatchNow(OrderPlaced{
    OrderID: "ORD-123",
})
```

### Asynchronous Dispatch

```go
// Dispatch without waiting (uses goroutines or queue)
err := events.DispatchAsync(EmailSent{
    To:      "user@example.com",
    Subject: "Welcome",
})
```

### Delayed Dispatch

```go
// Dispatch after a delay
err := events.DispatchAfter(
    OrderFollowUp{OrderID: "ORD-123"},
    24 * time.Hour,
)
```

### Dispatch Until Result

```go
// Dispatch until first non-nil result
result, err := events.Until(ValidatePayment{
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
// Listen to all user events
events.Listen("user.*", &UserActivityLogger{})

// Matches:
// - user.registered
// - user.updated
// - user.deleted
// - user.anything
```

### Suffix Matching

```go
// Listen to all "created" events
events.Listen("*.created", &CreatedLogger{})

// Matches:
// - user.created
// - order.created
// - product.created
```

### Match Everything

```go
// Listen to all events
events.Listen("*", &GlobalLogger{})
```

### Multiple Patterns

```go
// Listen to multiple event patterns
events.Listen([]string{
    "user.registered",
    "user.updated",
    "order.placed",
}, &MultiEventListener{})
```

## Global Dispatcher Functions

```go
// Register a listener
events.Listen("user.registered", &MyListener{})

// Register a subscriber
events.Subscribe(&MySubscriber{})

// Dispatch an event
events.Dispatch(UserRegistered{UserID: 1})

// Dispatch synchronously
events.DispatchNow(OrderPlaced{OrderID: "123"})

// Dispatch asynchronously
events.DispatchAsync(EmailSent{})

// Dispatch with delay
events.DispatchAfter(Reminder{}, 1*time.Hour)

// Dispatch until result
result, _ := events.Until(ValidateData{})

// Check if event has listeners
if events.HasListeners("user.registered") {
    // Event has listeners
}

// Get all listeners for an event
listeners := events.GetListeners("user.registered")

// Remove all listeners for an event
events.Flush("user.registered")

// Remove specific listeners
events.Forget("user.registered")
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
func (l *SendWelcomeEmail) Handle(event interface{}) error {
    e := event.(UserRegistered)
    return emailService.SendWelcome(e.Email, e.Name)
}
func (l *SendWelcomeEmail) ShouldQueue() bool { return true }

type CreateUserProfile struct{}
func (l *CreateUserProfile) Handle(event interface{}) error {
    e := event.(UserRegistered)
    return profileService.Create(e.UserID)
}
func (l *CreateUserProfile) ShouldQueue() bool { return false }

type TrackRegistration struct{}
func (l *TrackRegistration) Handle(event interface{}) error {
    e := event.(UserRegistered)
    return analytics.Track("user_registered", map[string]interface{}{
        "user_id": e.UserID,
        "ip":      e.IPAddress,
    })
}
func (l *TrackRegistration) ShouldQueue() bool { return true }

// Setup
func init() {
    events.Listen("user.registered", &SendWelcomeEmail{})
    events.Listen("user.registered", &CreateUserProfile{})
    events.Listen("user.registered", &TrackRegistration{})
}

// Usage in handler
func (c *AuthHandler) Register(ctx *router.Context) error {
    user := createUser(email, password)

    events.Dispatch(UserRegistered{
        UserID:    user.ID,
        Email:     user.Email,
        Name:      user.Name,
        IPAddress: ctx.Request.RemoteAddr,
    })

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
func init() {
    events.Listen("order.placed", &ProcessPayment{})
    events.Listen("order.placed", &SendOrderConfirmation{})
    events.Listen("order.placed", &UpdateInventory{})
    events.Listen("order.placed", &NotifyWarehouse{})
    events.Listen("order.placed", &UpdateAnalytics{})
}
```

### Audit Logging

```go
type AuditLogger struct{}

func (l *AuditLogger) Handle(event interface{}) error {
    // Log all model changes
    return auditLog.Record(event)
}

func (l *AuditLogger) ShouldQueue() bool {
    return true
}

// Register for all creation events
func init() {
    events.Listen("*.created", &AuditLogger{})
    events.Listen("*.updated", &AuditLogger{})
    events.Listen("*.deleted", &AuditLogger{})
}
```

### Cache Invalidation

```go
type CacheInvalidator struct{}

func (l *CacheInvalidator) Handle(event interface{}) error {
    switch e := event.(type) {
    case UserUpdated:
        cache.Forget("user:" + strconv.Itoa(e.UserID))
    case ProductUpdated:
        cache.Forget("product:" + e.ProductID)
    }
    return nil
}

func (l *CacheInvalidator) ShouldQueue() bool {
    return false // Invalidate immediately
}

func init() {
    events.Listen("*.updated", &CacheInvalidator{})
}
```

## Testing

### Using Fake Dispatcher

```go
import "github.com/velocitykode/velocity/pkg/events"

func TestUserRegistration(t *testing.T) {
    // Create fake dispatcher
    fake := events.NewFake()

    // Swap global dispatcher
    events.Initialize(fake)
    defer events.Reset()

    // Perform action that dispatches events
    registerUser("test@example.com", "password")

    // Assert event was dispatched
    fake.AssertDispatched(UserRegistered{}, func(e interface{}) bool {
        event := e.(UserRegistered)
        return event.Email == "test@example.com"
    })

    // Assert specific number of times
    fake.AssertDispatchedTimes(UserRegistered{}, 1)

    // Assert not dispatched
    fake.AssertNotDispatched(UserDeleted{})
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

    err := listener.Handle(event)
    assert.NoError(t, err)

    // Verify email was sent
    assert.True(t, emailService.WasSent("test@example.com"))
}
```

### Integration Tests

```go
func TestEventFlow(t *testing.T) {
    // Setup real dispatcher with test listeners
    dispatcher := events.NewDispatcher()
    events.Initialize(dispatcher)

    // Track which listeners were called
    var called []string
    mu := sync.Mutex{}

    trackingListener := func(name string) events.Listener {
        return &testListener{
            handle: func(e interface{}) error {
                mu.Lock()
                called = append(called, name)
                mu.Unlock()
                return nil
            },
        }
    }

    events.Listen("user.registered", trackingListener("email"))
    events.Listen("user.registered", trackingListener("profile"))
    events.Listen("user.registered", trackingListener("analytics"))

    // Dispatch event
    events.Dispatch(UserRegistered{UserID: 1})

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

## Performance Considerations

### Async vs Sync

```go
// Synchronous: Blocks until all listeners complete
events.DispatchNow(event)

// Asynchronous: Returns immediately
events.DispatchAsync(event)
```

**Use synchronous when:**
- Event handling must complete before continuing
- Order of execution matters
- Error handling is critical

**Use asynchronous when:**
- Event handling can happen in background
- Performance is critical
- Failures can be retried

### Queue Integration

For high-volume applications, integrate with the queue system:

```go
import "github.com/velocitykode/velocity/pkg/queue"

// Setup queue dispatcher
queueDispatcher := &QueueEventDispatcher{
    queue: queue.Connection("redis"),
}

dispatcher := events.NewDispatcher()
dispatcher.SetQueueDispatcher(queueDispatcher)
events.Initialize(dispatcher)
```

### Batching Events

```go
// Collect events and dispatch in batches
type EventBatcher struct {
    events []interface{}
    mu     sync.Mutex
}

func (b *EventBatcher) Add(event interface{}) {
    b.mu.Lock()
    b.events = append(b.events, event)
    b.mu.Unlock()
}

func (b *EventBatcher) Flush() error {
    b.mu.Lock()
    defer b.mu.Unlock()

    for _, event := range b.events {
        if err := events.Dispatch(event); err != nil {
            return err
        }
    }

    b.events = nil
    return nil
}
```

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
4. Listener implements the `Listener` interface correctly

### Performance Issues

**Solutions:**
1. Use `DispatchAsync()` for non-critical events
2. Implement queue-based event handling
3. Batch events when possible
4. Profile listener execution times
5. Remove unnecessary listeners
