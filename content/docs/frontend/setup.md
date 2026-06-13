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
your-app/
├── app/
│   └── handlers/       # Go handlers
├── resources/
│   ├── js/
│   │   ├── app.tsx        # React entry point
│   │   ├── pages/         # Page components (mapped to routes)
│   │   ├── components/    # Reusable UI components
│   │   ├── layouts/       # Layout wrappers
│   │   └── hooks/         # Custom React hooks
│   ├── css/
│   │   └── app.css        # Tailwind CSS
│   └── views/
│       └── app.html       # HTML template
├── public/
│   └── build/             # Compiled assets (generated)
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # npm dependencies
```

## Install Dependencies

```bash
npm install
```

Key packages included:

| Package | Purpose |
|---------|---------|
| `@inertiajs/react` | Inertia.js React adapter |
| `react` / `react-dom` | React 19 |
| `typescript` | Type checking |
| `vite` | Build tool |
| `tailwindcss` | Utility-first CSS |

## Vite Configuration

```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './resources/js'),
        },
    },
    build: {
        outDir: 'public/build',
        manifest: true,
        rollupOptions: {
            input: 'resources/js/app.tsx',
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        host: 'localhost',
    },
    esbuild: {
        jsx: 'automatic',
    },
});
```

Configuration breakdown:

- **`@` alias** - Import from `@/components/Button` instead of `../../components/Button`
- **`public/build`** - Compiled assets go here, served by Go
- **`manifest: true`** - Generates manifest.json for production asset versioning
- **Port 5173** - Vite dev server runs separately from Go server

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
import { createInertiaApp, router } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

// CSRF token handling
let csrfToken: string | null = null;

router.on('navigate', (event) => {
    const pageProps = event.detail.page.props as { csrf_token?: string };
    if (pageProps.csrf_token) {
        csrfToken = pageProps.csrf_token;
    }
});

createInertiaApp({
    resolve: async (name) => {
        const pages = import.meta.glob('./pages/**/*.tsx', { eager: true });
        const page = pages[`./pages/${name}.tsx`];
        return page.default;
    },
    setup({ el, App, props }) {
        const root = createRoot(el);
        root.render(<App {...props} />);
    },
    progress: {
        color: '#4B5563',
    },
});
```

Key parts:

- **`import.meta.glob`** - Vite's way to dynamically import all page components
- **Page resolution** - `"Posts/Index"` maps to `./pages/Posts/Index.tsx`
- **CSRF handling** - Token is passed from Go and updated on navigation
- **Progress bar** - Shows loading indicator during page transitions

## Development Workflow

### Start Development Servers

Run both servers in separate terminals:

```bash
# Terminal 1: Go server
go run main.go

# Terminal 2: Vite dev server
npm run dev
```

Or use a process manager like `overmind` or `foreman`.

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
<!-- resources/views/app.html -->
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
