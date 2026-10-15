import { posix } from "node:path";

export const MAX_LINES = 120;
const headings = [
  "Objetivo y alcance",
  "Reglas y criterios de aceptación",
  "Diseño y evidencia",
  "Tareas y pendientes",
];

/** Pure policy checks; exists receives a repository-relative POSIX path. */
export function checkDocuments(documents, exists) {
  const errors = [];
  for (const [file, source] of Object.entries(documents)) {
    const text = source.replace(/\r\n/g, "\n").trimEnd();
    if (text.split("\n").length > MAX_LINES)
      errors.push(
        `${file}: supera ${MAX_LINES} líneas; dividir por subfeature`,
      );
    if (/\b(?:back|front)end[\s-]*[12]\b/i.test(text))
      errors.push(`${file}: sustituir reparto numerado por features`);

    // Inline links/images only; ignore external URLs and same-page anchors.
    for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const href = match[1].replace(/^<|>$/g, "").split(/\s+["']/)[0];
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(href)) continue;
      const path = decodeURIComponent(href.split(/[?#]/)[0]);
      const target = posix.normalize(posix.join(posix.dirname(file), path));
      if (!exists(target)) errors.push(`${file}: enlace local roto: ${href}`);
    }

    const spec = /^docs\/sdd\/([^/]+)\/spec\.md$/.exec(file);
    if (!spec) continue;
    if (!text.includes(`ID: \`${spec[1]}\``))
      errors.push(`${file}: ID debe coincidir con la carpeta`);
    if (
      !/Estado: (?:propuesta|implementada|parcial|condicionada) · Revisión: \d{4}-\d{2}-\d{2}/.test(
        text,
      )
    )
      errors.push(`${file}: falta estado/revisión SDD`);
    for (const heading of headings)
      if (!text.includes(`\n## ${heading}\n`))
        errors.push(`${file}: falta sección ${heading}`);
    const criteria = [...text.matchAll(/\*\*AC-(\d+):\*\*/g)].map((m) => m[1]);
    if (!criteria.length || new Set(criteria).size !== criteria.length)
      errors.push(`${file}: criterios ausentes o duplicados`);
    const tasks = [
      ...text.matchAll(
        /^- \[[ x]\] \*\*T(\d+) · (?:código|validación|externo) · AC-(\d+(?:\/\d+)*):\*\*/gm,
      ),
    ];
    if (!tasks.length || new Set(tasks.map((m) => m[1])).size !== tasks.length)
      errors.push(`${file}: tareas ausentes o IDs duplicados`);
    for (const task of tasks)
      for (const id of task[2].split("/"))
        if (!criteria.includes(id))
          errors.push(`${file}: T${task[1]} referencia AC-${id} inexistente`);
    if (tasks.length !== [...text.matchAll(/^- \[[ x]\]/gm)].length)
      errors.push(`${file}: tarea sin ID, tipo o criterio`);
    if (!documents["docs/index.md"]?.includes(`sdd/${spec[1]}/spec.md`))
      errors.push(`${file}: feature ausente del índice`);
  }
  return errors;
}
