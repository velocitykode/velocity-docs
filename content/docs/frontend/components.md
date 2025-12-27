---
title: React Components
weight: 30
---

Build type-safe React components that receive props directly from Go controllers.

## Page Components

Page components live in `resources/js/pages/` and map directly to Inertia render calls:

```typescript
// resources/js/pages/Posts/Index.tsx
import { Link, Head } from '@inertiajs/react'
import Layout from '@/layouts/Layout'

interface Post {
  id: number
  title: string
  body: string
  user: User
  created_at: string
}

interface Props {
  posts: Post[]
  meta: {
    title: string
    description: string
  }
}

export default function PostsIndex({ posts, meta }: Props) {
  return (
    <Layout>
      <Head title={meta.title} />

      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{meta.title}</h1>
          <Link
            href="/posts/create"
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Create Post
          </Link>
        </div>

        <div className="grid gap-6">
          {posts.map(post => (
            <div key={post.id} className="border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-2">
                <Link href={`/posts/${post.id}`} className="hover:text-blue-600">
                  {post.title}
                </Link>
              </h2>
              <p className="text-gray-600 mb-4">{post.body.substring(0, 150)}...</p>
              <div className="text-sm text-gray-500">
                By {post.user.name} on {new Date(post.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
```

## Layout Components

Layouts wrap page content and access shared props:

```typescript
// resources/js/layouts/Layout.tsx
import { Link, usePage } from '@inertiajs/react'
import { PropsWithChildren } from 'react'

interface SharedProps {
  auth?: {
    user: User
  }
  flash?: {
    success?: string
    error?: string
  }
}

export default function Layout({ children }: PropsWithChildren) {
  const { auth, flash } = usePage<SharedProps>().props

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-xl font-bold">
              My App
            </Link>

            <div className="flex space-x-4">
              <Link href="/posts" className="hover:text-blue-600">
                Posts
              </Link>

              {auth?.user ? (
                <div className="flex items-center space-x-4">
                  <span>Hello, {auth.user.name}</span>
                  <Link href="/logout" method="post" className="text-red-600">
                    Logout
                  </Link>
                </div>
              ) : (
                <div className="flex space-x-4">
                  <Link href="/login">Login</Link>
                  <Link href="/register">Register</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {flash?.success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3">
          {flash.success}
        </div>
      )}

      {flash?.error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3">
          {flash.error}
        </div>
      )}

      <main className="py-8">
        {children}
      </main>
    </div>
  )
}
```

## Navigation

Use Inertia's `Link` component for SPA navigation:

```typescript
import { Link } from '@inertiajs/react'

// Basic link
<Link href="/posts">Posts</Link>

// With method (for logout, delete, etc.)
<Link href="/logout" method="post">Logout</Link>

// Preserve scroll position
<Link href="/posts" preserveScroll>Posts</Link>

// Replace history (no back button)
<Link href="/posts" replace>Posts</Link>

// Only reload specific props
<Link href="/posts" only={['posts']}>Refresh Posts</Link>
```

## Head Component

Manage document head from any component:

```typescript
import { Head } from '@inertiajs/react'

export default function PostShow({ post }: Props) {
  return (
    <>
      <Head>
        <title>{post.title}</title>
        <meta name="description" content={post.excerpt} />
        <meta property="og:title" content={post.title} />
      </Head>

      <article>
        <h1>{post.title}</h1>
        <div>{post.body}</div>
      </article>
    </>
  )
}
```

## Accessing Shared Props

Use `usePage` hook to access shared data:

```typescript
import { usePage } from '@inertiajs/react'

interface SharedProps {
  auth: { user: User }
  csrf_token: string
  flash: { success?: string; error?: string }
}

export default function SomeComponent() {
  const { auth, csrf_token, flash } = usePage<SharedProps>().props

  return (
    <div>
      {auth.user && <p>Welcome, {auth.user.name}</p>}
      {flash.success && <Alert>{flash.success}</Alert>}
    </div>
  )
}
```

## Component Organization

Recommended structure:

```
resources/js/
├── pages/              # Page components (route-mapped)
│   ├── Auth/
│   │   ├── Login.tsx
│   │   └── Register.tsx
│   ├── Posts/
│   │   ├── Index.tsx
│   │   ├── Show.tsx
│   │   └── Create.tsx
│   └── Dashboard.tsx
├── components/         # Reusable UI components
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── Card.tsx
│   └── AppHeader.tsx
├── layouts/           # Layout wrappers
│   ├── Layout.tsx
│   ├── AuthLayout.tsx
│   └── GuestLayout.tsx
├── hooks/             # Custom React hooks
│   ├── use-appearance.ts
│   └── use-mobile.ts
└── types/             # TypeScript interfaces
    └── index.d.ts
```

## Best Practices

1. **Props Typing** - Always define TypeScript interfaces for props
2. **Component Organization** - Keep page components in `pages/` directory
3. **Shared Data** - Use `usePage()` to access globally shared data
4. **Navigation** - Use `<Link>` over anchor tags for SPA navigation
5. **SEO** - Use `<Head>` component for page metadata
6. **Layouts** - Create reusable layouts for consistent page structure
