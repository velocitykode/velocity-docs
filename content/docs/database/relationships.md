---
title: Relationships
weight: 30
---

Velocity ORM supports all common relationship types with eager loading and query constraints.

## Relationship Types

| Type | Description | Example |
|------|-------------|---------|
| `hasOne` | One-to-one | User has one Profile |
| `hasMany` | One-to-many | User has many Posts |
| `belongsTo` | Inverse one-to-one/many | Post belongs to User |
| `belongsToMany` | Many-to-many | Post has many Tags |

## Defining Relationships

### Has One

```go
type User struct {
    orm.Model[User]
    Name    string   `orm:"column:name;type:varchar(255)"`
    Profile *Profile `orm:"relation:hasOne"`
}

type Profile struct {
    orm.Model[Profile]
    UserID uint   `orm:"column:user_id;type:bigint;not_null"`
    Bio    string `orm:"column:bio;type:text"`
    User   *User  `orm:"relation:belongsTo"`
}
```

### Has Many

```go
type User struct {
    orm.Model[User]
    Name  string `orm:"column:name;type:varchar(255)"`
    Posts []Post `orm:"relation:hasMany"`
}

type Post struct {
    orm.Model[Post]
    UserID uint   `orm:"column:user_id;type:bigint;not_null"`
    Title  string `orm:"column:title;type:varchar(255)"`
    User   *User  `orm:"relation:belongsTo"`
}
```

### Belongs To

```go
type Comment struct {
    orm.Model[Comment]
    PostID  uint   `orm:"column:post_id;type:bigint;not_null"`
    UserID  uint   `orm:"column:user_id;type:bigint;not_null"`
    Content string `orm:"column:content;type:text"`
    Post    *Post  `orm:"relation:belongsTo"`
    User    *User  `orm:"relation:belongsTo"`
}
```

### Belongs To Many (Many-to-Many)

```go
type Post struct {
    orm.Model[Post]
    Title string `orm:"column:title;type:varchar(255)"`
    Tags  []Tag  `orm:"relation:belongsToMany;join_table:post_tags"`
}

type Tag struct {
    orm.Model[Tag]
    Name  string `orm:"column:name;type:varchar(100)"`
    Posts []Post `orm:"relation:belongsToMany;join_table:post_tags"`
}
```

Pivot table migration:

```go
orm.Schema.Create("post_tags", func(table *orm.Table) {
    table.ForeignID("post_id").Constrained().OnDelete("CASCADE")
    table.ForeignID("tag_id").Constrained().OnDelete("CASCADE")
    table.Primary("post_id", "tag_id")
})
```

## Eager Loading

### Basic Eager Loading

```go
// Load single relationship
users, err := User{}.With("Posts").Get()

// Load multiple relationships
users, err := User{}.With("Profile", "Posts").Get()

// Access loaded relationship
for _, user := range users {
    fmt.Printf("%s has %d posts\n", user.Name, len(user.Posts))
}
```

### Nested Eager Loading

```go
// Load nested relationships with dot notation
users, err := User{}.With("Posts.Comments").Get()

// Multiple nested
users, err := User{}.With("Posts.Comments", "Posts.Tags", "Profile").Get()

// Access nested data
for _, user := range users {
    for _, post := range user.Posts {
        fmt.Printf("Post: %s has %d comments\n", post.Title, len(post.Comments))
    }
}
```

### Constrained Eager Loading

```go
// Filter related records
users, err := User{}.
    With("Posts", func(q *orm.Query[Post]) {
        q.Where("published = ?", true).
          OrderBy("created_at", "DESC").
          Limit(5)
    }).Get()

// Multiple constraints
users, err := User{}.
    With("Posts", func(q *orm.Query[Post]) {
        q.Where("published = ?", true)
    }).
    With("Profile", func(q *orm.Query[Profile]) {
        q.Select("id", "user_id", "bio")
    }).Get()
```

## Querying Relationships

### Has

Query models that have related records:

```go
// Users who have at least one post
users, err := User{}.Has("Posts").Get()

// Users who have more than 5 posts
users, err := User{}.Has("Posts", ">", 5).Get()

// Users who have between 1 and 10 posts
users, err := User{}.Has("Posts", ">=", 1).Has("Posts", "<=", 10).Get()
```

### Where Has

Query with relationship constraints:

```go
// Users who have published posts
users, err := User{}.WhereHas("Posts", func(q *orm.Query[Post]) {
    q.Where("published = ?", true)
}).Get()

// Users who have posts with comments
users, err := User{}.WhereHas("Posts", func(q *orm.Query[Post]) {
    q.Has("Comments")
}).Get()

// Users who have posts tagged with "golang"
users, err := User{}.WhereHas("Posts", func(q *orm.Query[Post]) {
    q.WhereHas("Tags", func(tq *orm.Query[Tag]) {
        tq.Where("name = ?", "golang")
    })
}).Get()
```

### Doesnt Have

Query models without related records:

```go
// Users with no posts
users, err := User{}.DoesntHave("Posts").Get()

// Users without published posts
users, err := User{}.WhereDoesntHave("Posts", func(q *orm.Query[Post]) {
    q.Where("published = ?", true)
}).Get()
```

## Creating Related Records

### Save Related

```go
user, _ := User{}.Find(1)

// Create related post
post := Post{Title: "New Post", Body: "Content"}
user.Posts().Save(&post)

// Create multiple
posts := []Post{
    {Title: "Post 1", Body: "Content 1"},
    {Title: "Post 2", Body: "Content 2"},
}
user.Posts().SaveMany(posts)
```

### Create Related

```go
user, _ := User{}.Find(1)

// Create and return
post, err := user.Posts().Create(map[string]any{
    "title": "New Post",
    "body":  "Content",
})
```

### Associate (Belongs To)

```go
post, _ := Post{}.Find(1)
user, _ := User{}.Find(5)

// Set the user for this post
post.User().Associate(user)
post.Save()

// Dissociate
post.User().Dissociate()
post.Save()
```

### Attach/Detach (Many-to-Many)

```go
post, _ := Post{}.Find(1)

// Attach tags
post.Tags().Attach([]uint{1, 2, 3})

// Attach with pivot data
post.Tags().Attach(map[uint]map[string]any{
    1: {"order": 1},
    2: {"order": 2},
})

// Detach specific tags
post.Tags().Detach([]uint{2, 3})

// Detach all
post.Tags().Detach()

// Sync (attach missing, detach removed)
post.Tags().Sync([]uint{1, 4, 5})
```

## Updating Related Records

```go
user, _ := User{}.Find(1)

// Update all related posts
user.Posts().Update(map[string]any{
    "published": false,
})

// Update with conditions
user.Posts().Where("created_at < ?", lastMonth).Update(map[string]any{
    "archived": true,
})
```

## Deleting Related Records

```go
user, _ := User{}.Find(1)

// Delete all posts
user.Posts().Delete()

// Delete with conditions
user.Posts().Where("published = ?", false).Delete()

// Delete parent with relationships
user.DeleteWith("Posts", "Profile")
```

## Counting Related Records

```go
user, _ := User{}.Find(1)

// Count related
postCount := user.Posts().Count()

// Count with conditions
publishedCount := user.Posts().Where("published = ?", true).Count()

// Eager load counts
users, _ := User{}.WithCount("Posts", "Comments").Get()
for _, user := range users {
    fmt.Printf("%s: %d posts\n", user.Name, user.PostsCount)
}
```

## Custom Foreign Keys

```go
type Post struct {
    orm.Model[Post]
    AuthorID uint  `orm:"column:author_id;type:bigint;not_null"`
    Author   *User `orm:"relation:belongsTo;foreign_key:author_id;owner_key:id"`
}

type User struct {
    orm.Model[User]
    Name  string `orm:"column:name;type:varchar(255)"`
    Posts []Post `orm:"relation:hasMany;foreign_key:author_id;local_key:id"`
}
```

## Polymorphic Relationships

```go
type Comment struct {
    orm.Model[Comment]
    CommentableID   uint   `orm:"column:commentable_id;type:bigint"`
    CommentableType string `orm:"column:commentable_type;type:varchar(255)"`
    Content         string `orm:"column:content;type:text"`
}

type Post struct {
    orm.Model[Post]
    Title    string    `orm:"column:title;type:varchar(255)"`
    Comments []Comment `orm:"relation:morphMany;morph:commentable"`
}

type Video struct {
    orm.Model[Video]
    Title    string    `orm:"column:title;type:varchar(255)"`
    Comments []Comment `orm:"relation:morphMany;morph:commentable"`
}
```

## Best Practices

1. **Always use eager loading** - Use `With()` to prevent N+1 queries
2. **Constrain eager loads** - Only load what you need with query constraints
3. **Index foreign keys** - Ensure all foreign key columns are indexed
4. **Use cascading deletes** - Set up ON DELETE CASCADE in migrations
5. **Avoid deep nesting** - Limit nested eager loading to 2-3 levels
6. **Count efficiently** - Use `WithCount()` instead of loading and counting
