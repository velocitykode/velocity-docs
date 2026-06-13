---
title: Velocity CLI
description: A standalone Go component library for building styled command-line tools - colored output, tables, spinners, progress bars, and interactive prompts. Zero framework dependency.
weight: 30
---

Velocity CLI is the component library behind Velocity's own `vel` tooling, extracted as its own module so you can build styled command-line programs with it. It covers the three things a CLI usually needs: consistent **output styling**, **status indicators** (spinners and progress bars), and **interactive prompts**.

{{% callout type="info" %}}
Despite the name, this module has **zero framework dependency**. It imports it into any Go project, not just Velocity apps. It is built on the [Charm](https://charm.sh) stack (lipgloss, bubbletea, bubbles).
{{% /callout %}}

## Install

```bash
go get github.com/velocitykode/velocity-cli
```

```go
import cli "github.com/velocitykode/velocity-cli"
```

The module's package is `cli`; the import alias above is the convention used throughout these examples.

## Output

Styled, leveled output with consistent glyphs and colors:

```go
cli.Header("migrate")               // MIGRATE (styled header)
cli.Info("Running migrations...")   // informational line
cli.Success("Done")                 // ✓ Done
cli.Warning("No migrations found")  // ! No migrations found
cli.Error("Connection failed")      // ✗ Connection failed
cli.Muted("skipping...")            // dimmed text
cli.Bold("important")               // bold text

cli.Note("Server running on port 4000")  // boxed message (primary border)
cli.Alert("Database connection failed")  // boxed message (error border)
```

## Tables

```go
cli.Table(
    []string{"Method", "Path", "Name"},
    [][]string{
        {"GET", "/users", "users.index"},
        {"POST", "/users", "users.store"},
    },
)
```

## Spinners & Progress

A spinner wraps a slow operation; a progress bar tracks a known number of steps:

```go
cli.Spinner("Building...", func() error {
    return exec.Command("go", "build", ".").Run()
})

cli.Progress(len(items), func(inc func()) {
    for _, item := range items {
        process(item)
        inc()
    }
})
```

## Interactive Prompts

Each prompt blocks for input and returns the typed result. Options like `WithRequired`, `WithPlaceholder`, and `WithDefaultYes` tune behavior:

```go
name := cli.Text("Model name:", cli.WithRequired(), cli.WithPlaceholder("User"))
pass := cli.Password("Database password:")
yes  := cli.Confirm("Generate migration?", cli.WithDefaultYes())
db   := cli.Select("Database driver:", []string{"mysql", "postgres", "sqlite"})
features := cli.Multiselect("Enable:", []string{"soft-deletes", "uuid", "timestamps"})

user := cli.Search("Find user:", func(q string) []string {
    return filterUsers(q)
})
```

## Theming

Output colors and prompt styling are driven by a shared theme, so a whole tool stays visually consistent. See the [repository](https://github.com/velocitykode/velocity-cli) for the full option set and theme configuration.
