| `SeederModule`       | `Seeders(r *velocity.Seeders)`            | During database seeder registration   |
---
title: Modules
linkTitle: Modules
description: Modular registration of services, routes, middleware, events, and scheduled jobs with lifecycle hooks.
weight: 85
aliases: ["/docs/advanced/service-providers/"]
---

Modules are the modular extension point for Velocity applications. A
module bundles registration for services, routes, middleware, event
listeners, and scheduled jobs behind a single type; you install it with
one line of wiring.

Import paths: `github.com/velocitykode/velocity` (the `velocity.*`
aliases used by application code) and `github.com/velocitykode/velocity/app`
(the underlying `Module` interface and `Services` container). The
optional auto-wiring interfaces and the `ModuleRegistry` live in
`github.com/velocitykode/velocity/chain`, re-exported under the root
`velocity` package for ergonomics. Application code should import
`velocity` rather than `chain`; the two names resolve to the same Go
type, and a direct `chain` import is only for framework internals or a
third-party module that needs to reference the types outside the
`velocity` package.

## The core interface

```go
type Module interface {
    Init(s *Services) error              // bind services; called before any Start
    Start(s *Services) error             // wire cross-module dependencies
    Shutdown(ctx context.Context) error  // teardown; called in reverse order
}
```

Every module implements these three methods. `Init` runs for **all**
modules first; `Start` runs after, so a module can safely reference
services another module registered.

`velocity.Module` is a type alias for `app.Module`, so the two names
resolve to the same Go type. Generated scaffolding writes
`*velocity.Services`; a standalone package can write `*app.Services`
instead and stay compatible.

## The Services container

Modules read and mutate `*velocity.Services` (alias for
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

    // ... plus framework-owned fields (RedirectAllowlist,
    // InsecureFlashCookies, the component registry) not meant for
    // direct module use.
}
```

To attach your own services, use the **type-keyed component registry**
rather than mutating core fields. Register a value with `app.Register`
and retrieve it later (typically from a `From(s)` accessor) with
`app.Get`:

```go
// during Init/Start
if err := app.Register(s, m.client); err != nil {
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
marker type `Q` instead of a string key. `app.Register` returns an error
for a nil value or a duplicate key, so a module that ran twice is caught
at boot.

{{% callout type="info" %}}
The registry owns teardown of registered values. A module that
registers a value into the registry MUST NOT also close that value in
its own `Shutdown` - the registry sweep during `App.Shutdown` runs
immediately after module `Shutdown` and closes anything implementing
`contract.ShutdownAware` exactly once. Closing it in both places is a
double-close.
{{% /callout %}}

## A minimal module

```go
package billing

import (
    "context"
    "os"

    "github.com/velocitykode/velocity/app"
)

type Module struct {
    client *Client
}

func (m *Module) Init(s *app.Services) error {
    m.client = NewClient(os.Getenv("STRIPE_KEY"))
    return app.Register(s, m.client)
}

func (m *Module) Start(s *app.Services) error {
    // every module has finished Init by now - wire cross-module hookups
    return nil
}

func (m *Module) Shutdown(ctx context.Context) error {
    // Nothing to close here: m.client went into the component registry,
    // and the registry sweep closes it (it implements
    // contract.ShutdownAware) right after this method returns.
    return nil
}
```

A module that owns a resource it did **not** hand to the registry closes
it in `Shutdown` as usual; the ownership rule only covers registered
values.

## Scaffolding a module

`vel gen module` writes the skeleton for you:

```bash
vel gen module Billing
```

That creates `internal/modules/billing.go` in `package modules`:

```go
package modules

import (
    "context"

    "github.com/velocitykode/velocity"
)

// BillingModule initializes and starts the Billing service.
type BillingModule struct{}

// Init binds services into the container.
func (m *BillingModule) Init(s *velocity.Services) error {
    return nil
}

// Start is called after all modules have been initialized.
func (m *BillingModule) Start(s *velocity.Services) error {
    return nil
}

// Shutdown gracefully tears down module resources.
func (m *BillingModule) Shutdown(ctx context.Context) error {
    return nil
}
```

The generator appends the `Module` suffix itself and strips a redundant
one from your argument, so `vel gen module Billing` and
`vel gen module BillingModule` both produce `BillingModule` in
`billing.go`. Pass `--dir` to write somewhere other than
`internal/modules`.

Other generators follow the same convention: `vel gen grpc service`
scaffolds `internal/modules/grpc_module.go` holding a `GRPCModule`
(skip it with `--no-module`). See [gRPC]({{< relref "grpc" >}}).

## Installing modules

Register them via `v.Modules(...)`:

```go
v.Modules(func(r *velocity.ModuleRegistry) {
    r.Add(
        &modules.BillingModule{},
        &modules.AnalyticsModule{},
    )
})
```

`Add` accepts any number of `velocity.Module` implementations and keeps
registration order. `v.Modules(fn)` stores a single callback, so calling
it twice replaces the first callback rather than appending to it; add
every module inside one callback.

Alternatively, pass them at construction time with `WithModules`:

```go
v, err := velocity.New(velocity.WithModules(
    &modules.BillingModule{},
    &modules.AnalyticsModule{},
))
```

{{% callout type="warning" %}}
The two entry points are not interchangeable. `WithModules` modules run
`Init`/`Start` inside `velocity.New`, before the bootstrap chain exists,
and the optional auto-wiring interfaces below are **not** dispatched to
them. Only modules added through `v.Modules(...)` get their `Routes`,
`Middleware`, `Events`, `Schedule`, and `Commands` methods called. Use
`WithModules` for infrastructure that must exist before bootstrap (and
in tests); use `v.Modules(...)` for anything that contributes routes,
middleware, listeners, jobs, or commands.
{{% /callout %}}

## Optional auto-wiring interfaces

A module registered through `v.Modules(...)` can opt into additional
bootstrap hooks by implementing any of these. Implementation is
structural, so no explicit declaration is needed:

| Interface            | Method signature                          | When it runs                          |
| -------------------- | ----------------------------------------- | ------------------------------------- |
| `RouteModule`        | `Routes(r *velocity.Routing)`             | During route registration             |
| `MiddlewareModule`   | `Middleware(m *velocity.MiddlewareStack)` | During middleware registration        |
| `EventModule`        | `Events(d events.Dispatcher)`             | During event listener registration    |
| `ScheduleModule`     | `Schedule(s scheduler.TaskScheduler)`     | During scheduled job registration     |
| `CommandModule`      | `Commands(r *velocity.Commands)`          | During custom CLI command registration |

Example - a module that adds its own routes and middleware:

```go
var _ velocity.RouteModule = (*BillingModule)(nil)

func (m *BillingModule) Routes(r *velocity.Routing) {
    r.API("/billing", func(api router.Router) {
        api.Post("/webhooks/stripe", m.handleWebhook)
    })
}

func (m *BillingModule) Middleware(mw *velocity.MiddlewareStack) {
    mw.API(billing.SignedWebhookMiddleware)
}
```

`Routes`, `Middleware`, `Events`, `Schedule`, and `Commands` run
alongside the equivalent chain callbacks (`v.Routes(...)`,
`v.Middleware(...)`, etc.), and always before them - your module
contributes to the same stacks.

Under `velocity.WithoutEvents()` there is no dispatcher, so the
`Events` hooks are skipped entirely and the framework logs a warning if
any module implements `EventModule`.

## Lifecycle order

`velocity.New(...)` runs first:

1. **Init** - every `WithModules` module's `Init`
2. **Start** - every `WithModules` module's `Start`

Then `v.Run()`, `v.Serve()`, or an explicit `v.Bootstrap()` runs the
declarative chain:

1. **Modules** - the `v.Modules(...)` callback fills a
   `velocity.ModuleRegistry`; every collected module's `Init` runs, then
   every module's `Start`
2. **Middleware** - module `Middleware` callbacks, then `v.Middleware(...)`
3. **Routes** - module `Routes` callbacks, then `v.Routes(...)`
4. **Events** - module `Events` callbacks, then `v.Events(...)`
5. **Schedule** - module `Schedule` callbacks, then `v.Schedule(...)`
6. **Commands** - module `Commands` callbacks, then `v.Commands(...)`
7. **Seeders** - module `Seeders` callbacks, then `v.Seeders(...)`
8. **Exceptions** - `v.Exceptions(...)`
9. Serve / run

`Bootstrap()` is safe to call more than once, but only the first call
does the work: the result is sticky, so a later call returns the same
error rather than registering modules and routes twice.

### When a module fails

If `Init` returns an error, the framework unwinds: every module whose
`Init` already completed is shut down in reverse order, and the error is
returned wrapped. The failing module is excluded from that unwind, so a
failing `Init` must release anything it opened before returning.

The wrapped messages read `velocity: chain module init failed: ...` and
`velocity: chain module start failed: ...` for modules added via
`v.Modules(...)`, and `velocity: module init failed: ...` /
`velocity: module start failed: ...` for `WithModules` modules.

## Shutdown order

`App.Shutdown(ctx)` tears down in reverse initialization order. For
modules that means:

1. Chain modules (`v.Modules(...)`) in reverse registration order
2. `WithModules` modules in reverse registration order
3. The component registry sweep - every registered value implementing
   `contract.ShutdownAware`, also in reverse registration order

Modules unwind before the queue, cache, and database close, so a module
can still flush through core services during its own teardown; the
registry sweep runs after module `Shutdown` so a module can flush using
a value it registered, and before the core services close so a
registered component can still reach them.

## Event discovery modules

The `events` package has its own, separate `EventModule` interface used
by the discovery registry:

```go
// events.EventModule
type EventModule interface {
    Register(dispatcher Dispatcher)
}
```

Register one with `EventRegistry.AddModule(module)` and fire them all
with `EventRegistry.BootModules(dispatcher)`. Note the method is
`Register(dispatcher)`, not `Events(d)` - `events.EventModule` and
`velocity.EventModule` are different interfaces serving different
registries. See [Events]({{< relref "events" >}}).

## When to write a module

Write a module when:

- You're shipping reusable functionality as a package (internal or
  public).
- A set of routes + middleware + events always travel together.
- You need to expose a service to handlers without hardcoding it in
  your app wiring.

For application-specific wiring, stick with the chain callbacks
(`v.Middleware`, `v.Routes`, etc.) - modules are for extraction and
reuse.
