---
title: Starter Kits
description: The three first-party starter kits the installer scaffolds from - React, Vue, and API-only - what each ships, how to pick one, and how to create a project from it.
weight: 30
---

Every `velocity new` project starts from a first-party starter kit. A kit is a
complete, runnable application: the Go layout described in
[Getting Started]({{< relref "getting-started#project-structure" >}}), an
`.env.example`, migrations for users, cache, and jobs, a user model with a
factory, and a small set of routes to build on. The installer downloads the
kit's newest release, renames the module to your project, re-initialises
git, writes `.env` with fresh keys, and installs dependencies.

Three kits exist. Pick by how you want to render your UI:

| Kit | Create with | Frontend | Auth scheme |
| --- | --- | --- | --- |
| [React](#react) | `velocity new myapp` (default) or `--stack react` | React 19 + Inertia.js 3 | `web` (session) |
| [Vue](#vue) | `velocity new myapp --stack vue` | Vue 3.5 + Inertia.js 3 | `web` (session) |
| [API](#api) | `velocity new myapi --api` | None, JSON only | `api` (JWT) |

You cannot switch a project between full-stack and API after scaffolding;
choose up front. `--stack` is ignored with `--api`. Database and cache
drivers are independent of the kit: `--database postgres|mysql|sqlite` and
`--cache redis|memory` apply to all three. See the
[installer reference]({{< relref "installer" >}}) for every flag.

## React

[velocity-template-react](https://github.com/velocitykode/velocity-template-react)
is the default kit. It pairs Velocity with React 19 and TypeScript, rendered
through Inertia.js so your pages are React components fed props by Go
handlers, with no separate API layer.

```bash
velocity new myapp --stack react
```

What ships:

- **UI**: shadcn/ui components on Radix primitives, Headless UI, lucide-react icons, Tailwind CSS 4.
- **Build**: Vite 7 with the [Velocity Vite plugin](https://www.npmjs.com/package/@velocitykode/velocity-vite-plugin); `./vel serve` runs Go and Vite together with live reload.
- **Pages**: `Home`, `Dashboard`, and `Auth/Login`, `Auth/Register` under `resources/js/pages`, plus an auth layout.
- **Routes**: `/`, `/login`, `/register`, `/logout`, `/dashboard` (guarded), and `/health`.
- **Auth**: session scheme (`AUTH_SCHEME=web`), CSRF enabled, flash-based validation errors on the forms.

Add `--ssr` at creation to turn on Inertia server-side rendering and wire the
Vite SSR entry.

## Vue

[velocity-template-vue](https://github.com/velocitykode/velocity-template-vue)
is the same application built with Vue 3.5 and the Composition API
(`<script setup>`), rendered through Inertia.js.

```bash
velocity new myapp --stack vue
```

What ships:

- **UI**: lucide-vue-next icons, Tailwind CSS 4.
- **Build**: Vite 7 with the [Velocity Vite plugin](https://www.npmjs.com/package/@velocitykode/velocity-vite-plugin), plus an SSR build target (`public/build/ssr/ssr.js`) ready for the Inertia SSR runtime.
- **Pages**: `Home`, `Dashboard`, and `Auth/Login`, `Auth/Register` under `resources/js/pages`, plus an auth layout.
- **Routes and auth**: identical to the React kit: session scheme, CSRF on, the same five routes and health check.

Pass `--ssr` to enable server-side rendering from the first run.

## API

[velocity-template-api](https://github.com/velocitykode/velocity-template-api)
is for services that serve JSON only. There is no `resources/`, `public/`,
`package.json`, or Vite; the binary is the whole deployable.

```bash
velocity new myapi --api
```

What ships:

- **Auth**: JWT scheme (`AUTH_SCHEME=api`, `AUTH_JWT_SECRET` generated on create), CSRF disabled since requests are stateless.
- **Middleware**: the API stack forces a JSON content type on every response.
- **Routes**: a top-level `/health` for load balancers, outside the middleware stack, and `/api/health` inside the `/api` group where your endpoints go.
- **Layout**: the same `internal/`, `config/`, `database/`, `routes/`, `storage/` tree as the full-stack kits, minus the frontend.

## After scaffolding

All three kits leave you at the same place. The installer has already run
the initial migrations when the database was reachable; if it was not, run
`./vel migrate` first.

```bash
cd myapp
./vel serve
```

The Go server listens on `http://localhost:4000`; full-stack kits also start
Vite on `http://localhost:5173`. From here the
[Getting Started]({{< relref "getting-started" >}}) walkthrough continues with
your first handler, and the [Frontend]({{< relref "/docs/frontend" >}}) section
covers Inertia pages, forms, and components for the React and Vue kits.
