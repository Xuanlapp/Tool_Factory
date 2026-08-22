# Platform Phase 1

Goal: build a local-first observation layer around the existing Acrylic runner.

Deliverables:
- Shared contracts for Run, Sheet, Item, Error, Output, and Agent Snapshot.
- JSON telemetry event schema.
- SQLite schema and event store.
- Local Agent folder observer.
- Read-only Control API and SSE scaffold.
- React web shell scaffold.

Non-goals:
- Do not change Illustrator logic, packing, wait, output, done, or error behavior.
- Do not add start, pause, resume, retry, or file-moving actions yet.
- Do not make runner availability depend on NocoDB.

Safe testing: use D:/FFactory/Arcylic/.platform-fixture before pointing the agent at production folders.
