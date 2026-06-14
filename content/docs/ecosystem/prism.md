---
title: Prism
description: A standalone Go component library for building styled command-line tools - colored output, tables, spinners, progress bars, and interactive prompts. Zero framework dependency.
weight: 30
---

Prism is the component library behind Velocity's own `vel` tooling, extracted as its own module so you can build styled command-line programs with it. It covers the three things a CLI usually needs: consistent **output styling**, **status indicators** (spinners and progress bars), and **interactive prompts**.

{{% callout type="info" %}}
Despite the name, this module has **zero framework dependency**. It imports it into any Go project, not just Velocity apps. It is built on the [Charm](https://charm.sh) stack (lipgloss, bubbletea, bubbles).
{{% /callout %}}

## Install

```bash
go get github.com/velocitykode/prism
```

```go
import "github.com/velocitykode/prism"
```

The module's package is `prism`; the import above is the convention used throughout these examples.

## Output

Styled, leveled output with consistent glyphs and colors:

```go
prism.Header("migrate")               // MIGRATE (styled header)
prism.Info("Running migrations...")   // informational line
prism.Success("Done")                 // ✓ Done
prism.Warning("No migrations found")  // ! No migrations found
prism.Error("Connection failed")      // ✗ Connection failed
prism.Muted("skipping...")            // dimmed text
prism.Bold("important")               // bold text

prism.Note("Server running on port 4000")  // boxed message (primary border)
prism.Alert("Database connection failed")  // boxed message (error border)
```

## Tables

```go
prism.Table(
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
prism.Spinner("Building...", func() error {
    return exec.Command("go", "build", ".").Run()
})

prism.Progress(len(items), func(inc func()) {
    for _, item := range items {
        process(item)
        inc()
    }
})
```

## Interactive Prompts

Each prompt blocks for input and returns the typed result. Options like `WithRequired`, `WithPlaceholder`, and `WithDefaultYes` tune behavior:

```go
name := prism.Text("Model name:", prism.WithRequired(), prism.WithPlaceholder("User"))
pass := prism.Password("Database password:")
yes  := prism.Confirm("Generate migration?", prism.WithDefaultYes())
db   := prism.Select("Database driver:", []string{"mysql", "postgres", "sqlite"})
features := prism.Multiselect("Enable:", []string{"soft-deletes", "uuid", "timestamps"})

user := prism.Search("Find user:", func(q string) []string {
    return filterUsers(q)
})
```

## Theming

Output colors and prompt styling are driven by a shared theme, so a whole tool stays visually consistent. See the [repository](https://github.com/velocitykode/prism) for the full option set and theme configuration.
