---
title: Frontend & Views
description: Build modern frontends with Velocity using Inertia.js, React, TypeScript, and Vite for SPA-like experiences.
weight: 40
sidebar:
  open: true
---

Velocity ships a first-party view layer that speaks the [Inertia.js](https://inertiajs.com) protocol, letting you build SPA-like frontends in React and TypeScript while keeping routing, controllers, and data in Go. The `view` package is the stable public surface (`view.Props`, the prop helpers, and `(*view.Engine).Render`); it delegates to the underlying Inertia protocol implementation. Assets are bundled with [Vite](https://vitejs.dev), wired into your root template through the `vite` template helper, and full-page responses can be server-side rendered through a Node SSR server with automatic fallback to client-side rendering.

- [Frontend Setup]({{< relref "setup" >}}) - install dependencies, configure Vite, and bootstrap the Inertia client.
- [Inertia.js]({{< relref "inertia" >}}) - how the Inertia protocol connects Go controllers to your frontend.
- [View Engine]({{< relref "view" >}}) - render components, share props, and handle redirects from Go.
- [React Components]({{< relref "components" >}}) - build pages and layouts with React and TypeScript.
- [Forms]({{< relref "forms" >}}) - submit data, validate, and surface errors with Inertia forms.
