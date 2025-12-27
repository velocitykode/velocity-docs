---
title: Getting Started
weight: 10
---

Velocity provides a powerful ORM built on top of GORM, offering a fluent, developer-friendly API with Go's type safety.

## Quick Start

```go
import (
    "github.com/velocitykode/velocity/pkg/orm"
    "github.com/joho/godotenv"
)

func main() {
    // Load environment variables
    godotenv.Load()

    // Initialize ORM (auto-detects driver from DB_CONNECTION)
    orm.Init()

    // Run migrations
    orm.Migrate()

    // Start your application
    log.Info("Application started with database")
}
```

## Configuration

Configure your database connection in `.env`:

```env
# Database configuration
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=velocity_app
DB_USERNAME=root
DB_PASSWORD=secret

# Optional settings
DB_MAX_IDLE_CONNS=10
DB_MAX_OPEN_CONNS=100
DB_CONN_MAX_LIFETIME=3600
DB_LOG_QUERIES=true
DB_SLOW_QUERY_THRESHOLD=200ms
```

## Supported Drivers

| Driver | Value | Notes |
|--------|-------|-------|
| MySQL | `mysql` | MySQL 8.0+ with full feature support |
| PostgreSQL | `postgres` | PostgreSQL 17+ with JSONB and array support |
| SQLite | `sqlite` | SQLite 3.x for development and testing |

## Model Definition

```go
package models

import (
    "github.com/velocitykode/velocity/pkg/orm"
)

type User struct {
    orm.Model[User]  // Embed with User type for static methods
    Name      string    `orm:"column:name;type:varchar(255);not_null"`
    Email     string    `orm:"column:email;type:varchar(255);unique;not_null"`
    Password  string    `orm:"column:password;type:varchar(255);not_null"`
    Role      string    `orm:"column:role;type:varchar(50);default:'user'"`
    Active    bool      `orm:"column:active;type:boolean;default:true"`
    Profile   *Profile  `orm:"relation:hasOne"`
    Posts     []Post    `orm:"relation:hasMany"`
}

// Optional: Customize table name
func (User) TableName() string {
    return "users"
}

// Optional: Specify connection
func (User) Connection() string {
    return "default"
}
```

## ORM Tags

| Tag | Description | Example |
|-----|-------------|---------|
| `column` | Database column name | `column:user_name` |
| `type` | Column type | `type:varchar(255)` |
| `not_null` | Not nullable | `not_null` |
| `unique` | Unique constraint | `unique` |
| `default` | Default value | `default:'active'` |
| `relation` | Relationship type | `relation:hasMany` |
| `join_table` | Many-to-many join table | `join_table:post_tags` |

## Scopes

Define reusable query scopes:

```go
// Define scopes in model
func (User) ScopeActive() *orm.Query[User] {
    return User{}.Where("active = ?", true)
}

func (User) ScopeAdmins() *orm.Query[User] {
    return User{}.WhereIn("role", []string{"admin", "super_admin"})
}

func (User) ScopeRecent(days int) *orm.Query[User] {
    return User{}.Where("created_at > ?", time.Now().AddDate(0, 0, -days))
}

// Use scopes
users, err := User{}.Active().Get()
users, err := User{}.Admins().Recent(7).Get()
```

## Testing

```go
// Use SQLite in-memory for tests
func TestMain(m *testing.M) {
    os.Setenv("DB_CONNECTION", "sqlite")
    os.Setenv("DB_DATABASE", ":memory:")

    orm.Init()
    orm.Migrate()

    code := m.Run()
    orm.Close()
    os.Exit(code)
}

// Factory pattern
func UserFactory(attrs ...map[string]any) User {
    user := User{
        Name:  faker.Name(),
        Email: faker.Email(),
        Role:  "user",
    }

    if len(attrs) > 0 {
        for key, val := range attrs[0] {
            reflect.ValueOf(&user).Elem().FieldByName(key).Set(reflect.ValueOf(val))
        }
    }

    return user
}

// Database assertions
func TestUserUpdate(t *testing.T) {
    user := UserFactory()
    user.Save()

    user.Update(map[string]any{"role": "admin"})

    orm.AssertDatabaseHas(t, "users", map[string]any{
        "id":   user.ID,
        "role": "admin",
    })
}
```

## Best Practices

1. **Use model embedding** - Always embed `orm.Model[T]` for automatic CRUD methods
2. **Leverage eager loading** - Use `With()` to prevent N+1 queries
3. **Implement soft deletes** - Add `DeletedAt` field for recoverable deletions
4. **Use transactions** - Wrap related operations in transactions
5. **Index foreign keys** - Index frequently queried columns
6. **Use migrations** - Never modify schema directly in production
