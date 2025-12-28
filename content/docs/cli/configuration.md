---
title: Configuration
weight: 3
---

The Velocity CLI stores global configuration preferences that apply to all projects.

## Configuration File

Configuration is stored in `~/.velocity/config.yaml`. This file is created automatically when you first set a configuration value.

## Available Settings

| Setting | Description | Valid Values |
|---------|-------------|--------------|
| `default.database` | Default database driver for new projects | `postgres`, `mysql`, `sqlite` |
| `default.cache` | Default cache driver | `redis`, `memory` |
| `default.queue` | Default queue driver | `redis`, `database`, `sync` |
| `default.auth` | Include authentication by default | `true`, `false` |
| `default.api` | Create API-only projects by default | `true`, `false` |

## Setting Defaults

Configure your preferred defaults so you don't have to specify them every time:

```bash
# Set PostgreSQL as default database
velocity config set default.database postgres

# Set Redis as default cache
velocity config set default.cache redis

# Always include authentication
velocity config set default.auth true
```

Now when you create a new project, these defaults are used:

```bash
# Uses postgres + redis + auth without specifying flags
velocity new myapp
```

## Viewing Configuration

List all current settings:

```bash
velocity config list
```

Get a specific value:

```bash
velocity config get default.database
```

## Resetting Configuration

Clear all settings and return to defaults:

```bash
velocity config reset
```

## Priority Order

When creating a project, values are resolved in this order:

1. **Command-line flags** (highest priority)
2. **Configuration file** (`~/.velocity/config.yaml`)
3. **Built-in defaults** (lowest priority)

**Example:**

```bash
# Config has default.database = postgres
# But this command uses mysql (flag overrides config)
velocity new myapp --database mysql
```

## Example Configuration File

```yaml
# ~/.velocity/config.yaml
defaults:
  database: postgres
  cache: redis
  queue: redis
  auth: true
  api: false
```
