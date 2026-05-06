---
title: "Feature Flags"
description: Minimal Provider interface, request-scoped overrides, and an in-memory driver for tests.
weight: 78
---

The `flags` package is the framework's feature-flag adapter surface.
It ships only a `Provider` interface, a top-level `Enabled` helper,
context attachment, a process-wide default slot, and a memory driver
for tests and local development. Production deployments are expected
to plug in a third-party SaaS (LaunchDarkly, Unleash, PostHog,
Statsig, Flagsmith) or a community adapter behind the same interface.

Higher-level concerns - rollout strategies, percentage hashing, cohort
targeting, registries, and admin UI - are deliberately out of scope.

Import path: `github.com/velocitykode/velocity/flags`

## Provider interface

```go
type Provider interface {
    Enabled(ctx context.Context, name string) bool
}
```

Implementations must be safe for concurrent use and should return
`false` for unknown flags.

## Package-level helpers

```go
flags.SetDefault(p)                           // install process-wide default
p := flags.Default()                          // read it back (may be nil)

ctx = flags.WithProvider(ctx, p)              // request-scoped override
on := flags.Enabled(ctx, "checkout.v2")       // resolve a flag
```

`Enabled` resolves in this order:

1. Provider attached to `ctx` via `WithProvider` - the request-scoped
   override.
2. Process-wide default installed via `SetDefault`.
3. `false` - unknown flag stays off.

`SetDefault` is safe for concurrent use; pass `nil` to clear the
default. `WithProvider` accepts a nil context and falls back to
`context.Background()`.

## MemoryProvider

`MemoryProvider` is an in-process driver backed by a map. Use it in
tests, in local development, or in small single-process apps;
production systems should sit a real SaaS adapter behind the
`Provider` interface.

```go
m := flags.NewMemoryProvider(map[string]bool{
    "checkout.v2": true,
    "new-search":  false,
})

m.Enabled(ctx, "checkout.v2") // true
m.Enabled(ctx, "missing")     // false
```

`NewMemoryProvider` copies the seed map, so later mutations to the
caller's map do not affect the provider. A nil seed is treated as
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

The provider has no `Delete` method - drop a flag by calling
`SetAll` with a map that omits it, or set it to `false`.

## Recipes

### Set up a process-wide default provider

Install one provider during boot (typically a service-provider `Boot`
hook) so every code path can call `flags.Enabled` without threading
the provider explicitly:

```go
func (p *AppProvider) Boot(v *velocity.Velocity) error {
    flags.SetDefault(flags.NewMemoryProvider(map[string]bool{
        "checkout.v2": v.Config.GetBool("flags.checkout_v2"),
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

Attach a request-scoped provider when a header, cookie, or user
attribute should flip flags for the duration of one request - useful
for QA overrides or staff dogfooding:

```go
func StaffOverrides() router.Middleware {
    return func(next router.Handler) router.Handler {
        return func(ctx *router.Context) error {
            if user := auth.User(ctx); user != nil && user.IsStaff {
                p := flags.NewMemoryProvider(map[string]bool{
                    "checkout.v2": true,
                    "new-search":  true,
                })
                ctx.Request = ctx.Request.WithContext(
                    flags.WithProvider(ctx.Request.Context(), p),
                )
            }
            return next(ctx)
        }
    }
}
```

The request-scoped provider takes precedence over the process-wide
default, so handlers downstream see the staff-flipped flags without
any other code change.

## Related

- [Middleware](/docs/core/middleware/) - the natural attachment point for `WithProvider` when a header or user attribute should flip flags per request
- [Config](/docs/core/config/) - read flag seeds from `Config` so the same memory driver can boot from `app.toml` or env vars
