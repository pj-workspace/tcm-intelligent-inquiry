#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPLACEMENTS = [
  ["focus:border-gray-400", "focus:border-border"],
  ["focus-within:sm:border-gray-400", "focus-within:sm:border-border"],
  ["hover:bg-gray-800", "hover:opacity-90"],
  ["hover:bg-gray-900", "hover:opacity-90"],
  ["hover:bg-gray-700", "hover:opacity-90"],
  ["hover:bg-gray-200/80", "hover:bg-muted/80"],
  ["hover:bg-gray-200/70", "hover:bg-muted/70"],
  ["hover:bg-gray-200", "hover:bg-muted"],
  ["bg-gray-200/70", "bg-muted/70"],
  ["bg-gray-200", "bg-muted"],
  ["text-gray-300", "text-muted-foreground/40"],
  ["bg-gray-900", "bg-foreground"],
  ["bg-black", "bg-foreground"],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "scripts") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
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
console.log(`phase4: ${changed} files`);
