#!/usr/bin/env node
// One-shot codemod for Phase 5b. Replaces:
//   supabase.from('activity_events').insert({ ... });
// → supabase.from('activity_events').insert({ ... } as never);
//
// Also tags `series` and `approval_authority_matrix` from() calls with
//   .from('series')      → .from('series' as never)
// to bypass the not-yet-regenerated Database types.
//
// Run: node scripts/phase5b-cast-fixup.cjs
// Idempotent — checks for existing `as never` before patching.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TARGET_DIR = path.join(ROOT, 'app', 'api');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

function fixActivityInsert(src) {
  // Match `.from('activity_events').insert({ ... })` with balanced braces.
  // Naive but safe enough — the bodies don't contain raw `})` strings.
  const re = /\.from\(['"]activity_events['"]\)\.insert\(\{([\s\S]*?)\}\)/g;
  return src.replace(re, (whole, inner) => {
    if (whole.includes('} as never)')) return whole;
    return `.from('activity_events').insert({${inner}} as never)`;
  });
}

function fixSeriesTable(src) {
  return src
    .replace(/\.from\('series'\)/g, ".from('series' as never)")
    .replace(/\.from\('approval_authority_matrix'\)/g, ".from('approval_authority_matrix' as never)");
}

function fixEpisodeAssetUpdate(src) {
  // Episodes/assets `.update(patch as never)` already handled inline; but the
  // generic pattern `.update({ ... })` with an inferred wider record type is
  // also problematic. Search for occurrences and cast.
  const re = /\.update\(([a-zA-Z_][\w]*)\)/g;
  return src.replace(re, (whole, varName) => {
    // Only patch if the named variable is a plain object (heuristic)
    if (whole.includes(' as never')) return whole;
    if (varName === 'patch' || varName === 'epPayload' || varName === 'insertPayload') {
      return `.update(${varName} as never)`;
    }
    return whole;
  });
}

let total = 0;
for (const file of walk(TARGET_DIR)) {
  const orig = fs.readFileSync(file, 'utf8');
  let out = orig;
  out = fixActivityInsert(out);
  out = fixSeriesTable(out);
  out = fixEpisodeAssetUpdate(out);
  if (out !== orig) {
    fs.writeFileSync(file, out, 'utf8');
    total += 1;
    console.log(`patched ${path.relative(ROOT, file)}`);
  }
}
console.log(`done — ${total} files updated`);
