---
title: Frontend & Views
description: Build modern frontends with Velocity using Inertia.js, React, TypeScript, and Vite for SPA-like experiences.
weight: 40
sidebar:
  open: true
---

Velocity ships a first-party view layer that speaks the [Inertia.js](https://inertiajs.com) protocol, letting you build SPA-like frontends in React or Vue while keeping routing, handlers, and data in Go. The `view` package is the stable public surface (`view.Props`, the prop helpers, and `(*view.Engine).Render`). Assets are bundled with [Vite](https://vitejs.dev) through the `vite` template helper, and full-page responses can be server-side rendered with automatic fallback to client-side rendering.
