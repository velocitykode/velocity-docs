---
title: Broadcasting
description: Broadcast events to multiple clients with public, private, and presence channels in Velocity.
weight: 20
---

Velocity provides a powerful broadcasting system for real-time event communication built on top of WebSockets. It enables you to broadcast events to multiple connected clients with support for public, private, and presence channels.

## Quick Start

{{% callout type="info" %}}
**Built on WebSockets**: The broadcast package provides a high-level API over Velocity's WebSocket server for event-driven real-time communication.
{{% /callout %}}

All broadcasting goes through a `*broadcast.BroadcastManager`, which you create with `broadcast.New(driver)`. The examples below assume `b` is a configured manager (see [Configuration](#configuration)).

{{< tabs items="Basic Broadcasting,Private Channels,Presence Channels" >}}

{{< tab >}}
```go
import (
    "context"

    "github.com/velocitykode/velocity/broadcast"
)

func broadcastOrder(b *broadcast.BroadcastManager, ctx context.Context, orderData any) error {
    // Broadcast to a public channel
    if err := b.Channel("orders").EmitCtx(ctx, "OrderShipped", map[string]interface{}{
        "order_id": 12345,
        "tracking": "ABC123",
    }); err != nil {
        return err
    }

    // Broadcast to multiple channels
    return b.Channel("orders", "notifications").EmitCtx(ctx, "OrderUpdate", orderData)
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "context"
    "time"

    "github.com/velocitykode/velocity/broadcast"
)

func broadcastAccount(b *broadcast.BroadcastManager, ctx context.Context) error {
    // Broadcast to a private channel (subscribers see "private-user.123")
    return b.Private("user.123").EmitCtx(ctx, "AccountUpdate", map[string]interface{}{
        "balance":    1500.00,
        "updated_at": time.Now(),
    })
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "context"
    "time"

    "github.com/velocitykode/velocity/broadcast"
)

func broadcastMessage(b *broadcast.BroadcastManager, ctx context.Context) error {
    // Broadcast to a presence channel (subscribers see "presence-chat.room.1")
    return b.Presence("chat.room.1").EmitCtx(ctx, "MessageSent", map[string]interface{}{
        "user":      "John",
        "message":   "Hello everyone!",
        "timestamp": time.Now(),
    })
}
```
{{< /tab >}}

{{< /tabs >}}

{{% callout type="info" %}}
**Context-aware emit**: `EmitCtx` threads the caller's `context.Context` through the send so a slow client cannot pin the request goroutine. The older `Emit(event, data)` method is **deprecated**: it now delegates to `EmitCtx` with `context.Background()`. Prefer `EmitCtx`, or chain `WithContext(ctx)` on the builder before calling `Emit`.
{{% /callout %}}

## Configuration

The broadcasting system is configured programmatically. Build a `websocket.Config`, wrap it in a WebSocket driver, and hand the driver to `broadcast.New`:

```go
import (
    "time"

    "github.com/velocitykode/velocity/broadcast"
    "github.com/velocitykode/velocity/broadcast/drivers"
    "github.com/velocitykode/velocity/websocket"
)

func newBroadcaster() *broadcast.BroadcastManager {
    config := websocket.Config{
        Host:           "0.0.0.0",
        Port:           6001,
        Path:           "/ws",
        AllowedOrigins: []string{"http://localhost:4000", "http://localhost:8090"},
        PingInterval:   30 * time.Second,
        PongTimeout:    60 * time.Second,
        WriteTimeout:   10 * time.Second,
        MaxMessageSize: 512 * 1024, // 512 KiB
    }

    driver := drivers.NewWebSocketDriver(config)
    return broadcast.New(driver)
}
```

{{% callout type="info" %}}
**Secure defaults**: `broadcast.New` installs a deny-all authorizer, so private- and presence- channel access is rejected until you call `SetAuthorizer`. The WebSocket driver also applies a per-client inbound message rate limit (`Config.MessageRateLimit`, defaulting from the zero value) and per-subscribe channel caps. Set `MessageRateLimit` to a negative value to opt out, and `AllowEmptyOrigin: true` only for trusted non-browser clients.
{{% /callout %}}

### Driver Options

`NewWebSocketDriver` accepts variadic `DriverOption` values to tune fan-out behavior:

```go
driver := drivers.NewWebSocketDriver(config,
    drivers.WithMaxChannelsPerClient(100),         // cap distinct channels per connection
    drivers.WithMaxChannelNameLength(200),         // cap subscribe channel-name length
    drivers.WithBlockingSend(50*time.Millisecond), // block up to a timeout instead of dropping on a full send buffer
    drivers.WithOnDrop(func(clientID, channel, event string) {
        // observe dropped messages
    }),
)
```

## Channel Types

### Public Channels

Public channels are accessible to all connected clients without authentication:

```go
// Anyone can subscribe to "orders" channel
b.Channel("orders").EmitCtx(ctx, "NewOrder", order)

// Broadcast to multiple public channels
b.Channel("orders", "notifications").EmitCtx(ctx, "OrderCreated", order)
```

### Private Channels

Private channels require authorization before clients can subscribe:

```go
// Broadcast to private user channel
userID := 123
b.Private(fmt.Sprintf("user.%d", userID)).EmitCtx(ctx, "PrivateMessage", message)

// Private channels are prefixed with "private-"
// Client subscribes to: "private-user.123"
```

### Presence Channels

Presence channels track which users are subscribed to the channel:

```go
// Broadcast to presence channel
b.Presence("chat.room.1").EmitCtx(ctx, "MessageSent", message)

// Presence channels are prefixed with "presence-"
// Client subscribes to: "presence-chat.room.1"
```

## Broadcasting Events

### Manual Broadcasting

Directly broadcast events to channels:

```go
import (
    "context"

    "github.com/velocitykode/velocity/broadcast"
)

func shipOrder(b *broadcast.BroadcastManager, ctx context.Context, orderID int) error {
    // Process order...

    // Broadcast shipping notification
    return b.Channel("orders").EmitCtx(ctx, "OrderShipped", map[string]interface{}{
        "order_id":        orderID,
        "status":          "shipped",
        "tracking_number": "ABC123",
    })
}
```

### Conditional Broadcasting

Broadcast only when certain conditions are met:

```go
// Broadcast to others (exclude sender by socket ID)
b.Channel("chat.room.1").
    ToOthers(socketID).
    EmitCtx(ctx, "UserTyping", username)

// Conditional broadcasting: When(false) makes Emit a no-op
b.Channel("orders").
    When(order.Status == "shipped").
    EmitCtx(ctx, "OrderUpdate", order)
```

### Event Interface

The `broadcast.Event` interface defines a standard shape for broadcastable events. Types that implement it describe which channels to broadcast on, the event name, the payload, and an optional condition. You wire the dispatch yourself by reading these methods and calling the manager:

```go
import (
    "context"

    "github.com/velocitykode/velocity/broadcast"
)

// dispatch broadcasts an Event across its channels using the manager.
func dispatch(b *broadcast.BroadcastManager, ctx context.Context, e broadcast.Event) error {
    if !e.BroadcastWhen() {
        return nil
    }
    return b.Channel(e.BroadcastOn()...).EmitCtx(ctx, e.BroadcastAs(), e.BroadcastWith())
}
```

An event type implements the four interface methods:

```go
type OrderShipped struct {
    OrderID  int    `json:"order_id"`
    Tracking string `json:"tracking"`
    UserID   int    `json:"-"`  // Excluded from broadcast
}

// BroadcastOn returns channels to broadcast on
func (e OrderShipped) BroadcastOn() []string {
    return []string{
        "orders",
        fmt.Sprintf("user.%d", e.UserID),
    }
}

// BroadcastAs returns the event name
func (e OrderShipped) BroadcastAs() string {
    return "order.shipped"
}

// BroadcastWith returns the data to broadcast
func (e OrderShipped) BroadcastWith() interface{} {
    return map[string]interface{}{
        "order_id": e.OrderID,
        "tracking": e.Tracking,
    }
}

// BroadcastWhen returns whether to broadcast
func (e OrderShipped) BroadcastWhen() bool {
    return e.Tracking != ""  // Only if tracking exists
}
```

## Channel Authorization

### Setting Up Authorization

`broadcast.New` installs a deny-all authorizer by default, so every private- and presence- channel is rejected until you install your own with `SetAuthorizer`. Public channels bypass the authorizer entirely.

```go
import (
    "fmt"
    "strings"

    "github.com/velocitykode/velocity/broadcast"
)

func setupAuthorization(b *broadcast.BroadcastManager) {
    // Authorizer signature: func(channel string, user interface{}) bool
    b.SetAuthorizer(func(channel string, user interface{}) bool {
        // Authorize private user channels
        if strings.HasPrefix(channel, "private-user.") {
            userID := strings.TrimPrefix(channel, "private-user.")
            currentUser := user.(*User)
            return fmt.Sprintf("%d", currentUser.ID) == userID
        }

        // Authorize presence channels
        if strings.HasPrefix(channel, "presence-chat.") {
            // Check if user can access this chat room
            return checkChatAccess(user, channel)
        }

        // Deny access by default
        return false
    })

    // PresenceDataFunc returns the data published for a presence member.
    b.SetPresenceData(func(channel string, user interface{}) interface{} {
        u := user.(*User)
        return map[string]interface{}{
            "id":     u.ID,
            "name":   u.Name,
            "avatar": u.AvatarURL,
        }
    })
}
```

### Authorizing Subscriptions

When a client wants to join a private- or presence- channel, it first calls your HTTP auth endpoint. Resolve the authorization (and, for presence channels, the channel data) with `Auth`:

```go
// Auth returns the payload to send back to the client, or ErrUnauthorized.
payload, err := b.Auth(channel, socketID, currentUser)
if err != nil {
    // err is broadcast.ErrUnauthorized when the authorizer denies access
    return ctx.JSON(403, map[string]string{"error": "forbidden"})
}
return ctx.JSON(200, payload)
```

### Signed Auth Tokens

By default the authorizer verdict alone gates a subscription. To cryptographically bind an authorized verdict to a specific socket (so a leaked verdict cannot be replayed on another connection), install an HMAC secret with `SetAuthSecret`:

```go
b.SetAuthSecret([]byte(secret)) // 32+ random bytes recommended
```

With a secret installed:

- `Auth` includes an `"auth"` field carrying `hex(HMAC-SHA256(socketID ":" channel))`. For presence channels the response is `{"auth": ..., "channel_data": ...}`.
- The WebSocket driver is auto-wired to require and verify that token on every private/presence subscribe (when the driver implements `TokenVerifierSetter`, which the built-in driver does). Calling `SetAuthSecret` with an empty slice clears the secret and returns the driver to authorizer-only mode.

Helpers for custom flows: `SignAuthToken(socketID, channel)` produces the token (or `ErrUnauthorized` if no secret is set), `VerifyAuthToken(socketID, channel, token)` checks it in constant time, and the package-level `broadcast.SecureCompareToken(a, b)` offers a constant-time string comparison for custom authorizers.

## WebSocket Driver

The default WebSocket driver provides real-time communication:

```go
import (
    "context"
    "time"

    "github.com/velocitykode/velocity/broadcast"
    "github.com/velocitykode/velocity/broadcast/drivers"
    "github.com/velocitykode/velocity/websocket"
)

func main() {
    // Configure WebSocket server
    config := websocket.Config{
        Host:           "0.0.0.0",
        Port:           6001,
        Path:           "/ws",
        AllowedOrigins: []string{"http://localhost:4000"},
        PingInterval:   30 * time.Second,
        PongTimeout:    60 * time.Second,
        WriteTimeout:   10 * time.Second,
        MaxMessageSize: 512 * 1024, // 512 KiB
    }

    // Create WebSocket driver
    driver := drivers.NewWebSocketDriver(config)

    // Create broadcaster with driver
    broadcaster := broadcast.New(driver)

    // Use broadcaster
    broadcaster.Channel("events").EmitCtx(context.Background(), "TestEvent", "Hello WebSocket!")
}
```

## Client-Side Integration

### JavaScript Client Example

```javascript
// Connect to WebSocket server
const ws = new WebSocket('ws://localhost:6001/ws');

ws.onopen = () => {
    console.log('Connected to WebSocket');

    // Subscribe to a public channel
    ws.send(JSON.stringify({
        type: 'subscribe',
        data: {
            channel: 'orders'
        }
    }));

    // Subscribe to a private channel
    ws.send(JSON.stringify({
        type: 'subscribe',
        data: {
            channel: 'private-user.123',
            auth: authToken  // Include auth token
        }
    }));
};

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
        case 'subscription_succeeded':
            console.log('Subscribed to:', message.data.channel);
            break;

        case 'order.shipped':
            console.log('Order shipped:', message.data);
            updateOrderUI(message.data);
            break;

        default:
            console.log('Received event:', message.type, message.data);
    }
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};

ws.onclose = () => {
    console.log('WebSocket connection closed');
};
```

## Advanced Usage

### Getting Channel Clients

`GetClients` lives on the driver and returns the **opaque** client identifiers subscribed to a channel. The IDs are derived per-channel from a process-local random seed, so raw socket IDs never leak across channels:

```go
import "github.com/velocitykode/velocity/broadcast/drivers"

func getChannelInfo(driver *drivers.WebSocketDriver, channelName string) {
    // Opaque per-channel client IDs (not raw socket IDs)
    clients := driver.GetClients(channelName)

    log.Info("Channel info",
        "channel", channelName,
        "client_count", len(clients),
    )
}
```

### Custom Driver Implementation

Create a custom broadcast driver by implementing the `Driver` interface:

```go
type Driver interface {
    // BroadcastCtx sends an event to channels. A ctx whose Err() is
    // already non-nil at call time MUST return that error before any send.
    BroadcastCtx(ctx context.Context, channels []string, event string, data interface{}) error

    // Deprecated: use BroadcastCtx with a request-scoped context.Context.
    Broadcast(channels []string, event string, data interface{}) error

    // BroadcastExceptCtx broadcasts to all except the specified socket,
    // honouring the same ctx-cancellation contract as BroadcastCtx.
    BroadcastExceptCtx(ctx context.Context, channels []string, event string, data interface{}, socketID string) error

    // Deprecated: use BroadcastExceptCtx with a request-scoped context.Context.
    BroadcastExcept(channels []string, event string, data interface{}, socketID string) error

    // GetClients returns the clients in a channel.
    GetClients(channel string) []string
}
```

The `Ctx` and non-`Ctx` methods come in pairs: the `Ctx` variant threads the caller's context so a slow client cannot pin the request goroutine, and the deprecated non-`Ctx` shim delegates to it with `context.Background()`. New driver implementations should put their logic in the `Ctx` methods. Implementations must pass `broadcasttest.RunDriverContractTests`, the package's executable specification.

Drivers may also implement `broadcast.TokenVerifierSetter` to opt into the framework's HMAC subscribe-time token verification (the built-in WebSocket driver does):

```go
type TokenVerifierSetter interface {
    SetTokenVerifier(fn func(socketID, channel, token string) bool)
}
```

Example custom driver:

```go
type RedisDriver struct {
    client *redis.Client
}

func (d *RedisDriver) BroadcastCtx(ctx context.Context, channels []string, event string, data interface{}) error {
    if err := ctx.Err(); err != nil {
        return err
    }

    message := map[string]interface{}{
        "event": event,
        "data":  data,
    }

    payload, _ := json.Marshal(message)

    for _, channel := range channels {
        if err := d.client.Publish(ctx, channel, payload).Err(); err != nil {
            return err
        }
    }

    return nil
}

// Deprecated shim required by the Driver interface.
func (d *RedisDriver) Broadcast(channels []string, event string, data interface{}) error {
    return d.BroadcastCtx(context.Background(), channels, event, data)
}
```

## Integration with HTTP Routes

### Broadcasting from Handlers

Inject the manager into your handler (for example as a struct field), then emit with the request's context:

```go
import (
    "github.com/velocitykode/velocity/broadcast"
    "github.com/velocitykode/velocity/router"
)

type OrderHandler struct {
    Broadcaster *broadcast.BroadcastManager
}

func (c *OrderHandler) Ship(ctx *router.Context) error {
    orderID := ctx.Param("id")

    // Ship the order
    order, err := shipOrder(orderID)
    if err != nil {
        return ctx.Error(500, "Failed to ship order")
    }

    // Broadcast shipping notification
    c.Broadcaster.Channel("orders").EmitCtx(ctx.Request.Context(), "OrderShipped", map[string]interface{}{
        "order_id": order.ID,
        "tracking": order.TrackingNumber,
    })

    return ctx.JSON(200, order)
}
```

## Best Practices

1. **Channel Naming**: Use consistent naming conventions (e.g., `resource.action.id`)
2. **Authorization**: Always authorize private and presence channels
3. **Data Size**: Keep broadcast payloads small for better performance
4. **Error Handling**: Handle broadcast errors gracefully
5. **Security**: Validate all user input before broadcasting
6. **Rate Limiting**: Implement rate limiting for broadcast operations
7. **Connection Management**: Handle disconnections and reconnections properly

## Examples

### Real-Time Chat

```go
func (c *ChatHandler) SendMessage(ctx *router.Context) error {
    var msg struct {
        RoomID  string `json:"room_id"`
        Message string `json:"message"`
    }

    if err := ctx.Bind(&msg); err != nil {
        return err
    }

    // Broadcast to presence channel, excluding the sending socket
    c.Broadcaster.Presence(fmt.Sprintf("chat.%s", msg.RoomID)).
        ToOthers(ctx.Request.Header.Get("X-Socket-ID")).
        EmitCtx(ctx.Request.Context(), "MessageSent", map[string]interface{}{
            "user_id":   currentUser.GetAuthIdentifier(),
            "message":   msg.Message,
            "timestamp": time.Now(),
        })

    return ctx.JSON(200, map[string]string{"status": "sent"})
}
```

### Live Notifications

```go
func (c *NotificationHandler) SendNotification(ctx context.Context, userID int, notification Notification) {
    // Broadcast to user's private channel
    c.Broadcaster.Private(fmt.Sprintf("user.%d", userID)).
        EmitCtx(ctx, "NewNotification", map[string]interface{}{
            "id":      notification.ID,
            "title":   notification.Title,
            "message": notification.Message,
            "type":    notification.Type,
        })
}
```

### Live Dashboard Updates

```go
func (c *DashboardHandler) UpdateMetrics(ctx context.Context) {
    metrics := calculateMetrics()

    // Broadcast to admin dashboard channel
    c.Broadcaster.Channel("admin.dashboard").EmitCtx(ctx, "MetricsUpdated", map[string]interface{}{
        "active_users": metrics.ActiveUsers,
        "total_orders": metrics.TotalOrders,
        "revenue":      metrics.Revenue,
        "updated_at":   time.Now(),
    })
}
```
