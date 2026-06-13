---
title: Installation
description: Install the Velocity CLI on macOS using Homebrew. Create and manage Go web applications with the velocity command line tool.
weight: 1
keywords: [velocity cli, go web framework, homebrew install, golang cli, velocity install]
---

Install the Velocity CLI to create and manage Velocity projects.

## Requirements

- **Go 1.26 or higher** - Required for building projects (the installer checks `go version` on startup and refuses to run on an older toolchain)
- **Node.js 20+** - Required for frontend asset compilation (Vite 7)
- **Git** - Required for project initialization (each new project is initialized as a Git repository, and Git clone is used as a fallback when the template tarball download is unavailable)

Full-stack projects install JavaScript dependencies with [bun](https://bun.sh) when it is available, falling back to `npm`. Installing bun is optional but gives much faster installs.

## Install via Homebrew

The recommended way to install Velocity on macOS is through the Homebrew cask:

```bash
brew tap velocitykode/tap
brew install velocity
```

## Verify Installation

Check that the CLI is installed correctly:

```bash
velocity --version
```

You should see the installer version followed by the template tags pinned to that release:

```
velocity 0.21.14
templates:
  api -> v...
  react -> v...
  vue -> v...
```

Each installer release pins exact template tags, so the version output lists those tags as the relevant build coordinates.

## Understanding the CLI Architecture

Velocity uses two CLI tools:

| Tool | Install Method | Purpose |
|------|---------------|---------|
| `velocity` | Homebrew (global) | Create projects, manage config |
| `vel` | Built from source (per-project) | Run dev server, migrations, generators |

When you run `velocity new myapp`, it:
1. Scaffolds a new project from the pinned template
2. Installs dependencies (`go mod tidy`, plus bun/npm for full-stack projects)
3. Builds the `./vel` binary from your project source
4. Runs initial database migrations

When the project is ready it prints the next steps to start the dev servers (`cd myapp` then `./vel serve`). If the database server is not reachable, migrations are skipped and the printed steps include starting your database and running `./vel migrate` manually.

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

## Setting Project Defaults

Use `velocity config` to set defaults that `velocity new` will apply when a flag is not provided:

```bash
velocity config set default.database postgres
velocity config set default.cache redis
velocity config set default.api true
```

Supported keys are `default.database`, `default.cache`, `default.queue`, `default.auth`, and `default.api`. Read or inspect the current values with:

```bash
velocity config get default.database
velocity config list
velocity config reset
```

Configuration is stored in `~/.vel/config.yaml`.

## Updating

### Update Velocity Installer

For Homebrew installs, upgrade the cask:

```bash
brew upgrade --cask velocity
```

The built-in self-update command detects a Homebrew install and will point you at the `brew upgrade --cask velocity` command above. It only downloads and replaces the binary in place for non-Homebrew (manual) installs:

```bash
velocity self-update
```

### Rebuild vel

The `vel` binary is built from the project's `main.go`. To rebuild it manually from the project root:

```bash
go build -o vel .
```

## Uninstalling

### Remove Velocity Installer

```bash
brew uninstall --cask velocity
brew untap velocitykode/tap
```

### Remove vel

The `vel` binary is project-local and gitignored. Simply delete your project directory.
