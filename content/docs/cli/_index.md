---
title: CLI
description: Velocity CLI reference. Create projects, run dev servers, generate code, and manage your Go web application from the command line.
weight: 20
sidebar:
  open: true
---

Velocity has two command-line tools. `velocity` is the global installer from Homebrew: it creates projects, stores your defaults, and updates itself. `vel` is built from your own project source, so it knows your migrations, models, and bootstrap code, and runs the dev server, migrations, generators, and your custom commands. Command names are space-separated words (`migrate fresh`, `gen model`), and a subcommand always beats its bare parent.
