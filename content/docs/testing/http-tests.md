---
title: HTTP & Feature Tests
description: Spin up an in-memory Velocity app, drive your router with a fluent HTTP client, chain expressive response assertions, and record events and commands with fakes.
weight: 10
---

The in-memory app harness, a fluent HTTP client that drives your router and asserts against the response, handler-level context for unit tests, and fakes that record what your code dispatched.

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

For seeding a real database and writing full integration tests, see [Database & Factories]({{< relref "database" >}}).
