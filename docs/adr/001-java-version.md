# ADR 001 — Java version

## Status
Accepted (2026-07-14)

## Context
The fixtures were produced with Pentaho Data Integration **9.4.0.0-343**. PDI 9.4 officially
supports Java 8 and Java 11 runtimes; a future Spoon plugin must therefore load inside a JVM
that may be as old as Java 8, realistically Java 11 for 9.4 installations. The build machine
has JDK 21; the web UI toolchain (Node 22 + Vite) is independent of Java.

## Decision
* All Java modules (`ktrdiff-core`, `ktrdiff-cli`, `ktrdiff-web-api`, `ktrdiff-fixture-tests`)
  compile with `maven.compiler.release=11` → class file version 55, loadable by PDI 9.4's
  supported JVMs (Java 11) and by anything newer.
* The build itself runs on any JDK ≥ 11 (CI and local dev use JDK 17/21; `--release` guarantees
  no accidental use of post-11 APIs).
* The web server module uses only the JDK built-in `com.sun.net.httpserver` — no framework — so
  it also stays at release 11; no split runtime is needed for the MVP.
* Dependencies are chosen to be Java-8/11 compatible: Jackson 2.x, SnakeYAML (via Jackson YAML),
  Picocli, java-diff-utils, JUnit 5, AssertJ.

## Consequences
* No records, sealed types, or `List.of()` beyond Java 11 APIs in the Java sources.
* A future Spoon plugin for PDI 9.4 can depend on `ktrdiff-core` directly as a plain library.
* If a Java-8 target is ever required (older PDI), the release level can be lowered; only
  `var`, `String::strip`, and small Java 9–11 APIs would need review.

## Alternatives considered
* **Release 8**: safest for very old PDI, but loses convenient Java 9–11 APIs and modern
  dependency baselines for no observed requirement (fixtures say 9.4).
* **Release 17/21 core + separate 11 shim**: unnecessary complexity; nothing in the core needs
  post-11 language features.
