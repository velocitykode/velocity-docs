---
title: "Storage"
description: Store and retrieve files with Velocity's unified storage interface for local filesystem and Amazon S3.
weight: 25
---

Velocity provides a unified storage interface for file operations across different backends including local filesystem and Amazon S3. The storage system uses a driver-based architecture that allows you to switch storage backends through configuration without changing your code.

## Quick Start

{{% callout type="info" %}}
**Zero Configuration**: The storage package automatically initializes from your `.env` file. No setup required!
{{% /callout %}}

{{< tabs items="Basic Usage,Streaming Files,Working with URLs" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/pkg/storage"

func uploadAvatar(userID int, imageData []byte) error {
    // Store file using default disk
    path := fmt.Sprintf("avatars/user-%d.jpg", userID)
    return storage.Put(path, imageData)
}

func getAvatar(userID int) ([]byte, error) {
    path := fmt.Sprintf("avatars/user-%d.jpg", userID)
    return storage.Get(path)
}

func deleteAvatar(userID int) error {
    path := fmt.Sprintf("avatars/user-%d.jpg", userID)
    return storage.Delete(path)
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "os"
    "github.com/velocitykode/velocity/pkg/storage"
)

func uploadVideo(videoPath string) error {
    // Open file for streaming
    file, err := os.Open(videoPath)
    if err != nil {
        return err
    }
    defer file.Close()

    // Stream large files efficiently
    return storage.PutStream("videos/intro.mp4", file)
}

func downloadVideo(outputPath string) error {
    // Get file as stream
    stream, err := storage.GetStream("videos/intro.mp4")
    if err != nil {
        return err
    }
    defer stream.Close()

    // Write to file
    file, err := os.Create(outputPath)
    if err != nil {
        return err
    }
    defer file.Close()

    _, err = io.Copy(file, stream)
    return err
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "time"
    "github.com/velocitykode/velocity/pkg/storage"
)

func getPublicURL(filePath string) string {
    // Get permanent public URL
    return storage.URL(filePath)
}

func getTemporaryURL(filePath string) (string, error) {
    // Get temporary signed URL (expires in 1 hour)
    return storage.TemporaryURL(filePath, 1*time.Hour)
}

// Example in HTTP handler
func handleDownload(c *http.Context) error {
    reportPath := "reports/monthly-report.pdf"

    // Generate signed URL valid for 30 minutes
    url, err := storage.TemporaryURL(reportPath, 30*time.Minute)
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

Configure storage through environment variables in your `.env` file:

```env
# Default disk
FILESYSTEM_DISK=local          # Options: local, s3, public

# Local disk configuration
FILESYSTEM_LOCAL_ROOT=storage/app
FILESYSTEM_LOCAL_URL=http://localhost:8090/storage
FILESYSTEM_LOCAL_VISIBILITY=private

# Public disk configuration
FILESYSTEM_PUBLIC_ROOT=storage/app/public
FILESYSTEM_PUBLIC_URL=http://localhost:8090/storage
APP_URL=http://localhost:8090

# S3 disk configuration
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=my-app-bucket
AWS_URL=https://my-bucket.s3.amazonaws.com
AWS_VISIBILITY=private

# Testing (automatically uses memory driver)
APP_ENV=testing
```

## Drivers

### Local Driver

The local driver stores files on your server's filesystem:

- **Storage location**: Configured via `FILESYSTEM_LOCAL_ROOT` (default: `storage/app`)
- **Public access**: Files can be served via configured URL
- **Thread-safe**: Concurrent writes are properly synchronized
- **Cross-platform**: Handles path separators automatically

**Use cases:**
- Development and testing
- Small-scale deployments
- Files that don't need distributed storage

### S3 Driver

The S3 driver stores files on Amazon S3:

- **Scalable**: Handle unlimited file storage
- **Distributed**: Access from anywhere
- **Secure**: Supports private files with signed URLs
- **Efficient**: Uses multipart uploads for large files
- **Reliable**: Automatic retry with exponential backoff

**Use cases:**
- Production deployments
- Large file storage
- Global content delivery
- Backup and archival

### Memory Driver

The memory driver stores files in memory (for testing):

- **Fast**: No disk I/O overhead
- **Clean**: No filesystem pollution during tests
- **Isolated**: Each test gets a clean state
- **Limited**: Configurable size limit

**Use cases:**
- Unit testing
- Integration testing
- Development with mock data

## API Reference

### File Operations

#### Put

Store file contents at a given path:

```go
// Store byte array
imageData := []byte{...}
err := storage.Put("uploads/image.jpg", imageData)

// Using specific disk
s3 := storage.Disk("s3")
err := s3.Put("backups/data.json", jsonData)
```

#### PutStream

Store a file from an io.Reader (efficient for large files):

```go
file, _ := os.Open("large-video.mp4")
defer file.Close()

err := storage.PutStream("videos/tutorial.mp4", file)
```

#### Get

Retrieve file contents as byte array:

```go
contents, err := storage.Get("uploads/document.pdf")
if err != nil {
    if errors.Is(err, storage.ErrFileNotFound) {
        // Handle missing file
    }
    return err
}
```

#### GetStream

Retrieve file as io.ReadCloser (efficient for large files):

```go
stream, err := storage.GetStream("videos/tutorial.mp4")
if err != nil {
    return err
}
defer stream.Close()

// Process stream
_, err = io.Copy(outputFile, stream)
```

#### Exists

Check if a file exists:

```go
if storage.Exists("uploads/avatar.jpg") {
    // File exists
}
```

#### Delete

Delete one or more files:

```go
// Delete single file
err := storage.Delete("uploads/temp.txt")

// Delete multiple files
err := storage.Delete(
    "uploads/file1.txt",
    "uploads/file2.txt",
    "uploads/file3.txt",
)
```

### File Management

#### Copy

Copy a file to a new location:

```go
err := storage.Copy("uploads/original.jpg", "uploads/copy.jpg")
```

#### Move

Move a file to a new location:

```go
err := storage.Move("uploads/temp.jpg", "uploads/final.jpg")
```

#### Size

Get the size of a file in bytes:

```go
size, err := storage.Size("uploads/video.mp4")
fmt.Printf("File size: %d bytes\n", size)
```

#### LastModified

Get the last modified time:

```go
modTime, err := storage.LastModified("uploads/document.pdf")
fmt.Printf("Last modified: %s\n", modTime.Format(time.RFC3339))
```

#### MimeType

Get the MIME type of a file:

```go
mimeType, err := storage.MimeType("uploads/image.jpg")
// Returns: "image/jpeg"
```

### Directory Operations

#### Files

List files in a directory (non-recursive):

```go
files, err := storage.Files("uploads")
// Returns: ["file1.txt", "file2.pdf"]
```

#### AllFiles

List all files recursively:

```go
files, err := storage.AllFiles("uploads")
// Returns: ["file1.txt", "2024/file2.pdf", "2024/01/file3.jpg"]
```

#### Directories

List subdirectories (non-recursive):

```go
dirs, err := storage.Directories("uploads")
// Returns: ["2024", "temp"]
```

#### AllDirectories

List all subdirectories recursively:

```go
dirs, err := storage.AllDirectories("uploads")
// Returns: ["2024", "2024/01", "2024/02", "temp"]
```

#### MakeDirectory

Create a directory:

```go
err := storage.MakeDirectory("uploads/2024/12")
```

#### DeleteDirectory

Delete a directory and all its contents:

```go
err := storage.DeleteDirectory("uploads/temp")
```

### URL Operations

#### URL

Get a permanent public URL for a file:

```go
// Local disk: returns configured base URL + path
url := storage.URL("public/logo.png")
// Returns: "http://localhost:8090/storage/public/logo.png"

// S3 disk: returns S3 URL
s3 := storage.Disk("s3")
url := s3.URL("images/banner.jpg")
// Returns: "https://my-bucket.s3.amazonaws.com/images/banner.jpg"
```

#### TemporaryURL

Get a temporary signed URL (S3 only):

```go
// Generate URL that expires in 15 minutes
url, err := storage.TemporaryURL("private/report.pdf", 15*time.Minute)
if err != nil {
    return err
}

// Share the URL - it will expire automatically
fmt.Println("Download link:", url)
```

## Working with Multiple Disks

### Using Specific Disks

```go
// Get a specific disk
s3 := storage.Disk("s3")
local := storage.Disk("local")
public := storage.Disk("public")

// Use the disk
s3.Put("backups/data.json", jsonData)
local.Put("logs/app.log", logData)
public.Put("images/logo.png", imageData)
```

### Copying Between Disks

```go
// Read from one disk, write to another
data, err := storage.Disk("local").Get("uploads/file.pdf")
if err != nil {
    return err
}

err = storage.Disk("s3").Put("backups/file.pdf", data)
if err != nil {
    return err
}
```

### Custom Disk Configuration

```go
import (
    "github.com/velocitykode/velocity/pkg/storage"
)

func setupCustomStorage() error {
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

    return storage.Configure(config)
}
```

## Best Practices

### 1. Use UUIDs for Uploaded Files

Prevent filename collisions and path traversal attacks:

```go
import "github.com/google/uuid"

func handleFileUpload(originalName string, data []byte) error {
    // Generate unique filename
    ext := filepath.Ext(originalName)
    filename := uuid.New().String() + ext

    path := fmt.Sprintf("uploads/%s", filename)
    return storage.Put(path, data)
}
```

### 2. Stream Large Files

Don't load large files into memory:

```go
// Good: Stream the file
file, _ := os.Open("large-file.mp4")
defer file.Close()
storage.PutStream("videos/video.mp4", file)

// Bad: Load entire file into memory
data, _ := os.ReadFile("large-file.mp4")
storage.Put("videos/video.mp4", data)
```

### 3. Use Appropriate Visibility

Store sensitive files as private:

```go
// Private files (default on S3)
storage.Disk("s3").Put("invoices/invoice-123.pdf", invoiceData)

// Public files
storage.Disk("public").Put("images/logo.png", logoData)

// Generate temporary access to private files
url, _ := storage.TemporaryURL("invoices/invoice-123.pdf", 1*time.Hour)
```

### 4. Handle Errors Properly

```go
import "errors"

func getFile(path string) ([]byte, error) {
    data, err := storage.Get(path)
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
storage.Put(fmt.Sprintf("uploads/%d/%s/avatar.jpg", year, month), data)
storage.Put(fmt.Sprintf("users/%d/documents/%s.pdf", userID, docType), data)

// Bad: Flat structure
storage.Put(fmt.Sprintf("avatar-%d.jpg", userID), data)
```

### 6. Clean Up Temporary Files

```go
// Upload temporary file
tempPath := fmt.Sprintf("temp/%s.jpg", uuid.New().String())
storage.Put(tempPath, imageData)

// Process the file
processedData := processImage(tempPath)

// Clean up
defer storage.Delete(tempPath)

// Save final result
storage.Put("images/final.jpg", processedData)
```

## Testing

### Using Memory Driver

```go
func TestFileUpload(t *testing.T) {
    // Memory driver is automatically used when APP_ENV=testing

    testData := []byte("test content")
    err := storage.Put("test/file.txt", testData)
    assert.NoError(t, err)

    // Verify file was stored
    retrieved, err := storage.Get("test/file.txt")
    assert.NoError(t, err)
    assert.Equal(t, testData, retrieved)
}
```

### Testing with Fake Storage

```go
import "github.com/velocitykode/velocity/pkg/storage/testing"

func TestUserAvatar(t *testing.T) {
    // Create fake storage
    fake := testing.NewFake()
    storage.SetGlobalManager(storage.NewManager(storage.Config{
        Default: "fake",
        Disks: map[string]storage.DiskConfig{
            "fake": {Driver: "memory"},
        },
    }))

    // Test your code
    UploadAvatar(123, testImage)

    // Assert file was stored
    fake.AssertExists("avatars/user-123.jpg")
    fake.AssertMissing("avatars/user-456.jpg")
}
```

## Complete Example

Here's a complete example of a file upload handler:

```go
package handlers

import (
    "fmt"
    "io"
    "path/filepath"
    "time"

    "github.com/google/uuid"
    "github.com/velocitykode/velocity/pkg/http"
    "github.com/velocitykode/velocity/pkg/storage"
)

type FileHandler struct{}

// Upload handles file uploads
func (fc *FileHandler) Upload(c *http.Context) error {
    // Parse multipart form (32 MB max)
    err := c.Request.ParseMultipartForm(32 << 20)
    if err != nil {
        return c.JSON(400, map[string]string{
            "error": "Invalid file upload",
        })
    }

    // Get the file
    file, header, err := c.Request.FormFile("file")
    if err != nil {
        return c.JSON(400, map[string]string{
            "error": "No file provided",
        })
    }
    defer file.Close()

    // Validate file size (10 MB max)
    if header.Size > 10*1024*1024 {
        return c.JSON(400, map[string]string{
            "error": "File too large (max 10MB)",
        })
    }

    // Generate unique filename
    ext := filepath.Ext(header.Filename)
    filename := uuid.New().String() + ext
    path := fmt.Sprintf("uploads/%s", filename)

    // Store the file
    err = storage.PutStream(path, file)
    if err != nil {
        return c.JSON(500, map[string]string{
            "error": "Failed to store file",
        })
    }

    // Generate public URL
    url := storage.URL(path)

    return c.JSON(200, map[string]interface{}{
        "message": "File uploaded successfully",
        "path":    path,
        "url":     url,
        "size":    header.Size,
    })
}

// Download generates a temporary download link
func (fc *FileHandler) Download(c *http.Context) error {
    filePath := c.Param("path")

    // Check if file exists
    if !storage.Exists(filePath) {
        return c.JSON(404, map[string]string{
            "error": "File not found",
        })
    }

    // Generate temporary URL (valid for 1 hour)
    url, err := storage.TemporaryURL(filePath, 1*time.Hour)
    if err != nil {
        return c.JSON(500, map[string]string{
            "error": "Failed to generate download link",
        })
    }

    return c.JSON(200, map[string]string{
        "download_url": url,
        "expires_in":   "1 hour",
    })
}

// Delete removes a file
func (fc *FileHandler) Delete(c *http.Context) error {
    filePath := c.Param("path")

    // Check if file exists
    if !storage.Exists(filePath) {
        return c.JSON(404, map[string]string{
            "error": "File not found",
        })
    }

    // Delete the file
    err := storage.Delete(filePath)
    if err != nil {
        return c.JSON(500, map[string]string{
            "error": "Failed to delete file",
        })
    }

    return c.JSON(200, map[string]string{
        "message": "File deleted successfully",
    })
}
```
