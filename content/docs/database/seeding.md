---
title: Seeding
description: Populate a database with reference data and development fixtures through explicit, ordered seeders run by vel db seed.
weight: 30
---

Seeders insert the rows an application needs before it is useful: roles, regions, default settings, or a set of development fixtures. They live in the `github.com/velocitykode/velocity/orm/seed` package and are plain values: the application lists them once, in dependency order, and `vel db seed` runs that list.

```
Migration → Model → Factory → Seeder
```

There is no registry to discover and nothing to trigger from `init()`. A seeder that is not listed does not exist, and the list is the run order.

## Writing a Seeder

A seeder is any type implementing `seed.Seeder`:

```go
type Seeder interface {
    Name() string
    Run(ctx context.Context, db *orm.Manager) error
}
```

`Name` is the operator-facing handle, kebab-case by convention (`role`, `user-profile`); it is what `vel db seed --only <name>` matches and what progress output prints. `Run` receives the request-scoped context and the application's ORM manager.

Scaffold one with the generator:

```bash
vel gen seeder Role
```

which writes `database/seeders/role.go`:

```go
package seeders

import (
    "context"

    "github.com/velocitykode/velocity/orm"
)

// RoleSeeder seeds the database.
//
// Register this seeder in database/seeders/kernel.go, after the seeders whose
// rows it depends on:
//   r.Add(&RoleSeeder{})
type RoleSeeder struct{}

// Name returns the seeder name used by `vel db seed --only <name>`.
func (s RoleSeeder) Name() string {
    return "role"
}

// Run inserts the seed data. Use orm.Model[T] for reference rows and
// orm/factory for generated fixtures; both take ctx.
func (s RoleSeeder) Run(ctx context.Context, db *orm.Manager) error {
    return nil
}
```

`vel gen seeder RoleSeeder`, `Role`, and `role` all produce `RoleSeeder` with the name `role`; `UserProfile` produces `UserProfileSeeder` with the name `user-profile`. The output directory can be changed with `--dir`.

## Registering Seeders

Seeders are registered through the `Seeders` step of the bootstrap chain, the same way custom commands are registered through `Commands`. New projects ship `database/seeders/kernel.go`:

```go
package seeders

import "github.com/velocitykode/velocity"

// Register declares the application's database seeders in the order they
// run: list a seeder after the ones whose rows it depends on.
func Register(r *velocity.Seeders) {
    r.Add(&RegionSeeder{}, &RoleSeeder{}, &UserSeeder{})
}
```

wired in `main.go`:

```go
v.Modules(app.Configure).
    Routes(routes.Register).
    Commands(commands.Register).
    Seeders(seeders.Register).
    Serve()
```

`Add` panics with a `contract.RegistrationError` on a nil seeder, an empty name, or a duplicate name: all three are wiring mistakes, and they surface at boot rather than mid-run.

A module can contribute seeders by implementing the optional `velocity.SeederModule` interface (`Seeders(r *velocity.Seeders)`). Module seeders are added before the application's own `Register` callback, in module order.

## Models and Factories Inside Run

Reference rows are best written idempotently through the ORM, so a seeder can run again without duplicating data:

```go
func (s RoleSeeder) Run(ctx context.Context, db *orm.Manager) error {
    for _, name := range []string{"owner", "admin", "member"} {
        if _, err := (orm.Model[models.Role]{}).FirstOrCreate(ctx,
            map[string]any{"name": name}, nil); err != nil {
            return err
        }
    }
    return nil
}
```

Development fixtures come from factories. The `orm/factory` package takes the manager the seeder was handed and a definition; `Create` takes `ctx` and persists:

```go
import "github.com/velocitykode/velocity/orm/factory"

func (s UserSeeder) Run(ctx context.Context, db *orm.Manager) error {
    users := factory.NewFactory(db, "users", func() map[string]interface{} {
        return map[string]interface{}{
            "name":  factory.F().Name(),
            "email": factory.F().Email(),
            "role":  "user",
        }
    })
    users.Count(25).Create(ctx)
    users.State("admin").Count(1).Create(ctx)
    return nil
}
```

Model factories defined under `database/factories` (the `orm/testing` factories that new projects ship) work the same way: `factories.UserFactory(db).Count(5).Create(ctx)`.

## Running Seeders

```bash
vel db seed [--only <name>] [--force]
vel migrate fresh --seed        # drop, migrate, then seed
```

| Flag      | Accepts           | Description                                        |
| --------- | ----------------- | -------------------------------------------------- |
| `--only`  | `=VALUE` or space | Run a single seeder by its `Name()`                |
| `--force` | flag (`-f`)       | Proceed in a production-class environment          |

```bash
vel db seed                 # every registered seeder, in registration order
vel db seed --only role     # one seeder
```

One line is printed per completed seeder, and the run stops at the first failure with the seeder named in the error:

```
→ Seeding database...
✓ region
✓ role
✗ user
velocity/console: seeding failed: seed: seeder user failed: UNIQUE constraint failed: users.email
```

`--only` with a name that is not registered is an error that lists what is registered, including when nothing is registered at all, so a bootstrap script cannot continue believing it seeded something. An empty registry without `--only` prints a hint and exits 0.

Ctrl-C cancels the context the seeders received. The runner checks it between seeders, so an interrupted run finishes the seeder in flight and skips the rest.

## Wiping the Database

```bash
vel db wipe [--force]
```

Drops every table in the current database without running migrations. `--force` / `-f` is the only argument it accepts. Outside production there is no confirmation prompt, so use it only when the database is disposable. To rebuild rather than empty, use `vel migrate fresh`.

## Production Guard

`vel db seed` refuses to run in a production-class environment unless `--force` (`-f`) is passed:

```
vel: refusing to run "db seed" in a production environment (APP_ENV="production"): this command writes seed data; pass --force to proceed
```

The guard is the one used by `db wipe`, `migrate fresh`, and `migrate rollback`: `production`, `prod`, `staging`, and any unrecognised `APP_ENV` value count as production, so a typo cannot disable it. It runs before the application bootstraps. `migrate fresh --seed` is covered by the `migrate fresh` guard, so one `--force` decision applies to both steps. Only the bare `--force` / `-f` flag is recognised; `--force=yes` is rejected as an unknown flag.

## Composing Seeders

A seeder that depends on others calls them directly. `seed.Run` runs a list against the same manager with the same fail-fast semantics:

```go
func (s DevelopmentSeeder) Run(ctx context.Context, db *orm.Manager) error {
    return seed.Run(ctx, db, RoleSeeder{}, UserSeeder{}, PostSeeder{})
}
```

Register the composite in `kernel.go` and it becomes one entry: `vel db seed --only development`.

## Programmatic Use

Outside the CLI, drive seeders with a `Runner`:

```go
runner, err := seed.NewRunner(db)
if err != nil {
    return err
}
if err := runner.Run(ctx, seeders.RoleSeeder{}, seeders.UserSeeder{}); err != nil {
    return err
}
runner.Ran() // []string{"role", "user"}
```

`NewRunner` fails on a nil manager or one without an open connection. In tests, a context that carries a transaction (the transaction-rollback isolation in `orm/testing`) is honoured by every ORM and factory write inside the seeders, so seeding inside a test case rolls back with it.

## Best Practices

- **Reference data is idempotent.** Use `FirstOrCreate` or an explicit lookup so `vel db seed` can run on an existing database without duplicating rows.
- **Order is explicit.** Parents before children in `kernel.go`; a seeder never reaches into the registry to find another one.
- **Fixtures are for non-production environments.** Keep generated users, posts, and orders behind a composite such as `development`, and rely on the production guard for the rest.
- **Seeders are code.** They are compiled with the application, so a seeder that references a renamed column fails at build time, not at deploy time.
