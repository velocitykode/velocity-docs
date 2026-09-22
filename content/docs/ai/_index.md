---
title: AI
description: Velocity's AI surface - the MCP SDK for building Model Context Protocol servers, the Arrow context server for AI coding agents, and the velocity-ai vector store.
weight: 76
sidebar:
  open: true
---

Everything Velocity ships for working with AI agents and models. Each piece is its own Go module under `github.com/velocitykode`, opt-in with `go get`, and stays out of the core dependency graph.

- [AI SDK]({{< relref "ai-sdk" >}}) - LLM providers, embeddings, and the vector document store (docs coming soon).
- [MCP]({{< relref "mcp" >}}) - native SDK for building Model Context Protocol servers on Velocity.
- [Arrow]({{< relref "arrow" >}}) - a ready-to-run MCP server giving AI coding agents live context about your Velocity app (routes, config, database schema, logs, docs).
- [Vector search]({{< relref "/docs/database/vector-search" >}}) - pgvector queries in the ORM and the velocity-ai document store for embed-and-search pipelines.
