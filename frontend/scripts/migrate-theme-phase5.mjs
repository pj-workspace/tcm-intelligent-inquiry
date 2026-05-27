#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPLACEMENTS = [
  ["text-white bg-foreground", "text-primary-foreground bg-primary"],
  ["bg-foreground text-white", "bg-primary text-primary-foreground"],
  ["hover:bg-neutral-900", "hover:opacity-90"],
  ["from-orange-50/60 via-surface to-transparent", "from-orange-50/60 via-surface to-transparent dark:from-orange-950/40"],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "scripts") continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(root)) {
  let src = fs.readFileSync(file, "utf8");
  let next = src;
  for (const [from, to] of REPLACEMENTS) next = next.split(from).join(to);
  if (next !== src) {
    fs.writeFileSync(file, next);
    changed++;
  }
}
console.log(`phase5: ${changed} files`);
