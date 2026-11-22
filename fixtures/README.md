# Fixtures

Golden test corpus for KTRDiff. **Read-only**: never modify `.ktr` files or `expected.yml`
here — see [docs/fixture-guide.md](../docs/fixture-guide.md) for how fixtures work and how to
add new ones, [docs/fixture-matrix.md](../docs/fixture-matrix.md) for the full inventory, and
[docs/fixture-issues.md](../docs/fixture-issues.md) for documented inconsistencies
(quarantined via `../fixtures-known-issues.yml`).

Run them: `./scripts/ktrdiff fixtures` (or `./mvnw verify`). Single fixture:
`./scripts/ktrdiff fixtures --id select-values-001`.

Layouts supported: `<category>/<case>/` (current), `pdi-<version>/<category>/<case>/`
(version-scoped), each case holding `before/<seed>.ktr`, `after/<seed>.ktr`, `expected.yml`
(legacy flat `before.ktr`/`after.ktr` also accepted).
