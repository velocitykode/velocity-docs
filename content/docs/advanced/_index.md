---
title: Advanced Topics
description: Advanced Velocity features including queues, events, mail, notifications, file storage, task scheduling, gRPC, and more.
weight: 70
sidebar:
  open: true
---

Advanced Velocity features for building robust, production-grade applications: background jobs, event-driven architecture, outbound communication, file storage, scheduled tasks, and the building blocks that tie them together.

- [Queues]({{< relref "queue" >}}) - dispatch and process background jobs.
- [Events]({{< relref "events" >}}) - decouple your application with the event dispatcher and listeners.
- [Command Bus]({{< relref "bus" >}}) - dispatch commands and queries through a central bus.
- [Pipeline]({{< relref "pipeline" >}}) - pass input through a series of composable stages.
- [Mail]({{< relref "mail" >}}) - compose and send email.
- [Notifications]({{< relref "notifications" >}}) - deliver notifications across multiple channels.
- [Webhooks]({{< relref "webhook" >}}) - send and verify outbound webhooks.
- [HTTP Client]({{< relref "httpclient" >}}) - make outbound HTTP requests.
- [Storage]({{< relref "storage" >}}) - work with files across local and cloud disks.
- [Scheduler]({{< relref "scheduler" >}}) - run tasks on a recurring schedule.
- [gRPC]({{< relref "grpc" >}}) - build and consume gRPC services.
- [Feature Flags]({{< relref "flags" >}}) - toggle features at runtime.
- [Collections]({{< relref "collect" >}}) - fluent helpers for working with slices and maps.
- [Service Providers]({{< relref "service-providers" >}}) - register and bootstrap application services.
- [Contracts]({{< relref "contract" >}}) - the interfaces that decouple Velocity's components.
- [Driver Registry]({{< relref "driver-registry" >}}) - register and resolve pluggable drivers.
- [Tracing]({{< relref "trace" >}}) - instrument your application with distributed tracing.
