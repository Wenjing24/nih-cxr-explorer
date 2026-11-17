import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const candidates = process.platform === "win32"
  ? [resolve(root, ".venv", "Scripts", "python.exe")]
  : [resolve(root, ".venv", "bin", "python")];
const python = candidates.find(existsSync);

if (!python) {
  console.error("Python environment not found. Run setup.ps1 first.");
  process.exit(1);
}

const result = spawnSync(
  python,
  [resolve(root, "preprocess", "preprocess.py"), ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
