# ADR 002 — Module and core boundaries

## Status
Accepted (2026-07-14)

Frontend choice superseded by ADR 003 (Angular replaces React/Vite).

## Context
The project brief sketches up to eight Maven modules (`ktrdiff-model`, `ktrdiff-parser`,
`ktrdiff-core`, `ktrdiff-adapters`, …) but explicitly allows simplifying the module count as
long as parser, model, engine, adapters, CLI, web and fixture tests stay separated. A future
Spoon plugin must be able to consume the comparison engine as one ordinary Java library.

## Decision
Four Maven modules plus the npm UI:

```
ktrdiff (parent pom)
├── ktrdiff-core           model + parser + normalization + matching + engine
│                          + adapters + modes/config + renderers + fixture-runner library
├── ktrdiff-cli            Picocli front end (compare/inspect/validate/fixtures/git/git-install)
├── ktrdiff-web-api        stateless local HTTP server (JDK com.sun.net.httpserver)
├── ktrdiff-fixture-tests  golden tests binding the fixture runner to fixtures/
└── ktrdiff-web-ui         React + TypeScript + Vite (npm project, not a Maven module)
```

Inside `ktrdiff-core` the separation demanded by the brief is enforced at package level with a
one-directional dependency flow:

```
model  ←  parser  ←  normalize  ←  match  ←  engine  ←  profile (modes)  ←  render
                                      ↑          ↑
                                   adapters ─────┘        fixtures (runner, test support)
```

* `model` has no dependencies on anything else.
* `parser` produces `model` objects from XML and never imports engine/adapters.
* `adapters` implement the `StepAdapter` SPI defined by the engine; the engine discovers them
  through an explicit registry (no classpath scanning).
* `render` and `profile` consume a finished `ChangeSet` only — mode filtering is presentation-time.
* The fixture runner lives in the core (package `fixtures`) so both the CLI (`ktrdiff fixtures`)
  and the JUnit golden tests reuse the exact same verification logic.

## Rationale
* One core jar is precisely what a Spoon plugin, the CLI and the web server all need; splitting
  model/parser/adapters into separate jars would create four nearly-empty artifacts and slow
  every build without adding any real boundary an MVP benefits from.
* Package-level boundaries are cheap to promote to modules later (packages are already
  dependency-clean); the reverse operation is what is expensive.

## Consequences
* `ktrdiff-core` has no dependency on Picocli, on the web server, or on any UI concern.
* The web API depends on core + Jackson only; the CLI on core + Picocli only.
* CI builds: `mvnw verify` (all Java modules incl. golden fixtures) + `npm test/build` for the UI.
