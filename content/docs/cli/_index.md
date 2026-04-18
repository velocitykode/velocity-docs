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
├── config                 ├── build
└── self-update            ├── migrate
                           ├── migrate:fresh / rollback / status
                           ├── db:wipe
                           ├── cache:clear
                           ├── queue:work
                           ├── schedule:work
                           ├── down / up
                           ├── route:list
                           ├── key:generate
                           └── make:* (12 generators)
```

**Why two CLIs?**
- `velocity` is installed globally via Homebrew and only knows how to
  create, configure, and update itself.
- `vel` is built from your project source, so it has access to your
  migrations, models, and app initialization code.

## Quick Reference

### Global Commands (velocity)

| Command | Description |
|---------|-------------|
| `velocity new <name>` | Create a new Velocity project |
| `velocity new <name> --api` | API-only project (no frontend) |
| `velocity config` | Manage CLI defaults |
| `velocity self-update` | Update the installer |

Full reference: [Installer Commands](installer/).

### Project Commands (vel)

| Command | Description |
|---------|-------------|
| `vel serve` | Dev server with live reload |
| `vel build` | Production build |
| `vel migrate` | Run database migrations |
| `vel queue:work` | Process queued jobs |
| `vel make:handler` | Generate a handler |
| `vel key:generate` | Generate encryption key |

Full reference: [vel Commands](commands/).

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

- **[Installation](installation/)** — Install the Velocity CLI
- **[Installer Commands](installer/)** — `velocity new`, `config`, `self-update`
- **[vel Commands](commands/)** — Complete per-project command reference
- **[Configuration](configuration/)** — `velocity config` defaults in depth
