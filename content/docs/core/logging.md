---
title: "Logging"
description: Log messages with Velocity's driver-based logging system supporting console, file, and daily rotation.
weight: 30
---

Velocity provides a powerful, driver-based logging system that auto-initializes from your environment configuration.

## Quick Start

{{% callout type="info" %}}
**Zero Configuration**: The log package automatically initializes from your `.env` file. No setup required!
{{% /callout %}}

{{< tabs items="Basic Logging,Structured Logging,Error Handling" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/log"

func main() {
    // Logger auto-initializes from .env
    log.Info("Application started")
    log.Debug("Debugging information")
    log.Warn("Warning message")
    log.Error("An error occurred")
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/log"

func main() {
    // Structured logging with key-value pairs
    log.Info("User logged in",
        "user_id", 123,
        "email", "user@example.com",
        "ip_address", "192.168.1.1",
    )

    log.Info("Order processed",
        "order_id", "ORD-123",
        "amount", 99.99,
        "currency", "USD",
    )
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/log"

func processOrder(orderID string) error {
    log.Info("Processing order", "order_id", orderID)

    if err := validateOrder(orderID); err != nil {
        log.Error("Order validation failed",
            "order_id", orderID,
            "error", err,
        )
        return err
    }

    log.Info("Order processed successfully", "order_id", orderID)
    return nil
}
```
{{< /tab >}}

{{< /tabs >}}

## Configuration

Configure logging through environment variables in your `.env` file:

```env
# Driver selection
LOG_DRIVER=file          # Options: console, file

# File driver settings
LOG_PATH=./storage/logs  # Directory for log files

# General settings
LOG_LEVEL=debug         # Minimum log level
LOG_FORMAT=text         # Output format
```

## Drivers

### Console Driver

The console driver outputs formatted logs to stdout:

```
[09:42:06] INFO: Application started
[09:42:07] DEBUG: Processing request | method=GET path=/api/users
[09:42:08] ERROR: Database connection failed | error=connection timeout
```

### File Driver

The file driver writes logs to daily rotating files:

- **Location**: Configured via `LOG_PATH` (default: `./storage/logs`)
- **Format**: `velocity-YYYY-MM-DD.log`
- **Rotation**: Automatic daily rotation at midnight
- **Thread-safe**: Concurrent writes are properly synchronized

Example file output:
```
2024-01-15 09:42:06 INFO: Application started
2024-01-15 09:42:07 DEBUG: Processing request | method=GET path=/api/users
2024-01-15 09:42:08 ERROR: Database connection failed | error=connection timeout
```

## Advanced Usage

### Manager for Multiple Channels

For complex applications, use the Manager to handle multiple log channels:

```go
import (
    "github.com/velocitykode/velocity/pkg/log"
    "github.com/velocitykode/velocity/pkg/config"
)

func setupLogging() {
    cfg := config.LoggingConfig{
        Default: "file",
        Channels: map[string]config.ChannelConfig{
            "file": {
                Driver: "file",
                Path:   "./storage/logs",
            },
            "audit": {
                Driver: "file",
                Path:   "./storage/audit",
            },
            "errors": {
                Driver: "file",
                Path:   "./storage/errors",
            },
            "console": {
                Driver: "console",
            },
        },
    }
    
    manager := log.NewManager(cfg)
    
    // Get specific channels
    auditLog, _ := manager.Channel("audit")
    errorLog, _ := manager.Channel("errors")
    
    // Use different loggers for different purposes
    auditLog.Info("User action", "action", "delete", "user_id", 123)
    errorLog.Error("Critical error", "component", "payment")
}
```

### Stack Driver

Log to multiple destinations simultaneously:

```go
cfg := config.LoggingConfig{
    Channels: map[string]config.ChannelConfig{
        "stack": {
            Driver: "stack",
            Options: map[string]any{
                "channels": []string{"console", "file"},
            },
        },
    },
}
```

### Null Driver

For testing or to disable specific log channels:

```go
cfg := config.LoggingConfig{
    Channels: map[string]config.ChannelConfig{
        "null": {
            Driver: "null", // Discards all logs
        },
    },
}
```

## Testing

When testing, you can use the null driver or initialize with specific settings:

```go
func TestMyFunction(t *testing.T) {
    // Initialize with null driver for tests
    log.Init("null", nil)
    
    // Your test code
    MyFunction() // Won't produce log output
}
```

## Best Practices

1. **Use structured logging**: Pass key-value pairs for better searchability
2. **Choose appropriate levels**: Debug for development, Info for production
3. **Configure per environment**: Use different drivers for dev/staging/production
4. **Rotate logs**: File driver handles this automatically
5. **Monitor disk space**: Set up log cleanup for production systems

## Examples

### HTTP Middleware

```go
import (
    "time"
    "github.com/velocitykode/velocity/pkg/log"
    "github.com/velocitykode/velocity/pkg/http"
)

func LoggingMiddleware(next http.HandlerFunc) http.HandlerFunc {
    return func(c *http.Context) error {
        start := time.Now()

        log.Info("Request started",
            "method", c.Request.Method,
            "path", c.Request.URL.Path,
            "ip", c.Request.RemoteAddr,
        )

        // Call the next handler
        err := next(c)

        log.Info("Request completed",
            "method", c.Request.Method,
            "path", c.Request.URL.Path,
            "duration", time.Since(start),
        )

        return err
    }
}

// Usage with router
func main() {
    router := http.NewRouter()

    // Apply middleware globally
    router.Middleware(LoggingMiddleware)

    router.GET("/api/users", func(c *http.Context) error {
        return c.JSON(200, map[string]string{"status": "ok"})
    })

    router.Listen(":3000")
}
```

### Error Handling

```go
func ProcessPayment(amount float64) error {
    log.Debug("Processing payment", "amount", amount)
    
    err := chargeCard(amount)
    if err != nil {
        log.Error("Payment failed",
            "amount", amount,
            "error", err,
            "timestamp", time.Now(),
        )
        return err
    }
    
    log.Info("Payment successful", "amount", amount)
    return nil
}
```