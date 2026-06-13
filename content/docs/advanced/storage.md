---
title: "Storage"
description: Store and retrieve files with Velocity's unified storage manager for local filesystem and Amazon S3.
weight: 25
---

Velocity provides a unified storage interface for file operations across different backends including local filesystem and Amazon S3. The storage system uses a driver-based architecture that allows you to switch storage backends through configuration without changing your code.

Storage is exposed as a **manager** that holds one or more named disks. You obtain the manager from the request context (`c.Storage()`) or from `app.Services.Storage`, select a disk with `Disk(name)` or `Default()`, and call methods on the returned driver. Every I/O method comes in two forms: a context-aware `Ctx` variant that threads the request's `context.Context` through to the backend (so a slow S3 GET or a hung write can be cancelled), and a deprecated non-`Ctx` shim. **New code should always call the `Ctx` variants.**

## Quick Start

{{% callout type="info" %}}
**Configured from your environment**: When you build your app, Velocity wires a storage manager from your `.env` file (a `local` disk is always configured, and an `s3` disk is added when `AWS_BUCKET` is set). Retrieve it with `c.Storage()` inside a handler.
{{% /callout %}}

{{< tabs items="Basic Usage,Streaming Files,Working with URLs" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/router"

func uploadAvatar(c *router.Context, userID int, imageData []byte) error {
    disk, err := c.Storage().Default()
    if err != nil {
        return err
    }

    path := fmt.Sprintf("avatars/user-%d.jpg", userID)
    return disk.PutCtx(c.Request.Context(), path, imageData)
}

func getAvatar(c *router.Context, userID int) ([]byte, error) {
    disk, err := c.Storage().Default()
    if err != nil {
        return nil, err
    }

    path := fmt.Sprintf("avatars/user-%d.jpg", userID)
    return disk.GetCtx(c.Request.Context(), path)
}

func deleteAvatar(c *router.Context, userID int) error {
    disk, err := c.Storage().Default()
    if err != nil {
        return err
    }

    path := fmt.Sprintf("avatars/user-%d.jpg", userID)
    return disk.DeleteCtx(c.Request.Context(), path)
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "io"
    "os"

    "github.com/velocitykode/velocity/router"
)

func uploadVideo(c *router.Context, videoPath string) error {
    disk, err := c.Storage().Default()
    if err != nil {
        return err
    }

    // Open file for streaming
    file, err := os.Open(videoPath)
    if err != nil {
        return err
    }
    defer file.Close()

    // Stream large files efficiently
    return disk.PutStreamCtx(c.Request.Context(), "videos/intro.mp4", file)
}

func downloadVideo(c *router.Context, outputPath string) error {
    disk, err := c.Storage().Default()
    if err != nil {
        return err
    }

    // Get file as stream
    stream, err := disk.GetStreamCtx(c.Request.Context(), "videos/intro.mp4")
    if err != nil {
        return err
    }
    defer stream.Close()

    // Write to file
    out, err := os.Create(outputPath)
    if err != nil {
        return err
    }
    defer out.Close()

    _, err = io.Copy(out, stream)
    return err
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "time"

    "github.com/velocitykode/velocity/router"
)

func handleDownload(c *router.Context) error {
    disk, err := c.Storage().Disk("s3")
    if err != nil {
        return err
    }

    reportPath := "reports/monthly-report.pdf"

    // Permanent public URL (pure string operation, no context needed).
    publicURL := disk.URL(reportPath)
    _ = publicURL

    // Temporary signed URL valid for 30 minutes (S3 only).
    url, err := disk.TemporaryURLCtx(c.Request.Context(), reportPath, 30*time.Minute)
    if err != nil {
        return err
    }

    return c.JSON(200, map[string]string{
        "download_url": url,
    })
}
```
{{< /tab >}}

{{< /tabs >}}

## Configuration

Storage is configured from environment variables when your app is built. A `local` disk is always configured; an `s3` disk is added automatically when `AWS_BUCKET` is set.

```env
# Default disk
STORAGE_DRIVER=local           # Options: local, s3

# Local disk configuration
FILESYSTEM_LOCAL_ROOT=./storage/app

# S3 disk configuration (only configured when AWS_BUCKET is set)
AWS_BUCKET=my-app-bucket
AWS_DEFAULT_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_URL=https://my-bucket.s3.amazonaws.com
```

{{% callout type="info" %}}
The `STORAGE_DRIVER` value names the default disk (`local` or `s3`). `FILESYSTEM_LOCAL_ROOT` defaults to `./storage/app`. Relative roots are resolved against the working directory at startup.
{{% /callout %}}

For full programmatic control, build a `storage.Config` and configure a manager yourself (see [Custom Disk Configuration](#custom-disk-configuration)).

## Drivers

Drivers register themselves into the storage registry from an `init()`. The `local` and `memory` drivers live in the `storage` package itself; the `s3` driver lives in `github.com/velocitykode/velocity/storage/s3` and registers the `"s3"` driver when that package is imported (Velocity imports it for you when an app needs S3).

### Local Driver

The local driver stores files on your server's filesystem:

- **Storage location**: Configured via `FILESYSTEM_LOCAL_ROOT` (default: `./storage/app`)
- **Sandboxed**: The driver opens an `os.Root` at the configured directory and resolves every path beneath it, rejecting traversal and symlink escapes at the kernel level
- **Thread-safe**: Concurrent operations are properly synchronized
- **Cross-platform**: Handles path separators automatically

**Use cases:**
- Development and testing
- Small-scale deployments
- Files that don't need distributed storage

{{% callout type="info" %}}
The local driver holds an `os.Root` file descriptor for the lifetime of the driver. The storage manager drains it during app shutdown via `Manager.Shutdown(ctx)`, so you do not normally release it yourself.
{{% /callout %}}

### S3 Driver

The S3 driver stores files on Amazon S3:

- **Scalable**: Handle unlimited file storage
- **Distributed**: Access from anywhere
- **Secure**: Supports private files with signed URLs
- **Efficient**: Uses multipart uploads for large files

**Use cases:**
- Production deployments
- Large file storage
- Global content delivery
- Backup and archival

### Memory Driver

The memory driver stores files in memory (useful for tests and ephemeral data):

- **Fast**: No disk I/O overhead
- **Clean**: No filesystem pollution
- **Limited**: Configurable size limit via `MaxSize` (default 100 MB)

**Use cases:**
- Unit testing
- Integration testing
- Development with mock data

## API Reference

All methods below are called on a `Driver` obtained from `c.Storage().Disk(name)` or `c.Storage().Default()`. The examples assume a `disk` variable holding that driver and `ctx` holding the request context (`c.Request.Context()`).

### File Operations

#### PutCtx

Store file contents at a given path:

```go
// Store byte array on the default disk
imageData := []byte{ /* ... */ }
err := disk.PutCtx(ctx, "uploads/image.jpg", imageData)

// Using a specific disk
s3, err := c.Storage().Disk("s3")
if err != nil {
    return err
}
err = s3.PutCtx(ctx, "backups/data.json", jsonData)
```

#### PutStreamCtx

Store a file from an `io.Reader` (efficient for large files):

```go
file, _ := os.Open("large-video.mp4")
defer file.Close()

err := disk.PutStreamCtx(ctx, "videos/tutorial.mp4", file)
```

#### GetCtx

Retrieve file contents as a byte array:

```go
contents, err := disk.GetCtx(ctx, "uploads/document.pdf")
if err != nil {
    if errors.Is(err, storage.ErrFileNotFound) {
        // Handle missing file
    }
    return err
}
```

#### GetStreamCtx

Retrieve a file as an `io.ReadCloser` (efficient for large files):

```go
stream, err := disk.GetStreamCtx(ctx, "videos/tutorial.mp4")
if err != nil {
    return err
}
defer stream.Close()

// Process stream
_, err = io.Copy(outputFile, stream)
```

#### ExistsCtx

Check if a file exists (returns a `bool`):

```go
if disk.ExistsCtx(ctx, "uploads/avatar.jpg") {
    // File exists
}
```

#### DeleteCtx

Delete one or more files:

```go
// Delete single file
err := disk.DeleteCtx(ctx, "uploads/temp.txt")

// Delete multiple files
err := disk.DeleteCtx(ctx,
    "uploads/file1.txt",
    "uploads/file2.txt",
    "uploads/file3.txt",
)
```

### File Management

#### CopyCtx

Copy a file to a new location:

```go
err := disk.CopyCtx(ctx, "uploads/original.jpg", "uploads/copy.jpg")
```

#### MoveCtx

Move a file to a new location:

```go
err := disk.MoveCtx(ctx, "uploads/temp.jpg", "uploads/final.jpg")
```

#### SizeCtx

Get the size of a file in bytes:

```go
size, err := disk.SizeCtx(ctx, "uploads/video.mp4")
fmt.Printf("File size: %d bytes\n", size)
```

#### LastModifiedCtx

Get the last modified time:

```go
modTime, err := disk.LastModifiedCtx(ctx, "uploads/document.pdf")
fmt.Printf("Last modified: %s\n", modTime.Format(time.RFC3339))
```

#### MimeTypeCtx

Get the MIME type of a file:

```go
mimeType, err := disk.MimeTypeCtx(ctx, "uploads/image.jpg")
// Returns: "image/jpeg"
```

### Directory Operations

#### FilesCtx

List files in a directory (non-recursive):

```go
files, err := disk.FilesCtx(ctx, "uploads")
// Returns: ["file1.txt", "file2.pdf"]
```

#### AllFilesCtx

List all files recursively:

```go
files, err := disk.AllFilesCtx(ctx, "uploads")
// Returns: ["file1.txt", "2024/file2.pdf", "2024/01/file3.jpg"]
```

#### DirectoriesCtx

List subdirectories (non-recursive):

```go
dirs, err := disk.DirectoriesCtx(ctx, "uploads")
// Returns: ["2024", "temp"]
```

#### AllDirectoriesCtx

List all subdirectories recursively:

```go
dirs, err := disk.AllDirectoriesCtx(ctx, "uploads")
// Returns: ["2024", "2024/01", "2024/02", "temp"]
```

#### MakeDirectoryCtx

Create a directory:

```go
err := disk.MakeDirectoryCtx(ctx, "uploads/2024/12")
```

#### DeleteDirectoryCtx

Delete a directory and all its contents:

```go
err := disk.DeleteDirectoryCtx(ctx, "uploads/temp")
```

### URL Operations

#### URL

Get a permanent public URL for a file. `URL` is a pure string transformation, so it has no context-aware variant:

```go
// Local disk: returns configured base URL + path
url := disk.URL("public/logo.png")

// S3 disk: returns S3 URL
s3, _ := c.Storage().Disk("s3")
url := s3.URL("images/banner.jpg")
// Returns: "https://my-bucket.s3.amazonaws.com/images/banner.jpg"
```

#### TemporaryURLCtx

Get a temporary signed URL. This is supported by the S3 driver; the local and memory drivers return `storage.ErrNotSupported`:

```go
// Generate URL that expires in 15 minutes
url, err := s3.TemporaryURLCtx(ctx, "private/report.pdf", 15*time.Minute)
if err != nil {
    if errors.Is(err, storage.ErrNotSupported) {
        // Driver cannot mint signed URLs (e.g. local disk)
    }
    return err
}

// Share the URL - it will expire automatically
fmt.Println("Download link:", url)
```

## Working with Multiple Disks

### Using Specific Disks

```go
mgr := c.Storage()

s3, err := mgr.Disk("s3")
if err != nil {
    return err
}
local, err := mgr.Disk("local")
if err != nil {
    return err
}

// Use the disks
s3.PutCtx(ctx, "backups/data.json", jsonData)
local.PutCtx(ctx, "logs/app.log", logData)
```

`Disk` returns `storage.ErrDiskNotFound` when the named disk has not been configured.

### Copying Between Disks

```go
mgr := c.Storage()

src, err := mgr.Disk("local")
if err != nil {
    return err
}
data, err := src.GetCtx(ctx, "uploads/file.pdf")
if err != nil {
    return err
}

dst, err := mgr.Disk("s3")
if err != nil {
    return err
}
if err := dst.PutCtx(ctx, "backups/file.pdf", data); err != nil {
    return err
}
```

### Custom Disk Configuration

Build a `storage.Config` and configure a `*storage.Manager` directly. `Config`, `DiskConfig`, and the driver interface are defined in the `storage` package (backed by the shared `contract` leaf):

```go
import (
    "context"

    "github.com/velocitykode/velocity/storage"
)

func setupCustomStorage(ctx context.Context) (*storage.Manager, error) {
    config := storage.Config{
        Default: "s3",
        Disks: map[string]storage.DiskConfig{
            "local": {
                Driver: "local",
                Root:   "./storage/app",
                URL:    "http://localhost:8090/storage",
            },
            "s3": {
                Driver: "s3",
                Key:    "YOUR_AWS_KEY",
                Secret: "YOUR_AWS_SECRET",
                Region: "us-east-1",
                Bucket: "my-bucket",
            },
            "backup": {
                Driver: "s3",
                Key:    "YOUR_AWS_KEY",
                Secret: "YOUR_AWS_SECRET",
                Region: "us-west-2",
                Bucket: "my-backup-bucket",
            },
        },
    }

    mgr := storage.NewManager(config)
    if err := mgr.ConfigureWithContext(ctx, config); err != nil {
        return nil, err
    }
    return mgr, nil
}
```

{{% callout type="info" %}}
To use the S3 driver, import `github.com/velocitykode/velocity/storage/s3` somewhere in your build so its `init()` registers the `"s3"` factory. The `local` and `memory` drivers are registered by the `storage` package itself.
{{% /callout %}}

## Best Practices

### 1. Use UUIDs for Uploaded Files

Prevent filename collisions:

```go
import "github.com/google/uuid"

func handleFileUpload(ctx context.Context, disk storage.Driver, originalName string, data []byte) error {
    // Generate unique filename
    ext := filepath.Ext(originalName)
    filename := uuid.New().String() + ext

    path := fmt.Sprintf("uploads/%s", filename)
    return disk.PutCtx(ctx, path, data)
}
```

### 2. Stream Large Files

Don't load large files into memory:

```go
// Good: Stream the file
file, _ := os.Open("large-file.mp4")
defer file.Close()
disk.PutStreamCtx(ctx, "videos/video.mp4", file)

// Bad: Load entire file into memory
data, _ := os.ReadFile("large-file.mp4")
disk.PutCtx(ctx, "videos/video.mp4", data)
```

### 3. Use Appropriate Disks for Sensitive Files

Keep private files on a private disk and mint temporary access for them:

```go
s3, _ := c.Storage().Disk("s3")

// Store a private file
s3.PutCtx(ctx, "invoices/invoice-123.pdf", invoiceData)

// Generate temporary access to a private file
url, _ := s3.TemporaryURLCtx(ctx, "invoices/invoice-123.pdf", 1*time.Hour)
```

### 4. Handle Errors Properly

```go
import "errors"

func getFile(ctx context.Context, disk storage.Driver, path string) ([]byte, error) {
    data, err := disk.GetCtx(ctx, path)
    if err != nil {
        if errors.Is(err, storage.ErrFileNotFound) {
            // Handle missing file specifically
            return nil, fmt.Errorf("file not found: %s", path)
        }
        // Handle other errors
        return nil, fmt.Errorf("failed to read file: %w", err)
    }
    return data, nil
}
```

### 5. Organize Files with Directory Structure

```go
// Good: Organized structure
disk.PutCtx(ctx, fmt.Sprintf("uploads/%d/%s/avatar.jpg", year, month), data)
disk.PutCtx(ctx, fmt.Sprintf("users/%d/documents/%s.pdf", userID, docType), data)

// Bad: Flat structure
disk.PutCtx(ctx, fmt.Sprintf("avatar-%d.jpg", userID), data)
```

## Testing

The `github.com/velocitykode/velocity/storage/testing` package ships an in-memory fake driver plus fluent assertions, so you can verify storage interactions without touching disk or S3.

### Using the Fake Driver

`StorageFake()` returns a `*FakeStorage` that records every operation. Use the `Fake()` builder to synthesize realistic test files:

```go
import (
    storageTesting "github.com/velocitykode/velocity/storage/testing"
)

func TestUserAvatar(t *testing.T) {
    fake := storageTesting.StorageFake()

    // Build a realistic fake image
    img := storageTesting.Fake().Image("avatar.jpg", 200, 200)

    // Exercise your code against the fake
    if err := fake.Put("avatars/user-123.jpg", img.Content()); err != nil {
        t.Fatal(err)
    }

    // Assert against recorded state
    a := fake.Assert(t)
    a.AssertExists("avatars/user-123.jpg")
    a.AssertMissing("avatars/user-456.jpg")
    a.AssertCount(1)
}
```

Available assertions include `AssertExists`, `AssertMissing`, `AssertStored`, `AssertStoredString`, `AssertCount`, `AssertNothingStored`, `AssertSize`, `AssertMimeType`, `AssertDirectory`, `AssertCopied`, `AssertMoved`, `AssertDeleted`, `AssertContains`, `AssertURL`, and `AssertTemporaryURL`. You can also drive failure paths with `fake.ShouldFail("boom")` / `fake.ShouldSucceed()` and reset state with `fake.Clear()`.

## Complete Example

Here's a complete file upload handler using the request-scoped storage manager:

```go
package handlers

import (
    "fmt"
    "path/filepath"
    "time"

    "github.com/google/uuid"
    "github.com/velocitykode/velocity/router"
    "github.com/velocitykode/velocity/storage"
)

type FileHandler struct{}

// Upload handles file uploads
func (fc *FileHandler) Upload(c *router.Context) error {
    disk, err := c.Storage().Default()
    if err != nil {
        return c.JSON(500, map[string]string{"error": "Storage unavailable"})
    }

    // Parse multipart form (32 MB max)
    if err := c.Request.ParseMultipartForm(32 << 20); err != nil {
        return c.JSON(400, map[string]string{"error": "Invalid file upload"})
    }

    // Get the file
    file, header, err := c.Request.FormFile("file")
    if err != nil {
        return c.JSON(400, map[string]string{"error": "No file provided"})
    }
    defer file.Close()

    // Validate file size (10 MB max)
    if header.Size > 10*1024*1024 {
        return c.JSON(400, map[string]string{"error": "File too large (max 10MB)"})
    }

    // Generate unique filename
    ext := filepath.Ext(header.Filename)
    filename := uuid.New().String() + ext
    path := fmt.Sprintf("uploads/%s", filename)

    // Store the file (streaming)
    if err := disk.PutStreamCtx(c.Request.Context(), path, file); err != nil {
        return c.JSON(500, map[string]string{"error": "Failed to store file"})
    }

    return c.JSON(200, map[string]interface{}{
        "message": "File uploaded successfully",
        "path":    path,
        "url":     disk.URL(path),
        "size":    header.Size,
    })
}

// Download generates a temporary download link
func (fc *FileHandler) Download(c *router.Context) error {
    disk, err := c.Storage().Default()
    if err != nil {
        return c.JSON(500, map[string]string{"error": "Storage unavailable"})
    }

    filePath := c.Param("path")
    if !disk.ExistsCtx(c.Request.Context(), filePath) {
        return c.JSON(404, map[string]string{"error": "File not found"})
    }

    // Generate temporary URL (valid for 1 hour); requires a driver that supports it (S3).
    url, err := disk.TemporaryURLCtx(c.Request.Context(), filePath, 1*time.Hour)
    if err != nil {
        return c.JSON(500, map[string]string{"error": "Failed to generate download link"})
    }

    return c.JSON(200, map[string]string{
        "download_url": url,
        "expires_in":   "1 hour",
    })
}

// Delete removes a file
func (fc *FileHandler) Delete(c *router.Context) error {
    disk, err := c.Storage().Default()
    if err != nil {
        return c.JSON(500, map[string]string{"error": "Storage unavailable"})
    }

    filePath := c.Param("path")
    if !disk.ExistsCtx(c.Request.Context(), filePath) {
        return c.JSON(404, map[string]string{"error": "File not found"})
    }

    if err := disk.DeleteCtx(c.Request.Context(), filePath); err != nil {
        return c.JSON(500, map[string]string{"error": "Failed to delete file"})
    }

    return c.JSON(200, map[string]string{"message": "File deleted successfully"})
}
```
