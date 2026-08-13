---
title: Service Providers
description: Modular registration of services, routes, middleware, events, and scheduled jobs with lifecycle hooks.
weight: 85
---

Service providers are the modular extension point for Velocity
applications. A provider bundles registration for services, routes,
middleware, event listeners, and scheduled jobs behind a single type;
you install it with one line of wiring.

Import paths: `github.com/velocitykode/velocity` (the `velocity.*`
aliases used by application code) and `github.com/velocitykode/velocity/app`
(the underlying `ServiceProvider` interface and `Services` container). The
optional provider interfaces and the `ProviderRegistry` live in
`github.com/velocitykode/velocity/chain`, re-exported under the root
`velocity` package for ergonomics.

## The core interface

```go
type ServiceProvider interface {
    Register(s *Services) error      // bind services; called before Boot
    Boot(s *Services) error          // wire cross-provider dependencies
    Shutdown(ctx context.Context) error  // teardown; called in reverse order
}
```

Every provider implements these three methods. `Register` runs for all
providers first; `Boot` runs after, so providers can reference services
registered by others.

## The Services container

Providers read and mutate `*velocity.Services` (alias for
`app.Services`). It holds every core service instance, typed as
`contract` interfaces so the leaf `app` package avoids import cycles:

```go
type Services struct {
    Log        contract.Logger
    Exceptions contract.ExceptionHandler
    Crypto     contract.Encryptor
    DB         contract.Database
    Auth       contract.AuthManager
    CSRF       contract.CSRFProtector
    View       contract.ViewEngine

    Cache        contract.CacheManager
    Events       contract.Dispatcher
    Queue        contract.QueueDriver
    Storage      contract.StorageManager
    Scheduler    scheduler.TaskScheduler
    Mail         contract.Mailer
    Notification contract.Notifier
    Validator    contract.Validator

    // ... plus internal fields (RedirectAllowlist, the component
    // registry) not meant for direct provider use.
}
```

To attach your own services, use the **type-keyed component registry**
rather than mutating core fields. Register a value with `app.Register`
and retrieve it later (typically from a `From(s)` accessor) with
`app.Get`:

```go
// during Register/Boot
if err := app.Register(s, p.client); err != nil {
    return err
}

// elsewhere - exact-type lookup, no string keys
client, err := app.Get[*billing.Client](s)
```

Lookup is by **exact type**: `app.Get[T]` only finds an entry registered
under that same `T`, never a value that merely satisfies it. Because a
Go type's identity includes its import path, two modules can never
collide. For multiple instances of the same type, use
`app.RegisterFor[T, Q]` / `app.GetFor[T, Q]` with an integrator-owned
marker type `Q` instead of a string key.

{{% callout type="info" %}}
The registry owns teardown of registered values. A provider that
registers a value into the registry MUST NOT also close that value in
its own `Shutdown` - the registry sweep during `App.Shutdown` runs
immediately after provider `Shutdown` and closes anything implementing
`contract.ShutdownAware` exactly once. Closing it in both places is a
double-close.
{{% /callout %}}

## A minimal provider

```go
package billing

import (
    "context"
    "os"

    "github.com/velocitykode/velocity/app"
)

type Provider struct {
    client *Client
}

func (p *Provider) Register(s *app.Services) error {
    p.client = NewClient(os.Getenv("STRIPE_KEY"))
    return app.Register(s, p.client)
}

func (p *Provider) Boot(s *app.Services) error {
    // everything else registered by now - wire cross-provider hookups
    return nil
}

func (p *Provider) Shutdown(ctx context.Context) error {
    return p.client.Close(ctx)
}
```

## Installing providers

Register them via `v.Providers(...)`:

```go
v.Providers(func(r *velocity.ProviderRegistry) {
    r.Add(
        &billing.Provider{},
        &analytics.Provider{},
    )
})
```

`Add` accepts any number of `ServiceProvider` implementations.

Alternatively, pass them at construction time with `WithProviders`:

```go
v, err := velocity.New(velocity.WithProviders(
    &billing.Provider{},
    &analytics.Provider{},
))
```

## Optional lifecycle interfaces

A provider can opt into additional bootstrap hooks by implementing any
of these:

| Interface              | Method signature                               | When it runs                                   |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `RouteProvider`        | `Routes(r *velocity.Routing)`                  | During route registration                       |
| `MiddlewareProvider`   | `Middleware(m *velocity.MiddlewareStack)`      | During middleware registration                  |
| `EventProvider`        | `Events(d events.Dispatcher)`                  | During event listener registration              |
| `ScheduleProvider`     | `Schedule(s scheduler.TaskScheduler)`          | During scheduled job registration               |
| `CommandProvider`      | `Commands(r *velocity.Commands)`               | During custom CLI command registration          |

Example - a provider that adds its own routes and middleware:

```go
func (p *Provider) Routes(r *velocity.Routing) {
    r.API("/billing", func(api router.Router) {
        api.Post("/webhooks/stripe", p.handleWebhook)
    })
}

func (p *Provider) Middleware(m *velocity.MiddlewareStack) {
    m.API(billing.SignedWebhookMiddleware)
}
```

`Routes`, `Middleware`, `Events`, `Schedule`, and `Commands` run
alongside the equivalent chain callbacks (`v.Routes(...)`,
`v.Middleware(...)`, etc.) - your provider contributes to the same
stacks.

## Lifecycle order

During `v.Run()` or `v.Serve()`:

1. **Register** - every provider's `Register`
2. **Boot** - every provider's `Boot`
3. **Middleware** - provider `Middleware` callbacks, then `v.Middleware(...)`
4. **Routes** - provider `Routes` callbacks, then `v.Routes(...)`
5. **Events** - provider `Events` callbacks, then `v.Events(...)`
6. **Schedule** - provider `Schedule` callbacks, then `v.Schedule(...)`
7. **Commands** - provider `Commands` callbacks, then `v.Commands(...)`
8. **Exceptions** - `v.Exceptions(...)`
9. Serve / run

On shutdown, providers' `Shutdown` methods run in reverse registration
order so later providers can tear down cleanly before earlier ones.
Immediately after the provider sweep, the component registry tears down
every registered value implementing `contract.ShutdownAware`, also in
reverse registration order.

## When to write a provider

Write a provider when:

- You're shipping reusable functionality as a package (internal or
  public).
- A set of routes + middleware + events always travel together.
- You need to expose a service to handlers without hardcoding it in
  your app wiring.

For application-specific wiring, stick with the chain callbacks
(`v.Middleware`, `v.Routes`, etc.) - providers are for extraction and
reuse.
