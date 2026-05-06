---
title: Query Builder
description: Build complex database queries with Velocity's fluent query builder for filtering, sorting, and pagination.
weight: 20
---

Velocity provides a fluent query builder for database operations.

## Basic Queries

```go
// Find single record
user, err := User{}.Find(1)                           // Find by ID
user, err := User{}.FindBy("email", "john@example.com") // Find by field
user, err := User{}.First()                           // Get first record
user, err := User{}.Last()                            // Get last record

// Find multiple records
users, err := User{}.All()                            // Get all records
users, err := User{}.Where("role = ?", "admin").Get() // Get with conditions
users, err := User{}.WhereActive(true).Get()          // Dynamic where methods

// Check existence
exists := User{}.Where("email = ?", "john@example.com").Exists()
exists := User{}.WhereEmail("john@example.com").Exists()

// Count records
count := User{}.Count()
count := User{}.Where("role = ?", "admin").Count()
```

## Tracing and Cancellation

The static-like helpers (`Find`, `FindBy`, `First`, `All`, `Where`, ...) are context-blind by themselves. To propagate a request or transaction context to the driver, enter the chain through `Model[T].WithContext(ctx)`. Every base model (`Model[T]`, `UUIDModel[T]`, `SoftDeleteModel[T]`, `SoftDeleteUUIDModel[T]`, `ImmutableModel[T]`, `ImmutableUUIDModel[T]`) exposes it.

```go
// Context-blind (no cancellation, no trace propagation)
user, err := User{}.Find(1)
user, err := User{}.FindBy("email", "john@example.com")
users, err := User{}.Where("role = ?", "admin").Get()
count := User{}.Count()

// Context-bound (cancellation honored, trace IDs flow through)
var u User
err := orm.Model[User]{}.WithContext(ctx).Where("id = ?", 1).First(&u)
err := orm.Model[User]{}.WithContext(ctx).Where("email = ?", email).First(&u)
users, err := orm.Model[User]{}.WithContext(ctx).Where("role = ?", "admin").Get()
count, err := orm.Model[User]{}.WithContext(ctx).Count()
```

`WithContext` returns `*Query[T]` so the rest of the builder API (`Where`, `OrderBy`, `GroupBy`, `Limit`, `Pluck`, ...) is available on the chain. Reach for it on any handler that already has a `ctx context.Context` in scope; it costs nothing and unblocks request-scoped cancellation and tracing.

{{< callout type="tip" title="Mass updates" >}}
For mass updates, chain through the builder so the driver sees ctx:

```go
affected, err := orm.Model[User]{}.WithContext(ctx).
    Where("role = ?", "guest").
    Update(map[string]any{"active": false})
```
{{< /callout >}}

## Chained Queries

```go
users, err := User{}.
    Where("role = ?", "admin").
    OrWhere("super_admin = ?", true).
    OrderBy("created_at", "DESC").
    Limit(10).
    Offset(20).
    Get()
```

## Select Columns

```go
// Select specific columns
users, err := User{}.Select("id", "name", "email").Get()

// Pluck single column
emails, err := User{}.Pluck("email")

// Pluck distinct values: .Distinct().Pluck(col) returns deduped values
roles, err := User{}.Distinct().Pluck("role")

// Pluck as map
emailsMap, err := User{}.PluckMap("id", "email") // map[uint]string
```

## Conditions

### Where Clauses

```go
// Basic where
users, _ := User{}.Where("active = ?", true).Get()

// Multiple conditions
users, _ := User{}.
    Where("role = ?", "admin").
    Where("active = ?", true).
    Get()

// Or where
users, _ := User{}.
    Where("role = ?", "admin").
    OrWhere("super_admin = ?", true).
    Get()

// Where in
users, _ := User{}.WhereIn("role", []string{"admin", "moderator"}).Get()

// Where between
users, _ := User{}.WhereBetween("age", 18, 65).Get()

// Where null
users, _ := User{}.WhereNull("deleted_at").Get()
users, _ := User{}.WhereNotNull("email_verified_at").Get()

// Dynamic where (generated from struct fields)
users, _ := User{}.WhereEmail("john@example.com").Get()
users, _ := User{}.WhereRole("admin").WhereActive(true).Get()
```

### Raw Expressions

```go
users, _ := User{}.
    Where("YEAR(created_at) = ?", 2024).
    Get()

users, _ := User{}.
    Select("id", "name", orm.Raw("COUNT(*) as post_count")).
    Join("posts", "posts.user_id", "=", "users.id").
    GroupBy("users.id").
    Get()
```

### Grouped Predicates

`WhereGroup` and `OrWhereGroup` wrap a sub-builder's conditions in parentheses so they bind tighter than the surrounding `AND`/`OR`. Reach for it whenever an `OR` group needs to be scoped by an outer predicate, typically a multi-column free-text search restricted to the current tenant or team.

```go
// WHERE team_id = ? AND (name LIKE ? OR email LIKE ?)
users, err := User{}.
    Where("team_id = ?", teamID).
    WhereGroup(func(sub *orm.Query[User]) {
        sub.Where("name LIKE ?", "%"+q+"%").
            OrWhere("email LIKE ?", "%"+q+"%")
    }).
    Get()
```

`OrWhereGroup` is the OR-joined counterpart:

```go
// WHERE active = ? OR (role = ? OR role = ?)
users, err := User{}.
    Where("active = ?", true).
    OrWhereGroup(func(sub *orm.Query[User]) {
        sub.Where("role = ?", "admin").
            OrWhere("role = ?", "owner")
    }).
    Get()
```

Empty groups (closure adds no conditions) are dropped, no stray parentheses appear in the SQL. A `nil` closure is a no-op. Errors from the sub-builder propagate to the outer query and surface on the next terminal call.

## Ordering

```go
// Single order
users, _ := User{}.OrderBy("created_at", "DESC").Get()

// Multiple orders
users, _ := User{}.
    OrderBy("role", "ASC").
    OrderBy("name", "ASC").
    Get()

// Latest/Oldest shortcuts
users, _ := User{}.Latest().Get()  // ORDER BY created_at DESC
users, _ := User{}.Oldest().Get()  // ORDER BY created_at ASC
```

## Grouping and Aggregates

```go
// Group by
results, err := User{}.
    Select("role", "COUNT(*) as count").
    GroupBy("role").
    Get()

// Having
results, err := User{}.
    Select("role", "COUNT(*) as count").
    GroupBy("role").
    Having("COUNT(*) > ?", 5).
    Get()

// Aggregates
count := User{}.Count()
sum := Order{}.Sum("total")
avg := Product{}.Avg("price")
max := Product{}.Max("price")
min := Product{}.Min("price")
```

## Joins

```go
// Inner join
users, _ := User{}.
    Join("posts", "posts.user_id", "=", "users.id").
    Select("users.*", "posts.title").
    Get()

// Left join
users, _ := User{}.
    LeftJoin("posts", "posts.user_id", "=", "users.id").
    Get()

// Multiple joins
users, _ := User{}.
    Join("posts", "posts.user_id", "=", "users.id").
    Join("comments", "comments.post_id", "=", "posts.id").
    Distinct().
    Get()
```

## Pagination

```go
// Simple pagination
users, err := User{}.Limit(10).Offset(20).Get()

// Paginate helper
pagination := User{}.Paginate(page, perPage)
// Returns: { Data: []User, Total: 100, PerPage: 10, CurrentPage: 1, LastPage: 10 }
```

## Chunking

Process large datasets in batches:

```go
// Process in chunks
User{}.Chunk(1000, func(users []User) error {
    for _, user := range users {
        // Process user
    }
    return nil
})

// Cursor for memory efficiency (one at a time)
User{}.Cursor(func(user *User) error {
    // Process single user
    return nil
})
```

## Subqueries

```go
// Subquery in where
users, _ := User{}.
    WhereIn("id", Post{}.Select("user_id").Where("published = ?", true)).
    Get()

// Subquery in select
users, _ := User{}.
    Select("*").
    SelectSub(Post{}.Select("COUNT(*)").Where("posts.user_id = users.id"), "post_count").
    Get()
```

## Performance Tips

### Select Only Needed Columns

```go
// Bad: fetches all columns
users, _ := User{}.Get()

// Good: fetches only needed columns
users, _ := User{}.Select("id", "name", "email").Get()
```

### Avoid N+1 Queries

```go
// Bad: N+1 queries
users, _ := User{}.Get()
for _, user := range users {
    posts, _ := Post{}.WhereUserID(user.ID).Get() // N queries
}

// Good: Eager loading
users, _ := User{}.With("Posts").Get() // 2 queries total
```

### Use Indexes

```go
// Ensure columns used in WHERE, ORDER BY, JOIN are indexed
User{}.Where("email = ?", email).First()  // email should be indexed
User{}.OrderBy("created_at", "DESC").Get() // created_at should be indexed
```

## Related

- [CRUD](/docs/database/crud/) - create, update, delete, and lifecycle hooks for the same models you query here
- [Relationships](/docs/database/relationships/) - HasMany / BelongsTo helpers and `With(...)` eager loading
- [Global Query Scopes](/docs/database/scopes/) - register predicates that run on every `Get` / `Count` / `Pluck` / `Update`, with per-query opt-out for admin work
- [Transactional Outbox](/docs/database/outbox/) - atomically commit queue jobs and events alongside writes
- [Migrations](/docs/database/migrations/) - schema definitions and indexes that back efficient queries
