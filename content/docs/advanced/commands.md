---
title: Console Commands
description: Add your own commands to the per-project vel binary - scaffold them with vel gen command, register them with v.Commands, and run them with vel run.
weight: 62
keywords: [custom commands, vel run, gen command, console]
---

Every project's `./vel` binary can carry commands you write: reports,
imports, one-off maintenance, anything that needs the application's
services but not an HTTP request. They live under `vel run` so they
never collide with a built-in.

## Scaffold a command

```bash
vel gen command SyncInventory [--dir PATH]
```

Writes `internal/commands/sync_inventory.go` (or under `--dir`):

```go
package commands

import (
    "fmt"

    "github.com/velocitykode/velocity"
)

// SyncInventoryCommand is a console command.
//
// Register this command in internal/commands/kernel.go:
//   r.Add(&SyncInventoryCommand{})
type SyncInventoryCommand struct{}

// Name returns the command name used to invoke it.
func (c SyncInventoryCommand) Name() string {
    return "sync-inventory"
}

// Description returns a short description of the command.
func (c SyncInventoryCommand) Description() string {
    return "TODO: describe sync-inventory"
}

// Handle executes the command logic.
func (c SyncInventoryCommand) Handle(s *velocity.Services, args []string) error {
    fmt.Println("Executing sync-inventory...")
    return nil
}
```

The generator appends the `Command` suffix and derives the invocation
name in kebab-case, so `SyncInventory` becomes `sync-inventory`.
`Handle` receives the full [services container]({{< relref "modules#the-services-container" >}}),
so the database, cache, queue, mail, and every other service are
available exactly as in a handler.

## Register it

The starter kits ship `internal/commands/kernel.go` and wire it from
`main.go` through the `Commands` chain method:

```go
// internal/commands/kernel.go
func Register(r *velocity.Commands) {
    r.Add(&SyncInventoryCommand{})
}
```

```go
// main.go
v.Modules(app.Configure).
    Routes(routes.Register).
    Commands(commands.Register).
    Seeders(seeders.Register).
    Run()
```

A module can contribute commands too by implementing `CommandModule`:

```go
func (m *BillingModule) Commands(r *velocity.Commands) {
    r.Add(&ReconcileCommand{})
}
```

Module commands register first, in module order, then the `Commands`
callback. Registering the same name twice panics at boot.

## Run it

```bash
vel run <command> [arguments]
```

Everything after the command name is passed straight through to
`Handle`, so `vel run report --csv` reaches your code with `["--csv"]`.
The application bootstraps first: modules, routes, events, and schedules
are all wired before `Handle` runs.

```bash
vel run              # list every registered command
vel run report
vel run report --csv
```

`vel run` with no arguments prints the registered commands, or a hint to
create one with `vel gen command <Name>`. An unknown name prints the
same list and errors, and a flag-like first token (`vel run --bogus`) is
rejected as an unknown flag before the app bootstraps.

Custom commands are reachable only through `vel run`. Typing one as a
bare `vel <name>` is an unknown command, so a command sharing a name
with a built-in never shadows it.
