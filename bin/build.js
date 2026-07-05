#!/usr/bin/env node
"use strict";
/* Build the single-file toll trends site.
 * Usage: node bin/build.js <consolidated.(csv|xlsx)> [-o dist/index.html] */
const fs = require("fs");
const path = require("path");
const { loadRows } = require("../src/parse");
const { derive } = require("../src/derive");
const { assemble } = require("../src/assemble");

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === "-h" || args[0] === "--help") {
    console.log("Usage: node bin/build.js <consolidated.(csv|xlsx)> [-o dist/index.html]");
    process.exit(args.length ? 0 : 1);
  }
  const input = args[0];
  const oIdx = args.indexOf("-o");
  const out = oIdx >= 0 ? args[oIdx + 1] : path.join(__dirname, "..", "dist", "index.html");

  console.log("Reading", input, "...");
  const { rows, skipped } = loadRows(input);
  console.log("  " + rows.length.toLocaleString() + " records" + (skipped ? " (" + skipped + " skipped)" : ""));

  console.log("Fitting per-plaza models and deriving metrics ...");
  const t0 = Date.now();
  const embedded = derive(rows);
  console.log("  " + embedded.plazasD.length + " plazas, " + embedded.monthKeys.length +
    " months, " + Object.keys(embedded.states).length + " states  (" + ((Date.now() - t0) / 1000).toFixed(1) + "s)");

  const html = assemble(embedded, path.join(__dirname, "..", "src"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log("Wrote", out, "(" + (html.length / 1e3).toFixed(0) + " KB) \u2014 aggregates + derived metrics only.");
}

main();
