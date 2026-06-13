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

// The server already enqueues a built-in "welcome" message on connect
// (see below); send your own app-level greeting under a distinct type.
srv.OnConnect(func(c *websocket.Client) {
    c.SendJSON("ready", map[string]any{
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

On registration the server automatically enqueues a `welcome`
message to each client carrying its assigned ID:

```json
{ "type": "welcome", "data": { "id": "<client-id>", "version": "1.0.0" } }
```

To stop the server, call `Shutdown` with a context that bounds how
long it waits for the dispatcher and every per-client read/write
pump to drain:

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
if err := srv.Shutdown(ctx); err != nil {
    log.Error("ws shutdown timed out", "err", err)
}
```

`Shutdown` is safe to call more than once; subsequent calls are
no-ops that return nil.

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
    MessageRateLimit: 100, // msgs/sec per client (0 = secure default, -1 = unlimited)
    MessageBurstSize: 200, // 0 defaults to 2x MessageRateLimit
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

{{% callout type="warning" %}}
Rate limiting is **opt-out**, not opt-in. Leaving `MessageRateLimit`
at its zero value installs the secure default
(`websocket.DefaultMessageRateLimit`, 10 msgs/sec) so an
unconfigured deployment is never silently unthrottled. To run with no
rate limit, set `MessageRateLimit` to a negative value (e.g. `-1`).
See [Rate limiting](#rate-limiting).
{{% /callout %}}

### Origin checks

When `AllowedOrigins` is empty (the default), only **same-origin**
upgrades are accepted: the request's `Origin` host must match its
`Host`, case-insensitively, and the scheme must be `http`/`https`.
Set `AllowedOrigins: []string{"*"}` to allow every origin, or list
specific origins to allow them exactly.

Browsers always send an `Origin` header on WebSocket upgrades, so a
missing `Origin` almost always means a non-browser client (curl, a
custom Go/Python client). Such requests are rejected by default. Set
`AllowEmptyOrigin: true` to admit them for trusted non-browser
integrations.

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

### Taking over the raw connection

`HandleRaw` upgrades the HTTP request to a WebSocket and hands back
the raw `*websocket.Conn` without registering a managed client,
starting read/write pumps, or entering the message-routing system.
The caller owns the connection - reading, writing, and closing it:

```go
web.Get("/ws/raw", func(c *router.Context) error {
    conn, err := srv.HandleRaw(c.Response, c.Request)
    if err != nil {
        return err
    }
    defer conn.Close()
    // drive conn directly...
    return nil
})
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

When a message arrives with no registered handler, the server replies
to that client with a generic `error` message (`{"message": "unknown
message type"}`) - register handlers for everything you expect to
receive. Likewise, if a handler returns a non-nil error and no
`OnError` callback is set, the client receives a generic `error`
message (`{"message": "internal error"}`); internal error details are
never reflected back to the client.

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

`SendJSON` and `SendMessage` are non-blocking - they enqueue on the
client's bounded send channel and return immediately. If that channel
is full they return `websocket.ErrSendChannelFull` rather than
blocking, so check the error when delivery matters:

```go
if err := client.SendJSON("ping", nil); err != nil {
    // websocket.ErrSendChannelFull - slow consumer, message dropped
}
```

The package also exports `ErrServerNotRunning`, `ErrClientNotFound`,
`ErrGroupNotFound`, `ErrConnectionLimit`, and `ErrInvalidMessage` for
matching with `errors.Is`.

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

`OnConnect`, `OnDisconnect`, and `OnError` each hold a single
callback; calling them again replaces the previous one (pass `nil`
to clear). When you need *several* disconnect observers - for example
an adapter that purges its own state - register them with
`AddOnDisconnect`:

```go
srv.AddOnDisconnect(func(c *websocket.Client) {
    metrics.ClientGone(c.ID)
})
```

Added listeners fire in registration order, alongside the single
`OnDisconnect` callback, **before** the client's send channel is
closed.

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
cfg.MessageBurstSize  = 100 // 0 defaults to 2x the rate limit
```

When a client exceeds the burst within a one-second window, the
server sends it a final `error` message (`{"message": "rate limit
exceeded"}`) and closes the connection.

The zero value of `MessageRateLimit` installs the secure default
(`websocket.DefaultMessageRateLimit`, 10 msgs/sec). To turn rate
limiting **off**, set a negative value:

```go
cfg.MessageRateLimit = -1 // explicit opt-out, no rate limit
```

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

`RecoveredPanics()` returns how many times the dispatcher's internal
recover has caught a panic in a single handler dispatch - a useful
gauge to alert on:

```go
if n := srv.RecoveredPanics(); n > 0 {
    log.Warn("ws handler panics recovered", "count", n)
}
```

## Logging

The server stays decoupled from the framework's `log` package: it
logs operational events (connects, disconnects, rate-limit
violations, recovered panics) through a minimal interface. Install a
logger with `SetLogger`; the framework's `log.Logger` satisfies it
directly. Logging is off until a logger is set, and passing `nil`
disables it again:

```go
// logger satisfies websocket.Logger (Info/Warn/Error(msg, kvs ...any)).
srv.SetLogger(logger)
```

Any value implementing `websocket.Logger` works:

```go
type Logger interface {
    Info(msg string, kvs ...any)
    Warn(msg string, kvs ...any)
    Error(msg string, kvs ...any)
}
```

`SetLogger` is safe to call concurrently.

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
            // built-in welcome envelope: { id, version }
            console.log('connected as', msg.data.id);
            break;
        case 'ready':
            console.log('app ready for', msg.data.client_id);
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
    defer srv.Shutdown(context.Background())

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
