#!/usr/bin/env node
// Fails (exit 1) if any Markdown file in the repository, or any file passed as an argument,
// contains an em dash (U+2014) or en dash (U+2013). Used by .kiro/hooks/dash-check.json.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const SKIP = new Set(["node_modules", "dist", ".git", ".vercel", ".netlify", "coverage"]);
const BAD = [0x2014, 0x2013];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(md|markdown)$/i.test(name)) out.push(full);
  }
  return out;
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : walk(root, []);
let hits = 0;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (let c = 0; c < line.length; c++) {
      if (BAD.includes(line.codePointAt(c))) {
        hits++;
        console.error(`${relative(root, file)}:${i + 1}:${c + 1} U+${line.codePointAt(c).toString(16).toUpperCase()}`);
      }
    }
  });
}
if (hits) {
  console.error(`dash-check: ${hits} dash character(s) found in ${files.length} file(s).`);
  process.exit(1);
}
console.log(`dash-check: 0 dash characters in ${files.length} Markdown file(s).`);
