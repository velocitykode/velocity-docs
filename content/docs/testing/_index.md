---
title: Testing
description: Test Velocity applications with an in-memory app harness, a fluent HTTP test client with expressive response assertions, and fakes for events and the command bus.
weight: 75
sidebar:
  open: true
---

Velocity ships a batteries-included testing toolkit: an in-memory app harness, a fluent HTTP client that drives your router and asserts against the response, and fakes that record events and commands so you can assert what your code dispatched.

## Test App

`velocitytest.NewApp` builds an `*velocity.App` wired with the in-memory defaults a test needs: memory cache, memory queue, console logger, log-mail driver, and `APP_ENV=testing` (which opts out of the `APP_KEY` requirement). It lives in its own subpackage so production builds never pull in those defaults.

```go
import "github.com/velocitykode/velocity/velocitytest"

func TestSignup(t *testing.T) {
    app, err := velocitytest.NewApp()
    if err != nil {
        t.Fatal(err)
    }
    defer app.Shutdown(context.Background())

    // register routes, then drive them with the HTTP client below
}
```

It accepts the same `Option` funcs as `velocity.New()`, so you can layer config or swap services. `WithoutEvents()` skips event dispatching; `WithFakeEvents(fake)` swaps in a recording dispatcher (see [Fakes](#fakes)).

## HTTP Tests

`testing/http.NewTestClient` wraps a router (any `http.Handler`) and gives you request verbs that return a `*TestResponse`. Assertions are chainable and fail the test through the `*testing.T` you pass in.

```go
import velhttp "github.com/velocitykode/velocity/testing/http"

func TestEcho(t *testing.T) {
    client := velhttp.NewTestClient(t, router)

    client.PostJSON("/echo", map[string]any{"name": "test"}).
        AssertOk().
        AssertJSON("received.name", "test").
        AssertJSONPath("data.status", "active")
}
```

### Request verbs

```go
client.Get("/path")
client.Post("/path", body)        // body is an io.Reader
client.PostJSON("/path", data)    // marshals data, sets Content-Type
client.Put("/path", body)
client.PutJSON("/path", data)
client.Patch("/path", body)
client.PatchJSON("/path", data)
client.Delete("/path")
```

Builder methods stack request state before a verb:

```go
client.WithHeader("X-Request-Id", "abc").
    WithToken("jwt-token").              // sets Authorization: Bearer
    WithCookie(&http.Cookie{...}).
    Get("/me")
```

### Response assertions

Status:

```go
resp.AssertStatus(418)
resp.AssertOk()            // 200
resp.AssertCreated()       // 201
resp.AssertNoContent()     // 204
resp.AssertNotFound()      // 404
resp.AssertForbidden()     // 403
resp.AssertUnauthorized()  // 401
resp.AssertUnprocessable() // 422
resp.AssertRedirect("/login") // location optional
```

Headers and cookies:

```go
resp.AssertHeader("Content-Type", "application/json")
resp.AssertHeaderMissing("X-Debug")
resp.AssertCookie("session", "value")
resp.AssertCookieMissing("session")
```

Body and JSON:

```go
resp.AssertBodyContains("Hello")
resp.AssertBodyEmpty()
resp.AssertJSON("user.name", "Alice")     // dotted key
resp.AssertJSONPath("data.address.city", "Portland")
resp.AssertJSONCount(3, "posts")
resp.AssertJSONStructure([]string{"id", "name", "email"})
```

### Authentication

Act as a user for the request, or assert the resulting auth state:

```go
client.ActingAs(guard, user).Get("/dashboard").AssertOk()
client.ActingAsID(guard, userID).Get("/dashboard").AssertOk()

client.AssertAuthenticated(guard)
client.AssertGuest(guard)
```

### Validation

When a route runs validation, assert the outcome directly:

```go
resp := client.PostJSON("/signup", map[string]any{"email": "bad"})

resp.AssertInvalid("email")                    // these fields failed
resp.AssertValidationErrors(map[string][]string{
    "email": {"The email must be a valid email address."},
})

resp.AssertValid() // no validation errors
```

## Unit-Level Context

For handler unit tests without a full app or router, `router.NewTestContext` returns a `*Context` backed by an `*httptest.ResponseRecorder`:

```go
ctx, rec := router.NewTestContext("POST", "/users", body)
err := MyHandler(ctx)

if rec.Code != 201 {
    t.Fatalf("got %d", rec.Code)
}
```

## Integration Testing

For tests that hit a real database, refresh the schema between tests and build rows with factories.

### Refresh the database

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

### Factories

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

### Putting it together

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

## Fakes

### Events

`events.NewFakeDispatcher()` records dispatched events instead of running listeners, so you can assert what fired. Wire it via `WithFakeEvents` or set it on the app directly.

```go
fake := events.NewFakeDispatcher()

fake.AssertDispatched(UserRegistered{}, func(e interface{}) bool {
    return e.(UserRegistered).Email == "a@b.com"
})
fake.AssertDispatchedTimes(UserRegistered{}, 1)
fake.AssertNotDispatched(PaymentFailed{})
fake.AssertNothingDispatched()
```

### Command Bus

`bus.NewFakeBus()` records commands (sync and async) for the same style of assertion.

```go
fake := bus.NewFakeBus()

fake.AssertDispatched(CreateUser{}, func(c bus.Command) bool { ... })
fake.AssertDispatchedTimes(CreateUser{}, 1)
fake.AssertNotDispatched(DeleteUser{})
fake.AssertNothingDispatched()

// async path
fake.AssertAsyncDispatched(SendEmail{}, func(c bus.Command) bool { ... })
fake.AssertAsyncDispatchedTimes(SendEmail{}, 1)
fake.AssertAsyncNotDispatched(SendEmail{})
fake.AssertNothingAsyncDispatched()
```
