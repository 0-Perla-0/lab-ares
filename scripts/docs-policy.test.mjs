import assert from "node:assert/strict";
import test from "node:test";
import { checkDocuments, MAX_LINES } from "./docs-policy.mjs";

const file = "docs/sdd/example/spec.md";
const valid = `# Example
ID: \`example\` · Estado: propuesta · Revisión: 2026-10-15

## Objetivo y alcance
Scope.
## Reglas y criterios de aceptación
- **AC-1:** Observable.
## Diseño y evidencia
[Source](../../../src/example.ts) · [Web](https://example.com) · [Anchor](#example).
## Tareas y pendientes
- [ ] **T1 · código · AC-1:** Deliver.
`;
const inspect = (text, exists = () => true, index = "sdd/example/spec.md") =>
  checkDocuments({ [file]: text, "docs/index.md": index }, exists);

test("accepts a short indexed SDD with valid local/external links", () => {
  const targets = [];
  assert.deepEqual(
    inspect(valid, (target) => targets.push(target)),
    [],
  );
  assert.deepEqual(targets, ["src/example.ts"]);
});
test("accepts exactly the line limit, rejects exceeding it and supports CRLF", () => {
  assert.deepEqual(
    checkDocuments({ "README.md": "line\r\n".repeat(MAX_LINES) }, () => true),
    [],
  );
  assert.match(
    checkDocuments(
      { "README.md": "line\n".repeat(MAX_LINES + 1) },
      () => true,
    )[0],
    /supera/,
  );
});
test("rejects broken local links", () => {
  assert.match(inspect(valid, () => false)[0], /enlace local roto/);
});
test("rejects numbered layer ownership", () => {
  assert.match(
    inspect(`${valid}\nBackend 2 owns this.`)[0],
    /reparto numerado/,
  );
});
test("requires sections, metadata, matching ID and index entry", () => {
  for (const removed of [
    "Objetivo y alcance",
    "Estado: propuesta",
    "ID: `example`",
  ]) {
    assert.ok(inspect(valid.replace(removed, "missing")).length);
  }
  assert.match(inspect(valid, () => true, "")[0], /ausente del índice/);
});
test("rejects absent, malformed, duplicate or dangling task/criterion IDs", () => {
  for (const text of [
    valid.replace("AC-1:** Observable", "AC-2:** Observable"),
    valid.replace("T1 · código · AC-1", "T1 · backend · AC-1"),
    valid + "\n- [ ] **T1 · validación · AC-1:** Duplicate.",
    valid + "\n- **AC-1:** Duplicate.",
    valid.replace("**AC-1:**", "Criterion:"),
    valid.replace(/^- \[ \].*$/m, "No task"),
  ])
    assert.ok(inspect(text).length);
});
