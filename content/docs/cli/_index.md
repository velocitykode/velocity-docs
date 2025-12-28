---
title: CLI
description: Velocity CLI reference. Create projects, run dev servers, generate code, and manage your Go web application from the command line.
weight: 20
sidebar:
  open: true
---

The Velocity CLI provides commands for creating projects, running development servers, generating code, and managing your application.

## Installation

{{< tabs items="Homebrew,Go" >}}

{{< tab name="Homebrew" >}}
```bash
brew tap velocitykode/tap
brew install velocity
```
{{< /tab >}}

{{< tab name="Go" >}}
```bash
go install github.com/velocitykode/velocity-cli@latest
```
{{< /tab >}}

{{< /tabs >}}

## Quick Reference

| Command | Description |
|---------|-------------|
| `velocity new <name>` | Create a new Velocity project |
| `velocity init` | Initialize Velocity in existing project |
| `velocity serve` | Start development server with hot reload |
| `velocity build` | Build for production |
| `velocity migrate` | Run database migrations |
| `velocity migrate:fresh` | Drop all tables and re-migrate |
| `velocity make controller` | Generate a controller |
| `velocity key:generate` | Generate encryption key |
| `velocity config` | Manage CLI configuration |

## In This Section

- **[Installation](installation/)** - Install the Velocity CLI
- **[Commands](commands/)** - Complete command reference
- **[Configuration](configuration/)** - CLI configuration options
