#!/usr/bin/env node
// Runs the Python suite with STITCH_PYTHON (or `python`). Kiro sends a failing hook's stderr to the
// agent, and pytest reports failures on stdout, so stdout goes to stderr here.
import { spawnSync } from "node:child_process";

const py = process.env.STITCH_PYTHON || "python";
const r = spawnSync(py, ["-m", "pytest", "tests_py", "-q", "-p", "no:cacheprovider"], {
  stdio: ["ignore", 2, 2],
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
});
if (r.error) console.error(`could not start ${py}: ${r.error.message}`);
process.exit(r.status ?? 1);
