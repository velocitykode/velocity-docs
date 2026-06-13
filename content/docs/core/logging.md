---
title: "Logging"
description: Log messages with Velocity's driver-based logging system supporting console, file, daily rotation, stack fan-out, and secret redaction.
weight: 30
---

Velocity provides a driver-based logging system that the framework wires up for you
from environment configuration when you boot an app with `velocity.New()`.

## Quick Start

{{% callout type="info" %}}
**Wired on boot**: `velocity.New()` reads the `LOG_*` environment variables, builds a
logger via `log.NewLogger`, and exposes it as `app.Log`. Inside a request handler the
same logger is available as `c.Log()`. No manual setup is required for the common case.
{{% /callout %}}

{{< tabs items="Basic Logging,Structured Logging,Error Handling" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity"

func main() {
    app, err := velocity.New()
    if err != nil {
        panic(err)
    }

    // app.Log is a contract.Logger wired from your LOG_* env vars.
    app.Log.Info("Application started")
    app.Log.Debug("Debugging information")
    app.Log.Warn("Warning message")
    app.Log.Error("An error occurred")
}
```
{{< /tab >}}

{{< tab >}}
```go
// Structured logging with key-value pairs. Every Logger method takes a
// message followed by alternating key/value arguments.
app.Log.Info("User logged in",
    "user_id", 123,
    "email", "user@example.com",
    "ip_address", "192.168.1.1",
)

app.Log.Info("Order processed",
    "order_id", "ORD-123",
    "amount", 99.99,
    "currency", "USD",
)
```
{{< /tab >}}

{{< tab >}}
```go
func processOrder(logger contract.Logger, orderID string) error {
    logger.Info("Processing order", "order_id", orderID)

    if err := validateOrder(orderID); err != nil {
        logger.Error("Order validation failed",
            "order_id", orderID,
            "error", err,
        )
        return err
    }

    logger.Info("Order processed successfully", "order_id", orderID)
    return nil
}
```
{{< /tab >}}

{{< /tabs >}}

The logger satisfies the `contract.Logger` interface, so any code that accepts a
`contract.Logger` can log without importing the `log` package directly:

```go
import "github.com/velocitykode/velocity/contract"

type Logger interface {
    Debug(msg string, kvs ...any)
    Info(msg string, kvs ...any)
    Warn(msg string, kvs ...any)
    Error(msg string, kvs ...any)
    Fatal(msg string, kvs ...any)
}
```

## Configuration

`velocity.New()` builds the logger from these environment variables:

```env
# Driver selection
LOG_DRIVER=console       # Options: console, file, daily, stack, null (default: console)

# File / daily driver settings
LOG_PATH=./storage/logs  # Directory for log files
LOG_DAYS=14              # Retention in days for rotated files (default: 14)

# Stack driver (comma-separated channel names)
LOG_STACK=console,file

# General settings
LOG_LEVEL=debug          # Minimum log level (default: debug)

# Optional: redact secrets/PII before they hit any sink
LOG_REDACT=true
```

These map onto a `log.LogConfig`, which you can also construct by hand:

```go
import "github.com/velocitykode/velocity/log"

cfg := log.LogConfig{
    Driver: "file",
    Config: map[string]any{
        "path":  "./storage/logs",
        "days":  14,
        "level": "debug",
    },
}

logger, err := log.NewLogger(cfg)
```

`log.NewLogger` resolves the driver through Velocity's driver registry. An empty
`Driver` defaults to `"console"`, so a zero-value `LogConfig` still produces a working
logger.

{{% callout type="info" %}}
**Driver imports**: the `console` and `null` drivers register themselves whenever the
`log` package is imported. The `file`, `daily`, and `stack` drivers live in leaf
packages and must be enabled with a blank import:

```go
import (
    _ "github.com/velocitykode/velocity/log/file"  // file + daily
    _ "github.com/velocitykode/velocity/log/stack" // stack
)
```

Or pull in all built-in drivers at once with the aggregator:

```go
import _ "github.com/velocitykode/velocity/log/standard"
```
{{% /callout %}}

## Drivers

### Console Driver

The console driver outputs formatted logs to stdout:

```
[09:42:06] INFO: Application started
[09:42:07] DEBUG: Processing request | method=GET path=/api/users
[09:42:08] ERROR: Database connection failed | error=connection timeout
```

You can construct one directly when you need a logger outside the framework:

```go
import "github.com/velocitykode/velocity/log/drivers"

// level is the minimum severity: 0=debug, 1=info, 2=warn, 3=error, 4=fatal.
logger := drivers.NewConsoleLogger(0)
```

### File and Daily Drivers

The `file` and `daily` drivers both write to daily-rotating files (they share a
factory, so `daily` is an alias):

- **Location**: Configured via `LOG_PATH` / the `path` option.
- **Format**: `velocity-YYYY-MM-DD.log`
- **Rotation**: Automatic daily rotation; retention is controlled by `LOG_DAYS` /
  the `days` option (`0` keeps files forever).
- **Permissions**: Files are created `0o600` inside a `0o700` directory by default.
- **Thread-safe**: Concurrent writes are serialized; opt into cross-process advisory
  locking when multiple instances share a log directory.

Example file output:
```
[2024-01-15 09:42:06.000] INFO: Application started
[2024-01-15 09:42:07.001] DEBUG: Processing request | method=GET path=/api/users
[2024-01-15 09:42:08.002] ERROR: Database connection failed | error=connection timeout
```

Constructing a file logger directly exposes the rotation and permission options:

```go
import "github.com/velocitykode/velocity/log/file"

// path, days (retention), level, then optional functional options.
logger := file.NewFileLogger("./storage/logs", 14, 0,
    file.WithFileMode(0o640), // override the default 0o600
    file.WithFileLock(),      // advisory flock for shared log dirs
)
```

### Stack Driver

The stack driver fans every message out to several child channels at once. Configure
it through the `stack` option (a list of channel names) or the `LOG_STACK` env var:

```go
cfg := log.LogConfig{
    Driver: "stack",
    Config: map[string]any{
        "stack": []string{"console", "file"},
        "path":  "./storage/logs",
    },
}
```

You can also build one directly from existing loggers:

```go
stack := log.NewStackLogger(consoleLogger, fileLogger)
```

### Null Driver

For testing or to disable a channel, use the `null` driver, which discards everything:

```go
logger, _ := log.NewLogger(log.LogConfig{Driver: "null"})
// or directly:
logger := log.NewNullLogger()
```

## Advanced Usage

### Manager for Multiple Channels

For applications that need several independently-configured channels, use the
`Manager`. Channel configuration lives in `log.LoggingConfig` / `log.ChannelConfig`:

```go
import "github.com/velocitykode/velocity/log"

func setupLogging() {
    cfg := log.LoggingConfig{
        Default: "file",
        Channels: map[string]log.ChannelConfig{
            "file": {
                Driver: "file",
                Path:   "./storage/logs",
                MaxAge: 14, // retention in days
            },
            "audit": {
                Driver: "file",
                Path:   "./storage/audit",
            },
            "errors": {
                Driver: "file",
                Path:   "./storage/errors",
                Level:  "error",
            },
            "console": {
                Driver: "console",
            },
        },
    }

    manager := log.NewManager(cfg)

    // Get specific channels (created lazily, thread-safe).
    auditLog, _ := manager.Channel("audit")
    errorLog, _ := manager.Channel("errors")

    // The default channel is available via Default().
    defaultLog, _ := manager.Default()
    _ = defaultLog

    // Use different loggers for different purposes.
    auditLog.Info("User action", "action", "delete", "user_id", 123)
    errorLog.Error("Critical error", "component", "payment")
}
```

A manager channel can itself be a stack that references other configured channels:

```go
cfg := log.LoggingConfig{
    Default: "stack",
    Channels: map[string]log.ChannelConfig{
        "console": {Driver: "console"},
        "file":    {Driver: "file", Path: "./storage/logs"},
        "stack": {
            Driver: "stack",
            Options: map[string]any{
                "channels": []string{"console", "file"},
            },
        },
    },
}
```

## Redaction

Velocity can strip secrets and PII from every log line before it reaches a sink. The
redaction layer runs against the message and each key/value, across all drivers.

Turn it on per channel with the `redact` option, supply your own chain with the
`redactors` option, or flip it on process-wide with `LOG_REDACT=true`:

```go
cfg := log.LogConfig{
    Driver: "console",
    Config: map[string]any{"redact": true},
}
```

The default chain (`log.BuildDefaultRedactors()`) covers `Authorization`-style
headers, JWTs, and card numbers (PAN). Email-address redaction is opt-in: set
`LOG_REDACT_EMAILS=true` and `BuildDefaultRedactors()` adds the email redactor.
You can wrap any logger with a custom chain:

```go
import "github.com/velocitykode/velocity/log"

redacted := log.WithRedactors(inner,
    log.HeaderRedactor(),
    log.JWTRedactor(),
    log.RedactorFunc(func(s string) string {
        // custom rule
        return s
    }),
)
```

## Testing

When testing, use the null driver to silence output:

```go
func TestMyFunction(t *testing.T) {
    logger, _ := log.NewLogger(log.LogConfig{Driver: "null"})

    // Pass the logger into the code under test; it produces no output.
    MyFunction(logger)
}
```

## Best Practices

1. **Use structured logging**: Pass key-value pairs for better searchability.
2. **Choose appropriate levels**: Debug for development, Info for production.
3. **Configure per environment**: Use different drivers for dev/staging/production.
4. **Rotate logs**: The file/daily drivers handle this automatically via `LOG_DAYS`.
5. **Redact secrets**: Enable redaction in compliance-sensitive environments.

## Examples

### HTTP Middleware

Inside the router, the request-scoped logger is available via `c.Log()`:

```go
import (
    "time"
    "github.com/velocitykode/velocity/router"
)

func LoggingMiddleware(next router.HandlerFunc) router.HandlerFunc {
    return func(c *router.Context) error {
        start := time.Now()

        c.Log().Info("Request started",
            "method", c.Request.Method,
            "path", c.Request.URL.Path,
            "ip", c.Request.RemoteAddr,
        )

        // Call the next handler.
        err := next(c)

        c.Log().Info("Request completed",
            "method", c.Request.Method,
            "path", c.Request.URL.Path,
            "duration", time.Since(start),
        )

        return err
    }
}
```

### Error Handling

```go
func ProcessPayment(logger contract.Logger, amount float64) error {
    logger.Debug("Processing payment", "amount", amount)

    err := chargeCard(amount)
    if err != nil {
        logger.Error("Payment failed",
            "amount", amount,
            "error", err,
            "timestamp", time.Now(),
        )
        return err
    }

    logger.Info("Payment successful", "amount", amount)
    return nil
}
```
