---
title: Configuration
description: Configure a Velocity application through environment variables and the .env file, or override settings in code with the Config struct and functional options.
weight: 3
keywords: [velocity config, environment variables, go framework settings, default database, .env]
---

A Velocity application is configured entirely through **environment variables**, loaded once at startup. There is no separate config store or CLI to manage settings. Every value comes from the process environment (or a `.env` file) and is read into a typed `Config` struct.

## How Configuration Is Loaded

When you call `velocity.New()`, the framework loads configuration with `ConfigFromEnv()`. This reads a `.env` file from the working directory (if present) and then reads each setting from the environment, applying built-in defaults where a variable is unset.

```go
package main

import (
    "log"

    "github.com/velocitykode/velocity"
)

func main() {
    v, err := velocity.New() // loads ConfigFromEnv() internally
    if err != nil {
        log.Fatal(err)
    }

    if err := v.Serve(); err != nil {
        log.Fatal(err)
    }
}
```

{{% callout type="info" %}}
If a `.env` file exists but fails to parse, Velocity logs a warning and continues with the process environment. A missing `.env` file is not an error: environment variables alone are sufficient.
{{% /callout %}}

## The .env File

Place a `.env` file at the root of your project. Each line sets one environment variable:

```bash
# .env
APP_ENV=production
APP_DEBUG=false
APP_PORT=4000
APP_KEY=base64:...

DB_CONNECTION=postgres
DB_HOST=127.0.0.1
DB_DATABASE=myapp
DB_USERNAME=myapp
DB_PASSWORD=secret

CACHE_DRIVER=redis
QUEUE_DRIVER=redis
```

## Common Settings

The most frequently used variables and their defaults:

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_ENV` | Application environment | _(empty)_ |
| `APP_DEBUG` | Enable debug output | `false` |
| `APP_PORT` | HTTP server port | `4000` |
| `APP_KEY` | Application key used for crypto | _(empty)_ |
| `DB_CONNECTION` | Database driver (`sqlite`, `postgres`, `mysql`) | _(empty)_ |
| `DB_HOST` | Database host | `127.0.0.1` |
| `DB_PORT` | Database port | _(per driver)_ |
| `DB_DATABASE` | Database name | _(empty)_ |
| `DB_USERNAME` | Database username | _(empty)_ |
| `DB_PASSWORD` | Database password | _(empty)_ |
| `CACHE_DRIVER` | Cache driver (`memory`, `file`, `redis`, `database`) | `memory` |
| `QUEUE_DRIVER` | Queue driver (`memory`, `redis`, `database`) | `memory` |
| `STORAGE_DRIVER` | Default storage disk | `local` |
| `LOG_DRIVER` | Log driver | `console` |
| `LOG_LEVEL` | Minimum log level | `debug` |

{{% callout type="info" %}}
`APP_ENV` is intentionally empty when unset. Security gates fail closed for an unknown environment, so production deployments that forget to set `APP_ENV` do not inherit development relaxations.
{{% /callout %}}

## Overriding Configuration in Code

For tests or single-binary deployments you can bypass the environment and pass configuration directly. `velocity.New` accepts functional options.

### WithConfig

`WithConfig` supplies a fully-built `Config` struct, replacing `ConfigFromEnv()`:

```go
cfg := velocity.ConfigFromEnv()
cfg.Port = "8080"
cfg.Debug = true

v, err := velocity.New(velocity.WithConfig(cfg))
```

### Targeted Options

Smaller overrides have dedicated options:

```go
v, err := velocity.New(
    velocity.WithPort("8080"),
    velocity.WithReadTimeout(15*time.Second),
    velocity.WithWriteTimeout(15*time.Second),
    velocity.WithIdleTimeout(60*time.Second),
)
```

Other options include `velocity.WithProviders(...)` to append service providers, `velocity.WithSchedulerInProcess()` to run the scheduler inside the HTTP process, and `velocity.WithoutEvents()` / `velocity.WithFakeEvents(...)` for tests.

## Priority Order

Configuration values are resolved in this order:

1. **Functional options** passed to `velocity.New(...)` (highest priority, applied after the base config is built)
2. **Environment variables** (including those loaded from `.env`)
3. **Built-in defaults** (lowest priority)

```go
// DB_DATABASE from the environment is used as the base,
// but this code forces the port regardless of APP_PORT.
v, err := velocity.New(velocity.WithPort("9000"))
```

## Server Timeouts

HTTP server timeouts can be set through the environment or with the matching options:

| Variable | Option | Default |
|----------|--------|---------|
| `SERVER_READ_TIMEOUT` | `WithReadTimeout` | `30s` |
| `SERVER_WRITE_TIMEOUT` | `WithWriteTimeout` | `30s` |
| `SERVER_IDLE_TIMEOUT` | `WithIdleTimeout` | `120s` |
| `SERVER_READ_HEADER_TIMEOUT` | _(env only)_ | `10s` |
