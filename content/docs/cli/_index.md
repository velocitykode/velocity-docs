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
                           ├── migrate fresh / rollback / status
                           ├── db wipe
                           ├── db seed
                           ├── cache clear
                           ├── queue work
                           ├── schedule work
                           ├── down / up
                           ├── routes
                           ├── key generate
                           ├── run <command>
                           └── gen * (17 generators)
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

Full reference: [Velocity Installer]({{< relref "/docs/getting-started/installer" >}}).

### Project Commands (vel)

| Command | Description |
|---------|-------------|
| `vel serve` | Dev server with live reload |
| `vel build` | Production build |
| `vel migrate` | Run database migrations (`fresh`, `rollback`, `status`) |
| `vel db seed` / `vel db wipe` | Seed or wipe the database |
| `vel queue work` | Process queued jobs |
| `vel schedule work` | Run the scheduler |
| `vel cache clear` | Flush the cache |
| `vel routes` | List all registered routes |
| `vel down` / `vel up` | Toggle maintenance mode |
| `vel key generate` | Generate the encryption key |
| `vel gen <artifact>` | Scaffold handlers, models, migrations, jobs, and more |
| `vel run <command>` | Run a command your app registered |

Command names are space-separated words (`migrate fresh`, `gen model`,
`gen grpc service`), and a subcommand always beats its bare parent.

Full index with links to each command's page: [vel Commands](commands/).

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
