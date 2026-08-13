---
title: "Feature Flags"
description: Minimal Driver interface, request-scoped overrides, and an in-memory driver for tests.
weight: 78
---

The `flags` package is the framework's feature-flag adapter surface.
It ships only a `Driver` interface, a top-level `Enabled` helper,
context attachment, a process-wide default slot, and a memory driver
for tests and local development. Production deployments are expected
to plug in a third-party SaaS (LaunchDarkly, Unleash, PostHog,
Statsig, Flagsmith) or a community adapter behind the same interface.

Higher-level concerns - rollout strategies, percentage hashing, cohort
targeting, registries, and admin UI - are deliberately out of scope.

Import path: `github.com/velocitykode/velocity/flags`

## Driver interface

```go
type Driver interface {
    Enabled(ctx context.Context, name string) bool
}
```

Implementations must be safe for concurrent use and should return
`false` for unknown flags.

## Package-level helpers

```go
flags.SetDefault(d)                           // install process-wide default
d := flags.Default()                          // read it back (may be nil)

ctx = flags.WithDriver(ctx, d)                // request-scoped override
on := flags.Enabled(ctx, "checkout.v2")       // resolve a flag
```

`Enabled` resolves in this order:

1. Driver attached to `ctx` via `WithDriver` - the request-scoped
   override.
2. Process-wide default installed via `SetDefault`.
3. `false` - unknown flag stays off.

`SetDefault` is safe for concurrent use; pass `nil` to clear the
default. `WithDriver` accepts a nil context and falls back to
`context.Background()`.

## MemoryDriver

`MemoryDriver` is an in-process driver backed by a map. Use it in
tests, in local development, or in small single-process apps;
production systems should sit a real SaaS adapter behind the
`Driver` interface.

```go
m := flags.NewMemoryDriver(map[string]bool{
    "checkout.v2": true,
    "new-search":  false,
})

m.Enabled(ctx, "checkout.v2") // true
m.Enabled(ctx, "missing")     // false
```

`NewMemoryDriver` copies the seed map, so later mutations to the
caller's map do not affect the driver. A nil seed is treated as
empty.

### Mutating flags

```go
m.Set("new-search", true)                       // toggle one flag
m.SetAll(map[string]bool{"checkout.v2": true})  // replace every flag
```

`SetAll` builds the replacement map and swaps it under the same write
lock that guards `Set`, so a concurrent `Set` cannot be silently
overwritten between the build and the swap. Passing `nil` to `SetAll`
clears every flag.

The driver has no `Delete` method - drop a flag by calling
`SetAll` with a map that omits it, or set it to `false`.

## Recipes

### Set up a process-wide default driver

Install one driver during boot (typically a module `Start` hook, which
runs after every module has been initialized) so every code path can
call `flags.Enabled` without threading the driver explicitly:

```go
func (m *AppModule) Start(s *velocity.Services) error {
    on, _ := strconv.ParseBool(os.Getenv("FLAGS_CHECKOUT_V2"))
    flags.SetDefault(flags.NewMemoryDriver(map[string]bool{
        "checkout.v2": on,
    }))
    return nil
}
```

Anywhere in the app:

```go
if flags.Enabled(ctx, "checkout.v2") {
    return checkoutV2(ctx, order)
}
return checkoutV1(ctx, order)
```

### Override flags per-request via middleware

Attach a request-scoped driver when a header, cookie, or user
attribute should flip flags for the duration of one request - useful
for QA overrides or staff dogfooding:

```go
func StaffOverrides() router.MiddlewareFunc {
    return func(next router.HandlerFunc) router.HandlerFunc {
        return func(ctx *router.Context) error {
            if m := auth.FromContext(ctx); m != nil {
                if user := m.User(ctx.Request); user != nil && m.Access().HasRole(user, "staff") {
                    d := flags.NewMemoryDriver(map[string]bool{
                        "checkout.v2": true,
                        "new-search":  true,
                    })
                    ctx.Request = ctx.Request.WithContext(
                        flags.WithDriver(ctx.Request.Context(), d),
                    )
                }
            }
            return next(ctx)
        }
    }
}
```

The request-scoped driver takes precedence over the process-wide
default, so handlers downstream see the staff-flipped flags without
any other code change.

## Related

- [Middleware](/docs/core/middleware/) - the natural attachment point for `WithDriver` when a header or user attribute should flip flags per request
- [Config](/docs/core/config/) - read flag seeds from the environment so the same memory driver can boot from `.env`
