---
title: Frontend Setup
description: Set up Velocity's frontend stack with Inertia.js, React, TypeScript, and Vite for hot-reload development.
weight: 10
---

Velocity's frontend stack combines Go, Inertia.js, React, TypeScript, and Vite for a modern development experience.

## How It Works

The frontend stack combines four technologies:

- **Go Backend** - Handles routing, controllers, and data
- **Inertia.js** - Bridge between Go and React (no API endpoints needed)
- **React + TypeScript** - Type-safe frontend components
- **Vite** - Fast development server and production bundling

The flow works like this:

1. User visits `/posts`
2. Go router calls `PostController.Index()`
3. Controller fetches data and calls `view.Render("Posts/Index", props)`
4. Inertia sends props to React component at `resources/js/pages/Posts/Index.tsx`
5. React renders the page with full SPA navigation

No REST API, no GraphQL, no separate frontend routing. Just controllers and components.

## Project Structure

```
your-app/
├── app/
│   └── controllers/       # Go controllers
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

```html
<!-- resources/views/app.go.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ .csrfToken }}">

    <title>{{ .title | default "Velocity App" }}</title>

    {{ .inertiaHead }}

    <!-- Development: Vite dev server -->
    <script type="module" src="http://localhost:5173/@vite/client"></script>
    <script type="module" src="http://localhost:5173/resources/js/app.tsx"></script>

    <!-- Production: Compiled assets
    <link rel="stylesheet" href="/build/app.css">
    <script type="module" src="/build/app.js"></script>
    -->
</head>
<body class="font-sans antialiased">
    {{ .inertia }}
</body>
</html>
```

The template includes:

- **`{{ .csrfToken }}`** - CSRF token from Go, updated on each navigation
- **`{{ .inertiaHead }}`** - Inertia head content (title, meta from React)
- **`{{ .inertia }}`** - Inertia page data for React hydration

## Template Data and Functions

```go
// Share template data
view.ShareTemplateData("app_name", "My Velocity App")
view.ShareTemplateData("version", "1.0.0")

// Share template functions
view.ShareTemplateFunc("formatDate", func(date time.Time) string {
    return date.Format("January 2, 2006")
})

view.ShareTemplateFunc("asset", func(path string) string {
    return "/build/" + path
})
```
