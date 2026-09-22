---
title: Frontend Setup
description: Set up Velocity's frontend stack with Inertia.js, React, TypeScript, and Vite for hot-reload development.
weight: 10
---

Velocity's frontend stack combines Go, Inertia.js, React, TypeScript, and Vite for a modern development experience.

## How It Works

The frontend stack combines four technologies:

- **Go Backend** - Handles routing, handlers, and data
- **Inertia.js** - Bridge between Go and React (no API endpoints needed)
- **React + TypeScript** - Type-safe frontend components
- **Vite** - Fast development server and production bundling

The flow works like this:

1. User visits `/posts`
2. Go router calls `PostHandler.Index()`
3. Handler fetches data and calls `view.Render(ctx, "Posts/Index", props)`
4. Inertia sends props to React component at `resources/js/pages/Posts/Index.tsx`
5. React renders the page with full SPA navigation

No REST API, no GraphQL, no separate frontend routing. Just handlers and components.

## Project Structure

```
myapp/
├── internal/
│   └── handlers/          # Go handlers
├── resources/
│   ├── js/
│   │   ├── app.tsx        # React entry point
│   │   ├── pages/         # Page components (mapped to routes)
│   │   ├── components/    # Reusable UI components (shadcn/ui under ui/)
│   │   ├── layouts/       # Layout wrappers
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Helpers (cn, utils)
│   │   └── types/         # Shared TypeScript types
│   ├── css/
│   │   └── app.css        # Tailwind CSS entry
│   └── views/
│       └── app.go.html    # Root HTML template
├── public/
│   └── build/             # Compiled assets (generated)
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # JS dependencies
```

## Install Dependencies

The installer runs this for you when it scaffolds the project (with `bun`
when available, otherwise `npm`). Run it again after pulling a dependency
change:

```bash
npm install
```

Key packages included:

| Package | Purpose |
|---------|---------|
| `@inertiajs/react` | Inertia.js React adapter |
| `@inertiajs/vite` | Inertia Vite plugin: resolves page components from `resources/js/pages` |
| [`@velocitykode/velocity-vite-plugin`](https://www.npmjs.com/package/@velocitykode/velocity-vite-plugin) | Velocity Vite plugin: hot file, build output, manifest, `@` alias |
| `react` / `react-dom` | React 19 |
| `@vitejs/plugin-react` | React Fast Refresh |
| `vite` / `vite-plus` | Build tool; `vp` wraps Vite with lint, format, and check |
| `tailwindcss` / `@tailwindcss/vite` | Tailwind CSS 4 |
| `@radix-ui/*`, `@headlessui/react`, `lucide-react` | Primitives and icons behind the shadcn/ui components |
| `typescript` | Type checking |

## Vite Configuration

```typescript
// vite.config.ts
import inertia from '@inertiajs/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, lazyPlugins } from 'vite-plus';
import velocity from '@velocitykode/velocity-vite-plugin';

export default defineConfig({
    plugins: lazyPlugins(() => [
        velocity('resources/js/app.tsx'),
        inertia(),
        react(),
        tailwindcss(),
    ]),
    server: {
        port: 5173,
        strictPort: true,
        host: 'localhost',
    },
});
```

Configuration breakdown:

- **`velocity(entry)`** - the [Velocity Vite plugin](https://www.npmjs.com/package/@velocitykode/velocity-vite-plugin) owns the Vite side of the asset wiring. It sets `base: '/build/'`, `build.outDir: public/build`, the build manifest, and the entry input; registers the `@` alias to `resources/js`; writes `public/hot` with the dev-server origin while Vite runs and removes it on exit or production build. One call replaces all of that manual config.
- **`inertia()`** - resolves `"Posts/Index"` to `resources/js/pages/Posts/Index.tsx`, so `app.tsx` needs no `resolve` callback. Pass `{ ssr: 'resources/js/ssr.tsx' }` to add an SSR build.
- **`react()`** - React Fast Refresh in development.
- **`lazyPlugins`** - from `vite-plus`, defers plugin loading so `vp check` and `vp fmt` start fast. The kit's `package.json` scripts use `vp` for `dev`, `build`, `check`, `lint`, and `fmt`.
- **Port 5173** - Vite dev server, separate from the Go server on 4000. The kit also carries `fmt` and `check` blocks for `vite-plus`; they do not affect the build.

## TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./resources/js/*"]
    }
  },
  "include": ["resources/js"]
}
```

## React Entry Point

```typescript
// resources/js/app.tsx
import '../css/app.css';

import { createInertiaApp, http, router } from '@inertiajs/react';
import { initializeTheme } from './hooks/use-appearance';

let csrfToken: string | null = null;

// Attach the CSRF token to every Inertia request.
http.onRequest((config) => {
    if (!csrfToken) {
        csrfToken = readInitialCsrfToken();
    }
    if (csrfToken) {
        config.headers = { ...config.headers, 'X-CSRF-Token': csrfToken };
    }
    return config;
});

// Pick up the rotated token the server ships with each page.
router.on('navigate', (event) => {
    const pageProps = event.detail.page.props as { csrf_token?: string };
    if (pageProps.csrf_token) {
        csrfToken = pageProps.csrf_token;
        document.querySelector('meta[name="csrf-token"]')?.setAttribute('content', csrfToken);
    }
});

void createInertiaApp({
    progress: {
        color: '#4B5563',
    },
});

initializeTheme();
```

Key parts:

- **No `resolve` or `setup`** - Inertia 3 with its Vite plugin supplies page resolution and the React mount, so the entry stays small. `"Posts/Index"` maps to `resources/js/pages/Posts/Index.tsx`.
- **CSRF handling** - the token is read from the initial page payload, sent as `X-CSRF-Token` on every request, and refreshed from the `csrf_token` prop on each navigation.
- **Progress bar** - loading indicator during page transitions.
- **Theme** - `initializeTheme` applies the stored light/dark/system preference (the root template also sets it before first paint to avoid a flash).

## Development Workflow

### Start Development Servers

One command runs both:

```bash
./vel serve
```

It starts the Go server on port 4000 and the Vite dev server on 5173,
rebuilds and restarts Go on every `.go` change, and stops both on `Ctrl-C`.
See [Local Development]({{< relref "/docs/getting-started/local-development" >}})
for what happens in the background.

To run them separately, `./vel serve --no-watch` for Go in one terminal and
`npm run dev` in another.

### Development vs Production

**Development:**
- Vite serves assets with hot module replacement
- Changes to React components update instantly
- Go server proxies to Vite for assets

**Production:**
```bash
# Build assets
npm run build

# Run Go server only
./your-app
```

Go serves pre-built assets from `public/build/`.

## HTML Template

The root template is a Go `html/template`. Instead of hardcoding the Vite
dev-server URLs, render asset tags with the `vite` template helper: in
development (when the Vite dev server has written the `public/hot` marker)
it emits the `@vite/client` script and the dev-server entry; in production it walks
the build manifest and emits the hashed `<link>`/`<script>` tags. The
`viteReactRefresh` helper emits the React Fast Refresh preamble in dev and
nothing in production.

```html
<!-- resources/views/app.go.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ .csrfToken }}">

    <title>Velocity App</title>

    {{ .inertiaHead }}

    {{ viteReactRefresh }}
    {{ vite "resources/js/app.tsx" }}
</head>
<body class="font-sans antialiased">
    {{ .inertia }}
</body>
</html>
```

The template variables come from the renderer:

- **`{{ .inertia }}`** - Inertia page data container for React hydration
- **`{{ .inertiaHead }}`** - Inertia head content (title, meta from React; populated during SSR)
- **`{{ .csrfToken }}`** - CSRF token published per request via middleware (see Template Data below)

The `vite` and `viteReactRefresh` helpers are registered on the engine
through `view.Config.Funcs` (see below).

## Registering the Vite Helpers

The `vite` and `viteReactRefresh` template helpers are not built in. Wire
them onto the view engine by passing a `template.FuncMap` in `view.Config.Funcs`:

```go
import (
    "html/template"

    "github.com/velocitykode/velocity/bond/vite"
    "github.com/velocitykode/velocity/view"
)

helper := vite.New() // defaults: public/, build/, hot file "hot"

engine, err := view.NewEngine(view.Config{
    Funcs: template.FuncMap{
        "vite":             helper.Tags,
        "viteReactRefresh": helper.ReactRefreshTag,
    },
})
```

`vite.New` accepts options to override the defaults:

- `vite.WithPublicPath("public")` - directory containing built assets and the hot file
- `vite.WithBuildDirectory("build")` - subdirectory of public/ where Vite writes output
- `vite.WithHotFile("hot")` - dev-server marker file (its contents are the dev origin)
- `vite.WithManifestFilename("manifest.json")` - manifest filename
- `vite.WithManifestSubdir("")` - manifest subdirectory under the build directory

## Template Data and Functions

Static template helpers are registered once when the engine is built, via
`view.Config.Funcs` (shown above for the Vite helpers). To add your own:

```go
import "html/template"

engine, err := view.NewEngine(view.Config{
    Funcs: template.FuncMap{
        "vite": helper.Tags,
        "formatDate": func(date time.Time) string {
            return date.Format("January 2, 2006")
        },
    },
})
```

Per-request root-template variables (CSP nonce, CSRF token, etc.) are
published onto the request context with `bond.WithTemplateData`, then read by
name in the template (e.g. `{{ .csrfToken }}`):

```go
import "github.com/velocitykode/velocity/bond"

ctx := bond.WithTemplateData(r.Context(), "csrfToken", token)
r = r.WithContext(ctx)
```

To share data with React components (not the root template), use the engine's
shared-props API. These become Inertia props on every page:

```go
// Static shared prop on every response
engine.Share("app_name", "My Velocity App")

// Multiple static props at once
engine.ShareMultiple(view.Props{"version": "1.0.0", "env": "production"})

// Dynamic prop evaluated per request
engine.ShareFunc("user", func(r *http.Request) (any, error) {
    return currentUser(r), nil
})
```
