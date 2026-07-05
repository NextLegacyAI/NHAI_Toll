#!/usr/bin/env node
"use strict";
/* Zero-dependency local static server for previewing dist/.
 * Usage: node bin/serve.js [port] [dir]   (defaults: 8080, dist) */
const http = require("http");
const fs = require("fs");
const path = require("path");

const port = +process.argv[2] || 8080;
const root = path.resolve(__dirname, "..", process.argv[3] || "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

if (!fs.existsSync(root)) {
  console.error("Directory not found: " + root);
  console.error("Build the site first: node bin/build.js <your workbook> -o dist/index.html");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(root, urlPath);
  // guard against path traversal outside root
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found: " + urlPath); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log("Serving " + root);
  console.log("  http://localhost:" + port);
  console.log("Press Ctrl+C to stop.");
});
