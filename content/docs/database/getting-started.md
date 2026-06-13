---
title: Getting Started
description: Connect to PostgreSQL, MySQL, or SQLite and define models with Velocity's hand-rolled, ctx-first ORM.
weight: 10
---

Velocity ships its own ORM: a hand-rolled, generics-aware query builder with composable model traits, a ctx-first read/write API, and a pluggable driver registry. It is **not** built on GORM and shares no struct-tag namespace with it.

## Requirements

- **Go 1.26.3 or newer.** The framework's `go.mod` pins `go 1.26.3`. The ORM uses `weak.Pointer` (Go 1.24+) for its per-instance state side-channel; older toolchains will not compile.
- A driver registered with `orm.Drivers()`. The pure-Go SQLite default (`sqlite`, `sqlite3`) self-registers from `orm`'s own `init()` on import, so a zero-config app has a working database. Postgres and MySQL live in the heavy leaf packages `orm/postgres` and `orm/mysql` (and the cgo SQLite backend in `orm/sqlite`); blank-import the leaf you need, or `orm/standard` for the full set.

## Quick Start

The standard bootstrap is `velocity.New(...)`: it reads `DB_*` env, builds an `*orm.Manager`, and installs it as the package default via `orm.SetDefault`. From there, every read and write terminal takes a `context.Context` as its first argument so transactions, cancellation, and request scope flow through naturally.

```go
package main

import (
    "context"
    "log"

    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/orm"
)

func main() {
    app, err := velocity.New()
    if err != nil {
        log.Fatal(err)
    }

    // app.DB is a contract.Database backed by *orm.Manager;
    // orm.SetDefault has already been called, so pass nil to Save/queries.
    _ = app
    ctx := context.Background()

    user := &User{Name: "Ada", Email: "ada@example.com"}
    if err := orm.Save(ctx, nil, user); err != nil {
        log.Fatal(err)
    }

    found, err := orm.Model[User]{}.Find(ctx, user.ID)
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("loaded %s", found.Name)
}
```

`orm.Save(ctx, m, &model)` is the only persistence entry point. There is no `model.Save()` instance method; calling the package function makes the manager (or transaction binding via `ctx`) explicit at every call site. Pass `nil` for `m` to use the package default set by `velocity.New`.

## Configuration

Configure the connection in `.env`:

```env
DB_CONNECTION=postgres
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=velocity_app
DB_USERNAME=postgres
DB_PASSWORD=secret

# Optional pool tuning
DB_MAX_IDLE_CONNS=10
DB_MAX_OPEN_CONNS=100
DB_CONN_MAX_LIFETIME=3600
DB_LOG_QUERIES=true
DB_SLOW_QUERY_THRESHOLD=200ms
```

To bypass `velocity.New` and build a manager directly:

```go
m, err := orm.NewManagerWithContext(ctx, orm.ManagerConfig{
    Driver:   "sqlite",
    Database: ":memory:",
})
if err != nil { /* ... */ }
orm.SetDefault(m)
```

## Supported Drivers

| Driver | Registered name | Notes |
|--------|-----------------|-------|
| PostgreSQL | `postgres` | JSONB, arrays, `RETURNING`-aware insert path. Blank-import `orm/postgres` (or `orm/standard`) to register. |
| MySQL | `mysql` | TLS via the `TLS` config knob (`DB_MYSQL_TLS`). Blank-import `orm/mysql` (or `orm/standard`). |
| SQLite | `sqlite`, `sqlite3` | Pure-Go default, self-registered from `orm`. In-memory mode for tests (`:memory:`). |

The light SQLite default is always available; the heavier backends register from their leaf packages' `init()`:

```go
import (
    _ "github.com/velocitykode/velocity/orm/postgres" // registers "postgres"
    _ "github.com/velocitykode/velocity/orm/mysql"    // registers "mysql"
    // or, for everything at once:
    _ "github.com/velocitykode/velocity/orm/standard"
)
```

Add a third-party backend by registering a factory with `orm.Drivers()`. The factory receives a `drivers.ConnectionConfig` and returns a connected `drivers.Driver`:

```go
import (
    "context"

    "github.com/velocitykode/velocity/orm"
    "github.com/velocitykode/velocity/orm/drivers"
)

func init() {
    orm.Drivers().Register("clickhouse", func(_ context.Context, cfg drivers.ConnectionConfig) (drivers.Driver, error) {
        d := newClickhouseDriver()
        if err := d.Connect(cfg); err != nil {
            return nil, err
        }
        return d, nil
    })
}
```

## Composable Model Traits

A model is a Go struct that embeds one or more **traits**. Traits are orthogonal: each adds one column or one behaviour. The framework detects them by an unexported zero-size sentinel embedded as the first field of every trait struct, so a user-declared `CreatedAt` field that does **not** come from `orm.Timestamps` is treated as a plain column with no auto-stamping.

### The six traits

| Trait | Adds | Behaviour |
|-------|------|-----------|
| `orm.IDInt[T]` | `ID uint` | Auto-increment integer primary key |
| `orm.IDUUID[T]` | `ID string` | UUID PK; v4 generated on insert when empty |
| `orm.Timestamps` | `CreatedAt`, `UpdatedAt` | Both stamped on insert; `UpdatedAt` refreshed on every save |
| `orm.CreatedAtOnly` | `CreatedAt` | Append-log shape; no `UpdatedAt` to write |
| `orm.SoftDeletes[T]` | `DeletedAt *time.Time` | Auto-installs the `deleted_at IS NULL` global scope |
| `orm.AppendOnly` | (marker) | `Save` on an existing row returns `orm.ErrImmutableModelUpdate` |

`IDInt[T]` / `IDUUID[T]` are mutually exclusive, as are `Timestamps` / `CreatedAtOnly`; the framework refuses to detect both. See "Validation" below.

### Convenience compositions

Six pre-baked combinations cover the common shapes. They are thin embeds with no special meaning to the framework: each is identical to its hand-rolled equivalent.

| Composition | Equivalent traits |
|-------------|-------------------|
| `orm.Model[T]` | `IDInt[T]` + `Timestamps` |
| `orm.UUIDModel[T]` | `IDUUID[T]` + `Timestamps` |
| `orm.SoftDeleteModel[T]` | `IDInt[T]` + `Timestamps` + `SoftDeletes[T]` |
| `orm.SoftDeleteUUIDModel[T]` | `IDUUID[T]` + `Timestamps` + `SoftDeletes[T]` |
| `orm.ImmutableModel[T]` | `IDInt[T]` + `CreatedAtOnly` + `AppendOnly` |
| `orm.ImmutableUUIDModel[T]` | `IDUUID[T]` + `CreatedAtOnly` + `AppendOnly` |

### Defining a model

```go
package models

import "github.com/velocitykode/velocity/orm"

type User struct {
    orm.Model[User] // IDInt + Timestamps; methods like Find/Where/Create return *User

    Name     string  `orm:"column:name;type:varchar(255)"`
    Email    string  `orm:"column:email;type:varchar(255)"`
    Password string  `orm:"column:password;type:varchar(255)"`
    Role     string  `orm:"column:role;type:varchar(50)"`
    Active   bool    `orm:"column:active"`

    Profile *Profile `orm:"relation:hasOne,user_id,id"`
    Posts   []Post   `orm:"relation:hasMany,user_id,id"`
}

// Optional: override the inferred table name (snake_case of the model
// name, then pluralized via str.Plural - e.g. Category -> categories).
func (User) TableName() string { return "users" }
```

### Custom shapes

When the convenience compositions don't fit, embed traits directly. Anything missing simply doesn't exist on the row.

```go
// Tombstone-able audit log: append-only content, but the row can be soft-deleted.
type AuditEntry struct {
    orm.IDUUID[AuditEntry]
    orm.CreatedAtOnly
    orm.AppendOnly
    orm.SoftDeletes[AuditEntry]

    Action string
    Actor  string
}

// No timestamp trait embedded, so this CreatedAt is a plain column with
// no auto-stamping; the column:captured_at tag renames it.
type Snapshot struct {
    orm.IDInt[Snapshot]
    orm.SoftDeletes[Snapshot]

    CreatedAt time.Time `orm:"column:captured_at"`
}
```

Embed exactly the traits the table needs. There is no "base" you must inherit from.

## Per-Instance State

Every model carrying at least one trait gets implicit existence tracking from a process-wide side-channel keyed by the model pointer (Go 1.24+ `weak.Pointer` keeps the entry alive for exactly the lifetime of the struct). `orm.Save` consults this bit to choose `INSERT` vs `UPDATE`; you don't carry a separate `IsExisting` field.

Change tracking is opt-in: call `orm.Track(&m)` once after load to capture a baseline snapshot, then inspect deltas as needed.

| Function | Purpose |
|----------|---------|
| `orm.IsExisting(&m)` | True when the row is persisted (set automatically after a successful `Save` or query load) |
| `orm.Track(&m)` | Capture a column snapshot to compare against later |
| `orm.IsDirty(&m)` | True when any tracked column has changed since the snapshot |
| `orm.IsClean(&m)` | Inverse of `IsDirty` |
| `orm.HasChanged(&m, "field")` | True when a specific field differs from the snapshot |
| `orm.MarkClean(&m)` | Re-baseline tracking against the current state |

Models that never call `Track` pay zero per-instance cost beyond the `IsExisting` bit.

## Validation

Trait detection is invariant per type and the result is cached, but mutually-exclusive combinations (`IDInt + IDUUID`, `Timestamps + CreatedAtOnly`) are rejected. Library code surfaces the failure as `*orm.FeaturesError` rather than panicking; the error fires at the request that triggered detection.

Opt in to startup-time validation so misconfigured models fail at boot instead of at first query:

```go
func main() {
    app, err := velocity.New()
    if err != nil { log.Fatal(err) }

    // Returns *orm.FeaturesError on invalid composition.
    if err := orm.RegisterModel[User](); err != nil {
        log.Fatal(err)
    }

    // Or panic-on-failure for unrecoverable misconfigurations.
    orm.MustRegisterModel[Post]()
    orm.MustRegisterModel[AuditEntry]()

    // ...
}
```

## ORM Tags

Velocity's tag namespace is `orm:"..."` with directives separated by `;`. The reflection layer recognises the following:

| Tag | Purpose | Example |
|-----|---------|---------|
| `column:<name>` | Override the snake_case-of-field default | `column:user_name` |
| `type:<sql>` | SQL type hint; `type:json` / `type:jsonb` also flags the column for JSON marshaling | `type:varchar(255)` |
| `primaryKey` | Mark a custom field as PK (rare; PK traits cover the common case) | `primaryKey` |
| `autoIncrement` | Combine with `primaryKey` for auto-increment integers | `primaryKey;autoIncrement` |
| `autoCreateTime` | Stamp on insert | `autoCreateTime` |
| `autoUpdateTime` | Refresh on every save | `autoUpdateTime` |
| `relation:<kind>,<fk>,<localKey>` | `hasOne`, `hasMany`, `belongsTo`; foreign key and local key are required | `relation:hasMany,user_id,id` |
| `manyToMany:<pivot>,<fkLocal>,<fkRelated>` | Many-to-many through a pivot table | `manyToMany:post_tags,post_id,tag_id` |
| `polymorphic:<typeCol>,<idCol>` | Polymorphic morph pair | `polymorphic:morphable_type,morphable_id` |
| `-` | Skip this field entirely | `-` |

There is no `gorm:` tag; pre-existing GORM-style annotations such as `not null`, `unique`, or `default:` are not parsed by the ORM. Express column constraints in your migration instead.

## Scopes

A scope is a chainable method on the model that builds a `*orm.Query[T]`. Define them as ordinary methods that return a query; the terminal `Get`, `First`, `Count`, etc. take `ctx` and run the SQL.

```go
func (User) Active() *orm.Query[User] {
    return orm.Model[User]{}.Where("active = ?", true)
}

func (User) Admins() *orm.Query[User] {
    return orm.Model[User]{}.WhereIn("role", []any{"admin", "super_admin"})
}

// Use:
admins, err := User{}.Admins().Get(ctx)
recent, err := User{}.Active().Where("created_at > ?", since).Get(ctx)
```

For predicates that should apply to **every** read (multi-tenancy, soft-delete, draft visibility), register a global scope with `orm.AddGlobalScope[T]`. See [Global Query Scopes](/docs/database/scopes/).

## Testing

SQLite in-memory plus a fresh manager per test gives a clean slate without touching disk. Database assertions live in the `orm/testing` package and take the manager explicitly:

```go
import (
    "github.com/velocitykode/velocity/orm"
    ormtesting "github.com/velocitykode/velocity/orm/testing"
)

func TestMain(m *testing.M) {
    mgr, err := orm.NewManagerWithContext(context.Background(), orm.ManagerConfig{
        Driver:   "sqlite",
        Database: ":memory:",
    })
    if err != nil { log.Fatal(err) }
    orm.SetDefault(mgr)

    // Run your migrations against mgr here.

    code := m.Run()
    _ = mgr.Shutdown(context.Background())
    os.Exit(code)
}

func TestUserUpdate(t *testing.T) {
    ctx := context.Background()

    user := &User{Name: "Ada", Email: "ada@example.com"}
    if err := orm.Save(ctx, nil, user); err != nil {
        t.Fatal(err)
    }

    user.Role = "admin"
    if err := orm.Save(ctx, nil, user); err != nil {
        t.Fatal(err)
    }

    ormtesting.AssertDatabaseHas(t, orm.Default(), "users", map[string]any{
        "id":   user.ID,
        "role": "admin",
    })
}
```

`ormtesting` also exposes `AssertDatabaseMissing` and `AssertDatabaseCount`, all of which take the `*orm.Manager` as the second argument.

The same `orm.Save(ctx, nil, &m)` call inserts on a fresh struct and updates an existing row; the side-channel decides which.

## Best Practices

1. **Compose traits to match the table.** Reach for `Model[T]` / `UUIDModel[T]` for ordinary CRUD, `SoftDeleteModel[T]` for recoverable rows, `ImmutableModel[T]` for append-only ledgers; drop down to direct trait composition when none fit exactly.
2. **Pass `ctx` everywhere.** Every read and write terminal takes `context.Context` as its first argument so transactions, cancellation, and request scope flow through automatically. There is no `WithContext` decorator.
3. **Validate at boot.** Call `orm.RegisterModel[T]()` (or `MustRegisterModel[T]()`) for every persisted type so misconfigured trait compositions fail immediately.
4. **Track only when you need it.** `orm.Track(&m)` captures a snapshot; otherwise per-instance cost is just the existence bit.
5. **Eager-load relations.** Use `With("posts", "profile")` to avoid N+1; see [Relationships](/docs/database/relationships/).
6. **Use migrations.** ORM tags don't express constraints, indexes, or defaults; declare those in your migration files.
