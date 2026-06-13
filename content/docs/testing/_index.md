---
title: Testing
description: Test Velocity applications with an in-memory app harness, a fluent HTTP test client with expressive response assertions, fakes for events and the command bus, model factories, and database refresh.
weight: 75
sidebar:
  open: true
---

Velocity ships a batteries-included testing toolkit: an in-memory app harness, a fluent HTTP client that drives your router and asserts against the response, fakes that record events and commands, and database tooling (refresh strategies and model factories) for tests that hit a real database.

- [HTTP & Feature Tests]({{< relref "http-tests" >}}) - the in-memory app harness, the fluent HTTP client and its response assertions, handler-level context, and fakes for events and the command bus.
- [Database & Factories]({{< relref "database" >}}) - refresh the schema between tests and build rows with typed model factories for integration testing.
