---
title: gRPC
description: gRPC server and HTTP gateway with context helpers, structured errors, and interceptor-friendly APIs.
weight: 90
---

The `grpc` package wraps `google.golang.org/grpc` with Velocity
conventions - context helpers for auth/request metadata, structured
error constructors, and a sibling HTTP gateway that exposes gRPC
services over REST via grpc-gateway.

Import path: `github.com/velocitykode/velocity/grpc`

Sub-packages:

- `grpc/interceptors` - bundled `Auth`, `Logging`, `Recovery` interceptor pairs
- `grpc/grpcevents` - request / stream / server / gateway / panic / auth event types
- `grpc/converters` - proto `Timestamp` / `Duration` and pagination helpers

## Setup

A typical layout: `.proto` files under `api/proto/<pkg>/<version>/`,
generated stubs under `api/gen/go/...`, service implementations under
`internal/grpc/services/`, server lifecycle in a service provider.

{{< callout type="tip" title="Scaffold it instead" >}}
The console ships three generators that produce the layout below in one
call - proto + impl + provider wiring, then `buf generate`:

```bash
vel make:grpc:service Foo                   # proto + impl + provider (idempotent)
vel make:grpc:rpc Foo Hello                 # unary
vel make:grpc:rpc Foo Tail   --stream       # server-stream
vel make:grpc:rpc Foo Upload --client-stream
vel make:grpc:rpc Foo Chat   --bidi
vel make:grpc:gen                           # cd api/proto && buf generate
```

Subsequent `make:grpc:service` calls inject at `// vel:grpc:imports` and
`// vel:grpc:services` markers in the generated provider. See
[CLI commands - make:grpc:*](/docs/cli/commands/#vel-makegrpcservice) for the
full reference. The rest of this page documents the runtime API that the
generated files use.
{{< /callout >}}

### Proto + buf

`api/proto/foo/v1/foo.proto`:

```proto
syntax = "proto3";

package foo.v1;

option go_package = "yourapp/api/gen/go/foo/v1;foov1";

service FooService {
  rpc Hello(HelloRequest) returns (HelloResponse);
}

message HelloRequest  { string name = 1; }
message HelloResponse { string greeting = 1; }
```

`api/proto/buf.yaml`:

```yaml
version: v2
modules:
  - path: .
lint:
  use: [STANDARD]
breaking:
  use: [FILE]
```

`api/proto/buf.gen.yaml`:

```yaml
version: v2
plugins:
  - remote: buf.build/protocolbuffers/go
    out: ../gen/go
    opt: paths=source_relative
  - remote: buf.build/grpc/go
    out: ../gen/go
    opt:
      - paths=source_relative
      - require_unimplemented_servers=false
```

Generate stubs:

```bash
cd api/proto && buf generate
```

### Service implementation

`internal/grpc/services/foo.go`:

```go
package services

import (
    "context"

    foov1 "yourapp/api/gen/go/foo/v1"
)

type FooService struct {
    foov1.UnimplementedFooServiceServer
}

func NewFooService() *FooService { return &FooService{} }

func (s *FooService) Hello(ctx context.Context, req *foov1.HelloRequest) (*foov1.HelloResponse, error) {
    name := req.GetName()
    if name == "" {
        name = "world"
    }
    return &foov1.HelloResponse{Greeting: "hi " + name}, nil
}
```

### Service provider

`internal/providers/grpc_provider.go`:

```go
package providers

import (
    "context"
    "os"

    foov1 "yourapp/api/gen/go/foo/v1"
    "yourapp/internal/grpc/services"

    "github.com/velocitykode/velocity"
    velgrpc "github.com/velocitykode/velocity/grpc"
    googleGrpc "google.golang.org/grpc"
)

type GRPCProvider struct {
    server *velgrpc.Server
}

func (p *GRPCProvider) Register(s *velocity.Services) error {
    port := os.Getenv("GRPC_PORT")
    if port == "" {
        port = "50051"
    }

    p.server = velgrpc.NewServer(
        velgrpc.WithPort(port),
        velgrpc.WithReflection(true),
        velgrpc.WithLogger(s.Log),
    )

    foo := services.NewFooService()
    p.server.RegisterService(func(srv interface{}) {
        foov1.RegisterFooServiceServer(srv.(*googleGrpc.Server), foo)
    })

    return nil
}

func (p *GRPCProvider) Boot(s *velocity.Services) error {
    if err := p.server.Build(); err != nil {
        return err
    }
    return p.server.StartAsync()
}

func (p *GRPCProvider) Shutdown(ctx context.Context) error {
    return p.server.Shutdown(ctx)
}
```

Register the provider alongside the rest of the app's providers. `Build`
applies interceptors and registered services to the underlying
`*google.golang.org/grpc.Server`; `StartAsync` launches the listener in a
background goroutine so the rest of the app boot continues. `Shutdown`
drains in-flight RPCs with the supplied ctx deadline.

## Server

```go
srv := grpc.NewServer(
    grpc.WithPort("50051"),
    grpc.WithEnvironment("production"),   // force-disables reflection
    grpc.WithReflection(true),            // enable reflection in dev
    grpc.WithMaxRecvMsgSize(4<<20),
    grpc.WithMaxSendMsgSize(4<<20),
    grpc.WithLogger(v.Log),
)
```

### Interceptors

Unary and stream interceptors follow standard gRPC signatures:

```go
srv.Use(
    authInterceptor,
    loggingInterceptor,
    recoveryInterceptor,
)

srv.UseStream(streamAuthInterceptor)
```

Mixed pairs:

```go
srv.UseAll(
    grpc.InterceptorPair{Unary: authUnary, Stream: authStream},
)
```

### Bundled interceptors

`grpc/interceptors` ships paired (unary + stream) implementations for the
common middleware spine. Each returns an `InterceptorPair`, so `UseAll` wires
both sides:

```go
import (
    "github.com/velocitykode/velocity/grpc/interceptors"
    "github.com/velocitykode/velocity/grpc/grpcevents"
)

srv.UseAll(
    interceptors.Recovery(
        interceptors.WithRecoveryLogger(s.Log),
        interceptors.WithStackTrace(true),
        interceptors.WithRecoveryEventDispatcher(eventDispatcher),
    ),
    interceptors.Logging(
        interceptors.WithLoggingLogger(s.Log),
        interceptors.WithSlowThreshold(500*time.Millisecond),
        interceptors.WithSkipHealthChecks(true),
        interceptors.WithEventDispatcher(eventDispatcher),
    ),
    interceptors.Auth(validator,
        interceptors.WithPublicMethods("/foo.v1.FooService/Hello"),
        interceptors.WithAuthEventDispatcher(eventDispatcher),
    ),
)
```

`validator` implements `interceptors.AuthValidator`: given a token, return
the resolved `Claims` or an error. `WithPublicMethods` bypasses auth on
listed full-method paths. `WithTokenExtractor` overrides the default
`authorization: Bearer ...` parser.

Each constructor accepts `WithEventDispatcher` (and variants) to wire the
matching `grpcevents` event onto a domain bus. The dispatchers also start
or continue a trace span on entry, so `RequestStarted` /
`RequestCompleted` / `RequestFailed` ship `TraceID` / `SpanID` /
`ParentID` (the standard 3-field convention).

### Registering services

```go
srv.RegisterService(func(s any) {
    pb.RegisterUsersServer(s.(*googleGrpc.Server), usersImpl)
})
```

The closure receives the underlying `*grpc.Server` - use it to call
generated `Register*` functions.

### Running

```go
if err := srv.Build(); err != nil {
    return err
}

if err := srv.Start(); err != nil {  // blocks
    return err
}
```

Non-blocking:

```go
if err := srv.StartAsync(); err != nil {
    return err
}

// later
srv.GracefulStop()
```

`Shutdown(ctx)` waits for in-flight RPCs with a deadline; `Stop` is
immediate.

## RPC types

gRPC has four method shapes. The framework treats all of them uniformly:
register the service with `srv.RegisterService`, the bundled interceptors
trace both unary and stream RPCs via paired `Unary` + `Stream`
implementations.

**Three things change per shape, one thing stays the same:**

| Concern | Unary | Server stream | Client stream | Bidi stream |
|---|---|---|---|---|
| Proto `stream` keyword | none | on response | on request | on both |
| Generated handler signature | `(ctx, *Req) (*Resp, error)` | `(*Req, Stream) error` | `(Stream) error` | `(Stream) error` |
| Where ctx comes from | parameter | `stream.Context()` | `stream.Context()` | `stream.Context()` |
| How responses flow | `return resp, nil` | `stream.Send(resp)` N times | `stream.SendAndClose(resp)` | `stream.Send(resp)` N times |
| How requests arrive | parameter | parameter | `stream.Recv()` until EOF | `stream.Recv()` until EOF |
| `srv.RegisterService` wiring | identical | identical | identical | identical |

Same proto file declares all four with the `stream` keyword in the right
position:

```proto
service FooService {
  rpc Hello(HelloRequest)        returns (HelloResponse);          // unary
  rpc Tail(HelloRequest)         returns (stream HelloResponse);   // server stream
  rpc Upload(stream HelloRequest) returns (HelloResponse);         // client stream
  rpc Chat(stream HelloRequest)  returns (stream HelloResponse);   // bidi
}
```

`buf generate` produces matching server-side handler signatures; the
service impl below has one method per RPC, each with the signature shape
its row prescribes. Registration is unchanged:

```go
foov1.RegisterFooServiceServer(srv, fooImpl) // same call regardless of mix
```

### Unary

One request, one response. Standard request/response RPC.

**Use cases:**

- CRUD endpoints (`GetUser`, `CreateOrder`, `UpdateProfile`)
- Auth handshake (`Login`, `RefreshToken`)
- Internal service-to-service calls (`ChargeCard`, `SendReceipt`)
- Synchronous validation / pricing / risk-score lookups
- Anything that fits a REST `GET` / `POST` mental model

```proto
service ChatService {
  rpc SendMessage(SendMessageRequest) returns (SendMessageResponse);
}
```

```go
func (s *ChatService) SendMessage(ctx context.Context, req *pb.SendMessageRequest) (*pb.SendMessageResponse, error) {
    msg, err := s.messages.Create(ctx, req.GetBody())
    if err != nil {
        return nil, velgrpc.WrapError(err)
    }
    return &pb.SendMessageResponse{Id: msg.ID}, nil
}
```

### Server streaming

One request, many responses.

**Use cases:**

- Log / metric tailing (`TailLogs(filter)` streams new lines as they arrive)
- Server-pushed notifications (`Subscribe(topic)` for chat, alerts, presence)
- Large result sets streamed in chunks (`Export(query)` without materialising
  the full set in memory)
- Progress updates for long-running jobs (`RunBuild(jobID)` emits stage events)
- Server-Sent-Events replacement on the gRPC wire

```proto
service ChatService {
  rpc Subscribe(SubscribeRequest) returns (stream Message);
}
```

```go
func (s *ChatService) Subscribe(req *pb.SubscribeRequest, stream pb.ChatService_SubscribeServer) error {
    ctx := stream.Context()
    sub, err := s.pubsub.Subscribe(ctx, req.GetTopic())
    if err != nil {
        return velgrpc.WrapError(err)
    }
    defer sub.Close()

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case msg, ok := <-sub.Ch():
            if !ok {
                return nil
            }
            if err := stream.Send(&pb.Message{Body: msg.Body}); err != nil {
                return err
            }
        }
    }
}
```

Honor `stream.Context().Done()`: the client may cancel mid-stream, and
the framework's recovery interceptor will not save a handler that
ignores cancellation.

### Client streaming

Many requests, one response.

**Use cases:**

- Bulk ingestion (`UploadEvents`, `UploadMetrics`, `UploadRows`)
- File upload chunked over the wire (`PutObject` streams blob chunks,
  returns a single ack with the resolved object id)
- Telemetry batching from edge agents into a central collector
- Aggregation / reduce APIs (`ComputeStats` consumes many samples,
  returns one summary)
- Anything the client can produce incrementally but the server only needs
  to acknowledge once at the end

```proto
service IngestService {
  rpc UploadEvents(stream Event) returns (UploadEventsResponse);
}
```

```go
func (s *IngestService) UploadEvents(stream pb.IngestService_UploadEventsServer) error {
    var count int64
    for {
        evt, err := stream.Recv()
        if err == io.EOF {
            return stream.SendAndClose(&pb.UploadEventsResponse{Accepted: count})
        }
        if err != nil {
            return err
        }
        if err := s.store.Append(stream.Context(), evt); err != nil {
            return velgrpc.WrapError(err)
        }
        count++
    }
}
```

`stream.SendAndClose` ends the RPC on the success path. Returning an
error short-circuits the stream with that status.

### Bidirectional streaming

Many requests, many responses, fully interleaved.

**Use cases:**

- Chat / DMs / presence (`Connect()` carries inbound messages and
  outbound deliveries on one long-lived stream)
- Interactive shells / remote exec (`Exec()` ships stdin chunks, returns
  stdout/stderr chunks)
- Live collaboration (CRDT / OT sync, multi-cursor editors)
- Pub/sub bridges where the client both publishes and subscribes on the
  same connection
- Real-time game / robotics control loops (client sends inputs, server
  sends state updates at its own cadence)

```proto
service ChatService {
  rpc Connect(stream ClientFrame) returns (stream ServerFrame);
}
```

```go
func (s *ChatService) Connect(stream pb.ChatService_ConnectServer) error {
    ctx := stream.Context()

    // Outbound pump: server -> client
    outbound := make(chan *pb.ServerFrame, 16)
    go func() {
        defer close(outbound)
        s.fanIn(ctx, outbound) // implementation-specific
    }()

    // Inbound pump runs on the request goroutine; send loop pulls from `outbound`.
    inboundErr := make(chan error, 1)
    go func() {
        for {
            frame, err := stream.Recv()
            if err != nil {
                inboundErr <- err
                return
            }
            if err := s.handle(ctx, frame); err != nil {
                inboundErr <- err
                return
            }
        }
    }()

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case err := <-inboundErr:
            if err == io.EOF {
                return nil
            }
            return err
        case frame, ok := <-outbound:
            if !ok {
                return nil
            }
            if err := stream.Send(frame); err != nil {
                return err
            }
        }
    }
}
```

`stream.Recv()` and `stream.Send()` are independently safe to call from
different goroutines, but `Recv` from two goroutines or `Send` from two
goroutines is undefined; serialise each direction.

{{< callout type="warning" title="HTTP gateway and streams" >}}
grpc-gateway proxies unary RPCs cleanly and supports server-streaming via
server-sent events / chunked responses. Client-streaming and
bidirectional-streaming RPCs are NOT exposed through the gateway by
default - mark them gateway-skip in your annotations or expose them only
on the native gRPC port.
{{< /callout >}}

## HTTP gateway (grpc-gateway)

Expose the same service over REST:

```go
gw := grpc.NewGateway(
    grpc.GatewayWithPort("8080"),
    grpc.GatewayWithGRPCEndpoint("localhost:50051"),
    grpc.GatewayWithInsecure(),  // or GatewayWithTLS(certFile)
    grpc.GatewayWithLogger(v.Log),
)

gw.RegisterHandler(pb.RegisterUsersHandlerFromEndpoint)

if err := gw.Build(context.Background()); err != nil {
    return err
}

// HTTP middleware chains applied to the gateway mux
gw.Use(cors.Default().Handler, requestLogger)

gw.StartAsync()
```

`gw.Mux()` returns the underlying `runtime.ServeMux` if you need to
attach custom handlers alongside the generated ones.

## Context helpers

### Claims

A `Claims` value carries authenticated user data:

```go
ctx = grpc.ContextWithClaims(ctx, Claims{UserID: 42, TeamID: 7})

claims := grpc.ClaimsFromContext(ctx)       // safe: returns zero value if absent
claims := grpc.MustClaimsFromContext(ctx)   // panics if absent - use in auth'd handlers

userID := grpc.UserIDFromContext(ctx)       // shortcut
teamID := grpc.TeamIDFromContext(ctx)
```

Attach them in an auth interceptor before the handler runs.

### Request ID

```go
ctx = grpc.ContextWithRequestID(ctx, grpc.GenerateRequestID())
id := grpc.RequestIDFromContext(ctx)
```

### Method name

```go
ctx = grpc.ContextWithMethod(ctx, info.FullMethod)
method := grpc.MethodFromContext(ctx)
```

Useful inside logging interceptors that run below the method dispatch.

### Metadata helpers

```go
token  := grpc.ExtractBearerToken(ctx)       // from "authorization: Bearer ..."
value  := grpc.ExtractMetadata(ctx, "x-tenant-id")
values := grpc.ExtractAllMetadata(ctx, "x-forwarded-for")
```

## Errors

Typed constructors produce standard `google.golang.org/grpc/status`
errors:

```go
return nil, grpc.NotFound("user not found")
return nil, grpc.NotFoundf("user %d", id)
return nil, grpc.InvalidArgument("id required")
return nil, grpc.Unauthenticated("missing token")
return nil, grpc.PermissionDenied("not your team")
return nil, grpc.AlreadyExists("duplicate email")
return nil, grpc.FailedPrecondition("invoice already finalized")
return nil, grpc.ResourceExhausted("quota exceeded")
return nil, grpc.Unavailable("downstream timeout")
return nil, grpc.Internal("bug")
```

All wrap `codes.Code` under the hood.

### Inspecting errors

```go
if grpc.IsNotFound(err) {
    // handle
}

switch grpc.Code(err) {
case codes.NotFound:         // ...
case codes.InvalidArgument:  // ...
}

msg := grpc.Message(err)        // unwrap status message
status := grpc.FromError(err)   // raw *status.Status
```

### Wrapping existing errors

```go
if err := db.Find(&user); err != nil {
    return nil, grpc.WrapError(err)  // maps stdlib errors → grpc codes
}

return nil, grpc.WrapErrorWithCode(err, codes.FailedPrecondition)
```

## Reflection in production

When `WithEnvironment("production")` is set, `WithReflection(true)` is
silently ignored - reflection is force-disabled so gRPC service
introspection isn't exposed to untrusted callers.

## Health checks

The package includes a standard gRPC health service registration
helper - see `health.go` for `RegisterHealthService(s *Server)`. Pair
it with your load balancer's gRPC health probes.

## Events

`grpc/grpcevents` defines the events the bundled interceptors and the
server lifecycle dispatch. Wire a dispatcher via `Server.SetEventDispatcher`
(or pass the matching `With*EventDispatcher` option into each bundled
interceptor) and route them onto the framework event bus:

| Event | When |
|---|---|
| `ServerStarted` / `ServerStopped` | Server lifecycle |
| `GatewayStarted` / `GatewayStopped` | HTTP gateway lifecycle |
| `RequestStarted` / `RequestCompleted` / `RequestFailed` | Unary RPC lifecycle (carries `TraceID` / `SpanID` / `ParentID`) |
| `StreamStarted` / `StreamCompleted` / `StreamFailed` | Stream RPC lifecycle (same trace fields) |
| `PanicRecovered` | `Recovery` interceptor caught a panic |
| `AuthFailed` | `Auth` interceptor rejected a token (token is masked) |

```go
srv.SetEventDispatcher(func(ctx context.Context, evt any) error {
    return s.Events.Dispatch(ctx, evt)
})
```

`Protocol` ("grpc" or "http") on each request/stream event identifies
whether the call entered through the native gRPC server or the HTTP
gateway.

## Converters

`grpc/converters` ships helpers for the two most common proto <-> Go
gaps:

```go
import "github.com/velocitykode/velocity/grpc/converters"

// time.Time <-> *timestamppb.Timestamp
ts := converters.TimeValueToProto(user.CreatedAt)
t  := converters.ProtoToTimeValue(req.GetCreatedAt())

// time.Duration <-> *durationpb.Duration
d  := converters.DurationToProto(15 * time.Minute)
dur := converters.ProtoToDuration(req.GetTimeout())

// Offset pagination
page := converters.NormalizePagination(req.GetPage(), req.GetPageSize())
resp := converters.NewPaginationResponse(page.Page, page.PageSize, totalItems)

// Cursor pagination
cp := converters.NormalizeCursorPagination(req.GetCursor(), req.GetLimit())
cr := converters.NewCursorResponse(nextCursor, prevCursor, hasMore, int(cp.Limit))
```

`NormalizePagination` clamps page / page-size to sane defaults so handlers
don't have to defensively validate. `CalculateTotalPages` and the cursor
helpers cover the remaining bookkeeping.
