---
title: Transactional Outbox
description: Atomically commit side effects (queue jobs, events) alongside database writes using the outbox pattern, with a built-in relay for delivery, retries, and DLQ.
weight: 60
---

The outbox pattern lets you commit a side effect (a queue job, a domain event) in the *same SQL transaction* as the database row that triggered it. If the transaction commits, the side effect is guaranteed to be delivered eventually. If it rolls back, the side effect disappears with it. No more "we charged the card but the email never went out because the request died between commit and queue.Push."

Velocity ships the producer (`Manager.TransactionWithOutbox`) and the consumer (`orm.Relay`) in the `orm` package.

## When to reach for it

- After-the-fact emails / webhooks / push notifications that must fire if and only if the user write succeeded.
- Domain events fanned out to other services where "fire and forget" cannot drop messages.
- Cross-system effects in a service that does not own a distributed transaction coordinator.

If the side effect is purely in-process and a dropped message after a crash is acceptable, reach for [`async.Go`](/docs/core/async/) or the [queue](/docs/core/queue/) directly. The outbox is the heavier hammer for "must not lose."

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

## Consumer side: the relay

`orm.Relay` polls the outbox table, claims ready rows with a lease + conditional UPDATE (no `SKIP LOCKED` required), decodes the payload, and invokes one of two callbacks:

```go
relay := orm.NewRelay(manager, orm.RelayCallbacks{
    OnJob: func(ctx context.Context, payload any, payloadType, idempotencyKey string) error {
        return queueDriver.Push(ctx, payload)
    },
    OnEvent: func(ctx context.Context, payload any, payloadType, idempotencyKey string) error {
        return events.Dispatch(ctx, payload)
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

## Related

- [Global Query Scopes](/docs/database/scopes/) - the other ORM primitive shipped alongside the outbox; soft-delete is implemented on top of it
- [CRUD](/docs/database/crud/) - regular `Manager.Transaction` for writes that do not need a side-effect commit
- [Queue](/docs/core/queue/) - durable background jobs the relay's `OnJob` callback typically pushes into
- [Events](/docs/core/events/) - in-process event dispatcher the `OnEvent` callback typically forwards to
