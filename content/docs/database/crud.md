---
title: CRUD Operations
weight: 40
---

Create, read, update, and delete records with Velocity ORM.

## Create

### Save Instance

```go
user := User{
    Name:  "John Doe",
    Email: "john@example.com",
    Role:  "user",
}
err := user.Save()  // Creates new record
fmt.Printf("User created with ID: %d\n", user.ID)
```

### Create with Map

```go
user, err := User{}.Create(map[string]any{
    "name":  "Jane Doe",
    "email": "jane@example.com",
    "role":  "admin",
})
```

### Create Multiple

```go
users := []User{
    {Name: "Alice", Email: "alice@example.com"},
    {Name: "Bob", Email: "bob@example.com"},
}
err := User{}.CreateMany(users)
```

### First Or Create

Find or create if not exists:

```go
// Find by email, or create with provided attributes
user, created := User{}.FirstOrCreate(
    map[string]any{"email": "john@example.com"},        // Search criteria
    map[string]any{"name": "John Doe", "role": "user"}, // Creation attributes
)

if created {
    fmt.Println("New user created")
} else {
    fmt.Println("Existing user found")
}
```

### Update Or Create

Find and update, or create if not exists:

```go
user, err := User{}.UpdateOrCreate(
    map[string]any{"email": "john@example.com"},        // Search criteria
    map[string]any{"name": "John Updated", "role": "admin"}, // Update/create attributes
)
```

## Read

See [Query Builder](queries) for detailed query documentation.

```go
// Find by ID
user, err := User{}.Find(1)

// Find by field
user, err := User{}.FindBy("email", "john@example.com")

// First/Last
user, err := User{}.First()
user, err := User{}.Last()

// All records
users, err := User{}.All()

// With conditions
users, err := User{}.Where("role = ?", "admin").Get()
```

## Update

### Update Instance

```go
user, _ := User{}.Find(1)
user.Name = "Updated Name"
user.Email = "newemail@example.com"
err := user.Save()  // Updates existing record (has ID)
```

### Update with Map

```go
user, _ := User{}.Find(1)
err := user.Update(map[string]any{
    "role":   "admin",
    "active": true,
})
```

### Mass Update

```go
// Update single field
affected := User{}.Where("role = ?", "guest").Update("active", false)

// Update multiple fields
affected := User{}.WhereRole("guest").UpdateMany(map[string]any{
    "active": false,
    "role":   "user",
})

fmt.Printf("Updated %d records\n", affected)
```

### Increment / Decrement

```go
user, _ := User{}.Find(1)

// Increment by 1
user.Increment("login_count")

// Increment by specific amount
user.Increment("points", 100)

// Decrement
user.Decrement("credits", 10)

// Mass increment
User{}.Where("active = ?", true).Increment("bonus", 5)
```

### Touch Timestamps

```go
user, _ := User{}.Find(1)

// Update updated_at to current time
user.Touch()

// Touch related records
user.Posts().Touch()
```

## Delete

### Soft Delete

If your model has a `DeletedAt` field, records are soft deleted:

```go
type User struct {
    orm.Model[User]
    Name      string     `orm:"column:name"`
    DeletedAt *time.Time `orm:"column:deleted_at"`  // Enables soft delete
}

user, _ := User{}.Find(1)
err := user.Delete()  // Sets deleted_at, doesn't remove row
```

### Force Delete

Permanently remove records:

```go
user, _ := User{}.Find(1)
err := user.ForceDelete()  // Permanent deletion
```

### Mass Delete

```go
// Delete matching records
affected := User{}.Where("role = ?", "guest").Delete()

// Force delete matching records
affected := User{}.Where("active = ?", false).ForceDelete()
```

### Delete with Associations

```go
user, _ := User{}.Find(1)

// Delete user and related records
user.DeleteWith("Profile", "Posts")
```

## Working with Soft Deletes

### Query Soft Deleted Records

```go
// Only soft deleted records
users, _ := User{}.OnlyTrashed().Get()

// Include soft deleted records
users, _ := User{}.WithTrashed().Get()

// Normal query (excludes soft deleted)
users, _ := User{}.Get()
```

### Restore Soft Deleted Records

```go
user, _ := User{}.OnlyTrashed().Find(1)
err := user.Restore()

// Mass restore
User{}.OnlyTrashed().Where("role = ?", "admin").Restore()
```

### Check if Soft Deleted

```go
user, _ := User{}.WithTrashed().Find(1)

if user.Trashed() {
    fmt.Println("User is soft deleted")
}
```

## Transactions

### Callback Transaction

```go
err := orm.Transaction(func() error {
    user := User{Name: "John", Email: "john@example.com"}
    if err := user.Save(); err != nil {
        return err // Auto rollback
    }

    profile := Profile{UserID: user.ID, Bio: "Developer"}
    if err := profile.Save(); err != nil {
        return err // Auto rollback
    }

    return nil // Auto commit
})

if err != nil {
    log.Printf("Transaction failed: %v", err)
}
```

### Manual Transaction

```go
tx := orm.Begin()
defer tx.Rollback() // Rollback if not committed

user := User{Name: "Jane"}
if err := user.SaveTx(tx); err != nil {
    return err
}

profile := Profile{UserID: user.ID}
if err := profile.SaveTx(tx); err != nil {
    return err
}

if err := tx.Commit(); err != nil {
    return err
}
```

### Nested Transactions (Savepoints)

```go
err := orm.Transaction(func() error {
    user := User{Name: "John"}
    user.Save()

    // Nested transaction (savepoint)
    err := orm.Transaction(func() error {
        post := Post{UserID: user.ID, Title: "Draft"}
        return post.Save()
    })

    if err != nil {
        // Inner transaction rolled back, outer continues
        log.Printf("Failed to create post: %v", err)
    }

    return nil
})
```

## Model Events

```go
type User struct {
    orm.Model[User]
    Name  string `orm:"column:name"`
    Email string `orm:"column:email"`
}

// Before create
func (u *User) Creating() error {
    u.Email = strings.ToLower(u.Email)
    return nil
}

// After create
func (u *User) Created() {
    log.Printf("User %d created", u.ID)
}

// Before update
func (u *User) Updating() error {
    return nil
}

// After update
func (u *User) Updated() {
    log.Printf("User %d updated", u.ID)
}

// Before delete
func (u *User) Deleting() error {
    return nil
}

// After delete
func (u *User) Deleted() {
    log.Printf("User %d deleted", u.ID)
}
```

## Best Practices

1. **Use transactions** - Wrap related operations in transactions
2. **Prefer soft deletes** - Use soft deletes for recoverable data
3. **Validate before save** - Validate data in `Creating()`/`Updating()` hooks
4. **Handle errors** - Always check returned errors
5. **Use mass updates carefully** - Mass updates skip model events
6. **Index for performance** - Index columns used in WHERE clauses
