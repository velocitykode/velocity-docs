---
title: Command Bus
description: Type-safe command dispatch with middleware, self-handling commands, and async queue delivery.
weight: 65
---

The `bus` package implements a typed command bus. Commands are plain
structs; handlers are generic functions; middleware composes through
the `pipeline` package. Commands can be dispatched synchronously or
pushed to the queue.

Import path: `github.com/velocitykode/velocity/bus`

## Commands and handlers

A command is any struct. A handler is a function with a single typed
argument:

```go
type CreateInvoice struct {
    UserID int
    Amount int
}

func handleCreateInvoice(cmd CreateInvoice) error {
    // ...
    return nil
}
```

Register the handler against the command type:

```go
b := bus.New()
bus.Register(b, handleCreateInvoice)
```

`Register` is a package-level function (not a method) because Go
generics don't allow type parameters on methods.

`Register` panics with `*contract.RegistrationError` if the handler is
nil, a handler for the same command type is already registered, or the
command type is not JSON-serializable. Serializability is probed at
registration time (a zero value is round-tripped through
`encoding/json`) so that async dispatch can never fail later with an
obscure marshal error.

## Dispatching

```go
err := b.Dispatch(CreateInvoice{UserID: 1, Amount: 5000})
```

`Dispatch` looks up the registered handler, runs any middleware, and
invokes the handler. If no handler is registered it returns an error.

### Self-handling commands

A command can carry its own handler by implementing `SelfHandling`:

```go
type SendReminder struct { UserID int }

func (c SendReminder) Handle() error {
    // send the reminder
    return nil
}

// No Register() call needed - the bus falls back to the Handle method.
b.Dispatch(SendReminder{UserID: 42})
```

## Middleware

Middleware is a `pipeline.Stage[Command]` - use `bus.Middleware` to
build one from a function:

```go
logging := bus.Middleware(func(cmd bus.Command, next func(bus.Command) error) error {
    start := time.Now()
    err := next(cmd)
    log.Info("command", "type", fmt.Sprintf("%T", cmd), "dur", time.Since(start), "err", err)
    return err
})

b.Through(logging, anotherMiddleware)
```

Stages run in order for each dispatch, wrapping the handler in a
pipeline.

`bus.LoggingMiddleware(logger)` is a ready-to-use logger stage.

## Async dispatch

Push commands to the queue to run later in a worker:

```go
b.SetQueue(v.Queue)            // anything implementing QueuePusher
b.SetQueueName("notifications") // optional - otherwise default queue

b.DispatchAsync(CreateInvoice{UserID: 1, Amount: 5000})
```

`QueuePusher` is the single-method slice of the queue driver that async
dispatch needs:

```go
type QueuePusher interface {
    PushCtx(ctx context.Context, job contract.QueueJob, queue ...string) error
}
```

Every shipped driver (memory, database, Redis) and the `queuetest`
fakes satisfy it directly.

The command is wrapped as a queue job; when the worker picks it up it
calls `Dispatch` internally so the same handler + middleware chain
runs.

The command **must be registered with `bus.Register` on this bus** before
it can be dispatched asynchronously - the registration installs the
factory the worker uses to rehydrate the command from its serialized
payload. `DispatchAsync` refuses to enqueue (returning an error) when no
factory is registered for the command type, so a missing `Register` call
is caught at the producer instead of silently routing the job to
`failed_jobs`. Self-handling commands with no `Register` call therefore
cannot be dispatched asynchronously.

`DispatchAsync` enqueues with a background context. Prefer
`DispatchAsyncCtx` so that a client disconnect, deadline, or graceful
shutdown aborts the enqueue before it reaches the backing store:

```go
b.DispatchAsyncCtx(ctx, CreateInvoice{UserID: 1, Amount: 5000})
```

### Cross-process workers

Every bus has a stable id (`b.ID()`) that is written onto every queued
job. The consumer side uses it to route hydration back through the
originating bus, which prevents cross-bus contamination when several
buses are in play (multi-tenant apps, plugin systems, per-test buses).

`bus.New()` assigns a random UUID, which is sufficient when the worker
runs in the same process as the producer (the memory driver, or a
same-process consumer of a durable driver). When the worker runs in a
**separate process** from the producer, pin a deterministic id with
`bus.NewWithID` on both sides so producer and consumer agree:

```go
b := bus.NewWithID("orders-bus")
```

`NewWithID` panics with `*contract.RegistrationError` if the id is empty
or another bus is already registered under the same id. Call `b.Close()`
to remove the bus from the registry when you are done with it; this is
optional, as the registry entry otherwise lives for the process
lifetime.

## Events

Every dispatch emits lifecycle events:

- `*bus.CommandDispatching` - before the handler runs
- `*bus.CommandCompleted` - on success
- `*bus.CommandFailed` - on handler error
- `*bus.CommandQueued` - on `DispatchAsync`

Wire the dispatcher:

```go
b.SetEventDispatcher(v.Events.Dispatch)
```

## Testing

`FakeBus` records dispatched commands without running handlers - handy
for isolating handler tests:

```go
fake := bus.NewFakeBus()
svc := NewOrderService(fake)

svc.Checkout(ctx, order)

if err := fake.AssertDispatched(SendReceipt{}); err != nil {
    t.Error(err)
}
```

Assertions available on `*FakeBus`:

- `AssertDispatched(cmd)` - at least one command of that type was dispatched
- `AssertDispatchedTimes(cmd, n)` - exactly n times
- `AssertNotDispatched(cmd)` - zero times
- `AssertNothingDispatched()` - no commands at all
- `AssertAsyncDispatched(cmd)` - dispatched via `DispatchAsync`
- `GetDispatched()` / `ClearDispatched()` - inspect or reset the log
