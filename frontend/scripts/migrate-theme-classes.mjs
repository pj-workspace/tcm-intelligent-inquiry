#!/usr/bin/env node
/**
 * One-off migration: replace hardcoded light-theme Tailwind classes with semantic tokens.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const REPLACEMENTS = [
  ["bg-[#fdfdfc]", "bg-background"],
  ["bg-[#fdfbf7]", "bg-background"],
  ["bg-[#fafaf9]", "bg-muted"],
  ["bg-[#fafaf9]/80", "bg-muted/80"],
  ["bg-[#f9f9f8]", "bg-sidebar"],
  ["bg-[#fbfaf7]", "bg-surface-muted"],
  ["bg-[#f5f5f4]", "bg-muted"],
  ["bg-[#fcfbf9]", "bg-muted"],
  ["border-[#e5e5e5]", "border-border"],
  ["border-[#ebe8e3]", "border-card-border"],
  ["border-[#eae8e3]", "border-card-border"],
  ["border-[#e7e5e4]", "border-border"],
  ["border-[#f2f0ec]", "border-card-header-border"],
  ["border-[#eeece6]/80", "border-border/80"],
  ["border-[#e2ddd3]", "border-border"],
  ["border-[#e8e8e8]", "border-border"],
  ["border-[#eadfce]", "border-border"],
  ["text-[#1a1a1a]", "text-foreground"],
  ["text-[#1c1917]", "text-foreground"],
  ["text-[#292524]", "text-foreground"],
  ["bg-[#1a1a1a]", "bg-foreground"],
  ["bg-white/95", "bg-surface/95"],
  ["bg-white/80", "bg-elevated/80"],
  ["bg-white/90", "bg-surface/90"],
  ["bg-white", "bg-surface"],
  ["hover:bg-white", "hover:bg-surface"],
  ["focus-within:bg-white", "focus-within:bg-surface"],
  ["disabled:hover:bg-white", "disabled:hover:bg-surface"],
  ["ring-black/[0.08]", "ring-border/80"],
  ["ring-black/[0.06]", "ring-border/60"],
  ["ring-black/[0.03]", "ring-border/40"],
  ["ring-black/[0.02]", "ring-border/30"],
  ["bg-[#f4f4f4]", "bg-user-bubble"],
  ["text-[#1a1a1a]", "text-foreground"],
  ["bg-[#eee]", "bg-border"],
  ["bg-[#fafafa]", "bg-muted"],
  ["border-orange-200/80", "border-orange-200/80"],
  ["border-gray-200", "border-border"],
  ["border-gray-300", "border-border"],
  ["border-gray-100", "border-border"],
  ["border-stone-200", "border-border"],
  ["divide-[#f2f0ec]", "divide-card-header-border"],
  ["border-[#e8e4dc]", "border-card-border"],
  ["border-[#e6ded2]", "border-border"],
  ["border-[#d9d1c4]", "border-border"],
  ["bg-[#f7f6f3]", "bg-muted"],
  ["bg-[#fafaf8]", "bg-muted"],
  ["bg-[#f7f2ea]", "bg-muted"],
  ["text-[#2b2721]", "text-foreground"],
  ["text-[#2f2a23]", "text-foreground"],
  ["text-[#78716c]", "text-muted-foreground"],
  ["text-[#d6d3d1]", "text-muted-foreground"],
  ["ring-[#eae8e3]", "ring-border"],
  ["ring-[#e7e5e4]", "ring-border"],
  ["hover:bg-gray-50/80", "hover:bg-muted/80"],
  ["hover:bg-gray-50/90", "hover:bg-muted/90"],
  ["hover:bg-gray-50", "hover:bg-muted"],
  ["data-[state=open]:bg-gray-50", "data-[state=open]:bg-muted"],
  ["bg-gray-50/50", "bg-muted/50"],
  ["bg-gray-50", "bg-muted"],
  ["text-gray-900", "text-foreground"],
  ["text-gray-800", "text-foreground"],
  ["text-gray-700", "text-foreground"],
  ["text-gray-600", "text-muted-foreground"],
  ["text-gray-500", "text-muted-foreground"],
  ["text-gray-400", "text-muted-foreground"],
  ["via-white", "via-surface"],
  ["disabled:bg-gray-50", "disabled:bg-muted"],
  ["hover:border-gray-300", "hover:border-border"],
  ["hover:border-gray-400", "hover:border-border"],
  ["border-gray-50", "border-border"],
  ["focus-within:border-gray-400", "focus-within:border-border"],
  ["hover:bg-gray-100", "hover:bg-muted"],
  ["bg-gray-100", "bg-muted"],
  ["bg-gray-200/60", "bg-muted/60"],
  ["bg-gray-200/80", "bg-muted/80"],
  ["bg-gray-200/70", "bg-muted/70"],
  ["bg-gray-200", "bg-muted"],
  ["hover:bg-gray-200/80", "hover:bg-muted/80"],
  ["hover:bg-gray-200/70", "hover:bg-muted/70"],
  ["hover:bg-gray-200", "hover:bg-muted"],
  ["focus:border-gray-400", "focus:border-border"],
  ["focus-within:sm:border-gray-400", "focus-within:sm:border-border"],
  ["text-gray-300", "text-muted-foreground/40"],
  ["hover:text-gray-950", "hover:text-foreground"],
  ["border-[#ebebeb]", "border-border"],
  ["hover:border-[#cfc5b8]", "hover:border-border"],
  ["text-[#3d3d3d]", "text-foreground"],
  ["border-[#eae8e4]", "border-border"],
  ["text-[#374151]", "text-foreground"],
  ["text-[#b4b4b9]", "text-muted-foreground"],
  ["bg-[#f4f4f5]", "bg-muted"],
  ["ring-gray-200", "ring-border"],
  ["hover:bg-gray-800", "hover:opacity-90"],
  ["hover:bg-gray-900", "hover:opacity-90"],
  ["hover:bg-gray-700", "hover:opacity-90"],
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(root).filter(
  (f) => !f.includes("migrate-theme-classes.mjs"),
);

let changed = 0;
for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  let next = src;
  for (const [from, to] of REPLACEMENTS) {
    next = next.split(from).join(to);
  }
  if (next !== src) {
    fs.writeFileSync(file, next);
    changed++;
    console.log("updated:", path.relative(root, file));
  }
}
console.log(`Done. ${changed} files updated.`);
