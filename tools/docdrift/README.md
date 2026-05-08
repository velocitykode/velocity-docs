# docdrift

Staleness detector for the Velocity docs. Walks every exported symbol in the
Velocity framework (via Go AST), looks each one up in the doc page(s) it's
mapped to (`data/api-mapping.yaml`), and reports anything missing.

## Usage

From the velocity-docs repo root, with the `velocity` framework checkout
sitting next to it:

```bash
# full report (text, exits 1 on drift)
go run ./tools/docdrift \
    --velocity ../velocity \
    --mapping data/api-mapping.yaml \
    --docs    content/docs

# per-package counts only
go run ./tools/docdrift --summary

# focus on one package
go run ./tools/docdrift --package auth

# machine-readable (used by the /fix-docs Claude command)
go run ./tools/docdrift --json --strict=false > drift.json
```

The tool has its own `go.mod` so it doesn't pull deps into the docs repo
itself.

## Flags

| flag | default | meaning |
|---|---|---|
| `--velocity` | `../velocity` | path to the framework checkout |
| `--mapping` | `data/api-mapping.yaml` | package → docs-page mapping |
| `--docs` | `content/docs` | docs content root |
| `--package` | (all) | restrict to one package (top-level or full path) |
| `--summary` | false | per-package counts, no symbol list |
| `--json` | false | emit a single JSON report |
| `--strict` | true | exit 1 when drift is found (set `=false` for reporting) |

## What counts as drift

A symbol is "covered" when its identifier appears as a whole word in any of
the doc pages mapped to its package. Methods (`Type.Method`) match either the
dotted form *or* the bare method name when the receiver type also appears on
the page. Sub-packages (`auth/drivers/session`) inherit their top-level
parent's mapping.

The detector does **not** verify signatures or behaviors - only that the
identifier is mentioned. False positives are possible (e.g. an old method
name still in prose after rename); they show up as "missing" and need a
human eye. False negatives are rarer and indicate the mapping or coverage
rule needs tightening.

## Adding a new package

1. Add the package to `data/api-mapping.yaml` under `packages:` with the
   docs page(s) that cover it. Use a list if it spans multiple pages.
2. Or add it under `ignored:` with a comment explaining why it has no
   user-facing surface.

The detector flags any unmapped package as drift, so silence here is
intentional.
