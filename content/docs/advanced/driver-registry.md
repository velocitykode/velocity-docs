---
title: Driver Registry
description: Pluggable driver registration across cache, queue, storage, mail, notification, log, and orm subsystems.
weight: 92
---

`driverregistry` is the single pattern every Velocity subsystem with
swappable backends uses to manage its drivers. Cache, queue, storage,
mail, notification, log, and orm each instantiate their own typed
registry and expose a `Drivers()` accessor; built-in factories
self-register from each package's `init()`, and third-party drivers
plug in through the same API without any framework code change.

Import path: `github.com/velocitykode/velocity/driverregistry`

## Why a registry

Before this package existed, every subsystem carried a hardcoded
`createDriver` switch:

```go
// old shape, no longer used
switch cfg.Driver {
case "memory": return newMemory(cfg)
case "redis":  return newRedis(cfg)
default:       return nil, fmt.Errorf("unknown driver %q", cfg.Driver)
}
```

That made third-party drivers impossible without forking the framework.
The registry replaces the switch with a typed lookup, so a custom driver
becomes a one-line registration:

```go
cache.Drivers().Register("dragonfly", newDragonflyStore)
```

`Resolve` also takes a `context.Context`, so a Redis dial, S3 endpoint
check, or DB connect honours the caller's deadline end to end.

## The Registry type

```go
type Registry[D any, C any] struct { /* unexported */ }

func New[D any, C any](subsystem string) *Registry[D, C]
```

`D` is the driver instance type the subsystem returns to callers
(`cache.Store`, `storage.Driver`, `mail.Mailer`, ...); `C` is the
driver-config shape (`cache.StoreConfig`, `storage.DiskConfig`,
`mail.MailConfig`, ...). Both stay generic so the resolution boundary
is type-safe; there is no `map[string]any` in the hot path.

You only call `New` if you are building a new subsystem. Application
and third-party code uses the per-subsystem `Drivers()` accessor.

### Public API

```go
type Factory[D any, C any] func(ctx context.Context, cfg C) (D, error)

func (r *Registry[D, C]) Register(name string, factory Factory[D, C])
func (r *Registry[D, C]) Override(name string, factory Factory[D, C]) Factory[D, C]
func (r *Registry[D, C]) Has(name string) bool
func (r *Registry[D, C]) Names() []string
func (r *Registry[D, C]) Resolve(ctx context.Context, name string, cfg C) (D, error)
```

| Method     | Purpose                                                                                                  |
|------------|----------------------------------------------------------------------------------------------------------|
| `Register` | Install a factory under `name`. Panics on empty name, nil factory, or duplicate registration.            |
| `Override` | Replace (or install) a factory; returns the previous factory so tests can defer restoration.             |
| `Has`      | Report whether a driver is registered (case-insensitive).                                                |
| `Names`    | Sorted snapshot of registered driver names. Used in `NotFoundError` for the "available" hint.            |
| `Resolve`  | Look up the factory, invoke it with `ctx` and `cfg`, return the driver instance or `*NotFoundError`.     |

Names are normalised (lower-cased and trimmed) on every call, so
`Register("Redis")` and `Resolve(..., "redis", ...)` are the same key.

All methods are safe for concurrent use; the factory map is guarded by
`sync.RWMutex`. Registration is rare (init-time); resolution is hot
and uses the read-locked fast path.

{{< callout type="info" >}}
`Register` panics with `*contract.RegistrationError` on duplicate
names. That is the framework's "loud at boot" rule: a duplicate
registration is a programming bug that must surface at process start,
not at the first request. Use `Override` when you genuinely want to
replace.
{{< /callout >}}

## Subsystem accessors

Every subsystem with a registry exposes a `Drivers()` function that
returns its concrete `*Registry[D, C]`:

| Subsystem      | Accessor                | `D` (driver type)       | `C` (config type)              |
|----------------|-------------------------|-------------------------|--------------------------------|
| Cache          | `cache.Drivers()`       | `cache.Store`           | `cache.StoreConfig`            |
| Queue          | `queue.Drivers()`       | `queue.Driver`          | `queue.QueueConfig`            |
| Storage        | `storage.Drivers()`     | `storage.Driver`        | `storage.DiskConfig`           |
| Mail           | `mail.Drivers()`        | `mail.Mailer`           | `mail.MailConfig`              |
| Notification   | `notification.Drivers()`| `notification.Channel`  | `notification.ChannelConfig`   |
| Log            | `log.Drivers()`         | `log.Logger`            | `log.LogConfig`                |
| ORM            | `orm.Drivers()`         | `drivers.Driver`        | `drivers.ConnectionConfig`     |

Each subsystem's light built-in factories register themselves from the
package's `init()`, so they are available the moment the subsystem is
imported (no blank import required). Heavier drivers that carry their
own dependencies live in leaf packages and self-register from there:
`cache.DriverRedis` from `cache/redis`, the file/daily and `stack` log
drivers from `log/file` and `log/stack` (or the `log/standard`
aggregator). Blank-import the leaf to enable those.

## Registering a third-party driver

Two-step pattern: install the factory once at startup, then reference
the driver by name in config.

```go
package main

import (
    "context"
    "net"
    "strconv"

    "github.com/velocitykode/velocity/cache"
    "github.com/example/dragonfly"
)

func init() {
    cache.Drivers().Register("dragonfly", func(ctx context.Context, cfg cache.StoreConfig) (cache.Store, error) {
        return dragonfly.NewStore(ctx, dragonfly.Options{
            Addr:     net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port)),
            Password: cfg.Password,
            DB:       cfg.Database,
            TLS:      cfg.TLS,
            Prefix:   cfg.Prefix,
        })
    })
}
```

Reference it from app config like any built-in:

```go
cfg := &cache.Config{
    Default: "fast",
    Stores: map[string]cache.StoreConfig{
        "fast": {Driver: "dragonfly", Host: "10.0.0.5", Port: 6380, Prefix: "app:"},
    },
}
mgr := cache.NewManager(cfg)
store, err := mgr.StoreWithContext(ctx, "fast")
```

The factory receives the same `StoreConfig` the manager uses for the
built-in Redis driver. Driver-specific fields (auth tokens, pool tuning,
TLS material) live wherever you choose to read them: environment
variables, dependency injection, or extra fields on a wrapping config
struct in your own package.

{{< callout type="info" >}}
`cache.StoreConfig.Validate` no longer rejects driver names outside the
built-in set. The registry is the gate: an unknown name fails at
`Resolve` with `*driverregistry.NotFoundError`, after the driver
package's `init()` has had a chance to run. This is what makes
extensibility actually work.
{{< /callout >}}

### Per-subsystem registration snippets

{{< tabs items="cache,queue,storage,mail,notification,log,orm" >}}
{{< tab >}}
```go
import "github.com/velocitykode/velocity/cache"

cache.Drivers().Register("dragonfly", func(ctx context.Context, cfg cache.StoreConfig) (cache.Store, error) {
    return newDragonflyStore(ctx, cfg)
})
```
{{< /tab >}}
{{< tab >}}
```go
import "github.com/velocitykode/velocity/queue"

queue.Drivers().Register("kafka", func(ctx context.Context, cfg queue.QueueConfig) (queue.Driver, error) {
    return newKafkaDriver(ctx, cfg)
})
```
{{< /tab >}}
{{< tab >}}
```go
import "github.com/velocitykode/velocity/storage"

storage.Drivers().Register("gcs", func(ctx context.Context, cfg storage.DiskConfig) (storage.Driver, error) {
    return newGCSDriver(ctx, cfg)
})
```
{{< /tab >}}
{{< tab >}}
```go
import "github.com/velocitykode/velocity/mail"

mail.Drivers().Register("ses", func(ctx context.Context, cfg mail.MailConfig) (mail.Mailer, error) {
    return newSESDriver(ctx, cfg)
})
```
{{< /tab >}}
{{< tab >}}
```go
import "github.com/velocitykode/velocity/notification"

notification.Drivers().Register("discord", func(_ context.Context, _ notification.ChannelConfig) (notification.Channel, error) {
    return newDiscordChannel(), nil
})
```
{{< /tab >}}
{{< tab >}}
```go
import "github.com/velocitykode/velocity/log"

log.Drivers().Register("syslog", func(_ context.Context, cfg log.LogConfig) (log.Logger, error) {
    return newSyslogLogger(cfg.Config), nil
})
```
{{< /tab >}}
{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity/orm"
    "github.com/velocitykode/velocity/orm/drivers"
)

orm.Drivers().Register("clickhouse", func(_ context.Context, cfg drivers.ConnectionConfig) (drivers.Driver, error) {
    d := newClickhouseDriver()
    if err := d.Connect(cfg); err != nil {
        return nil, err
    }
    return d, nil
})
```
{{< /tab >}}
{{< /tabs >}}

## Errors

```go
var ErrDriverNotFound = errors.New("driverregistry: driver not registered")

type NotFoundError struct {
    Subsystem string
    Name      string
    Available []string
}
```

`Resolve` returns `*NotFoundError` when the requested name has no
registered factory. The error includes a sorted list of registered
names so the message guides callers toward the right choice:

```
velocity/cache: driver "redus" not registered (available: database, file, memory, redis)
```

`*NotFoundError` unwraps to `ErrDriverNotFound`, so generic handling
works with `errors.Is`:

```go
store, err := cache.Drivers().Resolve(ctx, "redus", cfg)
if errors.Is(err, driverregistry.ErrDriverNotFound) {
    // fall back, or surface a typed config error
}
```

`Register` and `Override` panic with `*contract.RegistrationError`
(from the `contract` package) when the name is empty, the factory is
nil, or, for `Register`, the name is already taken. These are
boot-time conditions and intentionally noisy.

## Override semantics

`Override` is the testing entry point. It returns the previous factory
(or `nil` when none was registered) so a test can swap in a fake and
restore the original on cleanup:

```go
prev := cache.Drivers().Override("redis", func(_ context.Context, _ cache.StoreConfig) (cache.Store, error) {
    return cachetesting.NewFake(), nil
})
t.Cleanup(func() { cache.Drivers().Override("redis", prev) })
```

Passing a `nil` factory to `Override` deletes the registration. Use
`Register` in production code so duplicate names panic loudly.

## Optional driver interfaces

The registry stores factories, never long-lived driver instances.
Lifecycle for an instance is the instance's own concern through two
optional interfaces a subsystem manager may probe:

```go
type Closer interface {
    Close(ctx context.Context) error
}

type HealthChecker interface {
    Health(ctx context.Context) error
}
```

A driver can implement either, neither, or both. Subsystem managers
type-assert against these when they enumerate their owned drivers
during shutdown or `/healthz` probes. `Closer` is per-instance and
distinct from `contract.ShutdownAware`, which is for whole subsystems.

## Special case: the log stack driver

The `stack` log driver fans a single log call out to multiple child
loggers (e.g. `console` plus `daily`). It lives in its own leaf package
(`github.com/velocitykode/velocity/log/stack`); blank-import that leaf,
or the `log/standard` aggregator, to wire the factory. Its factory
resolves each child through the same `log.Drivers()` registry, and
aggregates failures with `errors.Join`:

```go
// extracted from log/stack/stack.go
for _, name := range channels {
    if name == "stack" {
        continue // prevent recursion
    }
    child, err := log.Drivers().Resolve(ctx, name, log.LogConfig{Driver: name, Config: cfg.Config})
    if err != nil {
        childErrs = append(childErrs, fmt.Errorf("velocity/log: stack driver: child %q: %w", name, err))
        continue
    }
    loggers = append(loggers, child)
}
if len(childErrs) > 0 {
    return nil, errors.Join(childErrs...)
}
```

The child set comes from the driver config's `channels` key (or the
legacy `stack` key), defaulting to `console` plus `daily` when absent.
A typo in any entry fails the whole stack at boot rather than silently
dropping that destination. Continuing with surviving children would
mask configuration errors that have to be fixed before the app keeps
running.

## Where validation lives

`StoreConfig.Validate` (and the equivalents on other subsystems' configs)
checks only that a driver name is present. Per-driver field validation,
host/port for Redis, path for file, bucket for S3, message stream for
Postmark, lives inside the factory, where the type information is
available. This is what lets a third-party driver enforce its own
invariants without the subsystem having to learn about it.

## Building a new subsystem on top

If you are adding a Velocity subsystem with swappable backends, follow
the existing shape:

1. Define the public driver interface `D` and the config struct `C`.
2. Declare a package-level registry: `var drivers = driverregistry.New[D, C]("my-subsystem")`.
3. Expose `func Drivers() *driverregistry.Registry[D, C] { return drivers }`.
4. Register the built-in factories from `init()`.
5. In your manager, call `drivers.Resolve(ctx, name, cfg)` where the old
   `createDriver` switch lived.

That is the whole pattern: no map of `any`, no type assertions on the
hot path, no per-subsystem reinvention of "did you mean?" errors.
