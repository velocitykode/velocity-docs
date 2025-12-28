---
title: Forms
description: Handle form submissions with Inertia's useForm hook for validation, error handling, and submission states.
weight: 40
---

Inertia's `useForm` hook provides form state management with validation error handling and submission states.

## Basic Form

```typescript
// resources/js/pages/Posts/Create.tsx
import { useForm, Head, Link } from '@inertiajs/react'
import Layout from '@/layouts/Layout'

export default function CreatePost() {
  const { data, setData, post, errors, processing } = useForm({
    title: '',
    body: '',
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    post('/posts')
  }

  return (
    <Layout>
      <Head title="Create Post" />

      <div className="container mx-auto px-4 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Create New Post</h1>

        <form onSubmit={submit} className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={data.title}
              onChange={e => setData('title', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md ${
                errors.title ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.title && (
              <div className="text-red-500 text-sm mt-1">{errors.title}</div>
            )}
          </div>

          <div>
            <label htmlFor="body" className="block text-sm font-medium mb-2">
              Content
            </label>
            <textarea
              id="body"
              value={data.body}
              onChange={e => setData('body', e.target.value)}
              rows={10}
              className={`w-full px-3 py-2 border rounded-md ${
                errors.body ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.body && (
              <div className="text-red-500 text-sm mt-1">{errors.body}</div>
            )}
          </div>

          <div className="flex justify-between">
            <Link
              href="/posts"
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={processing}
              className="bg-blue-500 text-white px-6 py-2 rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {processing ? 'Creating...' : 'Create Post'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}
```

## useForm API

```typescript
const {
  data,        // Current form data
  setData,     // Update form field
  post,        // Submit via POST
  put,         // Submit via PUT
  patch,       // Submit via PATCH
  delete: del, // Submit via DELETE
  errors,      // Validation errors from server
  processing,  // True during submission
  progress,    // Upload progress (for files)
  reset,       // Reset form to initial values
  clearErrors, // Clear validation errors
  transform,   // Transform data before submission
} = useForm({
  title: '',
  body: '',
})
```

## Updating Fields

```typescript
// Single field
setData('title', 'New Title')

// Multiple fields
setData({
  title: 'New Title',
  body: 'New Body',
})

// Callback form (for derived values)
setData(data => ({
  ...data,
  slug: data.title.toLowerCase().replace(/\s+/g, '-'),
}))
```

## Form Methods

```typescript
// Create
post('/posts')

// Update
put(`/posts/${post.id}`)
patch(`/posts/${post.id}`)

// Delete
del(`/posts/${post.id}`)

// With options
post('/posts', {
  preserveScroll: true,
  preserveState: true,
  onSuccess: () => {
    reset()
  },
  onError: (errors) => {
    console.log('Validation errors:', errors)
  },
})
```

## File Uploads

```typescript
import { useForm } from '@inertiajs/react'

export default function FileUpload() {
  const { data, setData, post, progress } = useForm({
    avatar: null as File | null,
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    post('/profile/avatar', {
      forceFormData: true,
    })
  }

  return (
    <form onSubmit={submit}>
      <input
        type="file"
        onChange={e => setData('avatar', e.target.files?.[0] || null)}
        accept="image/*"
      />

      {progress && (
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      )}

      <button type="submit">Upload</button>
    </form>
  )
}
```

## Transform Data

Modify data before submission:

```typescript
const { data, setData, post, transform } = useForm({
  name: '',
  remember: false,
})

function submit(e: React.FormEvent) {
  e.preventDefault()

  transform(data => ({
    ...data,
    remember: data.remember ? 'on' : '',
  }))

  post('/login')
}
```

## Resetting Forms

```typescript
const { data, setData, reset } = useForm({
  title: '',
  body: '',
})

// Reset all fields
reset()

// Reset specific fields
reset('title')
reset('title', 'body')
```

## Validation Errors

Errors come from Go validation and are keyed by field name:

```go
// Go controller
func (c *PostController) Store(ctx *router.Context) error {
    errors := validate.Check(ctx.Request, validate.Rules{
        "title": {"required", "min:3"},
        "body":  {"required", "min:10"},
    })

    if errors.HasErrors() {
        view.RenderWithErrors(ctx.Response, ctx.Request, "Posts/Create",
            view.Props{}, errors)
        return nil
    }

    // Create post...
    return nil
}
```

```typescript
// React component
{errors.title && (
  <span className="text-red-500">{errors.title}</span>
)}
```

## Form Callbacks

```typescript
post('/posts', {
  onBefore: () => {
    // Called before request
    return confirm('Are you sure?')
  },
  onStart: () => {
    // Request started
  },
  onProgress: (progress) => {
    // Upload progress update
  },
  onSuccess: (page) => {
    // Request succeeded
    reset()
  },
  onError: (errors) => {
    // Validation errors
  },
  onCancel: () => {
    // Request was cancelled
  },
  onFinish: () => {
    // Always called (success or error)
  },
})
```

## Preserving State

```typescript
// Keep scroll position after submission
post('/posts', { preserveScroll: true })

// Keep form state on error (default for errors)
post('/posts', { preserveState: true })

// Replace history entry (no back button to form)
post('/posts', { replace: true })
```

## Best Practices

1. **Disable Buttons** - Use `processing` to disable submit during submission
2. **Show Progress** - Display upload progress for file forms
3. **Clear on Success** - Reset form after successful submission
4. **Preserve Scroll** - Use `preserveScroll` for inline forms
5. **Transform Data** - Use `transform` for data modifications before submit
6. **Type Props** - Define TypeScript interfaces for form data
