---
title: Broadcasting
weight: 20
---

Velocity provides a powerful broadcasting system for real-time event communication built on top of WebSockets. It enables you to broadcast events to multiple connected clients with support for public, private, and presence channels.

## Quick Start

{{% callout type="info" %}}
**Built on WebSockets**: The broadcast package provides a high-level API over Velocity's WebSocket server for event-driven real-time communication.
{{% /callout %}}

{{< tabs items="Basic Broadcasting,Private Channels,Presence Channels" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/broadcast"

func main() {
    // Broadcast to a public channel
    broadcast.Channel("orders").Emit("OrderShipped", map[string]interface{}{
        "order_id": 12345,
        "tracking": "ABC123",
    })

    // Broadcast to multiple channels
    broadcast.Channel("orders", "notifications").Emit("OrderUpdate", orderData)
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/broadcast"

func main() {
    // Broadcast to a private channel
    broadcast.Private("user.123").Emit("AccountUpdate", map[string]interface{}{
        "balance": 1500.00,
        "updated_at": time.Now(),
    })
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/broadcast"

func main() {
    // Broadcast to a presence channel
    broadcast.Presence("chat.room.1").Emit("MessageSent", map[string]interface{}{
        "user": "John",
        "message": "Hello everyone!",
        "timestamp": time.Now(),
    })
}
```
{{< /tab >}}

{{< /tabs >}}

## Configuration

Configure the broadcasting system in your `.env` file:

```env
# WebSocket configuration (default driver)
BROADCAST_DRIVER=websocket
WEBSOCKET_HOST=0.0.0.0
WEBSOCKET_PORT=6001
WEBSOCKET_PATH=/ws

# Connection settings
WEBSOCKET_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8090
WEBSOCKET_PING_INTERVAL=30s
WEBSOCKET_READ_TIMEOUT=60s
WEBSOCKET_WRITE_TIMEOUT=10s
WEBSOCKET_MAX_MESSAGE_SIZE=524288  # 512KB
```

## Channel Types

### Public Channels

Public channels are accessible to all connected clients without authentication:

```go
// Anyone can subscribe to "orders" channel
broadcast.Channel("orders").Emit("NewOrder", order)

// Broadcast to multiple public channels
broadcast.Channel("orders", "notifications").Emit("OrderCreated", order)
```

### Private Channels

Private channels require authorization before clients can subscribe:

```go
// Broadcast to private user channel
userID := 123
broadcast.Private(fmt.Sprintf("user.%d", userID)).Emit("PrivateMessage", message)

// Private channels are prefixed with "private-"
// Client subscribes to: "private-user.123"
```

### Presence Channels

Presence channels track which users are subscribed to the channel:

```go
// Broadcast to presence channel
broadcast.Presence("chat.room.1").Emit("MessageSent", message)

// Presence channels are prefixed with "presence-"
// Client subscribes to: "presence-chat.room.1"
```

## Broadcasting Events

### Manual Broadcasting

Directly broadcast events to channels:

```go
import "github.com/velocitykode/velocity/pkg/broadcast"

func shipOrder(orderID int) error {
    // Process order...

    // Broadcast shipping notification
    err := broadcast.Channel("orders").Emit("OrderShipped", map[string]interface{}{
        "order_id": orderID,
        "status": "shipped",
        "tracking_number": "ABC123",
    })

    return err
}
```

### Conditional Broadcasting

Broadcast only when certain conditions are met:

```go
// Broadcast to others (exclude sender)
broadcast.Channel("chat.room.1").
    ToOthers(socketID).
    Emit("UserTyping", username)

// Conditional broadcasting
broadcast.Channel("orders").
    When(order.Status == "shipped").
    Emit("OrderUpdate", order)
```

### Event Interface

Implement the `Event` interface for auto-broadcasting:

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

Configure authorization handlers for private and presence channels:

```go
import (
    "strings"
    "github.com/velocitykode/velocity/pkg/broadcast"
)

func setupBroadcasting() {
    // Get default broadcaster
    broadcaster := broadcast.Default()

    // Set authorization handler
    broadcaster.SetAuthorizer(func(channel string, user interface{}) bool {
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

    // Set presence data for presence channels
    broadcaster.SetPresenceData(func(channel string, user interface{}) interface{} {
        u := user.(*User)
        return map[string]interface{}{
            "id":     u.ID,
            "name":   u.Name,
            "avatar": u.AvatarURL,
        }
    })
}
```

### Global Authorization Functions

For convenience, use global authorization functions:

```go
import "github.com/velocitykode/velocity/pkg/broadcast"

func init() {
    // Set global authorizer
    broadcast.SetAuthorizer(func(channel string, user interface{}) bool {
        return authorizeChannel(channel, user)
    })

    // Set global presence data
    broadcast.SetPresenceData(func(channel string, user interface{}) interface{} {
        return getUserPresenceData(user)
    })
}
```

## WebSocket Driver

The default WebSocket driver provides real-time communication:

```go
import (
    "github.com/velocitykode/velocity/pkg/broadcast"
    "github.com/velocitykode/velocity/pkg/broadcast/drivers"
    "github.com/velocitykode/velocity/pkg/websocket"
)

func main() {
    // Configure WebSocket server
    config := websocket.Config{
        Host:           "0.0.0.0",
        Port:           6001,
        Path:           "/ws",
        AllowedOrigins: []string{"http://localhost:3000"},
        PingInterval:   30 * time.Second,
        ReadTimeout:    60 * time.Second,
        WriteTimeout:   10 * time.Second,
        MaxMessageSize: 512 * 1024,  // 512KB
    }

    // Create WebSocket driver
    driver := drivers.NewWebSocketDriver(config)

    // Create broadcaster with driver
    broadcaster := broadcast.New(driver)

    // Use broadcaster
    broadcaster.Channel("events").Emit("TestEvent", "Hello WebSocket!")
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

Retrieve clients subscribed to a channel:

```go
import "github.com/velocitykode/velocity/pkg/broadcast"

func getChannelInfo(channelName string) {
    broadcaster := broadcast.Default()

    // Get list of client IDs in channel
    clients := broadcaster.GetClients(channelName)

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
    // Broadcast sends an event to channels
    Broadcast(channels []string, event string, data interface{}) error

    // BroadcastExcept broadcasts to all except specified socket
    BroadcastExcept(channels []string, event string, data interface{}, socketID string) error

    // GetClients returns clients in a channel
    GetClients(channel string) []string
}
```

Example custom driver:

```go
type RedisDriver struct {
    client *redis.Client
}

func (d *RedisDriver) Broadcast(channels []string, event string, data interface{}) error {
    message := map[string]interface{}{
        "event": event,
        "data":  data,
    }

    payload, _ := json.Marshal(message)

    for _, channel := range channels {
        d.client.Publish(context.Background(), channel, payload)
    }

    return nil
}
```

## Integration with HTTP Routes

### Broadcasting from Controllers

```go
import (
    "github.com/velocitykode/velocity/pkg/broadcast"
    "github.com/velocitykode/velocity/pkg/router"
)

func (c *OrderController) Ship(ctx *router.Context) error {
    orderID := ctx.Param("id")

    // Ship the order
    order, err := shipOrder(orderID)
    if err != nil {
        return ctx.Error("Failed to ship order", 500)
    }

    // Broadcast shipping notification
    broadcast.Channel("orders").Emit("OrderShipped", map[string]interface{}{
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
func (c *ChatController) SendMessage(ctx *router.Context) error {
    var msg struct {
        RoomID  string `json:"room_id"`
        Message string `json:"message"`
    }

    if err := ctx.Bind(&msg); err != nil {
        return err
    }

    // Get authenticated user
    user := auth.User(ctx.Request)

    // Broadcast to presence channel
    broadcast.Presence(fmt.Sprintf("chat.%s", msg.RoomID)).
        ToOthers(ctx.Request.Header.Get("X-Socket-ID")).
        Emit("MessageSent", map[string]interface{}{
            "user_id": user.GetAuthIdentifier(),
            "message": msg.Message,
            "timestamp": time.Now(),
        })

    return ctx.JSON(200, map[string]string{"status": "sent"})
}
```

### Live Notifications

```go
func (c *NotificationController) SendNotification(userID int, notification Notification) {
    // Broadcast to user's private channel
    broadcast.Private(fmt.Sprintf("user.%d", userID)).
        Emit("NewNotification", map[string]interface{}{
            "id":      notification.ID,
            "title":   notification.Title,
            "message": notification.Message,
            "type":    notification.Type,
        })
}
```

### Live Dashboard Updates

```go
func (c *DashboardController) UpdateMetrics() {
    metrics := calculateMetrics()

    // Broadcast to admin dashboard channel
    broadcast.Channel("admin.dashboard").Emit("MetricsUpdated", map[string]interface{}{
        "active_users":  metrics.ActiveUsers,
        "total_orders":  metrics.TotalOrders,
        "revenue":       metrics.Revenue,
        "updated_at":    time.Now(),
    })
}
```
