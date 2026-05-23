import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, "..");
const projectRoot = resolve(frontendRoot, "..");
const source = resolve(frontendRoot, "dist");
const target = resolve(projectRoot, "dist");

const projectRootWithSep = projectRoot.endsWith(sep) ? projectRoot : `${projectRoot}${sep}`;
if (!target.startsWith(projectRootWithSep) || target === projectRoot) {
  throw new Error(`Refusing to sync Vercel output outside the project root: ${target}`);
}

if (!existsSync(source)) {
  throw new Error(`Frontend build output was not found: ${source}`);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Synced Vercel output to ${target}`);
