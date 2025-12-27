---
title: Migrations
weight: 50
---

Migrations provide version control for your database schema.

## Creating Migrations

```go
// database/migrations/2024_01_01_000001_create_users_table.go
package migrations

import (
    "github.com/velocitykode/velocity/pkg/orm"
)

type CreateUsersTable struct {
    orm.Migration
}

func (m *CreateUsersTable) Up() error {
    return orm.Schema.Create("users", func(table *orm.Table) {
        table.ID()
        table.String("name", 255)
        table.String("email", 255).Unique()
        table.String("password", 255)
        table.String("role", 50).Default("user")
        table.Boolean("active").Default(true)
        table.Timestamps()
        table.SoftDeletes()

        // Indexes
        table.Index("email")
        table.Index("role", "active").Name("idx_role_active")
    })
}

func (m *CreateUsersTable) Down() error {
    return orm.Schema.Drop("users")
}
```

## Running Migrations

```go
// Run all pending migrations
orm.Migrate()

// Rollback last batch
orm.Rollback()

// Rollback all
orm.Reset()

// Rollback and re-run all
orm.Refresh()

// Drop all tables and re-run
orm.Fresh()
```

## Schema Builder

### Creating Tables

```go
orm.Schema.Create("products", func(table *orm.Table) {
    table.ID()
    table.String("name", 255).NotNull()
    table.Text("description").Nullable()
    table.Decimal("price", 10, 2)
    table.Integer("stock").Default(0)
    table.Boolean("active").Default(true)
    table.ForeignID("category_id").Constrained()
    table.Timestamps()
})
```

### Column Types

| Method | Description |
|--------|-------------|
| `ID()` | Auto-incrementing BIGINT primary key |
| `String(name, length)` | VARCHAR column |
| `Text(name)` | TEXT column |
| `Integer(name)` | INT column |
| `BigInteger(name)` | BIGINT column |
| `TinyInteger(name)` | TINYINT column |
| `Boolean(name)` | BOOLEAN column |
| `Decimal(name, precision, scale)` | DECIMAL column |
| `Float(name)` | FLOAT column |
| `Date(name)` | DATE column |
| `DateTime(name)` | DATETIME column |
| `Timestamp(name)` | TIMESTAMP column |
| `Time(name)` | TIME column |
| `Json(name)` | JSON column |
| `Binary(name)` | BLOB column |
| `UUID(name)` | UUID/CHAR(36) column |
| `Enum(name, values...)` | ENUM column |

### Column Modifiers

```go
table.String("name", 255).NotNull()
table.String("bio", 500).Nullable()
table.String("role", 50).Default("user")
table.Integer("order").Unsigned()
table.String("phone", 20).After("email")
table.String("old_name", 100).Comment("Deprecated")
```

### Timestamps and Soft Deletes

```go
table.Timestamps()      // created_at, updated_at
table.SoftDeletes()     // deleted_at
table.TimestampsTz()    // With timezone
table.SoftDeletesTz()   // With timezone
```

### Indexes

```go
// Single column index
table.Index("email")

// Composite index
table.Index("role", "active")

// Named index
table.Index("email", "active").Name("idx_user_lookup")

// Unique index
table.Unique("email")

// Fulltext index (MySQL)
table.Fulltext("title", "content")
```

### Foreign Keys

```go
// Simple foreign key
table.ForeignID("user_id").Constrained()

// With custom table
table.ForeignID("author_id").Constrained("users")

// With actions
table.ForeignID("category_id").
    Constrained().
    OnDelete("CASCADE").
    OnUpdate("CASCADE")

// Manual foreign key
table.Foreign("user_id").
    References("id").
    On("users").
    OnDelete("SET NULL")
```

## Modifying Tables

```go
orm.Schema.Table("users", func(table *orm.Table) {
    // Add column
    table.String("phone", 20).After("email")

    // Modify column
    table.String("name", 500).Change()

    // Rename column
    table.RenameColumn("bio", "biography")

    // Drop column
    table.DropColumn("old_field")

    // Add index
    table.Index("phone")

    // Drop index
    table.DropIndex("idx_old_index")

    // Add foreign key
    table.ForeignID("team_id").Constrained()

    // Drop foreign key
    table.DropForeign("users_team_id_foreign")
})
```

## Checking Existence

```go
// Check table exists
if orm.Schema.HasTable("users") {
    // Table exists
}

// Check column exists
if orm.Schema.HasColumn("users", "email") {
    // Column exists
}

// Check index exists
if orm.Schema.HasIndex("users", "idx_email") {
    // Index exists
}
```

## Dropping Tables

```go
// Drop table
orm.Schema.Drop("old_table")

// Drop if exists
orm.Schema.DropIfExists("old_table")

// Drop multiple
orm.Schema.DropIfExists("table1", "table2", "table3")
```

## Raw SQL

```go
func (m *CustomMigration) Up() error {
    return orm.Schema.Raw(`
        CREATE VIEW active_users AS
        SELECT * FROM users WHERE active = true
    `)
}

func (m *CustomMigration) Down() error {
    return orm.Schema.Raw("DROP VIEW IF EXISTS active_users")
}
```

## Driver-Specific Features

### MySQL

```go
orm.Schema.Create("posts", func(table *orm.Table) {
    table.ID()
    table.String("title", 255)
    table.Text("content")
    table.Fulltext("title", "content")  // Fulltext search
    table.Engine("InnoDB")
    table.Charset("utf8mb4")
    table.Collation("utf8mb4_unicode_ci")
})
```

### PostgreSQL

```go
orm.Schema.Create("events", func(table *orm.Table) {
    table.UUID("id").Primary()
    table.String("name", 255)
    table.Json("metadata")          // JSONB
    table.Array("tags", "varchar")  // Array type
    table.TsVector("search")        // Full-text search
})
```

### SQLite

```go
orm.Schema.Create("settings", func(table *orm.Table) {
    table.ID()
    table.String("key", 255).Unique()
    table.Text("value")
    // SQLite has limited ALTER TABLE support
    // Consider recreating tables for complex changes
})
```

## Best Practices

1. **One change per migration** - Keep migrations focused and reversible
2. **Never modify run migrations** - Create new migrations for changes
3. **Test rollbacks** - Ensure `Down()` properly reverses `Up()`
4. **Use meaningful names** - Name migrations descriptively
5. **Index foreign keys** - Always index foreign key columns
6. **Add constraints carefully** - Consider existing data when adding NOT NULL
7. **Backup before migrating** - Especially in production
