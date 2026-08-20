import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const COMPILER_BINDING = "@astrojs/compiler-binding";
const WASI_BINDING = "@astrojs/compiler-binding-wasm32-wasi";

const initialLoad = tryLoadCompiler();

if (initialLoad.ok) process.exit(0);
if (process.platform !== "win32") throw initialLoad.error;

const bindingEntry = require.resolve(COMPILER_BINDING);
const bindingPackage = require(join(dirname(bindingEntry), "package.json"));
const packageSpec = `${WASI_BINDING}@${bindingPackage.version}`;
const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(frontendRoot, "..");
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("npm_execpath is required to install Astro's WASI fallback", {
    cause: initialLoad.error,
  });
}

console.warn(
  "Windows bloqueó el compilador nativo de Astro; instalando el fallback WASI oficial...",
);

const temporaryRoot = mkdtempSync(join(tmpdir(), "ares-astro-wasi-"));

try {
  const install = spawnSync(
    process.execPath,
    [
      npmCli,
      "install",
      "--prefix",
      temporaryRoot,
      "--no-save",
      "--package-lock=false",
      "--ignore-scripts",
      "--force",
      "--no-audit",
      "--no-fund",
      "--install-strategy=nested",
      packageSpec,
    ],
    {
      cwd: temporaryRoot,
      env: { ...process.env, npm_config_update_notifier: "false" },
      stdio: "inherit",
    },
  );

  if (install.error) throw install.error;
  if (install.status !== 0) {
    throw new Error(`No fue posible instalar ${packageSpec}`);
  }

  cpSync(
    join(
      temporaryRoot,
      "node_modules",
      "@astrojs",
      "compiler-binding-wasm32-wasi",
    ),
    join(
      repositoryRoot,
      "node_modules",
      "@astrojs",
      "compiler-binding-wasm32-wasi",
    ),
    { recursive: true, force: true },
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

const verification = spawnSync(
  process.execPath,
  ["-e", `require(${JSON.stringify(COMPILER_BINDING)})`],
  {
    cwd: repositoryRoot,
    env: { ...process.env, NAPI_RS_FORCE_WASI: "true" },
    stdio: "ignore",
  },
);

if (verification.error) throw verification.error;
if (verification.status !== 0) {
  throw new Error("El fallback WASI de Astro no pudo inicializarse", {
    cause: initialLoad.error,
  });
}

function tryLoadCompiler() {
  try {
    require(COMPILER_BINDING);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
