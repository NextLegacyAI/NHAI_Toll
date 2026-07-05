"use strict";
const fs = require("fs");
const path = require("path");

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

/** RFC-4180-ish CSV parser (quotes, embedded commas/newlines). */
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false, i = 0;
  const pushF = () => { row.push(field); field = ""; };
  const pushR = () => { if (row.length > 1 || row[0] !== "") rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ",") { pushF(); i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { pushF(); pushR(); i++; continue; }
    field += ch; i++;
  }
  if (field.length || row.length) { pushF(); pushR(); }
  const hdr = rows.shift();
  return rows.map(r => { const o = {}; hdr.forEach((h, j) => { o[h] = r[j]; }); return o; });
}

/** Parse a month value to key year*12+monthIndex. Accepts ISO, 'Feb-2026', Date, Excel serial. */
function toMonthKey(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.getUTCFullYear() * 12 + v.getUTCMonth();
  if (typeof v === "number") { // Excel serial
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.getUTCFullYear() * 12 + d.getUTCMonth();
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return +m[1] * 12 + (+m[2] - 1);
  m = s.match(/^([A-Za-z]{3,9})[-\s]?(\d{4})$/);
  if (m) { const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); if (mi >= 0) return +m[2] * 12 + mi; }
  const d = new Date(s);
  return isNaN(d) ? null : d.getUTCFullYear() * 12 + d.getUTCMonth();
}

const pick = (r, names) => { for (const n of names) if (r[n] != null && r[n] !== "") return r[n]; return null; };
const num = v => { const x = +v; return isFinite(x) ? x : 0; };

/** Load and normalize records from .csv or .xlsx into
 *  { plaza, state, lat, lon, mk, amt[6], cnt[6], totAmt, totCnt } */
function loadRows(file) {
  const ext = path.extname(file).toLowerCase();
  let raw;
  if (ext === ".csv") {
    raw = parseCSV(fs.readFileSync(file, "utf8"));
  } else if (ext === ".xlsx" || ext === ".xls") {
    let XLSX;
    try { XLSX = require("xlsx"); }
    catch (e) {
      throw new Error("Reading .xlsx needs the optional 'xlsx' package: run `npm install`. " +
        "Alternatively export the Consolidated sheet to CSV and pass the .csv file.");
    }
    const wb = XLSX.readFile(file, { cellDates: true });
    const sheet = wb.SheetNames.includes("Consolidated") ? "Consolidated" : wb.SheetNames[0];
    raw = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null });
  } else {
    throw new Error("Unsupported input: " + ext + " (use .csv or .xlsx)");
  }
  const A = ["CAR_JEEP_AMT","LCV_AMT","BUS_TRUCK_AMT","3_AXLE_AMT","4_6_AXLE_AMT","OSV_AMT"];
  const Cc = ["CAR_JEEP_CNT","LCV_CNT","BUS_TRUCK_CNT","3_AXLE_CNT","4_6_AXLE_CNT","OSV_CNT"];
  const out = []; let skipped = 0;
  for (const r of raw) {
    const plaza = pick(r, ["Plaza Name", "PLAZA_NAME", "Name"]);
    const mk = toMonthKey(pick(r, ["Month_Year", "Month_Label", "Month"]));
    if (!plaza || mk == null) { skipped++; continue; }
    out.push({
      plaza: String(plaza), state: String(pick(r, ["State"]) || "Unknown"),
      lat: +pick(r, ["Lat1", "Lat", "Latitude"]) || null,
      lon: +pick(r, ["Long1", "Long", "Lon", "Longitude"]) || null,
      mk,
      amt: A.map(c => num(r[c])), cnt: Cc.map(c => num(r[c])),
      totAmt: num(r["TOTAL_AMT"]), totCnt: num(r["TOTAL_CNT"]),
    });
  }
  return { rows: out, skipped };
}

module.exports = { parseCSV, toMonthKey, loadRows };
