---
title: gRPC
description: gRPC server and HTTP gateway with context helpers, structured errors, and interceptor-friendly APIs.
weight: 90
---

The `grpc` package wraps `google.golang.org/grpc` with Velocity
conventions — context helpers for auth/request metadata, structured
error constructors, and a sibling HTTP gateway that exposes gRPC
services over REST via grpc-gateway.

Import path: `github.com/velocitykode/velocity/grpc`

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

### Registering services

```go
srv.RegisterService(func(s any) {
    pb.RegisterUsersServer(s.(*googleGrpc.Server), usersImpl)
})
```

The closure receives the underlying `*grpc.Server` — use it to call
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
claims := grpc.MustClaimsFromContext(ctx)   // panics if absent — use in auth'd handlers

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
silently ignored — reflection is force-disabled so gRPC service
introspection isn't exposed to untrusted callers.

## Health checks

The package includes a standard gRPC health service registration
helper — see `health.go` for `RegisterHealthService(s *Server)`. Pair
it with your load balancer's gRPC health probes.
