---
title: CRUD Operations
description: Create, read, update, and delete database records with Velocity ORM's ctx-first API.
weight: 40
---

Every state-changing entry point on the ORM (and every read terminal) takes `context.Context` as its first positional argument. There is no implicit auto-commit and no chain-level `WithContext` decoration: pass the ctx your handler already holds, and a tx slot in that ctx (set by `Manager.Transaction` or `WithTxContext`) automatically enrolls the call in the surrounding transaction. A bare `context.Background()` routes through the pool driver.

## Create

### Save Instance

`orm.Save` is the package-level persistence helper. Pass `nil` for the manager to use the package default registered by `velocity.New()`.

```go
user := User{
    Name:  "John Doe",
    Email: "john@example.com",
    Role:  "user",
}
if err := orm.Save(ctx, nil, &user); err != nil {
    return err
}
fmt.Printf("User created with ID: %d\n", user.ID)
```

The same call updates an existing row when `orm.IsExisting(&user)` is true. Rows loaded via `Find`, `Where(...).Get`, `First`, etc. are marked existing automatically.

### Create with Map

```go
user, err := User{}.Create(ctx, map[string]any{
    "name":  "Jane Doe",
    "email": "jane@example.com",
    "role":  "admin",
})
```

`Create` accepts a `map[string]any` (mass-assignment respects `Fillable`/`Guarded`) or a pre-built `*User`.

### Create Multiple

```go
users := []User{
    {Name: "Alice", Email: "alice@example.com"},
    {Name: "Bob", Email: "bob@example.com"},
}
if err := (User{}).CreateMany(ctx, users); err != nil {
    return err
}
```

Iteration is sequential. The first error short-circuits; preceding rows are part of the in-flight tx when ctx carries one, so a `Manager.Transaction` closure can return that error to roll back the partial batch.

### First Or Create

Find by criteria; insert with `conditions ∪ values` if nothing matches.

```go
user, err := User{}.FirstOrCreate(ctx,
    map[string]any{"email": "john@example.com"},        // Search criteria
    map[string]any{"name": "John Doe", "role": "user"}, // Creation attributes
)
```

Returns `(*T, error)`. The "did we just create it" signal moved to a side-channel: call `orm.IsExisting(user)` after the call if you need it (it is always true on the returned pointer; the distinction lives in your branching logic, e.g. counting rows beforehand).

### Update Or Create

Lookup, update if found, insert if not.

```go
user, err := User{}.UpdateOrCreate(ctx,
    map[string]any{"email": "john@example.com"},
    map[string]any{"name": "John Updated", "role": "admin"},
)
```

The `Query[T]` chain forms exist too: `mgr.Query[T]()` style accepts the same `(ctx, conditions, values)` pair so you can scope the lookup with extra `Where` clauses before the helper resolves.

## Read

See [Query Builder](/docs/database/queries/) for the full surface. The static helpers terminal in ctx:

```go
user, err := User{}.Find(ctx, 1)
user, err := User{}.FindBy(ctx, "email", "john@example.com")
user, err := User{}.First(ctx)
user, err := User{}.Last(ctx)
users, err := User{}.All(ctx)

// Chained queries return *Query[T]; terminal methods take ctx.
users, err := User{}.Where("role = ?", "admin").Get(ctx)
count, err := User{}.Count(ctx)
exists := User{}.Where("email = ?", email).Exists(ctx)
```

## Update

### Update via Save

Modify the loaded struct, then re-save:

```go
user, err := User{}.Find(ctx, 1)
if err != nil {
    return err
}
user.Name = "Updated Name"
user.Email = "newemail@example.com"
if err := orm.Save(ctx, nil, user); err != nil {
    return err
}
```

Because `Find` marked the row as existing, `Save` takes the UPDATE branch.

### Mass Update

Update by static helper:

```go
affected, err := User{}.Update(ctx,
    map[string]any{"role": "guest"},   // conditions
    map[string]any{"active": false},   // updates
)
```

Update through the chain when conditions are richer than `field = value`:

```go
affected, err := User{}.
    Where("role = ?", "guest").
    Where("created_at < ?", cutoff).
    Update(ctx, map[string]any{"active": false})
```

`updated_at` is stamped automatically with the driver-appropriate `NOW()` / `CURRENT_TIMESTAMP` sentinel; pass `orm.NOW` (or any other `orm.RawSQL` value) explicitly when you need a column other than `updated_at` to take the server's clock.

### Increment / Decrement

```go
// Static helpers
err := User{}.Increment(ctx, "login_count")          // +1
err := User{}.Increment(ctx, "points", 100)          // +100
err := User{}.Decrement(ctx, "credits", 10)          // -10

// Chain form: scope the rows first
err := User{}.Where("active = ?", true).Increment(ctx, "bonus", 5)
```

The generated UPDATE is atomic (`SET col = col + ?`) so concurrent increments do not lose updates.

## Delete

### Soft Delete

Models composed with `orm.SoftDeleteModel[T]` (or any composition that includes the `SoftDeletes[T]` trait) carry a `deleted_at *time.Time` column. `Delete` on those models stamps `deleted_at = NOW()`; the row stays in the table and is filtered out of subsequent reads by the registered soft-delete scope.

```go
type User struct {
    orm.SoftDeleteModel[User]
    Name string `orm:"column:name"`
}

// Static helper: soft-delete by conditions.
affected, err := User{}.DeleteWhere(ctx, map[string]any{"role": "guest"})

// Chain: soft-delete with richer predicates.
affected, err := User{}.Where("created_at < ?", cutoff).Delete(ctx)
```

### Force Delete

Permanent removal, even on soft-delete models:

```go
affected, err := User{}.ForceDeleteWhere(ctx, map[string]any{"id": 42})

// Chain form
affected, err := User{}.Where("active = ?", false).ForceDelete(ctx)
```

On models without soft delete, `Delete` and `ForceDelete` are equivalent.

### Working with Soft Deleted Records

```go
// Default scope hides trashed rows.
users, err := User{}.All(ctx)

// Include trashed rows.
users, err := User{}.WithTrashed().Get(ctx)

// Only trashed rows.
users, err := User{}.OnlyTrashed().Get(ctx)
```

To restore a trashed row, clear `deleted_at` via mass update with the trashed-aware scope explicitly opted in:

```go
affected, err := User{}.WithTrashed().
    Where("id = ?", id).
    Update(ctx, map[string]any{"deleted_at": nil})
```

## Append-Only Models

Tables that should never be mutated after insert (`audit_logs`, `events`, `outbox`, ledger entries) embed `orm.ImmutableModel[T]` (or `orm.ImmutableUUIDModel[T]`) instead of `orm.Model[T]`. The composition is `IDInt[T] + CreatedAtOnly + AppendOnly`: there is no `UpdatedAt` column and no UPDATE branch.

```go
type AuditLog struct {
    orm.ImmutableModel[AuditLog]
    Actor  string         `orm:"column:actor"`
    Action string         `orm:"column:action"`
    Meta   map[string]any `orm:"column:meta;type:jsonb"`
}

log, err := AuditLog{}.Create(ctx, map[string]any{
    "actor":  "user:42",
    "action": "user.deleted",
    "meta":   map[string]any{"target": 99},
})
```

Reads work like any other model:

```go
log, err := AuditLog{}.Find(ctx, id)
recent, err := AuditLog{}.
    Where("actor = ?", actor).
    OrderBy("created_at", "DESC").
    Limit(50).
    Get(ctx)
```

`orm.Save(ctx, mgr, &existing)` on an already-persisted immutable record returns `orm.ErrImmutableModelUpdate`. To "edit" an immutable row, append a new one.

{{< callout type="warning" title="Use orm.Save for the parent struct" >}}
The package-level `orm.Save(ctx, mgr, &record)` is the only persistence path for `ImmutableModel[T]` parents; there is no instance method. `Create` / `CreateMany` on the static-like helpers go through `orm.Save` automatically.
{{< /callout >}}

## Transactions

`Manager.Transaction` runs a closure inside a database transaction. The ctx passed to the closure carries a `*sql.Tx`; every ORM call you make with that ctx auto-enrolls in the tx.

```go
err := manager.Transaction(ctx, func(ctx context.Context) error {
    user, err := User{}.Create(ctx, map[string]any{
        "name":  "John",
        "email": "john@example.com",
    })
    if err != nil {
        return err // auto rollback
    }

    if _, err := (Profile{}).Create(ctx, map[string]any{
        "user_id": user.ID,
        "bio":     "Developer",
    }); err != nil {
        return err
    }

    return nil // auto commit
})
```

Lifecycle:

- Closure returns a non-nil error: rollback, error returned to caller.
- Closure panics: rollback, panic re-raised. Rollback failures surface as `TxRecover` events.
- Closure returns nil: commit, then per-tx callbacks and buffered events flush.

### Nested Transactions (Savepoints)

Re-entering `Transaction` from inside a closure reuses the outer tx. The inner closure observes savepoint semantics: an inner rollback discards only the inner work; the outer tx still commits or rolls back on its own boundary.

```go
err := manager.Transaction(ctx, func(ctx context.Context) error {
    user, err := User{}.Create(ctx, map[string]any{"name": "John"})
    if err != nil {
        return err
    }

    // Savepoint: inner failure is contained.
    inner := manager.Transaction(ctx, func(ctx context.Context) error {
        _, err := (Post{}).Create(ctx, map[string]any{
            "user_id": user.ID,
            "title":   "Draft",
        })
        return err
    })
    if inner != nil {
        log.Printf("post creation failed: %v", inner)
    }
    return nil
})
```

### Manual Transactions

When the closure form does not fit (long-lived txs, savepoint issuance), `Manager.Begin` returns the raw `*sql.Tx`. Thread it through ctx with `orm.WithTxContext`:

```go
tx, err := manager.Begin(ctx)
if err != nil {
    return err
}
txCtx := orm.WithTxContext(ctx, tx)

if err := orm.Save(txCtx, manager, &user); err != nil {
    _ = tx.Rollback()
    return err
}
return tx.Commit()
```

Prefer `Transaction` for everyday work; the manual path skips the per-tx event buffer and callback drain wiring that `Transaction` installs for you.

## Commit Callbacks

`OnCommit`, `OnRollback`, and `OnCommitFailure` register work to fire after the surrounding transaction settles. They are the durable replacement for "do this thing only if the row actually persisted" branches that used to live inline.

```go
ctx = orm.PrepareTxCallbacks(ctx)

err := manager.Transaction(ctx, func(ctx context.Context) error {
    user, err := User{}.Create(ctx, map[string]any{"email": email})
    if err != nil {
        return err
    }

    // Fires only after a successful commit.
    _ = orm.OnCommit(ctx, func(ctx context.Context) error {
        return cache.Forget(ctx, "users:"+user.Email)
    })

    // Fires only if the tx rolls back.
    _ = orm.OnRollback(ctx, func(ctx context.Context) error {
        log.Warn("user create rolled back", "email", email)
        return nil
    })

    return nil
})
```

`PrepareTxCallbacks` attaches the callback holder to ctx; without it, the `OnCommit` / `OnRollback` calls return `orm.ErrNoTxCallbacks` so callers can fall back to inline execution.

Important guarantees:

- Callbacks fire AFTER the tx has settled, never inside it.
- The ctx supplied to a callback is detached from cancellation via `context.WithoutCancel`. A request deadline that triggered the rollback will not poison the cache-invalidation cascade.
- A panic inside a callback is isolated. It surfaces as a `TxRecover` event with `Cause == "callback_panic"`; subsequent callbacks still run.
- Savepoint inner registrations defer to the outer tx: only the outermost commit/rollback boundary drains.

### Commit Failure

If `tx.Commit()` itself returns an error, the transaction is in an AMBIGUOUS state: the database may have committed but the network failed before the OK reached the client. `OnCommitFailure` is the only callback list that fires in this case; rollback callbacks do NOT run because the rollback was never confirmed.

```go
_ = orm.OnCommitFailure(ctx, func(ctx context.Context, commitErr error) error {
    log.Error("commit ambiguous - leaving outbox/cache untouched",
        "err", commitErr)
    return nil
})
```

The safe default is to log and leave outboxes / caches alone. Aggressive cleanup risks duplicate work (re-enqueueing jobs that already fired) or stale-cache reads (invalidating changes that DID land).

### Model Hooks: AfterCommit / AfterRollback

Models that implement `orm.AfterCommitHook` or `orm.AfterRollbackHook` are auto-registered against the active TxCallbacks on every successful Save. This is the right home for outbox dispatch, cache invalidation, webhook fanout: anything that requires durability before the side effect can be safely observed.

```go
type Order struct {
    orm.Model[Order]
    Customer string `orm:"column:customer"`
    Total    int64  `orm:"column:total"`
}

func (o *Order) AfterCommit(ctx context.Context) error {
    return events.Dispatch(ctx, OrderPlaced{ID: o.ID})
}

func (o *Order) AfterRollback(ctx context.Context) error {
    log.Warn("order rolled back", "id", o.ID)
    return nil
}
```

Outside a `Transaction`, the implicit auto-commit already happened by the time `Save` returns, so `AfterCommit` fires inline immediately after the in-tx hooks. `AfterRollback` only fires inside a `Transaction` that ultimately rolls back.

## Change Tracking

Tracking is opt-in. Calling `orm.Track` snapshots the current field values; `IsDirty`, `IsClean`, and `HasChanged` compare against that snapshot lazily. Models that never call `Track` pay zero: the side-channel is allocated only on demand.

```go
user, err := User{}.Find(ctx, 1)
if err != nil {
    return err
}
orm.Track(&user) // baseline

user.Name = "Updated"

orm.IsDirty(&user)              // true
orm.HasChanged(&user, "Name")   // true
orm.HasChanged(&user, "Email")  // false

if err := orm.Save(ctx, nil, &user); err != nil {
    return err
}
orm.MarkClean(&user) // re-baseline so subsequent edits are diffed against the saved state
orm.IsClean(&user)   // true
```

`HasChanged` keys on the Go field name (e.g. `"Name"`, not `"name"`). Tracking on an in-memory struct that was never persisted is a no-op.

## Existence

`orm.IsExisting(&model)` reports whether the row is persisted. Rows loaded via any read path (`Find`, `Get`, `First`, raw queries) are marked existing automatically; freshly-constructed structs are not until the first successful `Save`.

```go
var u User
u.Name = "draft"

orm.IsExisting(&u) // false

if err := orm.Save(ctx, nil, &u); err != nil {
    return err
}
orm.IsExisting(&u) // true
```

This is the bit that drives `Save`'s INSERT-vs-UPDATE branch. Reach for it directly when you want to branch in user code without round-tripping the database.

## Model Lifecycle Hooks

Models can implement any subset of the lifecycle hook interfaces. The save path detects them via type assertion and fires them at the appropriate point.

```go
type User struct {
    orm.Model[User]
    Name  string `orm:"column:name"`
    Email string `orm:"column:email"`
}

// Before insert: validate or normalize.
func (u *User) BeforeCreate() error {
    u.Email = strings.ToLower(u.Email)
    return nil
}

// After insert.
func (u *User) AfterCreate() error {
    log.Printf("user %d created", u.ID)
    return nil
}

// Before update.
func (u *User) BeforeUpdate() error {
    return nil
}

// After update.
func (u *User) AfterUpdate() error {
    return nil
}

// Before delete.
func (u *User) BeforeDelete() error {
    return nil
}

// After delete.
func (u *User) AfterDelete() error {
    return nil
}
```

These run inside the same connection / transaction as the write. For work that must wait until the row is durable (cache invalidation, queue dispatch), implement `AfterCommit` instead. See [Commit Callbacks](#commit-callbacks).

## Best Practices

1. **Always pass ctx.** The compile-time requirement is the point: there is no silent auto-commit code path to forget about.
2. **Prefer `Manager.Transaction` over `Begin`.** The closure form wires per-tx event buffering and callback drains for you.
3. **Use `AfterCommit` for side effects.** In-tx `AfterCreate` runs before the row is durable; webhooks and queue jobs belong on `AfterCommit`.
4. **Check `OnCommitFailure` semantics.** Treat commit-failure as ambiguous; logging is safe, retrying is not.
5. **Validate in `BeforeCreate` / `BeforeUpdate`.** Mass updates skip lifecycle hooks, so cross-check critical invariants in the request layer when going through the chain `Update`.
6. **Index columns used in WHERE.** The ORM does not synthesize indexes; see [Migrations](/docs/database/migrations/).

## Related

- [Queries](/docs/database/queries/): read-side counterpart, Where / First / Get / pagination patterns
- [Global Query Scopes](/docs/database/scopes/): the primitive behind soft-delete, also useful for multi-tenant filters and draft visibility
- [Transactional Outbox](/docs/database/outbox/): commit queue jobs and events atomically with the write that triggered them
- [Relationships](/docs/database/relationships/): HasMany / BelongsTo wiring used by Save and lifecycle hooks
- [Migrations](/docs/database/migrations/): schema and indexes that back the models you create and update
