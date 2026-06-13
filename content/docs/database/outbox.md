---
title: Transactional Outbox
description: Atomically commit side effects (queue jobs, events) alongside database writes using the outbox pattern, with a built-in relay for delivery, retries, and DLQ.
weight: 60
---

The outbox pattern lets you commit a side effect (a queue job, a domain event) in the *same SQL transaction* as the database row that triggered it. If the transaction commits, the side effect is guaranteed to be delivered eventually. If it rolls back, the side effect disappears with it. No more "we charged the card but the email never went out because the request died between commit and queue.Push."

Velocity ships the producer (`Manager.TransactionWithOutbox`) and the consumer (`orm.Relay`) in the `orm` package. For lighter-weight post-commit side effects that do not need durable redelivery (cache invalidation, fire-and-forget webhooks, in-process domain events), reach for the transaction callbacks API: `orm.OnCommit` / `orm.OnRollback` / `orm.OnCommitFailure`.

## When to reach for it

- After-the-fact emails / webhooks / push notifications that must fire if and only if the user write succeeded.
- Domain events fanned out to other services where "fire and forget" cannot drop messages.
- Cross-system effects in a service that does not own a distributed transaction coordinator.

If the side effect is purely in-process and a dropped message after a crash is acceptable, reach for [`async.Go`](/docs/core/async/), the [queue](/docs/core/queue/), or `orm.OnCommit` (see [Post-commit callbacks](#post-commit-callbacks-oncommit--onrollback--oncommitfailure) below). The outbox is the heavier hammer for "must not lose."

## Schema setup

Outbox rows live in a single table named `velocity_outbox`. Create it via the helper before starting any producers or relays:

```go
if err := manager.EnsureOutboxTable(ctx); err != nil {
    log.Fatal(err)
}
```

`EnsureOutboxTable` is idempotent (uses `CREATE TABLE IF NOT EXISTS`) and emits driver-aware DDL for SQLite, MySQL, and Postgres. If you prefer to drive your own migrations, pull the statements from `orm.OutboxMigrationSQL(driverName)` and wrap them in your usual migration tooling.

The exported constants `orm.OutboxTableName`, `orm.OutboxKindJob`, and `orm.OutboxKindEvent` are useful for admin tooling that inspects the table directly.

## Producer side

`Manager.TransactionWithOutbox` runs your callback inside a database transaction and hands you a `Pending` handle whose `Enqueue` and `Dispatch` methods record outbox rows on the same `*sql.Tx`. The rows commit (or roll back) atomically with your writes.

```go
type OrderPlaced struct {
    OrderID  uint
    Customer string
    Total    int64
}

// Once at startup, before producers run:
orm.RegisterPayloadType(OrderPlaced{})

err := manager.TransactionWithOutbox(ctx, func(tx *sql.Tx, outbox orm.Pending) error {
    if _, err := tx.ExecContext(ctx,
        "INSERT INTO orders (customer, total) VALUES (?, ?)",
        order.Customer, order.Total,
    ); err != nil {
        return err
    }

    // Recorded on the same tx. Commits with the order, rolls back with it.
    if _, err := outbox.Dispatch(OrderPlaced{
        OrderID:  order.ID,
        Customer: order.Customer,
        Total:    order.Total,
    }); err != nil {
        return err
    }
    return nil
})
```

`Pending.Enqueue` records a row to be delivered to your queue driver; `Pending.Dispatch` records an event for the events dispatcher. Both return the row id assigned by the database.

{{< callout type="info" title="Register payload types" >}}
Payloads are encoded with `encoding/gob` and base64-wrapped into a `TEXT` column. Every concrete type passed to `Enqueue` or `Dispatch` must be registered with `orm.RegisterPayloadType` before the relay starts, otherwise decode fails at delivery time. The call is idempotent and safe for concurrent use.
{{< /callout >}}

### Per-row options

```go
outbox.Enqueue(payload,
    orm.WithIdempotencyKey("order-placed-" + order.UUID),
    orm.WithPartitionKey("customer-" + order.Customer),
    orm.WithMaxAttempts(10),
    orm.WithAvailableAt(time.Now().Add(30 * time.Second)),
)
```

- `WithIdempotencyKey(key)` overrides the auto-generated 128-bit hex key. Duplicate keys hit a unique index and surface as a SQL error, useful when the producer is itself replayable.
- `WithPartitionKey(key)` opts the row into per-partition FIFO. The relay never leases two rows from the same partition concurrently and processes them in id order. Use the entity id (`"order-42"`) when downstream order matters.
- `WithMaxAttempts(n)` sets the per-row retry ceiling before the row moves to the DLQ. Defaults to 5.
- `WithAvailableAt(t)` schedules the first delivery attempt. Defaults to "now."

### Panic handling

A panic inside the `TransactionWithOutbox` callback is converted to an error and the transaction is rolled back. The panic is *not* re-raised, callers handle the failure as an ordinary error per the framework's "no panics in library code" rule.

## Post-commit callbacks: `OnCommit` / `OnRollback` / `OnCommitFailure`

The transactional outbox is the right tool when a side effect must survive a process crash. For everything else (cache invalidation, in-process events, fire-and-forget webhooks, audit emits) the lighter primitive is the transaction callbacks API: register a function inside the transaction, have it fire only after the tx terminates.

```go
ctx = orm.PrepareTxCallbacks(ctx)

err := mgr.Transaction(ctx, func(ctx context.Context) error {
    if _, err := (Order{}).Create(ctx, map[string]any{
        "customer": "alice",
        "total":    1299,
    }); err != nil {
        return err
    }

    // Fires only if the surrounding tx commits successfully.
    return orm.OnCommit(ctx, func(ctx context.Context) error {
        cache.Forget(ctx, "orders:alice")
        return nil
    })
})
```

Three registration helpers, all ctx-first and all keyed off the per-tx callbacks slot installed by `Manager.Transaction`:

- `orm.OnCommit(ctx, fn)` fires after `tx.Commit` returns successfully. Canonical place for cache invalidation, post-commit webhook publish, in-process event fanout, audit emits.
- `orm.OnRollback(ctx, fn)` fires after a confirmed rollback (closure returned an error, or a panic-driven rollback succeeded, or ctx cancellation triggered the rollback). Use for compensations: clearing in-memory reservations, releasing external locks held outside the database.
- `orm.OnCommitFailure(ctx, fn)` fires when `tx.Commit` returns an error. The tx is in an *ambiguous* state (see below). Receives the commit error so app code can branch on driver-specific SQLSTATE codes.

`orm.PrepareTxCallbacks(ctx)` wraps the incoming ctx with a holder slot so the registration helpers can find the active list. Call it once near the request boundary (typically at the top of an HTTP handler, before any `Transaction` call). It is idempotent and safe to call multiple times.

{{< callout type="warning" title="Ambiguous commit: do NOT re-enqueue" >}}
`OnCommitFailure` runs because `tx.Commit` returned an error. That does **not** mean the database rolled back, the network may have failed *after* the database persisted the change but *before* the client received the OK. Re-enqueuing outbox jobs or aggressively invalidating caches in this branch risks duplicate work or stale reads. The safe default is to **log the ambiguity and leave outboxes / caches untouched**; only branch on driver-specific error codes (`pq.Error.Code`, lib/pq's `CommitNotConfirmed`, libpq SQLSTATE) when you have a verified-rolled-back signal.
{{< /callout >}}

### Semantics in one place

- **Hook ctx is detached from cancellation.** Each callback receives a ctx wrapped in `context.WithoutCancel` so trace IDs and request-scoped values flow through, but a parent-ctx deadline does not poison the post-commit cascade. Most rollbacks are triggered *by* a canceled parent ctx; propagating that cancellation would silently drop every subsequent compensation.
- **Savepoints (nested `Transaction`) defer to the outer tx.** Inner `OnCommit` registrations queue onto the outer list. Releasing a savepoint does **not** fire commit hooks; only the outermost `tx.Commit` drains them.
- **A panic inside a hook is isolated.** It is recovered, surfaced as a `TxRecover` event through the manager's dispatcher, logged when a logger is wired, and falls back to stderr only when neither sink exists. Subsequent callbacks still run.
- **Commit-error path runs `OnCommitFailure` only.** Rollback hooks do **not** fire on commit error (the tx state is ambiguous; running rollback compensations would corrupt outboxes / caches).
- **Ctx cancellation that triggers rollback fires `OnRollback`.** A request-abort or deadline that causes the closure to return early still drains rollback hooks, with the detached hook ctx so they actually run.
- **Auto-commit (no surrounding `Transaction`) fires `AfterCommit` inline.** When a model is `Save`d outside `Manager.Transaction`, the implicit auto-commit has already happened by the time `Save` returns, so the model's `AfterCommit` hook fires synchronously before `Save` returns. `AfterRollback` never fires on this path (there is nothing to roll back).

### Auto-registering hooks on a model

Models that implement `AfterCommitHook` or `AfterRollbackHook` get the corresponding callback registered automatically every time the model is `Save`d:

```go
type Order struct {
    orm.Model[Order]
    Customer string
    Total    int64
}

func (o *Order) AfterCommit(ctx context.Context) error {
    return dispatcher.Dispatch(ctx, OrderPlaced{ID: o.ID, Customer: o.Customer})
}

func (o *Order) AfterRollback(ctx context.Context) error {
    inMemReservations.Release(o.Customer)
    return nil
}
```

Inside a `Manager.Transaction` the hook registers against the surrounding callback list and fires on commit (or rollback). Outside a transaction, `AfterCommit` fires inline once the implicit auto-commit returns. Errors returned by the hook are logged but never propagated to the original caller, by the time the hook runs the row is already durable.

### When to pick the outbox vs. `OnCommit`

| Need | Pick |
| --- | --- |
| Side effect must survive a process crash between commit and dispatch | **Outbox** (`TransactionWithOutbox` + relay) |
| Fan-out to another service over the network with at-least-once delivery | **Outbox** |
| Per-partition FIFO ordering, idempotency keys, retries with DLQ | **Outbox** |
| Fire-and-forget cache invalidation after commit | `OnCommit` |
| In-process event dispatch on commit | `OnCommit` (or the per-tx event buffer, see below) |
| Compensation work on rollback (release external locks, clear in-memory state) | `OnRollback` |
| Observe ambiguous-commit failures without re-enqueuing | `OnCommitFailure` |

## Buffered domain events at the tx boundary

`Manager.Transaction` installs a per-transaction `events.BufferedDispatcher` on the incoming ctx. Any `events.Buffer(ctx).Dispatch(ctx, ...)` call inside the closure records the event but does not fire it; the buffer flushes on commit (using the parent tx's ctx so listeners observe trace IDs) and is dropped on rollback.

Every `Listener.Handle` and every `Dispatcher.Dispatch` / `DispatchNow` / `DispatchAsync` / `DispatchAfter` / `Until` takes `ctx` as its first positional argument, so listeners observe request-scoped values when the buffered events flush.

```go
ctx = events.PrepareBuffer(ctx)
ctx = orm.PrepareTxCallbacks(ctx)

err := mgr.Transaction(ctx, func(ctx context.Context) error {
    if _, err := (Order{}).Create(ctx, map[string]any{
        "customer": "alice",
        "total":    1299,
    }); err != nil {
        return err
    }

    // Recorded into the per-tx buffer. Fires on commit; dropped on rollback.
    return events.Buffer(ctx).Dispatch(ctx, OrderPlaced{Customer: "alice"})
})
```

Nested `Transaction` calls reuse the outermost buffer (savepoint semantics): inner rollback drops only events emitted within the inner scope, outer commit flushes the rest.

## Consumer side: the relay

`orm.Relay` polls the outbox table, claims ready rows with a lease + conditional UPDATE (no `SKIP LOCKED` required), decodes the payload, and invokes one of two callbacks:

```go
relay := orm.NewRelay(manager, orm.RelayCallbacks{
    OnJob: func(ctx context.Context, payload any, payloadType, idempotencyKey string) error {
        return queueDriver.Push(ctx, payload)
    },
    OnEvent: func(ctx context.Context, payload any, payloadType, idempotencyKey string) error {
        return dispatcher.Dispatch(ctx, payload)
    },
}, orm.RelayConfig{
    PollInterval:  time.Second,
    LeaseDuration: 30 * time.Second,
    BatchSize:     32,
    WorkerCount:   4,
    MaxAttempts:   5,
    BackoffBase:   time.Second,
    BackoffMax:    5 * time.Minute,
})

if err := relay.Start(ctx); err != nil {
    log.Fatal(err)
}
defer relay.Stop(context.Background())
```

`Start(ctx)` launches the polling loop and returns immediately. Cancel the parent ctx or call `Stop(ctx)` to wind down: in-flight workers run to completion, bounded by `cfg.ShutdownGrace` (default 5s). After the grace window the relay's internal shutdown ctx is cancelled, interrupting any callback or DB writeback still in flight so `Stop` cannot hang indefinitely.

Multiple relay processes may run against the same table concurrently. Row claim uses an atomic conditional UPDATE (`leased_until IS NULL OR leased_until <= now`), so only one relay handles a row at a time even on SQLite where `SKIP LOCKED` does not exist.

### Backoff

Failed deliveries are scheduled for retry with exponential backoff capped at `BackoffMax`. The base and ceiling default to 1s and 5m respectively, matching the shape of [`queue/backoff`](/docs/core/queue/). Tune via `RelayConfig.BackoffBase` / `RelayConfig.BackoffMax`.

### DLQ

When `attempts >= MaxAttempts` the row's `dlq` column flips to true and the relay stops attempting it. DLQ rows are not visible to the polling query and never lease again until you replay them:

```go
if err := relay.Replay(ctx, rowID); err != nil {
    if errors.Is(err, orm.ErrOutboxRowNotFound) {
        // gone, e.g. already cleaned up
    }
    return err
}
```

`Replay` resets `attempts` to zero, clears the lease, sets `available_at = now`, and clears the DLQ flag so the next poll picks it up.

For inspection / admin tooling, `Manager.ListOutboxRows(ctx, limit)` returns `[]OutboxRowSnapshot` (id, kind, attempts, dlq, last error, leased_by, ...) and `Manager.CountOutboxRows(ctx)` returns the total row count. Snapshots do not include the payload, that stays opaque.

## Recipe: Atomic order placement with outbox event

A complete producer/consumer wiring for "place an order, fan out an `order.placed` event."

```go
package orders

import (
    "context"
    "database/sql"
    "log"
    "time"

    "github.com/velocitykode/velocity/orm"
)

type OrderPlaced struct {
    OrderID  uint
    Customer string
    Total    int64
    PlacedAt time.Time
}

// At app startup, before any TransactionWithOutbox call:
func init() {
    orm.RegisterPayloadType(OrderPlaced{})
}

// Producer: invoked from the HTTP handler.
func PlaceOrder(ctx context.Context, mgr *orm.Manager, customer string, total int64) error {
    return mgr.TransactionWithOutbox(ctx, func(tx *sql.Tx, outbox orm.Pending) error {
        var orderID uint
        if err := tx.QueryRowContext(ctx,
            "INSERT INTO orders (customer, total, placed_at) VALUES (?, ?, ?) RETURNING id",
            customer, total, time.Now().UTC(),
        ).Scan(&orderID); err != nil {
            return err
        }

        _, err := outbox.Dispatch(OrderPlaced{
            OrderID:  orderID,
            Customer: customer,
            Total:    total,
            PlacedAt: time.Now().UTC(),
        }, orm.WithPartitionKey("customer-"+customer))
        return err
    })
}

// Consumer: relay started once at app startup.
func StartRelay(ctx context.Context, mgr *orm.Manager) (*orm.Relay, error) {
    relay := orm.NewRelay(mgr, orm.RelayCallbacks{
        OnEvent: func(ctx context.Context, payload any, _ , idem string) error {
            evt, ok := payload.(OrderPlaced)
            if !ok {
                log.Printf("outbox: unexpected payload type %T", payload)
                return nil // permanent failure, don't retry
            }
            return notifyDownstream(ctx, evt, idem)
        },
    }, orm.RelayConfig{})

    return relay, relay.Start(ctx)
}
```

Because the `Dispatch` call lives inside the same transaction as the `INSERT`, the event row is durable the moment the order row is durable, and gone if the order is gone. The `WithPartitionKey("customer-"+customer)` ensures multiple events for the same customer are delivered in order, even when several relay workers are draining the table.

## Recipe: ORM write + outbox emit on commit

When the producer is using the ORM (not raw `*sql.Tx`), the cleanest pattern is `Manager.Transaction` for the write plus `orm.OnCommit` to enqueue an outbox row only on confirmed commit. The handler stays ctx-first, the side effect inherits the same trace ID, and the ambiguous-commit branch is left to the safe default (do nothing).

```go
func PlaceOrder(ctx context.Context, mgr *orm.Manager, customer string, total int64) error {
    ctx = orm.PrepareTxCallbacks(ctx)

    return mgr.Transaction(ctx, func(ctx context.Context) error {
        order, err := (Order{}).Create(ctx, map[string]any{
            "customer": customer,
            "total":    total,
        })
        if err != nil {
            return err
        }

        // Confirmed commit: hand the work off to the durable outbox.
        if err := orm.OnCommit(ctx, func(ctx context.Context) error {
            return mgr.TransactionWithOutbox(ctx, func(tx *sql.Tx, outbox orm.Pending) error {
                _, err := outbox.Dispatch(OrderPlaced{
                    OrderID:  order.ID,
                    Customer: customer,
                    Total:    total,
                }, orm.WithPartitionKey("customer-"+customer))
                return err
            })
        }); err != nil {
            return err
        }

        // Ambiguous commit: log only. NEVER re-enqueue here, the DB may
        // have committed the order row even though Commit returned err.
        return orm.OnCommitFailure(ctx, func(ctx context.Context, commitErr error) error {
            log.Printf("order commit ambiguous; outbox NOT re-enqueued: customer=%s error=%v",
                customer, commitErr)
            return nil
        })
    })
}
```

For the simplest case (the outbox row and the order row in the same tx), prefer the single-pass `TransactionWithOutbox` recipe above, that pattern is strictly atomic and avoids the second tx. Reach for `OnCommit` plus `TransactionWithOutbox` only when the outbox payload depends on values that are not known until after the first tx commits (e.g. an auto-generated id you want to read back through the ORM rather than via `RETURNING`).

## Related

- [Global Query Scopes](/docs/database/scopes/) - the other ORM primitive shipped alongside the outbox; soft-delete is implemented on top of it
- [CRUD](/docs/database/crud/) - regular `Manager.Transaction` for writes that do not need a side-effect commit
- [Queue](/docs/core/queue/) - durable background jobs the relay's `OnJob` callback typically pushes into
- [Events](/docs/core/events/) - in-process event dispatcher the `OnEvent` callback typically forwards to
