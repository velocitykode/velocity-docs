---
title: Standalone Packages
description: Cherry-pick individual Velocity components. Import a single subsystem, construct its Manager directly, and own the lifecycle without velocity.New().
weight: 15
---

Velocity is a single Go module, but its subsystems are designed as
independent packages. You do not have to call `velocity.New()` to use
them. Import the one package you need (cache, crypto, validation,
httpclient, str, log, pipeline, collect, async), construct it directly,
and own its lifecycle yourself. This is ideal for libraries, CLIs,
one-off scripts, tests, and MCP servers that want Velocity's helpers
without booting a full HTTP application.

## Install

Velocity is one module. Add it to your project with `go get`:

```bash
go get github.com/velocitykode/velocity@latest
```

The module path is `github.com/velocitykode/velocity`. Every subsystem
is a subpackage under it (for example
`github.com/velocitykode/velocity/cache`), so a single `go get` makes
all of them importable. The Go toolchain only compiles the packages you
actually import, so pulling in `str` does not drag in the ORM or the
router.

{{% callout type="info" %}}
**Standalone vs full app.** When you import a single package and call
its constructor yourself, *you own the lifecycle*: you build the config,
hold the instance, and decide when to use it. When you call
`velocity.New()` instead, the framework reads your `.env` and `config/`
files and wires every subsystem (logger, crypto, cache, queue, router,
...) into an `*velocity.App` for you. Both paths use the same underlying
constructors shown on this page; the full app is just the batteries-included
assembly of them. See {{< relref "getting-started.md" >}} for the full
app path.
{{% /callout %}}

## Standard driver bundles

Several subsystems are *pluggable*: cache, log, orm, queue, and storage
each own a driver registry, and config selects a driver by name at
runtime. A driver only becomes selectable once its factory has been
registered, and registration happens in a package's `init()` at import
time.

The light built-in drivers self-register from the subsystem's own
package, so importing the subsystem makes them available with no extra
work. The heavier drivers live in separate leaf packages so they (and
their dependencies) are only compiled when you ask for them. To register
*every* driver in a subsystem with one line, blank-import its `standard`
bundle:

```go
import (
    _ "github.com/velocitykode/velocity/cache/standard"
    _ "github.com/velocitykode/velocity/log/standard"
    _ "github.com/velocitykode/velocity/orm/standard"
    _ "github.com/velocitykode/velocity/queue/standard"
    _ "github.com/velocitykode/velocity/storage/standard"
)
```

Each bundle wires its subsystem's full driver set into the registry so
config can pick any of them at runtime:

| Bundle | Light drivers (self-register from the subsystem) | Heavy leaf drivers the bundle adds |
|---|---|---|
| `cache/standard` | memory, file | redis (`cache/redis`, go-redis) |
| `log/standard` | console, null | file, daily (`log/file`), stack (`log/stack`) |
| `orm/standard` | modernc SQLite (pure-Go default) | mysql (`orm/mysql`), postgres (`orm/postgres`), cgo SQLite (`orm/sqlite`) |
| `queue/standard` | memory, database | redis (`queue/redis`, go-redis) |
| `storage/standard` | local, memory | s3 (`storage/s3`, AWS SDK) |

{{% callout type="info" %}}
**Smaller footprint?** If you only need one heavy driver, skip the
bundle and blank-import just that leaf (for example
`_ "github.com/velocitykode/velocity/cache/redis"`). You only pay for
the dependencies you import. The bundles exist purely to register the
full set in one line; they must not be imported by the framework core,
which is why they live in their own packages.
{{% /callout %}}

## Cherry-picking components

Every Velocity subsystem exposes a plain Go constructor. Below are the
real signatures for the most commonly used leaf packages, each shown in
isolation with no `velocity.App`.

### Cache

`cache.NewManager(config *cache.Config) *cache.Manager`. The memory,
file, and database drivers self-register from the `cache` package's own
`init()`, so a memory store needs no bundle import at all:

```go
package main

import (
    "fmt"
    "time"

    "github.com/velocitykode/velocity/cache"
)

func main() {
    mgr := cache.NewManager(&cache.Config{
        Default: "memory",
        Stores: map[string]cache.StoreConfig{
            "memory": {Driver: cache.DriverMemory},
        },
    })

    mgr.Put("greeting", "hello", 5*time.Minute)

    if v, found := mgr.Get("greeting"); found {
        fmt.Println(v) // hello
    }
}
```

To use Redis here you would add
`_ "github.com/velocitykode/velocity/cache/standard"` (or the
`cache/redis` leaf) and set `Driver: cache.DriverRedis` with the host
fields on `StoreConfig`.

{{% callout type="info" %}}
**Thread the context.** `Manager` exposes a `*WithContext` variant for
every method (`PutWithContext`, `GetWithContext`,
`RememberEWithContext`, `StoreWithContext`, ...). Stores are created
lazily on first use; passing a `context.Context` lets a slow driver
connect (a Redis dial) honour your deadline. Prefer the context variants
in any code that already has one. See {{< relref "../core/cache.md" >}}.
{{% /callout %}}

### Crypto

`crypto.NewEncryptor(config crypto.Config) (crypto.Encryptor, error)`.
The crypto package never reads the environment; you pass the key
explicitly. Build one encryptor and reuse it:

```go
package main

import (
    "fmt"

    "github.com/velocitykode/velocity/crypto"
)

func main() {
    enc, err := crypto.NewEncryptor(crypto.Config{
        Key:    "base64:your-base64-encoded-key-here",
        Cipher: "AES-256-GCM",
    })
    if err != nil {
        panic(err)
    }

    payload, err := enc.Encrypt("sensitive data")
    if err != nil {
        panic(err)
    }

    plaintext, err := enc.Decrypt(payload)
    if err != nil {
        panic(err)
    }

    fmt.Println(plaintext) // sensitive data
}
```

`crypto.Config` fields are `Key`, `Cipher`, and `PreviousKeys` (for key
rotation). See {{< relref "../core/crypto.md" >}}.

### Validation

`validation.NewValidator() validation.Validator`. Rules are a
`map[string][]string` (`validation.Rules`); each entry is the field name
mapped to its list of rule strings. `Validate` returns a
`*validation.ValidatedData`:

```go
package main

import (
    "fmt"

    "github.com/velocitykode/velocity/validation"
)

func main() {
    v := validation.NewValidator()

    data := map[string]interface{}{
        "name":  "Ada",
        "email": "ada@example.com",
    }

    rules := validation.Rules{
        "name":  {"required", "min:2"},
        "email": {"required", "email"},
    }

    validated, err := v.Validate(data, rules)
    if err != nil {
        panic(err)
    }

    if validated.Errors().HasError("email") {
        fmt.Println("email is invalid")
    }
}
```

### HTTP client

`httpclient.New(opts ...httpclient.Option) *httpclient.Client`. The
client ships with secure defaults: TLS 1.2 or higher, a capped redirect
chain, sensitive headers stripped on cross-host redirects, a 30 second
timeout, and the SSRF private-IP dial guard enabled. Every request takes
a `context.Context`:

```go
package main

import (
    "context"
    "io"
    "time"

    "github.com/velocitykode/velocity/httpclient"
)

func main() {
    client := httpclient.New(
        httpclient.WithBaseURL("https://api.example.com"),
        httpclient.WithTimeout(10*time.Second),
    )

    ctx := context.Background()
    resp, err := client.Get(ctx, "/health")
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    _ = body
}
```

Use `httpclient.WithAllowedHosts(...)` to whitelist specific internal
hosts. `Client` also exposes `Post`, `Put`, `Delete`, and `Do(ctx,
*http.Request)` for full control.

### Strings

The `str` package is pure functions plus a fluent `*str.Stringable`
wrapper. There is no manager to construct; import and call:

```go
package main

import (
    "fmt"

    "github.com/velocitykode/velocity/str"
)

func main() {
    fmt.Println(str.Slug("Hello World"))   // hello-world
    fmt.Println(str.Camel("user_name"))    // userName
    fmt.Println(str.Snake("UserName"))     // user_name

    // Fluent chain via str.Of(...).
    out := str.Of("  Hello World  ").
        Camel().
        ToString()
    fmt.Println(out)
}
```

### Collections

`collect` mirrors `str`: standalone generic helpers over slices plus a
fluent `*collect.Collection[T]` from `collect.From(items)`:

```go
package main

import (
    "fmt"

    "github.com/velocitykode/velocity/collect"
)

func main() {
    nums := []int{1, 2, 3, 4, 5}

    evens := collect.Filter(nums, func(n int) bool { return n%2 == 0 })
    doubled := collect.Map(nums, func(n int) int { return n * 2 })

    fmt.Println(evens)   // [2 4]
    fmt.Println(doubled) // [2 4 6 8 10]
}
```

### Pipeline

`pipeline.New[T any]() *pipeline.Pipeline[T]` sends a value through a
series of stages. A stage is anything implementing
`Handle(passable T, next func(T) error) error`; wrap a function with
`pipeline.Pipe[T]`. `Then` runs the pipeline:

```go
package main

import (
    "fmt"
    "strings"

    "github.com/velocitykode/velocity/pipeline"
)

func main() {
    err := pipeline.New[string]().
        Send("  hello  ").
        Through(
            pipeline.Pipe[string](func(s string, next func(string) error) error {
                return next(strings.TrimSpace(s))
            }),
            pipeline.Pipe[string](func(s string, next func(string) error) error {
                return next(strings.ToUpper(s))
            }),
        ).
        Then(func(s string) error {
            fmt.Println(s) // HELLO
            return nil
        })
    if err != nil {
        panic(err)
    }
}
```

`Pipeline` is not safe for concurrent use: build and run it from a
single goroutine.

### Async

The `async` package is package-level generic helpers; there is nothing
to construct. `async.Run` runs a function on a goroutine and returns a
`*async.Result[T]`; `async.All` / `async.Map` fan out over a set of
functions or items:

```go
package main

import (
    "fmt"

    "github.com/velocitykode/velocity/async"
)

func main() {
    // Run a single task off the calling goroutine.
    r := async.Run(func() int { return 21 * 2 })
    value, err := r.Get()
    if err != nil {
        panic(err)
    }
    fmt.Println(value) // 42

    // Run several functions concurrently and collect results.
    results, allErr := async.All(
        func() int { return 1 },
        func() int { return 2 },
        func() int { return 3 },
    )
    if allErr != nil {
        panic(allErr)
    }
    fmt.Println(results) // [1 2 3]
}
```

Context-aware variants exist where blocking work needs a deadline:
`async.RunWithTimeout(timeout, fn)`, `async.RunWithContext(ctx, fn)`,
and `async.GoCtx(ctx, fn)`. Use them when the work can hang and you want
cancellation to propagate.

### Log

`log.NewManager(cfg log.LoggingConfig) *log.Manager`. The console and
null drivers self-register from the `log` package, so a console logger
needs no bundle import. `Channel(name)` (or `Default()`) returns a
`Logger` with `Debug`, `Info`, `Warn`, and `Error(msg string, kvs
...any)`:

```go
package main

import (
    "github.com/velocitykode/velocity/log"
)

func main() {
    mgr := log.NewManager(log.LoggingConfig{
        Default: "console",
        Channels: map[string]log.ChannelConfig{
            "console": {Driver: "console", Level: "debug"},
        },
    })

    logger, err := mgr.Default()
    if err != nil {
        panic(err)
    }

    logger.Info("standalone logger ready", "driver", "console")
}
```

For the `file`, `daily`, or `stack` drivers, blank-import
`_ "github.com/velocitykode/velocity/log/standard"` (or the individual
leaf) so those factories are registered before you resolve the channel.

## When to reach for the full app

Standalone construction is the right tool for libraries, CLIs, scripts,
tests, and embedded use. Reach for `velocity.New()` when you want the
framework to read `.env` and `config/`, build all subsystems from that
config, and hand you a wired `*velocity.App` (with `app.Cache`,
`app.Log`, the router, and the rest). The constructors are identical
either way; the full app simply assembles them for you. See
{{< relref "getting-started.md" >}} to scaffold a complete application.
