---
title: Query Builder
description: Build complex database queries with Velocity's fluent query builder for filtering, sorting, and pagination.
weight: 20
---

Velocity provides a fluent, generic query builder over `Model[T]`. Every read and write terminal takes `context.Context` as its first positional argument so cancellation, tracing, and transaction enrollment flow through naturally.

## Context-first terminals

The chain (`Where`, `OrderBy`, `Select`, `Join`, `Limit`, ...) is context-blind; only the terminal methods take `ctx`. There is no `WithContext` step and no out-of-band chain ctx, `ctx` is always a positional argument on the call that issues SQL.

```go
// Static-like helpers on the model: ctx is mandatory
user, err := orm.Model[User]{}.Find(ctx, 1)                         // (*User, error)
user, err := orm.Model[User]{}.FindBy(ctx, "email", "j@example.com")
user, err := orm.Model[User]{}.First(ctx)
user, err := orm.Model[User]{}.Last(ctx)
users, err := orm.Model[User]{}.All(ctx)
count, err := orm.Model[User]{}.Count(ctx)
exists, err := orm.Model[User]{}.Exists(ctx)

// Chain terminals: ctx on the terminal call
var u User
err := orm.Model[User]{}.Where("id = ?", id).First(ctx, &u)
err := orm.Model[User]{}.Where("id = ?", id).Find(ctx, id, &u)

users, err := orm.Model[User]{}.Where("role = ?", "admin").Get(ctx)
count, err := orm.Model[User]{}.Where("role = ?", "admin").Count(ctx)
```

{{< callout type="info" title="Tx auto-enrollment" >}}
Inside `mgr.Transaction(ctx, func(txCtx context.Context) error { ... })`, every read and write terminal that receives `txCtx` enrolls in that transaction automatically. The chain's driver is rebound from the pool to a tx-bound driver via the ctx value. Pass the original pre-tx `ctx` to a terminal to opt out and route through the pool.
{{< /callout >}}

{{< callout type="info" title="Opening a query chain" >}}
The fluent chain methods (`Select`, `Where`, `WhereBetween`, `Join`, `GroupBy`, `Limit`, `Distinct`, `Sum`, ...) live on `*Query[T]`, not on `Model[T]`. The `Model[T]{}` value exposes a small set of **chain-opening** statics that return a fresh `*Query[T]`: `Where`, `WhereIn`, `WhereNull`, `WhereNotNull`, `OrderBy`, and `With`. Open the builder with one of those, then chain everything else off it. The examples below lead with one of these openers for that reason. `Model[T]{}` also exposes the standalone helpers `Find`, `FindBy`, `First`, `Last`, `All`, `Count`, `Exists`, `DoesntExist`, `Pluck`, `Paginate`, `Create`, `CreateMany`, `Update`, `DeleteWhere`, `Increment`, `Decrement`, `FirstOrCreate`, `UpdateOrCreate`, `FindOrFail`, `FirstOrFail`, and `Raw` directly.
{{< /callout >}}

## Basic Queries

```go
// Find single record
user, err := orm.Model[User]{}.Find(ctx, 1)
user, err := orm.Model[User]{}.FindBy(ctx, "email", "john@example.com")
user, err := orm.Model[User]{}.First(ctx)
user, err := orm.Model[User]{}.Last(ctx)

// Find multiple records
users, err := orm.Model[User]{}.All(ctx)
users, err := orm.Model[User]{}.Where("role = ?", "admin").Get(ctx)

// Existence
exists, err := orm.Model[User]{}.Where("email = ?", email).Exists(ctx)
gone,   err := orm.Model[User]{}.Where("email = ?", email).DoesntExist(ctx)

// Count
count, err := orm.Model[User]{}.Count(ctx)
count, err := orm.Model[User]{}.Where("role = ?", "admin").Count(ctx)
```

`Find` on `Model[T]{}` returns `(*T, error)`. The chain variant `q.Find(ctx, id, dest)` writes into the caller's `*T` so it composes with whatever predicates the chain carries.

## FirstOrFail

`First` returns `ErrRecordNotFound` when nothing matches. `FirstOrFail` (and the static `FindOrFail` / `FirstOrFail` on the model) wrap that into `orm.ErrNotFound`, which itself wraps `sql.ErrNoRows`:

```go
user, err := orm.Model[User]{}.FindOrFail(ctx, id)
user, err := orm.Model[User]{}.FirstOrFail(ctx)

// Chain variant: dest is passed to the terminal, like First.
var u User
err := orm.Model[User]{}.Where("email = ?", email).FirstOrFail(ctx, &u)
if errors.Is(err, orm.ErrNotFound) { ... }
```

## Chained Queries

```go
users, err := orm.Model[User]{}.
    Where("role = ?", "admin").
    OrWhere("super_admin = ?", true).
    OrderBy("created_at", "DESC").
    Limit(10).
    Offset(20).
    Get(ctx)
```

## Select Columns

```go
// Select specific columns (open the chain with a Where opener)
users, err := orm.Model[User]{}.
    Where("active = ?", true).
    Select("id", "name", "email").
    Get(ctx)

// Pluck single column (standalone helper on the model)
emails, err := orm.Model[User]{}.Pluck(ctx, "email")

// Pluck distinct values
roles, err := orm.Model[User]{}.
    Where("active = ?", true).
    Distinct().
    Pluck(ctx, "role")
```

`Pluck` (as a standalone helper or a chain terminal) returns `[]any` and honors any `Distinct`, `Where`, and ordering already on the chain.

## Conditions

### Where Clauses

```go
// Basic where
users, _ := orm.Model[User]{}.Where("active = ?", true).Get(ctx)

// Multiple conditions
users, _ := orm.Model[User]{}.
    Where("role = ?", "admin").
    Where("active = ?", true).
    Get(ctx)

// Or where
users, _ := orm.Model[User]{}.
    Where("role = ?", "admin").
    OrWhere("super_admin = ?", true).
    Get(ctx)

// Where in
users, _ := orm.Model[User]{}.WhereIn("role", []any{"admin", "moderator"}).Get(ctx)

// Where between (WhereBetween is a chain method; open with a Where first)
users, _ := orm.Model[User]{}.Where("active = ?", true).WhereBetween("age", 18, 65).Get(ctx)

// Where not in (chain method; open with a Where first)
users, _ := orm.Model[User]{}.Where("active = ?", true).WhereNotIn("role", []any{"banned", "suspended"}).Get(ctx)

// Where null
users, _ := orm.Model[User]{}.WhereNull("deleted_at").Get(ctx)
users, _ := orm.Model[User]{}.WhereNotNull("email_verified_at").Get(ctx)

// Three-argument convenience form: column, operator, value
users, _ := orm.Model[User]{}.Where("age", ">=", 18).Get(ctx)
```

{{< callout type="info" title="One predicate per Where" >}}
Every `Where` predicate is a single `column operator ?` clause: bind values with `?`, never inline literals (`"age > 18"`) or compound predicates (`"a = ? AND b = ?"`). Chain `Where`/`OrWhere` for multiple conditions, use `WhereBetween`/`WhereIn` for multi-value operators, and `WhereGroup` for parenthesized sub-predicates. Anything else is rejected as a deferred error that surfaces on the next terminal call.
{{< /callout >}}

### Raw Projections

`Select` admits plain identifiers, the `*` wildcard, and aggregate expressions using exactly one of the five SQL-standard aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, uppercase, with an optional `AS` alias). Every other function name, window function, `CASE` expression, or dialect extension is rejected by the projection whitelist as a deferred error. For those, use `SelectRaw`, which emits a trusted expression verbatim and binds `?` placeholders from its `args`:

```go
// Aggregate projections pass the Select whitelist directly
results, _ := orm.Model[User]{}.
    Where("active = ?", true).
    Select("role", "COUNT(*) AS post_count").
    GroupBy("role").
    Get(ctx)

// SelectRaw is the escape hatch for projections Select cannot express
users, _ := orm.Model[User]{}.
    Where("active = ?", true).
    SelectRaw("id, name, ROW_NUMBER() OVER (ORDER BY created_at) AS rn").
    Get(ctx)

users, _ := orm.Model[User]{}.
    Where("active = ?", true).
    SelectRaw("CASE WHEN amount > ? THEN 'big' ELSE 'small' END AS bucket", 100).
    Get(ctx)
```

The caller owns the safety of the `SelectRaw` expression: values from user input MUST flow through the `args`, never via string interpolation into the expression. Multiple `SelectRaw` calls accumulate and are emitted after any `Select` columns.

### Dialect-specific operators (JSONB, FTS, array)

Drivers can extend the `Where` allowlist with dialect-specific operators via
an `OperatorRegistry`. PostgreSQL registers JSONB containment / key existence,
full-text search, and array overlap out of the box. The typed chain admits
them with no Raw escape hatch, so scopes, soft-delete filters, and chain
composition keep working.

```go
// JSONB containment: WHERE "metadata" @> $1::jsonb
rows, _ := orm.Model[App]{}.
    Where("metadata @> ?", `{"key":"value"}`).
    Get(ctx)

// JSONB key existence (one key): WHERE "metadata" ? $1
rows, _ := orm.Model[App]{}.
    Where("metadata ? ?", "feature").
    Get(ctx)

// JSONB any-of keys: WHERE "metadata" ?| ($1, $2, $3)
rows, _ := orm.Model[App]{}.
    Where("metadata ?| ?", []any{"a", "b", "c"}).
    Get(ctx)

// Full-text search: WHERE "search_vector" @@ to_tsquery($1)
rows, _ := orm.Model[Post]{}.
    Where("search_vector @@ ?", "velocity & framework").
    Get(ctx)

// Array overlap: WHERE "tags" && ARRAY[$1, $2]
rows, _ := orm.Model[Post]{}.
    Where("tags && ?", []any{"go", "orm"}).
    Get(ctx)
```

Built-in scalar operators (`=`, `!=`, `<`, `>`, `LIKE`, ...) keep working
without any registry. Registered operators are matched only when the
built-in allowlist misses, and `cond.Value` is validated against the spec's
`ParamShape` at parse time, so misuse surfaces as a parse error instead of a
runtime SQL syntax error.

PostgreSQL ships these operators today:

| Op | Shape | Example template |
|---|---|---|
| `@>` | JSON | `{{lhs}} @> {{rhs}}::jsonb` |
| `<@` | JSON | `{{lhs}} <@ {{rhs}}::jsonb` |
| `?`  | Scalar | `{{lhs}} ? {{rhs}}` |
| `?|` | Array | `{{lhs}} ?| {{rhs}}` |
| `?&` | Array | `{{lhs}} ?& {{rhs}}` |
| `@@` | Scalar | `{{lhs}} @@ to_tsquery({{rhs}})` |
| `&&` | Array | `{{lhs}} && {{rhs}}` |

SQLite and MySQL return `nil` from `OperatorRegistry()` today; the seam is in
place for `json1` / `fts5` and `JSON_CONTAINS` / `JSON_OVERLAPS` follow-ups.
Use Raw expressions for those dialects until the registrations land.

### Grouped Predicates

`WhereGroup` and `OrWhereGroup` wrap a sub-builder's conditions in parentheses so they bind tighter than the surrounding `AND`/`OR`. Reach for it whenever an `OR` group needs to be scoped by an outer predicate, typically a multi-column free-text search restricted to the current tenant or team.

```go
// WHERE team_id = ? AND (name LIKE ? OR email LIKE ?)
users, err := orm.Model[User]{}.
    Where("team_id = ?", teamID).
    WhereGroup(func(sub *orm.Query[User]) {
        sub.Where("name LIKE ?", "%"+q+"%").
            OrWhere("email LIKE ?", "%"+q+"%")
    }).
    Get(ctx)
```

`OrWhereGroup` is the OR-joined counterpart:

```go
// WHERE active = ? OR (role = ? OR role = ?)
users, err := orm.Model[User]{}.
    Where("active = ?", true).
    OrWhereGroup(func(sub *orm.Query[User]) {
        sub.Where("role = ?", "admin").
            OrWhere("role = ?", "owner")
    }).
    Get(ctx)
```

Empty groups (closure adds no conditions) are dropped, no stray parentheses appear in the SQL. A `nil` closure is a no-op. Errors from the sub-builder propagate to the outer query and surface on the next terminal call.

## Ordering

```go
// Single order
users, _ := orm.Model[User]{}.OrderBy("created_at", "DESC").Get(ctx)

// Multiple orders
users, _ := orm.Model[User]{}.
    OrderBy("role", "ASC").
    OrderBy("name", "ASC").
    Get(ctx)

// OrderByDesc shortcut (chain method; open with an OrderBy or Where first)
users, _ := orm.Model[User]{}.OrderBy("created_at", "DESC").Get(ctx)  // ORDER BY created_at DESC
```

`OrderBy` normalizes the direction to `ASC`/`DESC` (case-insensitive) and falls back to `ASC` for any other value. Once the chain is open, `OrderByDesc(col)` is shorthand for `OrderBy(col, "DESC")`.

## Grouping and Aggregates

```go
// Group by (open the chain with a Where opener)
results, err := orm.Model[User]{}.
    Where("active = ?", true).
    Select("role", "COUNT(*) as count").
    GroupBy("role").
    Get(ctx)

// Having
results, err := orm.Model[User]{}.
    Where("active = ?", true).
    Select("role", "COUNT(*) as count").
    GroupBy("role").
    Having("COUNT(*) > ?", 5).
    Get(ctx)

// Count is a standalone helper on the model; ctx-first
count, err := orm.Model[User]{}.Count(ctx)

// Sum/Avg/Min/Max are chain terminals on *Query[T]; lead with a Where
// (or another opener) to obtain the builder first.
sum, err := orm.Model[Order]{}.Where("status = ?", "paid").Sum(ctx, "total")
avg, err := orm.Model[Product]{}.Where("active = ?", true).Avg(ctx, "price")
max, err := orm.Model[Product]{}.Where("active = ?", true).Max(ctx, "price")
min, err := orm.Model[Product]{}.Where("active = ?", true).Min(ctx, "price")

// Single-column scalar pull from the first matching row
v, err := orm.Model[User]{}.Where("id = ?", id).Value(ctx, "email")
```

`Sum`, `Avg`, `Min`, and `Max` return `(float64, error)` and report `0` when the result set is empty. `Value` returns `orm.ErrNotFound` on no match.

## Joins

`Join`, `LeftJoin`, and `RightJoin` are chain methods, so open the builder with a `Where` (or another opener) first:

```go
// Inner join
users, _ := orm.Model[User]{}.
    Where("users.active = ?", true).
    Join("posts", "posts.user_id", "=", "users.id").
    Select("users.*", "posts.title").
    Get(ctx)

// Left join
users, _ := orm.Model[User]{}.
    Where("users.active = ?", true).
    LeftJoin("posts", "posts.user_id", "=", "users.id").
    Get(ctx)

// Multiple joins
users, _ := orm.Model[User]{}.
    Where("users.active = ?", true).
    Join("posts", "posts.user_id", "=", "users.id").
    Join("comments", "comments.post_id", "=", "posts.id").
    Distinct().
    Get(ctx)
```

Each join validates the table and the two ON identifiers, and admits only the built-in comparison operators (`=`, `!=`, `<`, `>`, `LIKE`, ...) between them.

## Pagination

```go
// Simple pagination via limit/offset (Limit/Offset are chain methods;
// open with a Where or OrderBy first)
users, err := orm.Model[User]{}.
    OrderBy("id", "ASC").
    Limit(10).
    Offset(20).
    Get(ctx)

// Paginate helper: total count + page slice in a single call.
// Paginate is a standalone helper on the model, and also a chain terminal.
result, err := orm.Model[User]{}.
    Where("active = ?", true).
    Paginate(ctx, page, perPage)

// result.Data() / result.Total() / result.PerPage() /
// result.CurrentPage() / result.LastPage()
```

`Paginate` defaults to page 1 and 15 per page when given non-positive values, and runs the count query and the data query against the same conditions so global scopes apply identically to both.

## Chunking

Process large datasets in fixed-size batches. The callback receives one page at a time; returning a non-nil error from the callback aborts the walk.

`Chunk` is a chain terminal, so open the builder first (a stable `OrderBy` is recommended so pages do not overlap or skip rows between batches):

```go
err := orm.Model[User]{}.
    OrderBy("id", "ASC").
    Chunk(ctx, 1000, func(users []User) error {
        for _, u := range users {
            // process u
        }
        return nil
    })
```

## Mass Updates and Deletes

Mass writes are chain terminals on `Query[T]`. They take `ctx` first so they enroll in `mgr.Transaction` automatically:

```go
// Mass update. Copies the input map; never mutated. Auto-stamps updated_at.
affected, err := orm.Model[User]{}.
    Where("role = ?", "guest").
    Update(ctx, map[string]any{"active": false})

// Soft delete (or hard, when the model has no DeletedAt trait)
affected, err := orm.Model[User]{}.Where("id = ?", id).Delete(ctx)

// Hard delete; bypasses the soft-delete trait
affected, err := orm.Model[User]{}.Where("id = ?", id).ForceDelete(ctx)

// Insert + return generated id. InsertGetId is a builder terminal and
// ignores any predicates on the chain; open the builder with a no-op
// opener such as With() to reach it. For the common insert path, prefer
// the Create helper on the model, which returns the populated *T.
id, err := orm.Model[User]{}.With().InsertGetId(ctx, map[string]any{
    "email": "j@example.com",
    "name":  "Jane",
})
```

`Update` injects the driver-appropriate `NOW()` / `CURRENT_TIMESTAMP` sentinel for `updated_at` automatically, except on models that don't carry an `UpdatedAt` column (e.g. `ImmutableModel`). To emit raw SQL deliberately, wrap the value in `orm.RawSQL` (or use the `orm.NOW` constant).

### Chain-style writes

`Save`, `Create`, `CreateMany`, `FirstOrCreate`, and `UpdateOrCreate` are exposed on the chain. They all share the chain's driver, so a tx-bound `ctx` enrolls them in that transaction. `Create`, `CreateMany`, `FirstOrCreate`, and `UpdateOrCreate` are also standalone helpers on the model and can be called on a bare `Model[T]{}`; `Save` is chain-only, so open the builder with a no-op `With()` first:

```go
err := orm.Model[User]{}.With().Save(ctx, &user)
created, err := orm.Model[User]{}.Create(ctx, map[string]any{"email": email})
err = orm.Model[User]{}.CreateMany(ctx, batch)

u, err := orm.Model[User]{}.FirstOrCreate(ctx,
    map[string]any{"email": email},
    map[string]any{"name": name},
)

u, err := orm.Model[User]{}.UpdateOrCreate(ctx,
    map[string]any{"email": email},
    map[string]any{"name": name, "active": true},
)
```

`CreateMany` iterates sequentially and short-circuits on the first error. Inside `mgr.Transaction`, returning that error rolls back the partial batch.

## Raw SQL

`RawQuery[T]` is the escape hatch for queries the builder doesn't express. Every terminal takes `ctx` as the first argument and enrolls in a transaction the same way the fluent builder does. `Exec` returns the standard library's `sql.Result` so callers can inspect both `RowsAffected()` and `LastInsertId()`.

```go
// Read into structs
var u User
err := orm.NewRawQuery[User]("SELECT * FROM users WHERE email = ?", email).First(ctx, &u)

users, err := orm.NewRawQuery[User]("SELECT * FROM users WHERE role = ?", "admin").Get(ctx)

// Scalar / multi-column scan
var count int
err = orm.NewRawQuery[User]("SELECT COUNT(*) FROM users WHERE active").Scan(ctx, &count)

// Exec returns sql.Result
result, err := orm.NewRawQuery[User]("UPDATE users SET active = ? WHERE last_seen < ?", false, cutoff).Exec(ctx)
if err != nil { return err }
affected, _ := result.RowsAffected()
```

{{< callout type="warning" title="Soft deletes and raw SQL" >}}
`NewRawQuery` runs the SQL verbatim, it does **not** apply the `deleted_at IS NULL` predicate that `Query[T]` adds for soft-delete models. Use `NewRawQuerySoftDeleteOnly` to opt in to that single scope, or write the predicate by hand. User-registered global scopes (multi-tenant, region, archive...) are never applied to raw SQL; if your model has any, use the fluent builder instead.
{{< /callout >}}

## Performance Tips

### Select Only Needed Columns

```go
// Bad: fetches all columns
users, _ := orm.Model[User]{}.All(ctx)

// Good: fetches only needed columns (open with a Where, then Select)
users, _ := orm.Model[User]{}.
    Where("active = ?", true).
    Select("id", "name", "email").
    Get(ctx)
```

### Avoid N+1 Queries

```go
// Bad: N+1 queries
users, _ := orm.Model[User]{}.All(ctx)
for _, u := range users {
    posts, _ := orm.Model[Post]{}.Where("user_id = ?", u.ID).Get(ctx) // N queries
}

// Good: eager loading
users, _ := orm.Model[User]{}.With("Posts").Get(ctx) // 2 queries total
```

### Use Indexes

```go
// Ensure columns used in WHERE, ORDER BY, JOIN are indexed
var u User
_ = orm.Model[User]{}.Where("email = ?", email).First(ctx, &u)  // email indexed
users, _ := orm.Model[User]{}.OrderBy("created_at", "DESC").Get(ctx)
```

## Related

- [CRUD](/docs/database/crud/) - create, update, delete, and lifecycle hooks for the same models you query here
- [Relationships](/docs/database/relationships/) - HasMany / BelongsTo helpers and `With(...)` eager loading
- [Global Query Scopes](/docs/database/scopes/) - register predicates that run on every `Get` / `Count` / `Pluck` / `Update`, with per-query opt-out for admin work
- [Transactional Outbox](/docs/database/outbox/) - atomically commit queue jobs and events alongside writes
- [Migrations](/docs/database/migrations/) - schema definitions and indexes that back efficient queries
