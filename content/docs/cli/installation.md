---
title: Installation
description: Install the Velocity CLI on macOS using Homebrew. Create and manage Go web applications with the velocity command line tool.
weight: 1
keywords: [velocity cli, go web framework, homebrew install, golang cli, velocity install]
---

Install the Velocity CLI to create and manage Velocity projects.

## Requirements

- **Go 1.25 or higher** - Required for building projects
- **Node.js 18+** - Required for frontend asset compilation (Vite)
- **Git** - Required for project initialization

## Install via Homebrew

The recommended way to install Velocity on macOS:

```bash
brew tap velocitykode/tap
brew install velocity
```

## Verify Installation

Check that the CLI is installed correctly:

```bash
velocity --version
```

You should see output like:

```
velocity version 0.4.0
```

## Understanding the CLI Architecture

Velocity uses two CLI tools:

| Tool | Install Method | Purpose |
|------|---------------|---------|
| `velocity` | Homebrew (global) | Create projects, manage config |
| `vel` | Built from source (per-project) | Run dev server, migrations, generators |

When you run `velocity new myapp`, it:
1. Scaffolds a new project
2. Installs dependencies
3. Builds the `./vel` binary from your project source
4. Starts development servers

## Using vel in Projects

After creating a project, use `./vel` for development commands:

```bash
cd myapp
./vel serve      # Start dev server
./vel migrate    # Run migrations
```

### Shell Function (Recommended)

Run this once to use `vel` instead of `./vel`:

```bash
grep -q "vel()" ~/.zshrc || echo 'vel() { [ -x ./vel ] && ./vel "$@" || echo "vel: not found"; }' >> ~/.zshrc && source ~/.zshrc
```

Now you can simply run:

```bash
vel serve
vel migrate
```

## Getting Help

View available commands:

```bash
velocity --help
./vel --help
```

Get help for a specific command:

```bash
velocity new --help
./vel serve --help
```

## Updating

### Update Velocity Installer

```bash
brew upgrade velocity
```

Or use the built-in self-update:

```bash
velocity self-update
```

### Rebuild vel

The `vel` binary is rebuilt automatically when source files change. To manually rebuild:

```bash
go build -o vel ./cmd/vel
```

## Uninstalling

### Remove Velocity Installer

```bash
brew uninstall velocity
brew untap velocitykode/tap
```

### Remove vel

The `vel` binary is project-local and gitignored. Simply delete your project directory.
