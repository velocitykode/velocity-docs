---
title: Installation
weight: 1
---

Install the Velocity CLI to create and manage Velocity projects.

## Requirements

- **Go 1.25 or higher** - Required for building projects
- **Node.js 18+** - Required for frontend asset compilation
- **Git** - Required for project initialization

## Installation Methods

### Homebrew (macOS)

The recommended way to install on macOS:

```bash
brew tap velocitykode/tap
brew install velocity
```

To upgrade to the latest version:

```bash
brew upgrade velocity
```

### Go Install

Install directly using Go:

```bash
go install github.com/velocitykode/velocity-cli@latest
```

Make sure `$GOPATH/bin` (usually `~/go/bin`) is in your PATH:

```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$PATH:$(go env GOPATH)/bin"
```

### Verify Installation

Check that the CLI is installed correctly:

```bash
velocity version
```

You should see output like:

```
╔══════════════════════════════════════╗
║        VELOCITY CLI v0.1.0        ║
╚══════════════════════════════════════╝
```

## Getting Help

View available commands:

```bash
velocity --help
```

Get help for a specific command:

```bash
velocity new --help
velocity serve --help
```

## Updating

### Homebrew

```bash
brew upgrade velocity
```

### Go Install

```bash
go install github.com/velocitykode/velocity-cli@latest
```

## Uninstalling

### Homebrew

```bash
brew uninstall velocity
brew untap velocitykode/tap
```

### Go Install

```bash
rm $(go env GOPATH)/bin/velocity
```
