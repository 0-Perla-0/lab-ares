import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDocuments } from "./docs-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Git excludes generated/third-party docs while including new untracked specs.
const files = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "*.md",
  ],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter((file) => file && existsSync(resolve(root, file)));
const documents = Object.fromEntries(
  [...new Set(files)].map((file) => [
    file,
    readFileSync(resolve(root, file), "utf8"),
  ]),
);
const errors = checkDocuments(documents, (file) =>
  existsSync(resolve(root, file)),
);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `SDD válido: ${Object.keys(documents).length} Markdown breves, enlaces y estructura correctos.`,
  );
}
