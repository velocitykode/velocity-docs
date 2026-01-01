---
title: CLI
description: Velocity CLI reference. Create projects, run dev servers, generate code, and manage your Go web application from the command line.
weight: 20
sidebar:
  open: true
---

Velocity provides two CLI tools that work together:

- **`velocity`** - Global installer (via Homebrew) for creating and managing projects
- **`vel`** - Project CLI (built from source) for development commands

## Installation

```bash
brew tap velocitykode/tap
brew install velocity
```

## Architecture

```
velocity (global)          vel (per-project)
├── new                    ├── serve
├── init                   ├── build
├── config                 ├── migrate
└── self-update            ├── migrate:fresh
                           ├── make:controller
                           └── key:generate
```

**Why two CLIs?**
- `velocity` is installed globally via Homebrew
- `vel` is built from your project source, so it has access to your migrations, models, and bootstrap code

## Quick Reference

### Global Commands (velocity)

| Command | Description |
|---------|-------------|
| `velocity new <name>` | Create a new Velocity project |
| `velocity init` | Initialize Velocity in existing project |
| `velocity config` | Manage CLI configuration |
| `velocity self-update` | Update the installer |

### Project Commands (vel)

| Command | Description |
|---------|-------------|
| `vel serve` | Start development server with hot reload |
| `vel build` | Build for production |
| `vel migrate` | Run database migrations |
| `vel migrate:fresh` | Drop all tables and re-migrate |
| `vel make:controller` | Generate a controller |
| `vel key:generate` | Generate encryption key |

## Using vel

After creating a project with `velocity new`, a `./vel` binary is built automatically. Run project commands with:

```bash
cd myproject
./vel serve
./vel migrate
```

### Shell Function (Optional)

Add this to `~/.zshrc` to use `vel` instead of `./vel`:

```bash
vel() { [ -x ./vel ] && ./vel "$@" || echo "vel: not found"; }
```

Then you can simply run:

```bash
vel serve
vel migrate
```

## In This Section

- **[Installation](installation/)** - Install the Velocity CLI
- **[Commands](commands/)** - Complete command reference
- **[Configuration](configuration/)** - CLI configuration options
