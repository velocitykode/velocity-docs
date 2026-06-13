---
title: Database & Factories
description: Refresh the database schema between tests and build rows with typed model factories for fast, isolated integration testing.
weight: 20
---

For tests that hit a real database, refresh the schema between tests and build rows with factories. Combine these with the [HTTP client]({{< relref "http-tests" >}}) for full integration tests.

## Refresh the database

`ormtesting.NewTestCase(t, manager)` gives you two refresh strategies. Both refuse to run outside a test environment (guarded by `APP_ENV`).

```go
import ormtesting "github.com/velocitykode/velocity/orm/testing"

func TestUserList(t *testing.T) {
    tc := ormtesting.NewTestCase(t, manager)
    tc.LazyRefreshDatabase() // migrate once per suite, truncate per test (fast, default)
    // tc.RefreshDatabase()  // drop + re-migrate every test (full isolation, slower)

    db := tc.DB()
    // ... seed with factories, then exercise your code
}
```

- **LazyRefreshDatabase**: runs migrations once per suite, then truncates all tables before each test. Reach for this by default.
- **RefreshDatabase**: drops all tables and re-migrates for *every* test. Use when the migrations themselves are under test.

A free-function form returns the `*sql.DB` directly:

```go
db := ormtesting.RefreshDatabase(t, manager)
```

## Factories

Define how a model is built once, then make or persist rows with optional states and overrides. Typed factories operate on your struct:

```go
users := ormtesting.NewModelFactory[User](manager, func() *User {
    f := ormtesting.Faker()
    return &User{Name: f.Name(), Email: f.Email(), Role: "user"}
}).
    DefineState("admin", func(u *User) { u.Role = "admin" }).
    DefineState("inactive", func(u *User) { u.Active = false })

u := users.MakeOne(nil)                                   // in-memory, not saved
u, err := users.CreateOne(ctx, &User{Email: "a@b.com"})   // persisted, overrides applied
admins, err := users.State("admin").CreateMany(ctx, 3, nil)
```

`Faker()` exposes a [gofakeit](https://github.com/brianvoe/gofakeit) faker for realistic values. When you don't have a struct, a map-based factory is available via `ormtesting.NewFactory(manager, "users", func() map[string]any { ... })`.

## Putting it together

Refresh the schema, seed with a factory, then drive a route with the HTTP client:

```go
func TestSignupPersistsUser(t *testing.T) {
    tc := ormtesting.NewTestCase(t, manager)
    tc.LazyRefreshDatabase()

    // seed an existing admin
    ormtesting.NewModelFactory[User](manager, newUser).
        State("admin").
        CreateOne(context.Background(), nil)

    // drive the route with the HTTP client
    velhttp.NewTestClient(t, router).
        PostJSON("/signup", map[string]any{"email": "new@b.com", "name": "New"}).
        AssertCreated().
        AssertJSONPath("user.email", "new@b.com")
}
```
