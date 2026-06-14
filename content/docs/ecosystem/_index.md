---
title: Ecosystem
description: First-party companion modules for Velocity - the MCP SDK, the Arrow context server, and the AI module - each shipped as its own Go module and added with go get.
weight: 80
sidebar:
  open: true
---

First-party companion modules that live alongside core Velocity. Each ships as its own Go module under `github.com/velocitykode`, so it stays out of the core dependency graph and is opt-in: you add only what you need with `go get`.

- [Velocity MCP]({{< relref "velocity-mcp" >}}) - native SDK for building Model Context Protocol servers on Velocity.
- [Velocity Arrow]({{< relref "velocity-arrow" >}}) - a ready-to-run MCP server giving AI agents live context about your Velocity app (routes, config, database schema, logs, docs).
- [Velocity AI]({{< relref "../database/vector-search" >}}) - LLM provider, embeddings, and vector store module for AI-powered features.
- [Prism]({{< relref "prism" >}}) - a standalone component library for building styled command-line tools: output, tables, spinners, and interactive prompts.
