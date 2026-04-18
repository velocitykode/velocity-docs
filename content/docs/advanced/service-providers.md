---
title: Service Providers
description: Modular registration of services, routes, middleware, events, and scheduled jobs with lifecycle hooks.
weight: 85
---

Service providers are the modular extension point for Velocity
applications. A provider bundles registration for services, routes,
middleware, event listeners, and scheduled jobs behind a single type;
you install it with one line of wiring.

Import paths: `github.com/velocitykode/velocity` (types) and
`github.com/velocitykode/velocity/app` (the underlying interface).

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
`app.Services`). It holds every core service instance:

```go
type Services struct {
    Log          log.Logger
    Exceptions   *exceptions.Handler
    Crypto       crypto.Encryptor
    DB           *orm.Manager
    Auth         contract.AuthManager
    CSRF         contract.CSRFProtector
    View         contract.ViewEngine

    Cache        *cache.Manager
    Events       events.Dispatcher
    Queue        queue.Driver
    Storage      *storage.Manager
    Scheduler    *scheduler.Scheduler
    Mail         mail.Mailer
    Notification *notification.Manager
    Validator    validation.Validator

    Extensions map[string]any  // bag for third-party services
}
```

Use `Extensions` to attach your own services without touching core
fields — keyed by a stable string.

## A minimal provider

```go
package billing

import (
    "context"

    "github.com/velocitykode/velocity/app"
)

type Provider struct {
    client *Client
}

func (p *Provider) Register(s *app.Services) error {
    p.client = NewClient(os.Getenv("STRIPE_KEY"))
    if s.Extensions == nil {
        s.Extensions = map[string]any{}
    }
    s.Extensions["billing"] = p.client
    return nil
}

func (p *Provider) Boot(s *app.Services) error {
    // everything else registered by now — wire cross-provider hookups
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
| `ScheduleProvider`     | `Schedule(s *scheduler.Scheduler)`             | During scheduled job registration               |

Example — a provider that adds its own routes and middleware:

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

`Routes`, `Middleware`, `Events`, `Schedule` run alongside the
equivalent chain callbacks (`v.Routes(...)`, `v.Middleware(...)`, etc.)
— your provider contributes to the same stacks.

## Lifecycle order

During `v.Run()` or `v.Serve()`:

1. **Register** — every provider's `Register`
2. **Boot** — every provider's `Boot`
3. **Middleware** — provider `Middleware` callbacks, then `v.Middleware(...)`
4. **Routes** — provider `Routes` callbacks, then `v.Routes(...)`
5. **Events** — provider `Events` callbacks, then `v.Events(...)`
6. **Schedule** — provider `Schedule` callbacks, then `v.Schedule(...)`
7. **Exceptions** — `v.Exceptions(...)`
8. Serve / run

On shutdown, providers' `Shutdown` methods run in reverse registration
order so later providers can tear down cleanly before earlier ones.

## When to write a provider

Write a provider when:

- You're shipping reusable functionality as a package (internal or
  public).
- A set of routes + middleware + events always travel together.
- You need to expose a service to handlers without hardcoding it in
  your app wiring.

For application-specific wiring, stick with the chain callbacks
(`v.Middleware`, `v.Routes`, etc.) — providers are for extraction and
reuse.
