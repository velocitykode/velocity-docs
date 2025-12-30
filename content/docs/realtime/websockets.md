---
title: WebSockets
description: Enable real-time bidirectional communication with Velocity's WebSocket server and client APIs.
weight: 70
---

Velocity provides a powerful WebSocket implementation for real-time, bidirectional communication between your application and clients.

## Quick Start

Setting up WebSockets is straightforward:

```go
import (
    "github.com/velocitykode/velocity/pkg/websocket"
    "github.com/velocitykode/velocity/pkg/log"
)

func main() {
    // Create WebSocket server with default configuration
    config := websocket.DefaultConfig()
    config.Port = 6001
    config.Path = "/ws"

    server := websocket.NewServer(config)

    // Handle new connections
    server.OnConnect(func(client *websocket.Client) {
        log.Info("Client connected", "client_id", client.ID())

        // Send welcome message
        client.Send("welcome", map[string]interface{}{
            "message": "Welcome to our WebSocket server!",
            "client_id": client.ID(),
        })
    })

    // Handle disconnections
    server.OnDisconnect(func(client *websocket.Client) {
        log.Info("Client disconnected", "client_id", client.ID())
    })

    // Start the WebSocket server
    go server.Start()

    // Your HTTP server continues to run
    http.ListenAndServe(":4000", router.Get())
}
```

## Configuration

### Server Configuration

```go
config := websocket.Config{
    Port:                3000,
    Path:                "/ws",
    AllowedOrigins:      []string{"*"},
    EnableCompression:   true,
    HandshakeTimeout:    10 * time.Second,
    ReadBufferSize:      1024,
    WriteBufferSize:     1024,
    CheckOrigin: func(r *http.Request) bool {
        // Custom origin checking logic
        return true
    },
}

server := websocket.NewServer(config)
```

### Environment Configuration

Configure WebSocket settings in your `.env` file:

```env
# WebSocket Server
WS_PORT=6001
WS_PATH=/ws
WS_ALLOWED_ORIGINS=*
WS_ENABLE_COMPRESSION=true
WS_HANDSHAKE_TIMEOUT=10s
WS_READ_BUFFER_SIZE=1024
WS_WRITE_BUFFER_SIZE=1024
```

## Client Management

### Client Information

```go
server.OnConnect(func(client *websocket.Client) {
    // Get client information
    clientID := client.ID()
    remoteAddr := client.RemoteAddr()
    userAgent := client.UserAgent()

    log.Info("New client connected",
        "client_id", clientID,
        "remote_addr", remoteAddr,
        "user_agent", userAgent,
    )
})
```

### Client Collections

```go
// Get all connected clients
clients := server.GetClients()
log.Info("Total connected clients", "count", len(clients))

// Get specific client by ID
client := server.GetClient("client-123")
if client != nil {
    client.Send("ping", map[string]interface{}{
        "timestamp": time.Now().Unix(),
    })
}

// Check if client is connected
if server.IsConnected("client-123") {
    log.Info("Client is still connected")
}
```

## Message Handling

### Receiving Messages

```go
server.OnMessage(func(client *websocket.Client, message websocket.Message) {
    log.Info("Received message",
        "client_id", client.ID(),
        "event", message.Event,
        "data", message.Data,
    )

    switch message.Event {
    case "chat_message":
        handleChatMessage(client, message.Data)
    case "join_room":
        handleJoinRoom(client, message.Data)
    case "ping":
        client.Send("pong", map[string]interface{}{
            "timestamp": time.Now().Unix(),
        })
    default:
        log.Warn("Unknown message event", "event", message.Event)
    }
})

func handleChatMessage(client *websocket.Client, data interface{}) {
    messageData := data.(map[string]interface{})
    text := messageData["text"].(string)
    room := messageData["room"].(string)

    // Broadcast message to all clients in the room
    server.ToRoom(room).Send("new_message", map[string]interface{}{
        "text": text,
        "user": client.ID(),
        "timestamp": time.Now().Unix(),
    })
}
```

### Sending Messages

```go
// Send to specific client
client.Send("notification", map[string]interface{}{
    "title": "New Message",
    "body": "You have received a new message",
    "timestamp": time.Now().Unix(),
})

// Send to all connected clients
server.Broadcast("server_announcement", map[string]interface{}{
    "message": "Server maintenance in 5 minutes",
    "type": "warning",
})

// Send to multiple clients
clientIDs := []string{"client-1", "client-2", "client-3"}
server.ToClients(clientIDs).Send("group_message", map[string]interface{}{
    "message": "Hello group!",
})
```

## Room Management

### Joining and Leaving Rooms

```go
// Client joins a room
server.OnMessage(func(client *websocket.Client, message websocket.Message) {
    if message.Event == "join_room" {
        roomName := message.Data.(map[string]interface{})["room"].(string)

        // Add client to room
        server.JoinRoom(client.ID(), roomName)

        // Notify other room members
        server.ToRoom(roomName).Except(client.ID()).Send("user_joined", map[string]interface{}{
            "user_id": client.ID(),
            "room": roomName,
            "message": fmt.Sprintf("User %s joined the room", client.ID()),
        })

        // Send confirmation to the client
        client.Send("room_joined", map[string]interface{}{
            "room": roomName,
            "message": "Successfully joined the room",
        })
    }
})

// Client leaves a room
server.OnMessage(func(client *websocket.Client, message websocket.Message) {
    if message.Event == "leave_room" {
        roomName := message.Data.(map[string]interface{})["room"].(string)

        // Remove client from room
        server.LeaveRoom(client.ID(), roomName)

        // Notify other room members
        server.ToRoom(roomName).Send("user_left", map[string]interface{}{
            "user_id": client.ID(),
            "room": roomName,
            "message": fmt.Sprintf("User %s left the room", client.ID()),
        })
    }
})
```

### Room Broadcasting

```go
// Send message to all clients in a room
server.ToRoom("general").Send("room_message", map[string]interface{}{
    "text": "Hello everyone in the general room!",
    "from": "system",
})

// Send to room except specific clients
server.ToRoom("general").Except("client-123").Send("message", data)

// Send to multiple rooms
server.ToRooms([]string{"room1", "room2"}).Send("announcement", data)

// Get room information
roomClients := server.GetRoomClients("general")
log.Info("Clients in general room", "count", len(roomClients))
```

## Error Handling

### Connection Errors

```go
server.OnError(func(client *websocket.Client, err error) {
    log.Error("WebSocket error",
        "client_id", client.ID(),
        "error", err,
    )

    // Optionally disconnect the client
    if isServerError(err) {
        client.Disconnect()
    }
})

func isServerError(err error) bool {
    // Determine if error requires disconnection
    return strings.Contains(err.Error(), "server error")
}
```

### Message Validation

```go
server.OnMessage(func(client *websocket.Client, message websocket.Message) {
    // Validate message structure
    if message.Event == "" {
        client.Send("error", map[string]interface{}{
            "message": "Event name is required",
            "code": "INVALID_EVENT",
        })
        return
    }

    // Validate message data
    if message.Data == nil {
        client.Send("error", map[string]interface{}{
            "message": "Message data is required",
            "code": "INVALID_DATA",
        })
        return
    }

    // Process valid message
    handleValidMessage(client, message)
})
```

## Authentication

### Connection Authentication

```go
server.OnConnect(func(client *websocket.Client) {
    // Check for authentication token
    token := client.Request().URL.Query().Get("token")
    if token == "" {
        client.Send("auth_required", map[string]interface{}{
            "message": "Authentication token required",
        })
        client.Disconnect()
        return
    }

    // Validate token
    user, err := validateAuthToken(token)
    if err != nil {
        client.Send("auth_failed", map[string]interface{}{
            "message": "Invalid authentication token",
        })
        client.Disconnect()
        return
    }

    // Store user information with client
    client.SetData("user", user)
    client.SetData("authenticated", true)

    log.Info("Authenticated client connected",
        "client_id", client.ID(),
        "user_id", user.ID,
    )
})
```

### Message-based Authentication

```go
server.OnMessage(func(client *websocket.Client, message websocket.Message) {
    // Check if client is authenticated for protected events
    if isProtectedEvent(message.Event) {
        authenticated := client.GetData("authenticated")
        if authenticated != true {
            client.Send("unauthorized", map[string]interface{}{
                "message": "Authentication required for this action",
                "event": message.Event,
            })
            return
        }
    }

    // Process authenticated message
    handleMessage(client, message)
})
```

## Performance & Monitoring

### Connection Statistics

```go
// Get server statistics
stats := server.GetStats()
log.Info("WebSocket server stats",
    "connected_clients", stats.ConnectedClients,
    "total_messages_sent", stats.MessagesSent,
    "total_messages_received", stats.MessagesReceived,
    "bytes_sent", stats.BytesSent,
    "bytes_received", stats.BytesReceived,
)

// Monitor connection health
server.OnConnect(func(client *websocket.Client) {
    // Set up periodic ping
    ticker := time.NewTicker(30 * time.Second)
    go func() {
        defer ticker.Stop()
        for {
            select {
            case <-ticker.C:
                if !client.IsConnected() {
                    return
                }
                client.Ping()
            }
        }
    }()
})
```

### Rate Limiting

```go
// Implement rate limiting per client
server.OnMessage(func(client *websocket.Client, message websocket.Message) {
    // Get rate limiter for client
    limiter := getRateLimiter(client.ID())

    if !limiter.Allow() {
        client.Send("rate_limit_exceeded", map[string]interface{}{
            "message": "Too many messages, please slow down",
            "retry_after": time.Second * 5,
        })
        return
    }

    // Process message if rate limit allows
    handleMessage(client, message)
})

func getRateLimiter(clientID string) *rate.Limiter {
    // Implementation depends on your rate limiting strategy
    // Return appropriate rate limiter for client
    return rate.NewLimiter(rate.Limit(10), 10) // 10 messages per second
}
```

## Frontend Integration

### JavaScript Client

```javascript
// Connect to WebSocket server
const ws = new WebSocket('ws://localhost:6001/ws');

// Handle connection open
ws.onopen = function(event) {
    console.log('Connected to WebSocket server');

    // Send authentication
    ws.send(JSON.stringify({
        event: 'authenticate',
        data: {
            token: localStorage.getItem('auth_token')
        }
    }));
};

// Handle incoming messages
ws.onmessage = function(event) {
    const message = JSON.parse(event.data);
    console.log('Received message:', message);

    switch(message.event) {
        case 'welcome':
            handleWelcome(message.data);
            break;
        case 'new_message':
            displayMessage(message.data);
            break;
        case 'user_joined':
            showUserJoined(message.data);
            break;
        default:
            console.log('Unknown message event:', message.event);
    }
};

// Send message
function sendMessage(event, data) {
    ws.send(JSON.stringify({
        event: event,
        data: data
    }));
}

// Join a room
function joinRoom(roomName) {
    sendMessage('join_room', { room: roomName });
}

// Send chat message
function sendChatMessage(text, room) {
    sendMessage('chat_message', {
        text: text,
        room: room
    });
}
```

## Testing WebSockets

```go
func TestWebSocketServer(t *testing.T) {
    // Create test server
    config := websocket.DefaultConfig()
    config.Port = 0 // Use random available port
    server := websocket.NewServer(config)

    // Set up message handler
    var receivedMessage websocket.Message
    server.OnMessage(func(client *websocket.Client, message websocket.Message) {
        receivedMessage = message
    })

    // Start server
    go server.Start()
    defer server.Stop()

    // Connect test client
    url := fmt.Sprintf("ws://localhost:%d%s", server.Port(), config.Path)
    ws, _, err := websocket.DefaultDialer.Dial(url, nil)
    assert.NoError(t, err)
    defer ws.Close()

    // Send test message
    testMessage := websocket.Message{
        Event: "test_event",
        Data: map[string]interface{}{
            "test": "data",
        },
    }

    err = ws.WriteJSON(testMessage)
    assert.NoError(t, err)

    // Wait for message to be received
    time.Sleep(100 * time.Millisecond)

    // Verify message was received
    assert.Equal(t, "test_event", receivedMessage.Event)
    assert.Equal(t, "data", receivedMessage.Data.(map[string]interface{})["test"])
}
```

## Best Practices

1. **Handle Disconnections**: Always handle client disconnections gracefully
2. **Authenticate Connections**: Validate client authentication before processing messages
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Message Validation**: Validate all incoming messages
5. **Error Handling**: Provide clear error messages to clients
6. **Room Management**: Clean up rooms when they become empty
7. **Monitoring**: Monitor connection health and server performance
8. **Security**: Validate origins and implement proper CORS policies

