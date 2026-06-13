---
title: Migrations
description: Version control your database schema with Velocity migrations for creating tables and modifying columns.
weight: 50
---

Migrations provide version control for your database schema. Velocity migrations live in the `github.com/velocitykode/velocity/orm/migrate` package: each migration is a registered value with `Up`/`Down` functions that receive a `*migrate.Migrator`, and a `Migrator` applies them against a database connection.

## Creating Migrations

Register a migration in an `init()` function. The `Version` must be a 14-digit `YYYYMMDDHHmmss` timestamp, which determines ordering.

```go
// migrations/20240101000001_create_users_table.go
package migrations

import "github.com/velocitykode/velocity/orm/migrate"

func init() {
    migrate.Register(&migrate.Migration{
        Version:     "20240101000001",
        Description: "create users table",
        Up: func(m *migrate.Migrator) error {
            return m.CreateTable("users", func(t *migrate.TableBuilder) {
                t.ID()
                t.String("name")
                t.String("email").Unique()
                t.String("password")
                t.String("role", 50).Default("user")
                t.Boolean("active").Default(true)
                t.Timestamps()
                t.SoftDeletes()
            })
        },
        Down: func(m *migrate.Migrator) error {
            return m.DropTable("users")
        },
    })
}
```

{{% callout type="info" %}}
`Register` validates the migration and panics if the `Version` is missing, malformed, `Up` is nil, or the version is a duplicate. Each version may be registered only once.
{{% /callout %}}

## Running Migrations

Build a `Migrator` from the ORM `Manager`'s `*sql.DB` and driver name, then drive it. Import your migrations package (for its `init()` side effects) so they are registered.

```go
import (
    "github.com/velocitykode/velocity/orm"
    "github.com/velocitykode/velocity/orm/migrate"
    _ "myapp/migrations" // import to register migrations
)

manager, err := orm.NewManager(orm.ManagerConfig{
    Driver:   "sqlite",
    Database: "./database.db",
})
if err != nil {
    // handle error
}

migrator := migrate.NewMigrator(manager.DB(), manager.DriverName())

// Run all pending migrations
err = migrator.Up()

// Roll back the last N batches (defaults to 1 batch when steps <= 0)
err = migrator.Down(1)

// Drop all tables and re-run every migration from scratch
err = migrator.Fresh()
```

`Up`, `Down`, and `Fresh` run under a database-level advisory lock, so concurrent migrator processes cannot double-apply a migration. Applied migrations are grouped into batches; `Down(n)` rolls back the last `n` batches.

### Migration Status

```go
statuses, err := migrator.Status()
for _, s := range statuses {
    fmt.Printf("%s: %s (batch %d)\n", s.Version, s.State, s.Batch)
}
```

Each `MigrationStatus` has `Version`, `State` (`"Applied"` or `"Pending"`), `Batch`, and `ExecutedAt`.

## Schema Builder

### Creating Tables

`CreateTable` takes a table name and a builder closure:

```go
m.CreateTable("products", func(t *migrate.TableBuilder) {
    t.ID()
    t.String("name")
    t.Text("description").Nullable()
    t.Decimal("price", 10, 2)
    t.Integer("stock").Default(0)
    t.Boolean("active").Default(true)
    t.Integer("category_id")
    t.Timestamps()
})
```

### Column Types

Each method appends a column to the table. `String` takes an optional length (default `255`).

| Method | Description |
|--------|-------------|
| `ID()` | Auto-increment INTEGER primary key named `id` |
| `BigID()` | Auto-increment BIGINT primary key named `id` |
| `UUIDPrimary()` | UUID primary key named `id` (auto-generated where the driver supports it) |
| `UUID(name)` | UUID column (CHAR(36) on MySQL, TEXT on SQLite) |
| `String(name, length...)` | VARCHAR column (default length 255) |
| `Text(name)` | TEXT column |
| `Integer(name)` | INTEGER column |
| `BigInteger(name)` | BIGINT column |
| `SmallInteger(name)` | SMALLINT column (INTEGER on SQLite) |
| `Boolean(name)` | BOOLEAN column |
| `Decimal(name, precision, scale)` | DECIMAL/NUMERIC column |
| `Date(name)` | DATE column |
| `Timestamp(name)` | TIMESTAMP column |
| `TimestampTz(name)` | Timestamp-with-time-zone column |
| `JSON(name)` | JSON column (TEXT on SQLite) |
| `JSONB(name)` | JSONB column (JSON on MySQL, TEXT on SQLite) |
| `Binary(name)` | Binary blob (BYTEA/LONGBLOB/BLOB) |
| `IP(name)` | VARCHAR(45) suitable for IPv4/IPv6 addresses |
| `Vector(name, dimensions)` | pgvector `vector(N)` column (PostgreSQL only) |

### Column Modifiers

Modifiers apply to the most recently added column:

```go
t.String("bio", 500).Nullable()        // allow NULL
t.String("role", 50).Default("user")   // literal default value
t.String("id").DefaultRaw("gen_random_uuid()") // raw SQL default (unquoted)
t.String("email").Unique()             // UNIQUE constraint
t.UUID("id").Primary()                 // mark column as primary key
```

{{% callout type="warning" %}}
`DefaultRaw` inlines its expression into the DDL verbatim with no escaping. Pass only trusted, developer-authored SQL, never user input. Use `Default` for ordinary literal values, which are quoted and escaped for you.
{{% /callout %}}

Columns are `NOT NULL` by default; call `Nullable()` to allow `NULL`.

### Composite Primary Keys and Check Constraints

```go
m.CreateTable("role_user", func(t *migrate.TableBuilder) {
    t.Integer("role_id")
    t.Integer("user_id")
    t.PrimaryKey("role_id", "user_id")        // composite primary key
})

m.CreateTable("accounts", func(t *migrate.TableBuilder) {
    t.ID()
    t.Decimal("balance", 12, 2)
    t.Check("balance_non_negative", "balance >= 0") // named CHECK constraint
})
```

{{% callout type="warning" %}}
`Check` emits its expression verbatim. Pass only trusted SQL, never user input. The constraint name is validated as a SQL identifier.
{{% /callout %}}

### Timestamps and Soft Deletes

```go
t.Timestamps()      // created_at, updated_at
t.SoftDeletes()     // deleted_at (nullable)
t.TimestampsTz()    // created_at, updated_at with timezone
```

Non-nullable timestamp columns receive a managed default of the current time (`NOW()` / `CURRENT_TIMESTAMP`) unless you set your own `Default`.

### Indexes

Indexes are created via the `Migrator` (not the table builder):

```go
// Auto-named single or composite index (idx_<table>_<cols>)
m.Index("users", "email")
m.Index("users", "role", "active")

// Auto-named unique index (idx_<table>_<cols>_unique)
m.UniqueIndex("users", "email")

// Named index with full control
m.CreateIndex("idx_user_lookup", "users", func(b *migrate.IndexBuilder) {
    b.Columns("email", "active").Unique()
})

// Partial index (PostgreSQL, SQLite)
m.CreateIndex("idx_active_users", "users", func(b *migrate.IndexBuilder) {
    b.Columns("email").Where("deleted_at IS NULL")
})

// Drop an index (MySQL also requires the table name)
m.DropIndex("idx_user_lookup")
m.DropIndex("idx_user_lookup", "users")
```

The `IndexBuilder` supports `Columns`, `Unique`, `Where` (partial index, validated against a narrow grammar), `Include` (PostgreSQL covering columns), `Using` (PostgreSQL access method), `OperatorClass` (pgvector), `IfNotExists`, and `ToSQL`.

### Foreign Keys

The migrate builder does not generate foreign-key constraints. Add foreign keys with a raw statement inside the migration:

```go
m.CreateTable("posts", func(t *migrate.TableBuilder) {
    t.ID()
    t.Integer("user_id")
    t.String("title")
    t.Timestamps()
})

m.Raw(`ALTER TABLE posts
    ADD CONSTRAINT posts_user_id_foreign
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE`)
```

{{% callout type="warning" %}}
`Raw` executes SQL directly. Never concatenate user input into the statement; it is the caller's responsibility to keep the SQL safe.
{{% /callout %}}

## Modifying Tables

`Table` adds new columns (and named CHECK constraints) to an existing table via `ALTER TABLE`. It cannot add a primary-key column, change column types, rename columns, or drop columns.

```go
// Add columns to an existing table
m.Table("users", func(t *migrate.TableBuilder) {
    t.String("phone", 20).Nullable()
    t.Integer("team_id").Nullable()
})

// Add a single column with the column builder
m.AddColumn("users", "nickname", func(c *migrate.ColumnBuilder) {
    c.String(50).Nullable()
})

// Drop a column (SQLite requires version 3.35.0+)
m.DropColumn("users", "old_field")
```

The `ColumnBuilder` used by `AddColumn` exposes type setters (`String(length...)`, `Integer`, `BigInteger`, `SmallInteger`, `Text`, `Boolean`, `Binary`, `Timestamp`, `TimestampTz`, `Date`, `UUID`, `JSON`, `JSONB`, `Vector`, plus a generic `Type`) and modifiers `Nullable`, `Default`, `DefaultRaw`, and `Unique`.

## Dropping Tables

```go
// Drop a table (DROP TABLE IF EXISTS; CASCADE on PostgreSQL)
m.DropTable("old_table")
```

## Raw SQL

```go
migrate.Register(&migrate.Migration{
    Version: "20240101000002",
    Up: func(m *migrate.Migrator) error {
        return m.Raw(`
            CREATE VIEW active_users AS
            SELECT * FROM users WHERE active = true
        `)
    },
    Down: func(m *migrate.Migrator) error {
        return m.Raw("DROP VIEW IF EXISTS active_users")
    },
})
```

Use `m.Driver()` inside a migration to branch on the active driver (`"postgres"`, `"mysql"`, `"sqlite"`) when raw SQL must differ per dialect.

## Pretend (Dry-Run) Mode

`SetPretend(true)` collects the SQL a migration would run instead of executing it. Inspect the collected statements with `PretendLog()`:

```go
migrator.SetPretend(true)
_ = migrator.Up()
for _, stmt := range migrator.PretendLog() {
    fmt.Println(stmt)
}
```

## Vector Columns (PostgreSQL)

For pgvector workloads, ensure the extension exists, declare a `Vector` column, and build an approximate-nearest-neighbour index.

```go
Up: func(m *migrate.Migrator) error {
    if err := m.CreateVectorExtension(); err != nil { // CREATE EXTENSION IF NOT EXISTS vector
        return err
    }
    if err := m.CreateTable("documents", func(t *migrate.TableBuilder) {
        t.ID()
        t.Text("content")
        t.Vector("embedding", 1536)
    }); err != nil {
        return err
    }
    // CREATE INDEX ... USING hnsw ("embedding" vector_cosine_ops)
    return m.VectorIndex("documents", "embedding", "hnsw", "vector_cosine_ops")
}
```

`Vector`, `VectorIndex`, and `CreateVectorExtension` are PostgreSQL-only and return an error on other drivers. Vector dimensions must be between 1 and 16000.

## Driver-Specific Notes

The builder emits driver-aware DDL for the three supported drivers. Some highlights:

- **PostgreSQL**: `ID()`/`BigID()` use `SERIAL`/`BIGSERIAL`, `UUIDPrimary()` defaults to `gen_random_uuid()`, `JSONB` maps to native `JSONB`, and `Vector` requires the pgvector extension.
- **MySQL**: `ID()` uses `INT AUTO_INCREMENT`, `UUID` columns are `CHAR(36)`, and `JSONB` falls back to `JSON`. `DropIndex` requires the table name.
- **SQLite**: integers share one storage class (`Integer`, `BigInteger`, `SmallInteger`, `Boolean` all map to `INTEGER`), `UUID`/`JSON`/`JSONB` map to `TEXT`, and `ALTER TABLE` support is limited (no DROP COLUMN before 3.35.0). When adding CHECK constraints to an existing table, Velocity rebuilds the table for you.

## Best Practices

1. **One change per migration** - Keep migrations focused and reversible.
2. **Never modify applied migrations** - Create new migrations for further changes.
3. **Test rollbacks** - Ensure `Down` properly reverses `Up`.
4. **Use timestamp versions** - The 14-digit `YYYYMMDDHHmmss` format avoids ordering conflicts in teams.
5. **Index foreign keys** - Always index foreign-key columns.
6. **Add constraints carefully** - Consider existing data when adding NOT NULL or CHECK constraints.
7. **Backup before migrating** - Especially in production.
</content>
</invoke>
