---
title: Configuration
description: Manage application configuration with environment variables and structured config files in Velocity.
weight: 5
---

Velocity provides a simple yet powerful configuration system that reads from environment variables and provides structured configuration for framework packages.

## Quick Start

{{% callout type="info" %}}
**Environment-Based**: Velocity uses environment variables for all configuration, following the twelve-factor app methodology.
{{% /callout %}}

{{< tabs items="Basic Usage,Environment Files,Type Helpers" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/config"

func main() {
    // Get environment variable with fallback
    appName := config.Get("APP_NAME", "Velocity")
    appEnv := config.Get("APP_ENV", "development")

    fmt.Printf("Running %s in %s mode\n", appName, appEnv)
}
```
{{< /tab >}}

{{< tab >}}
```env
# .env file
APP_NAME=MyApplication
APP_ENV=production
APP_DEBUG=false
APP_URL=https://example.com

# Database
DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=myapp
DB_USERNAME=root
DB_PASSWORD=secret

# Cache
CACHE_DRIVER=redis
REDIS_HOST=localhost
REDIS_PORT=6379
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/config"

func main() {
    // String with fallback
    appName := config.Env("APP_NAME", "Velocity")

    // Integer with fallback
    port := config.EnvInt("APP_PORT", 3000)

    // Boolean with fallback
    debug := config.EnvBool("APP_DEBUG", false)

    fmt.Printf("%s running on port %d (debug: %v)\n", appName, port, debug)
}
```
{{< /tab >}}

{{< /tabs >}}

## Configuration Files

### .env File

Create a `.env` file in your project root:

```env
# Application
APP_NAME=Velocity
APP_ENV=production
APP_DEBUG=false
APP_URL=https://example.com
APP_PORT=3000

# Crypto (for session encryption)
CRYPTO_KEY=base64:your-32-byte-base64-encoded-key
CRYPTO_CIPHER=AES-256-CBC

# Database
DB_CONNECTION=mysql
DB_HOST=localhost
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
SESSION_DRIVER=cookie
SESSION_LIFETIME=120
SESSION_SECURE=false
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax

# WebSocket
WEBSOCKET_HOST=0.0.0.0
WEBSOCKET_PORT=6001
WEBSOCKET_PATH=/ws
```

### Loading Environment Variables

Environment variables are loaded automatically by the framework, but you can also load them manually:

```go
import (
    "github.com/joho/godotenv"
    "log"
)

func init() {
    // Load .env file
    if err := godotenv.Load(); err != nil {
        log.Println("No .env file found")
    }
}
```

## API Reference

### Get

Retrieve an environment variable with a fallback:

```go
import "github.com/velocitykode/velocity/pkg/config"

// Get with fallback
appName := config.Get("APP_NAME", "DefaultApp")

// Get without fallback (returns empty string if not set)
apiKey := config.Get("API_KEY", "")
```

### Env

Alias for `Get` - retrieve string environment variable:

```go
// Get string value
appEnv := config.Env("APP_ENV", "development")
appURL := config.Env("APP_URL", "http://localhost:3000")
```

### EnvInt

Retrieve an integer environment variable:

```go
// Get integer value
port := config.EnvInt("APP_PORT", 3000)
maxConnections := config.EnvInt("MAX_CONNECTIONS", 100)

// Returns default value if not set or invalid
timeout := config.EnvInt("TIMEOUT", 30)
```

### EnvBool

Retrieve a boolean environment variable:

```go
// Get boolean value
debug := config.EnvBool("APP_DEBUG", false)
enableCache := config.EnvBool("ENABLE_CACHE", true)

// Accepts: true, false, 1, 0, yes, no (case-insensitive)
```

## Structured Configuration

### Logging Configuration

The config package provides structured configuration for logging:

```go
import "github.com/velocitykode/velocity/pkg/config"

// Get logging configuration
loggingConfig := config.GetLoggingConfig()

// Access default channel
defaultChannel := loggingConfig.Default  // "stack"

// Get specific channel config
if channelConfig, exists := loggingConfig.GetChannel("daily"); exists {
    fmt.Printf("Driver: %s\n", channelConfig.Driver)
    fmt.Printf("Path: %s\n", channelConfig.Path)
    fmt.Printf("Level: %s\n", channelConfig.Level)
}

// Get default channel config
if defaultConfig, exists := loggingConfig.GetDefaultChannel(); exists {
    fmt.Printf("Default driver: %s\n", defaultConfig.Driver)
}
```

### Channel Configuration

Configure individual log channels:

```go
type ChannelConfig struct {
    Driver     string                 // Driver name (file, console, syslog, null)
    Level      string                 // Log level (debug, info, warn, error)
    Path       string                 // File path (for file driver)
    MaxSize    int                    // Max size in MB
    MaxAge     int                    // Max age in days
    MaxBackups int                    // Number of old files to keep
    Format     string                 // Format (json, text)
    Options    map[string]interface{} // Driver-specific options
}
```

## Environment-Specific Configuration

### Development Environment

```env
APP_ENV=development
APP_DEBUG=true
APP_URL=http://localhost:3000

LOG_LEVEL=debug
LOG_DRIVER=console

CACHE_DRIVER=memory
QUEUE_DRIVER=memory

DB_HOST=localhost
DB_DATABASE=myapp_dev
```

### Production Environment

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://example.com

LOG_LEVEL=info
LOG_DRIVER=file

CACHE_DRIVER=redis
QUEUE_DRIVER=redis

DB_HOST=db.example.com
DB_DATABASE=myapp_prod
```

### Testing Environment

```env
APP_ENV=testing
APP_DEBUG=true

LOG_LEVEL=error
LOG_DRIVER=null

CACHE_DRIVER=memory
QUEUE_DRIVER=memory

DB_DATABASE=myapp_test
```

## Configuration Patterns

### Application Bootstrap

Centralize configuration loading in your bootstrap:

```go
package bootstrap

import (
    "log"
    "os"
    "github.com/joho/godotenv"
    "github.com/velocitykode/velocity/pkg/config"
)

type AppConfig struct {
    Name        string
    Environment string
    Debug       bool
    URL         string
    Port        int
}

func LoadConfig() *AppConfig {
    // Load .env file
    if err := godotenv.Load(); err != nil {
        log.Println("No .env file found, using environment variables")
    }

    return &AppConfig{
        Name:        config.Get("APP_NAME", "Velocity"),
        Environment: config.Get("APP_ENV", "development"),
        Debug:       config.EnvBool("APP_DEBUG", false),
        URL:         config.Get("APP_URL", "http://localhost:3000"),
        Port:        config.EnvInt("APP_PORT", 3000),
    }
}
```

### Database Configuration

```go
type DatabaseConfig struct {
    Connection string
    Host       string
    Port       int
    Database   string
    Username   string
    Password   string
}

func GetDatabaseConfig() *DatabaseConfig {
    return &DatabaseConfig{
        Connection: config.Get("DB_CONNECTION", "mysql"),
        Host:       config.Get("DB_HOST", "localhost"),
        Port:       config.EnvInt("DB_PORT", 3306),
        Database:   config.Get("DB_DATABASE", "velocity"),
        Username:   config.Get("DB_USERNAME", "root"),
        Password:   config.Get("DB_PASSWORD", ""),
    }
}
```

### Cache Configuration

```go
type CacheConfig struct {
    Driver   string
    Prefix   string
    Host     string
    Port     int
    Password string
    Database int
}

func GetCacheConfig() *CacheConfig {
    return &CacheConfig{
        Driver:   config.Get("CACHE_DRIVER", "memory"),
        Prefix:   config.Get("CACHE_PREFIX", "velocity_cache"),
        Host:     config.Get("REDIS_HOST", "localhost"),
        Port:     config.EnvInt("REDIS_PORT", 6379),
        Password: config.Get("REDIS_PASSWORD", ""),
        Database: config.EnvInt("REDIS_DATABASE", 0),
    }
}
```

### Mail Configuration

```go
type MailConfig struct {
    Driver      string
    Host        string
    Port        int
    Username    string
    Password    string
    Encryption  string
    FromAddress string
    FromName    string
}

func GetMailConfig() *MailConfig {
    return &MailConfig{
        Driver:      config.Get("MAIL_DRIVER", "smtp"),
        Host:        config.Get("MAIL_HOST", "localhost"),
        Port:        config.EnvInt("MAIL_PORT", 1025),
        Username:    config.Get("MAIL_USERNAME", ""),
        Password:    config.Get("MAIL_PASSWORD", ""),
        Encryption:  config.Get("MAIL_ENCRYPTION", "tls"),
        FromAddress: config.Get("MAIL_FROM_ADDRESS", "noreply@example.com"),
        FromName:    config.Get("MAIL_FROM_NAME", config.Get("APP_NAME", "Velocity")),
    }
}
```

## Security Best Practices

### Sensitive Data

Never commit sensitive data to version control:

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
APP_NAME=Velocity
APP_ENV=development
APP_DEBUG=true
APP_URL=http://localhost:3000

# Database (required)
DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=
DB_USERNAME=
DB_PASSWORD=

# Crypto (required for production)
CRYPTO_KEY=

# Mail (required for email features)
MAIL_DRIVER=smtp
MAIL_HOST=
MAIL_PORT=
MAIL_USERNAME=
MAIL_PASSWORD=
```

### Validation

Validate required configuration on startup:

```go
func validateConfig() error {
    required := []string{
        "APP_NAME",
        "DB_HOST",
        "DB_DATABASE",
    }

    for _, key := range required {
        if os.Getenv(key) == "" {
            return fmt.Errorf("required environment variable %s is not set", key)
        }
    }

    // Validate crypto key in production
    if config.Get("APP_ENV", "") == "production" {
        if os.Getenv("CRYPTO_KEY") == "" {
            return fmt.Errorf("CRYPTO_KEY is required in production")
        }
    }

    return nil
}
```

## Testing Configuration

### Test Environment

Create a `.env.testing` file:

```env
APP_ENV=testing
APP_DEBUG=true

DB_CONNECTION=sqlite
DB_DATABASE=:memory:

CACHE_DRIVER=memory
QUEUE_DRIVER=memory
LOG_DRIVER=null
```

### Load Test Config

```go
func TestMain(m *testing.M) {
    // Load test environment
    godotenv.Load(".env.testing")

    // Run tests
    code := m.Run()

    os.Exit(code)
}
```

## Docker Integration

### Using Environment Variables

```dockerfile
# Dockerfile
FROM golang:1.25-alpine

WORKDIR /app

COPY . .

RUN go build -o main .

# Environment variables can be passed at runtime
CMD ["./main"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - APP_NAME=MyApp
      - APP_ENV=production
      - APP_DEBUG=false
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

1. **Use Environment Variables**: Keep all configuration in environment variables
2. **Provide Defaults**: Always provide sensible defaults for non-sensitive values
3. **Document Variables**: Maintain an `.env.example` file with all available options
4. **Validate on Startup**: Check required configuration before starting the application
5. **Environment-Specific**: Use different `.env` files for different environments
6. **Security**: Never commit `.env` files to version control
7. **Type Safety**: Use `EnvInt` and `EnvBool` for non-string values
8. **Centralize**: Create configuration structs to centralize access patterns

## Examples

### Complete Application Setup

```go
package main

import (
    "fmt"
    "log"
    "os"

    "github.com/joho/godotenv"
    "github.com/velocitykode/velocity/pkg/config"
)

type Config struct {
    App      AppConfig
    Database DatabaseConfig
    Cache    CacheConfig
    Logging  config.LoggingConfig
}

type AppConfig struct {
    Name        string
    Environment string
    Debug       bool
    URL         string
    Port        int
}

type DatabaseConfig struct {
    Host     string
    Port     int
    Database string
    Username string
    Password string
}

type CacheConfig struct {
    Driver string
    Prefix string
}

func LoadAppConfig() (*Config, error) {
    // Load .env file
    if err := godotenv.Load(); err != nil {
        log.Println("No .env file found")
    }

    // Validate required variables
    if err := validateConfig(); err != nil {
        return nil, err
    }

    return &Config{
        App: AppConfig{
            Name:        config.Get("APP_NAME", "Velocity"),
            Environment: config.Get("APP_ENV", "development"),
            Debug:       config.EnvBool("APP_DEBUG", false),
            URL:         config.Get("APP_URL", "http://localhost:3000"),
            Port:        config.EnvInt("APP_PORT", 3000),
        },
        Database: DatabaseConfig{
            Host:     config.Get("DB_HOST", "localhost"),
            Port:     config.EnvInt("DB_PORT", 3306),
            Database: config.Get("DB_DATABASE", "velocity"),
            Username: config.Get("DB_USERNAME", "root"),
            Password: config.Get("DB_PASSWORD", ""),
        },
        Cache: CacheConfig{
            Driver: config.Get("CACHE_DRIVER", "memory"),
            Prefix: config.Get("CACHE_PREFIX", "velocity_cache"),
        },
        Logging: config.GetLoggingConfig(),
    }, nil
}

func validateConfig() error {
    required := []string{"DB_DATABASE"}

    for _, key := range required {
        if os.Getenv(key) == "" {
            return fmt.Errorf("%s is required", key)
        }
    }

    return nil
}

func main() {
    cfg, err := LoadAppConfig()
    if err != nil {
        log.Fatal("Failed to load configuration:", err)
    }

    fmt.Printf("Starting %s in %s mode on port %d\n",
        cfg.App.Name,
        cfg.App.Environment,
        cfg.App.Port,
    )
}
```
