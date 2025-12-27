---
title: Query Builder
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
