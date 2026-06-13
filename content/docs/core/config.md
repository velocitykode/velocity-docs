---
title: Configuration
description: Manage application configuration with environment variables and the structured velocity.Config struct in Velocity.
weight: 5
---

Velocity provides a simple yet powerful configuration system that reads from environment variables and a `.env` file, then exposes a single strongly-typed `velocity.Config` struct that every framework package consumes.

## Quick Start

{{% callout type="info" %}}
**Environment-Based**: Velocity loads configuration from environment variables and an optional `.env` file, following the twelve-factor app methodology.
{{% /callout %}}

{{< tabs items="Default App,Environment File,Custom Config" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity"

func main() {
    // velocity.New loads ConfigFromEnv() by default:
    // it reads .env (if present) and the process environment.
    app, err := velocity.New()
    if err != nil {
        panic(err)
    }

    if err := app.Serve(); err != nil {
        panic(err)
    }
}
```
{{< /tab >}}

{{< tab >}}
```env
# .env file
APP_ENV=production
APP_DEBUG=false
APP_PORT=4000

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=myapp
DB_USERNAME=root
DB_PASSWORD=secret

# Cache
CACHE_DRIVER=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity"

func main() {
    // Build the config explicitly, then override New's env-loaded default.
    cfg := velocity.ConfigFromEnv()
    cfg.Port = "8080"

    app, err := velocity.New(velocity.WithConfig(cfg))
    if err != nil {
        panic(err)
    }
    _ = app
}
```
{{< /tab >}}

{{< /tabs >}}

## How Configuration Loads

`velocity.New()` calls `ConfigFromEnv()` automatically, so a default app reads its
configuration from the environment with no extra wiring. The loader:

1. Calls `godotenv.Load()` to read a `.env` file from the working directory (if present).
   A `.env` that exists but fails to parse is logged as a warning, not a fatal error.
2. Reads every documented environment variable, applying defaults for unset values.
3. Returns a `velocity.Config` whose typed sub-structs (`DB`, `Cache`, `Queue`,
   `Storage`, `Session`, `Auth`, `CSRF`, `Crypto`, `Mail`, `View`, `Log`) are consumed
   by the matching framework packages.

```go
import "github.com/velocitykode/velocity"

func main() {
    cfg := velocity.ConfigFromEnv()

    // cfg.Env is the normalized (lowercased, trimmed) APP_ENV value.
    if cfg.Env == "production" && cfg.Debug {
        panic("APP_DEBUG must be false in production")
    }
}
```

You rarely need to call `ConfigFromEnv()` yourself. Use it only when you want to
inspect or mutate the config before passing it to `velocity.New` via `WithConfig`.

## The Config Struct

`velocity.Config` is the single source of truth for application configuration. The
top-level fields and their backing environment variables are:

```go
type Config struct {
    // App
    Env   string // APP_ENV, empty when unset
    Debug bool   // APP_DEBUG, default false
    Port  string // APP_PORT, default "4000"
    Key   string // APP_KEY (used for crypto)

    DB      DBConfig            // DB_*
    Auth    auth.Config         // AUTH_*
    Cache   CacheConfig         // CACHE_*, REDIS_*
    Log     log.LogConfig       // LOG_*
    Queue   QueueConfig         // QUEUE_*
    Storage StorageConfig       // STORAGE_*, FILESYSTEM_*, AWS_*
    CSRF    csrf.Config         // CSRF_*
    Session auth.SessionConfig  // SESSION_*
    View    view.Config         // VIEW_SSR_*
    Crypto  crypto.Config       // CRYPTO_*
    Mail    mail.MailConfig     // MAIL_*

    // Server timeouts
    ReadTimeout       time.Duration // SERVER_READ_TIMEOUT, default 30s
    WriteTimeout      time.Duration // SERVER_WRITE_TIMEOUT, default 30s
    IdleTimeout       time.Duration // SERVER_IDLE_TIMEOUT, default 120s
    ReadHeaderTimeout time.Duration // SERVER_READ_HEADER_TIMEOUT, default 10s

    // FileRoot bounds Context.File / Context.Download / Context.SaveFile.
    // Sourced from FILE_ROOT; defaults to the process working directory.
    FileRoot string
}
```

### Database Configuration

```go
type DBConfig struct {
    Connection      string        // DB_CONNECTION: sqlite, postgres, mysql
    Host            string        // DB_HOST, default "127.0.0.1"
    Port            string        // DB_PORT, default per driver (mysql 3306, postgres 5432)
    Database        string        // DB_DATABASE
    Username        string        // DB_USERNAME
    Password        string        // DB_PASSWORD
    Charset         string        // DB_CHARSET
    SSLMode         string        // DB_SSL_MODE (postgres)
    TLS             string        // DB_MYSQL_TLS (true/false/skip-verify/preferred)
    MaxIdleConns    int           // DB_MAX_IDLE_CONNS, default 10
    MaxOpenConns    int           // DB_MAX_OPEN_CONNS, default 100
    ConnMaxLifetime time.Duration // DB_CONN_MAX_LIFETIME (seconds), default 3600
    LogQueries      bool          // DB_LOG_QUERIES
    SlowThreshold   time.Duration // DB_SLOW_QUERY_THRESHOLD
}
```

### Cache Configuration

```go
type CacheConfig struct {
    Driver           string // CACHE_DRIVER: memory, file, redis, database (default "memory")
    Prefix           string // CACHE_PREFIX, default "velocity_cache"
    Path             string // CACHE_PATH (required when CACHE_DRIVER=file)
    MemoryMaxEntries int    // CACHE_MEMORY_MAX_ENTRIES (0 = 1,000,000, negative = unlimited)
    MaxValueBytes    int64  // CACHE_MAX_VALUE_BYTES (0 = unlimited)
    RedisHost        string // REDIS_HOST, default "127.0.0.1"
    RedisPort        int    // REDIS_PORT, default 6379
    RedisPassword    string // REDIS_PASSWORD
    RedisDatabase    int    // REDIS_DATABASE, default 0
    RedisTLS         bool   // REDIS_TLS
}
```

### Queue Configuration

```go
type QueueConfig struct {
    Driver        string // QUEUE_DRIVER: memory, redis, database (default "memory")
    RedisHost     string // QUEUE_REDIS_HOST, default "localhost"
    RedisPort     string // QUEUE_REDIS_PORT, default "6379"
    RedisPassword string // QUEUE_REDIS_PASSWORD
    RedisDB       string // QUEUE_REDIS_DB, default "0"
    RedisTLS      bool   // REDIS_TLS
    SigningKey    string // QUEUE_SIGNING_KEY: HMAC key for payload signing
    Encrypt       bool   // QUEUE_ENCRYPT: encrypt job payloads at rest
}
```

### Storage Configuration

```go
type StorageConfig struct {
    Default string                // STORAGE_DRIVER, default "local"
    Disks   map[string]DiskConfig // configured disks
}

type DiskConfig struct {
    Driver     string // "local", "s3", "memory"
    Root       string // root path for the local driver
    URL        string // base URL for file access
    Visibility string // default visibility (public/private)
    Bucket     string // s3
    Region     string // s3
    Key        string // s3
    Secret     string // s3
    MaxSize    int64  // memory driver max bytes
}
```

A `local` disk is always configured (root from `FILESYSTEM_LOCAL_ROOT`, default
`./storage/app`). An `s3` disk is added automatically when `AWS_BUCKET` is set, reading
`AWS_DEFAULT_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_URL`.

## Configuration Options

Pass `velocity.Option` functions to `velocity.New` to override the env-loaded config.

```go
import (
    "time"

    "github.com/velocitykode/velocity"
)

app, err := velocity.New(
    velocity.WithPort("8080"),
    velocity.WithReadTimeout(15*time.Second),
    velocity.WithWriteTimeout(15*time.Second),
    velocity.WithIdleTimeout(60*time.Second),
)
```

Available options include:

| Option | Effect |
| --- | --- |
| `WithConfig(cfg Config)` | Replace the entire configuration. |
| `WithPort(port string)` | Set the HTTP server port. |
| `WithReadTimeout(d time.Duration)` | Set the HTTP read timeout. |
| `WithWriteTimeout(d time.Duration)` | Set the HTTP write timeout. |
| `WithIdleTimeout(d time.Duration)` | Set the HTTP idle timeout. |
| `WithProviders(providers ...app.ServiceProvider)` | Append service providers. |
| `WithoutEvents()` | Disable the event dispatcher entirely. |
| `WithFakeEvents(fake *events.FakeDispatcher)` | Record dispatched events for assertions. |
| `WithSchedulerInProcess()` | Run the scheduler loop in the same process as `Serve()`. |

## Validating Configuration

`velocity.New` calls `Config.Validate()` before allocating any resources, so malformed
values (an invalid `APP_PORT`, a negative timeout, an unknown `SESSION_SAME_SITE`, a
`file` cache driver without `CACHE_PATH`) fail fast with a clear error. You can also call
it yourself:

```go
import (
    "errors"

    "github.com/velocitykode/velocity"
)

cfg := velocity.ConfigFromEnv()
if err := cfg.Validate(); err != nil {
    if errors.Is(err, velocity.ErrInvalidConfig) {
        // configuration is structurally invalid
    }
    return err
}
```

`Validate()` performs structural checks only (port is numeric, timeouts are
non-negative, `SESSION_SAME_SITE` / `CSRF_SAME_SITE` are one of `strict|lax|none`, and
each sub-config's `Validate()` passes). It deliberately does not check driver names
against an allowlist: an unknown driver surfaces as a typed registry error when the
relevant subsystem resolves it. Every failure wraps the `velocity.ErrInvalidConfig`
sentinel so callers can branch with `errors.Is`.

## Logging Configuration

The root config stores logging settings in `Config.Log`, a `log.LogConfig`:

```go
import "github.com/velocitykode/velocity/log"

type LogConfig struct {
    // Driver: "console", "file", "stack", "null", or a registered driver.
    Driver string
    // Config holds driver-specific options, e.g. "path" for file,
    // "level" for any driver, "stack" with a []string of channel names.
    Config map[string]any
}
```

`ConfigFromEnv()` populates it from `LOG_DRIVER` (default `console`), `LOG_PATH`,
`LOG_LEVEL` (default `debug`), `LOG_DAYS` (default 14), and `LOG_STACK` (a
comma-separated list of channel names for the `stack` driver).

The `log` package also exposes a multi-channel `LoggingConfig` for applications that
define named channels:

```go
import "github.com/velocitykode/velocity/log"

cfg := log.LoggingConfig{
    Default: "stack",
    Channels: map[string]log.ChannelConfig{
        "daily": {Driver: "file", Level: "debug", Path: "./storage/logs", MaxAge: 14},
    },
}

if channel, ok := cfg.GetChannel("daily"); ok {
    _ = channel.Driver
}

if channel, ok := cfg.GetDefaultChannel(); ok {
    _ = channel.Driver
}
```

```go
type ChannelConfig struct {
    Driver  string         // file, console, syslog, null
    Level   string         // debug, info, warn, error
    Path    string         // file path (for file driver)
    MaxAge  int            // max age in days
    Options map[string]any // driver-specific options
}
```

## Environment Variables Reference

A representative `.env` covering the most common settings:

```env
# Application
APP_ENV=production
APP_DEBUG=false
APP_PORT=4000
APP_KEY=base64:your-32-byte-base64-encoded-key

# Crypto
CRYPTO_KEY=base64:your-32-byte-base64-encoded-key
CRYPTO_CIPHER=AES-256-GCM

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=velocity
DB_USERNAME=root
DB_PASSWORD=

# Cache
CACHE_DRIVER=redis
CACHE_PREFIX=velocity_cache
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DATABASE=0

# Logging
LOG_DRIVER=file
LOG_PATH=./storage/logs
LOG_LEVEL=debug
LOG_DAYS=14

# Queue
QUEUE_DRIVER=memory
QUEUE_REDIS_HOST=localhost
QUEUE_REDIS_PORT=6379

# Mail
MAIL_DRIVER=smtp
MAIL_HOST=smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="${APP_NAME}"

# Session
SESSION_NAME=velocity_session
SESSION_LIFETIME=120
SESSION_SECURE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax

# Server timeouts (accepts Go duration syntax, e.g. 30s)
SERVER_READ_TIMEOUT=30s
SERVER_WRITE_TIMEOUT=30s
SERVER_IDLE_TIMEOUT=120s
```

{{% callout type="info" %}}
**Defaults that differ from common expectations**: `MAIL_DRIVER` defaults to `log`
(captured, not sent), `CRYPTO_CIPHER` defaults to `AES-256-GCM`, `CACHE_DRIVER` and
`QUEUE_DRIVER` default to `memory`, `SESSION_SECURE` defaults to `true` (only the literal
`false` disables it), and `DB_HOST` / `REDIS_HOST` default to `127.0.0.1`.
{{% /callout %}}

## Environment-Specific Configuration

Velocity classifies `APP_ENV` through the canonical reader, so security gates relax only
when you explicitly opt into a non-production profile. An unset `APP_ENV` is treated as
production (fail-secure).

### Development

```env
APP_ENV=development
APP_DEBUG=true
APP_PORT=4000

LOG_LEVEL=debug
LOG_DRIVER=console

CACHE_DRIVER=memory
QUEUE_DRIVER=memory

DB_HOST=127.0.0.1
DB_DATABASE=myapp_dev
```

### Production

```env
APP_ENV=production
APP_DEBUG=false

LOG_LEVEL=info
LOG_DRIVER=file

CACHE_DRIVER=redis
QUEUE_DRIVER=redis

DB_HOST=db.example.com
DB_DATABASE=myapp_prod
```

### Testing

```env
APP_ENV=testing
APP_DEBUG=true

LOG_LEVEL=error
LOG_DRIVER=null

CACHE_DRIVER=memory
QUEUE_DRIVER=memory

DB_CONNECTION=sqlite
DB_DATABASE=:memory:
```

## Security Best Practices

### Sensitive Data

Never commit secrets to version control:

```bash
# .gitignore
.env
.env.local
.env.production
.env.*.local
```

### Environment Template

Provide a template for required variables:

```env
# .env.example
APP_ENV=development
APP_DEBUG=true
APP_PORT=4000
APP_KEY=

# Database (required)
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=
DB_USERNAME=
DB_PASSWORD=

# Crypto (required for production)
CRYPTO_KEY=
```

## Testing Configuration

In tests, build a `velocity.Config` directly and pass it with `WithConfig` rather than
relying on the environment:

```go
import (
    "testing"

    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/log"
    "github.com/velocitykode/velocity/mail"
)

func TestApp(t *testing.T) {
    app, err := velocity.New(velocity.WithConfig(velocity.Config{
        Env:   "testing",
        Debug: true,
        Port:  "0",
        Cache: velocity.CacheConfig{Driver: "memory", Prefix: "test_cache"},
        Log:   log.LogConfig{Driver: "null", Config: make(map[string]any)},
        Queue: velocity.QueueConfig{Driver: "memory"},
        Mail:  mail.MailConfig{Driver: "log"},
    }))
    if err != nil {
        t.Fatalf("New() error: %v", err)
    }
    _ = app
}
```

You can also point the loader at a dedicated env file before constructing the app:

```go
func TestMain(m *testing.M) {
    _ = godotenv.Load(".env.testing")
    os.Exit(m.Run())
}
```

## Docker Integration

### Docker Compose

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "4000:4000"
    environment:
      - APP_ENV=production
      - APP_DEBUG=false
      - APP_PORT=4000
      - DB_HOST=db
      - DB_DATABASE=myapp
      - DB_USERNAME=root
      - DB_PASSWORD=secret
      - REDIS_HOST=redis
    depends_on:
      - db
      - redis

  db:
    image: mysql:8
    environment:
      - MYSQL_ROOT_PASSWORD=secret
      - MYSQL_DATABASE=myapp

  redis:
    image: redis:alpine
```

## Best Practices

1. **Let `New()` load config**: a plain `velocity.New()` reads `.env` and the environment for you.
2. **Override via options**: use `WithConfig` / `WithPort` / `WithReadTimeout` instead of mutating globals.
3. **Validate early**: `Config.Validate()` runs inside `New()`; call it yourself when building config manually.
4. **Provide defaults**: keep an `.env.example` documenting every variable.
5. **Environment-specific files**: use `.env`, `.env.testing`, etc., for different profiles.
6. **Security**: never commit `.env` files; set `APP_KEY` / `CRYPTO_KEY` in production.
7. **Fail-secure env**: leave `APP_ENV` unset only when you intend production-grade defaults.
