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

// No Register() call needed — the bus falls back to the Handle method.
b.Dispatch(SendReminder{UserID: 42})
```

## Middleware

Middleware is a `pipeline.Stage[Command]` — use `bus.Middleware` to
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
b.SetQueueName("notifications") // optional — otherwise default queue

b.DispatchAsync(SendReminder{UserID: 42})
```

The command is wrapped as a queue job; when the worker picks it up it
calls `Dispatch` internally so the same handler + middleware chain
runs.

## Events

Every dispatch emits lifecycle events:

- `*bus.CommandDispatching` — before the handler runs
- `*bus.CommandCompleted` — on success
- `*bus.CommandFailed` — on handler error
- `*bus.CommandQueued` — on `DispatchAsync`

Wire the dispatcher:

```go
b.SetEventDispatcher(v.Events.Dispatch)
```

## Testing

`FakeBus` records dispatched commands without running handlers — handy
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

- `AssertDispatched(cmd)` — at least one command of that type was dispatched
- `AssertDispatchedTimes(cmd, n)` — exactly n times
- `AssertNotDispatched(cmd)` — zero times
- `AssertNothingDispatched()` — no commands at all
- `AssertAsyncDispatched(cmd)` — dispatched via `DispatchAsync`
- `GetDispatched()` / `ClearDispatched()` — inspect or reset the log
