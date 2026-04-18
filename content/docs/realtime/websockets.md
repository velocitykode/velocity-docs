---
title: WebSockets
description: Real-time bidirectional communication - typed message handlers, groups, broadcasts, and per-client metadata.
weight: 70
---

The `websocket` package provides a typed WebSocket server with
message routing, group membership for fan-out, per-client metadata,
authentication hooks, and built-in rate limiting.

Import path: `github.com/velocitykode/velocity/websocket`

## Quick start

```go
import "github.com/velocitykode/velocity/websocket"

cfg := websocket.DefaultConfig()
cfg.Host = "0.0.0.0"
cfg.Port = 6001
cfg.Path = "/ws"

srv := websocket.New(cfg)

srv.OnConnect(func(c *websocket.Client) {
    c.SendJSON("welcome", map[string]any{
        "client_id": c.ID,
        "message":   "connected",
    })
})

srv.On("chat", func(c *websocket.Client, msg websocket.Message) error {
    return srv.Broadcast(websocket.Message{
        Type: "chat",
        From: c.ID,
        Data: msg.Data,
    })
})

if err := srv.Start(); err != nil {
    log.Fatal(err)
}
```

`Start` launches the internal dispatcher goroutine. To accept
connections, mount `srv.HandleConnection` on an HTTP route - see
[Mounting](#mounting-on-an-http-route) below.

## Configuration

`DefaultConfig()` provides reasonable defaults. Override what you
need:

```go
cfg := websocket.Config{
    Host:             "0.0.0.0",
    Port:             6001,
    Path:             "/ws",
    AllowedOrigins:   []string{"https://example.com"},
    MaxConnections:   10000,
    ReadBufferSize:   1024,
    WriteBufferSize:  1024,
    MaxMessageSize:   512 * 1024, // 512KB
    PingInterval:     30 * time.Second,
    PongTimeout:      60 * time.Second,
    WriteTimeout:     10 * time.Second,
    MessageRateLimit: 100, // msgs/sec per client (0 = unlimited)
    MessageBurstSize: 200,
    AuthFunc: func(r *http.Request) error {
        if r.URL.Query().Get("token") == "" {
            return errors.New("missing token")
        }
        return nil
    },
}
```

`AuthFunc` runs **before** the WebSocket upgrade - return a non-nil
error to reject the handshake.

## Mounting on an HTTP route

`HandleConnection` upgrades the connection and registers the client.
Wire it into your Velocity routes:

```go
v.Routes(func(r *velocity.Routing) {
    r.Web(func(web router.Router) {
        web.Get("/ws", func(c *router.Context) error {
            srv.HandleConnection(c.Response, c.Request)
            return nil
        })
    })
})
```

Or attach to a stdlib mux:

```go
http.HandleFunc("/ws", srv.HandleConnection)
```

## Messages

A message is a JSON envelope:

```go
type Message struct {
    Type   string `json:"type"`             // routing key
    Data   any    `json:"data"`             // payload
    Target string `json:"target,omitempty"` // client ID for direct sends
    From   string `json:"from,omitempty"`   // sender client ID
}
```

### Routing incoming messages

Register handlers per message type:

```go
srv.On("chat", func(c *websocket.Client, msg websocket.Message) error {
    text, _ := msg.Data.(map[string]any)["text"].(string)
    return srv.Broadcast(websocket.Message{
        Type: "chat",
        From: c.ID,
        Data: map[string]any{"text": text},
    })
})

srv.On("join", func(c *websocket.Client, msg websocket.Message) error {
    room, _ := msg.Data.(map[string]any)["room"].(string)
    return srv.JoinGroup(c.ID, room)
})
```

Unknown message types are silently dropped - register handlers for
everything you expect to receive.

### Sending to one client

```go
client.SendJSON("notification", map[string]any{
    "title": "New message",
    "body":  "Alice sent you a DM",
})

// Or build the Message yourself:
client.SendMessage(websocket.Message{
    Type: "ping",
    Data: time.Now().Unix(),
})
```

`SendJSON` is non-blocking - it queues the message on the client's
send channel.

### Broadcast to everyone

```go
srv.Broadcast(websocket.Message{
    Type: "announce",
    Data: "Server restart in 5 minutes",
})
```

### Send to a specific client by ID

```go
if err := srv.SendToClient("client-42", msg); err != nil {
    // client not found
}
```

## Groups (rooms)

Groups are server-side bags of clients. Join, leave, and broadcast
into them.

### Membership

```go
srv.JoinGroup(client.ID, "room-1")
srv.LeaveGroup(client.ID, "room-1")
srv.LeaveAllGroups(client.ID)  // typically called on disconnect

if client.IsInGroup("room-1") {
    // ...
}
```

### Broadcasting

```go
// Send to every client in the group
srv.BroadcastToGroup("room-1", websocket.Message{
    Type: "chat",
    Data: map[string]any{"text": "Hello room"},
})

// Same as Broadcast but with explicit semantics
srv.SendToGroup("room-1", msg)

// Skip the sender
srv.SendToOthersInGroup("room-1", senderID, msg)
```

### Inspecting groups

```go
clients := srv.GetGroupMembers("room-1")  // []*Client
ids     := srv.GetGroupMemberIDs("room-1")
groups  := srv.GetGroups()                 // all group names
n       := srv.GetGroupCount()             // number of groups
empty   := srv.IsGroupEmpty("room-1")
```

## Lifecycle callbacks

```go
srv.OnConnect(func(c *websocket.Client) {
    log.Info("connected", "id", c.ID)
})

srv.OnDisconnect(func(c *websocket.Client) {
    srv.LeaveAllGroups(c.ID)
    log.Info("disconnected", "id", c.ID)
})

srv.OnError(func(c *websocket.Client, err error) {
    log.Error("client error", "id", c.ID, "err", err)
})
```

## Per-client metadata

Stash request-scoped data on the client itself:

```go
srv.OnConnect(func(c *websocket.Client) {
    user, err := authenticateFromQuery(c.Conn)
    if err != nil {
        c.Close()
        return
    }
    c.SetMetadata("user_id", user.ID)
    c.SetMetadata("plan", user.Plan)
})

srv.On("admin:purge", func(c *websocket.Client, msg websocket.Message) error {
    plan, ok := c.GetMetadata("plan")
    if !ok || plan != "admin" {
        return c.SendJSON("error", map[string]any{"reason": "forbidden"})
    }
    return runPurge()
})
```

## Middleware

Wrap message handlers with cross-cutting concerns:

```go
logging := func(next websocket.MessageHandler) websocket.MessageHandler {
    return func(c *websocket.Client, msg websocket.Message) error {
        log.Info("ws.recv", "client", c.ID, "type", msg.Type)
        err := next(c, msg)
        if err != nil {
            log.Warn("ws.handler.err", "client", c.ID, "err", err)
        }
        return err
    }
}

srv.Use(logging)
```

Middleware runs in registration order around every dispatched
message.

## Authentication

Two layers:

1. **Pre-upgrade** - `Config.AuthFunc(*http.Request) error`. Reject
   the WebSocket handshake before the connection is established.
   Read tokens from headers, query strings, or cookies.

2. **Post-upgrade** - inside `OnConnect` or a message handler. Stash
   the user via `SetMetadata`; gate handlers by reading the metadata.

```go
cfg.AuthFunc = func(r *http.Request) error {
    token := r.Header.Get("Authorization")
    if !validateToken(token) {
        return errors.New("invalid token")
    }
    return nil
}
```

Pre-upgrade auth is preferred - rejected requests never consume a
client slot.

## Rate limiting

Built into the config - no external code needed:

```go
cfg.MessageRateLimit = 50  // msgs/sec
cfg.MessageBurstSize  = 100
```

When a client exceeds the burst, the server closes their connection.
Set `MessageRateLimit = 0` to disable.

## Stats

```go
stats := srv.GetStats()
log.Info("ws stats",
    "clients", stats.ConnectedClients,
    "sent",    stats.MessagesSent,
    "recv",    stats.MessagesReceived,
    "bytes_in", stats.BytesReceived,
    "bytes_out", stats.BytesSent,
)
```

Read-only snapshot. Useful for `/health` endpoints and Prometheus
exporters.

## Inspecting clients

```go
client, ok := srv.GetClient("client-42")
if ok {
    client.SendJSON("ping", nil)
}

all := srv.GetClients()  // map[string]*Client - copy of the live set
log.Info("connected", "n", len(all))
```

## Frontend (browser) example

```javascript
const ws = new WebSocket('wss://example.com/ws?token=' + token);

ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', data: { room: 'lobby' } }));
};

ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
        case 'welcome':
            console.log('connected as', msg.data.client_id);
            break;
        case 'chat':
            renderChat(msg.from, msg.data.text);
            break;
    }
};

function send(type, data) {
    ws.send(JSON.stringify({ type, data }));
}
```

The wire shape matches the Go `Message` struct directly - `type`,
`data`, optional `target` and `from`.

## Testing

Spin up a server on port 0 (OS-assigned) and connect with the
gorilla-websocket dialer:

```go
import gws "github.com/gorilla/websocket"

func TestEcho(t *testing.T) {
    cfg := websocket.DefaultConfig()
    cfg.Port = 0
    cfg.Path = "/ws"

    srv := websocket.New(cfg)
    received := make(chan websocket.Message, 1)

    srv.On("echo", func(c *websocket.Client, m websocket.Message) error {
        received <- m
        return c.SendMessage(m)
    })

    if err := srv.Start(); err != nil {
        t.Fatal(err)
    }
    defer srv.Stop()

    ts := httptest.NewServer(http.HandlerFunc(srv.HandleConnection))
    defer ts.Close()

    url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
    conn, _, err := gws.DefaultDialer.Dial(url, nil)
    if err != nil {
        t.Fatal(err)
    }
    defer conn.Close()

    if err := conn.WriteJSON(websocket.Message{Type: "echo", Data: "hi"}); err != nil {
        t.Fatal(err)
    }

    select {
    case got := <-received:
        if got.Type != "echo" || got.Data != "hi" {
            t.Errorf("got %+v", got)
        }
    case <-time.After(time.Second):
        t.Fatal("timeout")
    }
}
```

## Design notes

- **Groups, not rooms.** Every set-of-clients abstraction is a group.
  Use any naming convention you like (`room:lobby`, `tenant:42`,
  `private-user.42`) - they're just strings.
- **One dispatcher goroutine.** The server runs a single goroutine
  fanning out broadcast/register/unregister channel events. Per-client
  read and write pumps run independently.
- **Channel-based send.** `SendJSON` and `SendMessage` enqueue on the
  client's bounded send channel - they're safe to call from any
  goroutine and don't block on slow consumers (full channels drop
  the client).
