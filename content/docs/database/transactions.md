---
title: Transactions
description: ctx-bound transactions, savepoints, and post-commit callbacks for the Velocity ORM.
weight: 45
---

Velocity's ORM transactions are ctx-bound: `Manager.Transaction` opens a `*sql.Tx`, attaches it to the closure-supplied `ctx`, and every ORM terminal that observes that ctx (`Save`, `Create`, `Update`, `FirstOrCreate`, `UpdateOrCreate`, `CreateMany`, `Delete`, `Increment`, `Get`, `First`, `Count`, ...) auto-enrolls. There is no per-call `WithTx` decoration. Post-commit work registers via `orm.OnCommit` / `orm.OnRollback` / `orm.OnCommitFailure` (or the model-level `AfterCommit` / `AfterRollback` hooks) and runs only after the outer tx has settled.

## Closure-style transaction

```go
err := mgr.Transaction(ctx, func(ctx context.Context) error {
    user := User{Name: "Alice", Email: "alice@example.com"}
    if err := orm.Save(ctx, mgr, &user); err != nil {
        return err // -> rollback
    }

    profile := Profile{UserID: user.ID, Bio: "Builder"}
    return orm.Save(ctx, mgr, &profile)
}) // nil return -> commit
```

`fn` returning a non-nil error rolls back. Panicking rolls back and re-panics; rollback failures are logged through the manager's logger and surfaced as a `TxRecover` event with `Cause="panic"`. `fn` returning nil commits, flushes the per-tx event buffer, and drains commit callbacks.

The signature is fixed:

```go
func (m *Manager) Transaction(ctx context.Context, fn func(ctx context.Context) error) error
```

The closure receives a derived ctx, not the outer one. Use the inner ctx for every ORM call inside `fn` so the tx propagates.

## ctx carries the tx

Every ORM terminal takes ctx as its first positional argument. When that ctx carries a `*sql.Tx`, the call enrolls; otherwise it routes through the manager's pool driver. There is no per-call decoration.

```go
mgr.Transaction(ctx, func(ctx context.Context) error {
    // All four writes share one tx because they all use the inner ctx.
    if _, err := (User{}).Create(ctx, map[string]any{"email": "a@b.c"}); err != nil {
        return err
    }
    if err := orm.Save(ctx, mgr, &order); err != nil {
        return err
    }
    if _, err := (Audit{}).FirstOrCreate(ctx,
        map[string]any{"key": "user.created"},
        map[string]any{"actor": "system"},
    ); err != nil {
        return err
    }
    return orm.CreateMany(ctx, items)
})
```

Mixing tx-aware and tx-unaware writes inside the same closure is impossible without explicitly opting out. If you genuinely need a fire-and-forget side write that must commit independently of the surrounding tx (think audit / metrics), pass an explicitly non-tx ctx:

```go
mgr.Transaction(ctx, func(txCtx context.Context) error {
    if err := orm.Save(txCtx, mgr, &order); err != nil {
        return err
    }
    // Auto-commit, regardless of how the surrounding tx settles.
    return orm.Save(ctx, mgr, &MetricsRow{Kind: "order.placed"})
})
```

This is the documented opt-out. Reach for it sparingly.

## Manual transaction via Manager.Begin

```go
func (m *Manager) Begin(ctx context.Context) (*sql.Tx, error)
```

Use the closure form whenever it fits. `Begin` exists for the cases it does not: cross-goroutine SAVEPOINT issuance, integration with non-ORM SQL helpers that take their own `*sql.Tx`, lifecycle that does not match a single function scope.

```go
tx, err := mgr.Begin(ctx)
if err != nil {
    return err
}
ctx = orm.WithTxContext(ctx, tx) // every ORM call below enrolls in tx

if err := orm.Save(ctx, mgr, &order); err != nil {
    _ = tx.Rollback()
    return err
}
if err := tx.Commit(); err != nil {
    return err
}
```

`WithTxContext(ctx, tx)` is the slot Manager.Transaction wires for you. Direct callers must invoke `tx.Commit()` / `tx.Rollback()` themselves; `OnCommit` / `OnRollback` callbacks do **not** fire on this path because there is no Manager-driven boundary to drain them at. If you need post-commit work outside the closure form, register it manually after `tx.Commit()` returns nil.

## TxFromContext

Extract the underlying `*sql.Tx` for raw SQL or driver-specific calls (e.g. issuing a SAVEPOINT, running a non-ORM SQL helper that should join the same transaction):

```go
func TxFromContext(ctx context.Context) (*sql.Tx, bool)
```

```go
mgr.Transaction(ctx, func(ctx context.Context) error {
    tx, ok := orm.TxFromContext(ctx)
    if !ok {
        return errors.New("expected tx-bound ctx")
    }
    if _, err := tx.ExecContext(ctx, "SAVEPOINT before_risky"); err != nil {
        return err
    }
    // ... ORM writes still auto-enroll via ctx
    return nil
})
```

The slot is keyed by an unexported type, so external code cannot smuggle a forged `*sql.Tx` into the ORM via a hand-crafted ctx.

## Nested transactions and savepoints

Nested `Transaction` calls reuse the outer transaction. The inner closure does not own the commit boundary: its rollback drops only events buffered inside the inner scope, its commit defers to the outer `tx.Commit()`. Callbacks registered inside a nested call accumulate onto the **outer** callback list and fire only when the outer tx commits / rolls back.

```go
mgr.Transaction(ctx, func(ctx context.Context) error {
    if err := orm.Save(ctx, mgr, &order); err != nil {
        return err
    }
    return mgr.Transaction(ctx, func(ctx context.Context) error {
        // SAVEPOINT scope. OnCommit registered here fires when the
        // OUTER tx commits, not when this nested call returns.
        return orm.OnCommit(ctx, func(ctx context.Context) error {
            return cache.Forget(ctx, "orders:"+order.ID)
        })
    })
})
```

Releasing a savepoint does **not** fire commit hooks. Only the outermost commit drains the queue.

## Commit / rollback / commit-failure callbacks

Three package-level helpers register work to fire after the surrounding tx settles:

```go
func OnCommit(ctx context.Context, fn TxCallback) error
func OnRollback(ctx context.Context, fn TxCallback) error
func OnCommitFailure(ctx context.Context, fn TxCommitFailureCallback) error

type TxCallback              func(ctx context.Context) error
type TxCommitFailureCallback func(ctx context.Context, commitErr error) error
```

They solve the durability boundary: outbox emit, cache invalidation, and post-write webhook fanout must run only when the write is guaranteed durable. Calling these from inside `fn` accumulates onto the per-tx callback list; they fire **after** the outer commit / rollback completes, not inside `fn`.

```go
mgr.Transaction(ctx, func(ctx context.Context) error {
    if err := orm.Save(ctx, mgr, &order); err != nil {
        return err
    }
    if err := orm.OnCommit(ctx, func(ctx context.Context) error {
        return cache.Forget(ctx, "orders:"+order.ID)
    }); err != nil {
        return err
    }
    return orm.OnRollback(ctx, func(ctx context.Context) error {
        reservations.Release(order.ID)
        return nil
    })
})
```

When ctx carries no active callbacks holder (no surrounding `Transaction`, or `PrepareTxCallbacks` was not threaded through), the helpers return `orm.ErrNoTxCallbacks` so the caller can fall back to running `fn` inline.

### Hook semantics

- **ctx is detached from cancellation.** The hook ctx is the parent ctx passed through `context.WithoutCancel`, so values (trace IDs, auth, request-scoped data) propagate but a cancel / deadline does NOT. The parent ctx is most often canceled by the same condition that drove the rollback (request abort, deadline) so propagating cancellation would poison every subsequent hook.
- **Panics are isolated.** A panic inside a callback is recovered, logged through the manager's logger when wired, and surfaced as a `TxRecover` event with `Cause="callback_panic"`. The panic does NOT roll back the (already-committed) tx, does NOT abort later callbacks, and does NOT propagate to the original `Transaction` caller (by the time hooks fire, `Transaction` has already returned).
- **Errors are logged, not raised.** Callback return values are logged through the manager's logger but never re-raised. The tx has already settled; there is no caller to surface the error to.
- **Order is registration order.** Callbacks fire in the order they were registered. A hook that registers further hooks during its own body queues onto the same list and is drained in the same pass.

### Commit-error path

When `tx.Commit()` itself returns an error, the tx is in an **ambiguous state**: the database may have committed but the network failed before the client received the OK, OR the commit may have been rejected outright.

{{< callout type="warning" title="Commit-error does NOT run rollback callbacks" >}}
On commit error, only `OnCommitFailure` callbacks fire. `OnRollback` callbacks are explicitly NOT drained. Running them would corrupt outboxes (re-enqueue jobs that already fired) or invalidate caches for changes that DID land. The default behavior of an `OnCommitFailure` callback should be to log the ambiguity and leave outboxes / caches alone; reach for driver-specific error-code branching (`pq.Error.Code`, `lib/pq`'s `CommitNotConfirmed`, SQLSTATE inspection) before deciding to compensate.
{{< /callout >}}

```go
orm.OnCommitFailure(ctx, func(ctx context.Context, commitErr error) error {
    log.Warn("commit ambiguous; tx may or may not have landed",
        "error", commitErr, "order_id", order.ID)
    return nil
})
```

## PrepareTxCallbacks

```go
func PrepareTxCallbacks(ctx context.Context) context.Context
```

`Manager.Transaction` installs the callbacks holder on the ctx it receives, but only if there is somewhere to put it. If `OnCommit` / `OnRollback` need to be reachable BEFORE `Transaction` enters (e.g. middleware or a wrapping helper that registers callbacks higher in the call stack than the tx open), wrap ctx with `PrepareTxCallbacks` first:

```go
ctx = orm.PrepareTxCallbacks(ctx)

// Some helper higher in the call stack registers a commit callback
// before the Transaction open.
preCommit(ctx)

return mgr.Transaction(ctx, func(ctx context.Context) error {
    return orm.Save(ctx, mgr, &order)
})
```

`PrepareTxCallbacks` is idempotent: re-wrapping an already-prepared ctx returns it unchanged.

## Model lifecycle hooks

Models can implement `AfterCommitHook` and `AfterRollbackHook` to receive the same lifecycle signal as `OnCommit` / `OnRollback` without reaching for the helper functions. Hooks auto-register on every `Save` / `Create` of the model.

```go
type AfterCommitHook interface {
    AfterCommit(ctx context.Context) error
}

type AfterRollbackHook interface {
    AfterRollback(ctx context.Context) error
}
```

```go
type Order struct {
    orm.Model[Order]
    Customer string `orm:"column:customer"`
    Total    int64  `orm:"column:total"`
}

func (o *Order) AfterCommit(ctx context.Context) error {
    return cache.Forget(ctx, "orders:"+strconv.FormatUint(uint64(o.ID), 10))
}

func (o *Order) AfterRollback(ctx context.Context) error {
    reservations.Release(o.ID)
    return nil
}
```

The hooks observe the model's committed identity (id, timestamps stamped by the in-tx `AfterCreate` / `AfterUpdate` step). Errors are logged but never propagated; by the time the hook runs, the tx has settled.

`AfterRollback` does NOT fire on commit-error. That path is ambiguous; install an `OnCommitFailure` callback when commit-failure observability is required.

### Inline (auto-commit) AfterCommit

Saving a model OUTSIDE a `Transaction` still fires `AfterCommit`: the implicit per-statement auto-commit has already landed by the time `Save` returns, so the hook fires inline immediately afterward. The contract is uniform from the model's perspective.

The Manager's `TxRecover` dispatcher is plumbed through ctx so a panic inside an inline `AfterCommit` surfaces an identical `TxRecover` event (`Cause="callback_panic"`); the auto-commit branch does not silently drop hook panics.

`AfterRollback` does not fire on the inline path: there is no rollback to react to.

## Concurrency contract

`*sql.Tx` is single-goroutine by stdlib contract. The ctx returned by `Transaction` (and any chain rooted in it) MUST be used from the goroutine that owns the tx. Fanning out inside `fn` is fine, but the fanned-out goroutines must serialize back to one goroutine before touching tx-aware ORM helpers.

```go
mgr.Transaction(ctx, func(ctx context.Context) error {
    var wg sync.WaitGroup
    results := make([]Result, len(inputs))
    for i, in := range inputs {
        i, in := i, in
        wg.Add(1)
        go func() {
            defer wg.Done()
            // OK: pure compute, no ORM call.
            results[i] = compute(in)
        }()
    }
    wg.Wait()

    // Back on the owning goroutine; safe to write through the tx ctx.
    return orm.CreateMany(ctx, results)
})
```

A goroutine that calls `orm.Save(ctx, mgr, ...)` with a tx-bound ctx from a different goroutine than the one that opened the tx is a contract violation; the driver's behavior under concurrent statement execution on a single `*sql.Tx` is undefined and the test suite will not catch it.

## APM: tx span + TransactionExecuted

`Manager.Transaction` mints a fresh span on entry and parents every
`QueryExecuted` event dispatched inside `fn` under it, so an APM exporter can
render the tx as a single node grouping its statements.

```text
RequestStarted          (request span)
  TransactionExecuted   (tx span, ParentID = request span)
    QueryExecuted       (stmt root, ParentID = tx span)
    QueryExecuted       (stmt root, ParentID = tx span)
    QueryExecuted       (stmt root, ParentID = tx span)
```

A `TransactionExecuted` event fires on commit, rollback, panic, and
commit-failure paths:

```go
type TransactionExecuted struct {
    Context    context.Context
    Connection string        // Driver name
    Duration   time.Duration // BeginTx success -> Commit / Rollback resolution
    Statements int           // QueryExecuted events under this tx span
    Error      string        // Empty on commit; populated on rollback / panic / commit failure
    TraceID    string        // APM trace ID
    SpanID     string        // The tx span ID; child QueryExecuted ParentID points here
    ParentID   string        // The caller's prior span
}
```

`Statements` counts only direct statements under the tx body. A nested
`Manager.Transaction` call detects the surrounding tx span and parents its own
tx span under it; the inner tx ships its own `TransactionExecuted` with its own
statement count and does NOT bump the outer counter. Exporters that want
all-stmts-under-the-tree semantics sum across the events sharing a `TraceID`.

Top-level callers without an incoming trace get a freshly minted `TraceID`
and an empty `ParentID`; nested or downstream callers preserve and extend
the surrounding trace.

```go
events.Listen[*orm.TransactionExecuted](dispatcher, func(ctx context.Context, e *orm.TransactionExecuted) error {
    log.Info("tx",
        "trace_id", e.TraceID,
        "span_id", e.SpanID,
        "duration_ms", e.Duration.Milliseconds(),
        "stmts", e.Statements,
        "error", e.Error,
    )
    return nil
})
```

## Related

- [CRUD](/docs/database/crud/) - the writes that auto-enroll when ctx carries a tx
- [Transactional Outbox](/docs/database/outbox/) - the heavier durability primitive: side-effect rows committed in the same tx as the row that triggered them, drained by a relay
- [Queries](/docs/database/queries/) - read-side terminals that observe the same tx ctx
- [Events](/docs/core/events/) - per-tx buffered dispatcher; `events.Buffer(ctx).Dispatch(...)` inside `Transaction` flushes only on commit
