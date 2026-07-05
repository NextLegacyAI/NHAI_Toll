"use strict";
/* Zero-dependency test suite: `npm test`. Uses a synthetic dataset so it runs
 * anywhere without the (private) real data. */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { fitSeries } = require("../src/model");
const { parseCSV, toMonthKey, loadRows } = require("../src/parse");
const { derive } = require("../src/derive");
const { assemble } = require("../src/assemble");

let pass = 0;
function T(name, fn) {
  try { fn(); pass++; console.log("ok   " + name); }
  catch (e) { console.error("FAIL " + name + " \u2014 " + e.message); process.exitCode = 1; }
}

/* ---------- model ---------- */
T("model recovers a known 1%/month trend", () => {
  const ts = [], ys = [];
  for (let t = 0; t < 41; t++) {
    ts.push(t);
    ys.push(1e6 * Math.pow(1.01, t) * (1 + 0.05 * Math.sin(2 * Math.PI * t / 12)));
  }
  const f = fitSeries(ts, ys, 4);
  const expected = Math.pow(1.01, 12) - 1; // ~12.68% p.a.
  assert(Math.abs(f.trendPA - expected) < 0.005, "trend " + f.trendPA + " vs " + expected);
  assert(f.r2 > 0.99, "r2 " + f.r2);
});

T("forecast bands widen with horizon", () => {
  const ts = Array.from({ length: 36 }, (_, i) => i);
  const ys = ts.map(t => 1e5 * (1 + 0.02 * t) * (1 + 0.1 * Math.random()));
  const f = fitSeries(ts, ys, 4);
  const a = f.predict(37, 1), b = f.predict(60, 24);
  assert(b.hi / b.mid > a.hi / a.mid, "band should widen");
});

/* ---------- parser ---------- */
T("CSV parser handles quotes and embedded commas", () => {
  const rows = parseCSV('a,b,c\n1,"x, y","say ""hi"""\n2,plain,ok\n');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].b, "x, y");
  assert.strictEqual(rows[0].c, 'say "hi"');
});

T("month parsing: ISO, Mon-YYYY, Excel serial", () => {
  assert.strictEqual(toMonthKey("2026-05-01"), 2026 * 12 + 4);
  assert.strictEqual(toMonthKey("Feb-2026"), 2026 * 12 + 1);
  assert.strictEqual(toMonthKey(45658), 2025 * 12 + 0); // 1 Jan 2025
});

/* ---------- derive on synthetic data ---------- */
function syntheticRows() {
  const rows = [];
  const plazas = [
    { name: "Alpha", state: "State A", lat: 20.0, lon: 78.0, base: 5e7, g: 1.012 },
    { name: "Beta", state: "State A", lat: 21.0, lon: 79.0, base: 3e7, g: 0.995 },
    { name: "Gamma", state: "State B", lat: null, lon: null, base: 1e7, g: 1.0 },
  ];
  for (const p of plazas)
    for (let t = 0; t < 41; t++) {
      const mk = 2023 * 12 + t;
      const tot = p.base * Math.pow(p.g, t) * (1 + 0.04 * Math.sin(2 * Math.PI * t / 12));
      const car = tot * 0.3, com = tot * 0.7;
      rows.push({
        plaza: p.name, state: p.state, lat: p.lat, lon: p.lon, mk,
        amt: [car, com * 0.1, com * 0.4, com * 0.2, com * 0.25, com * 0.05],
        cnt: [tot / 100 * 0.6, tot / 100 * 0.1, tot / 100 * 0.15, tot / 100 * 0.07, tot / 100 * 0.06, tot / 100 * 0.02],
        totAmt: tot, totCnt: tot / 100,
      });
    }
  // duplicate record to test additive de-dup
  rows.push({ ...rows[0] });
  return rows;
}

T("derive: shapes, combos, and duplicate summing", () => {
  const e = derive(syntheticRows());
  assert.strictEqual(e.plazasD.length, 3);
  assert.strictEqual(e.monthKeys.length, 41);
  assert.strictEqual(e.network.length, 41);
  assert.strictEqual(e.netcls[0].length, 12);
  const alpha = e.plazasD.find(p => p.name === "Alpha");
  assert.strictEqual(alpha.c.length, 6);
  assert(alpha.c.every(x => x.length === 4));
  // duplicate row doubled Alpha's first month
  const firstMonthNet = e.network[0][0];
  const raw = syntheticRows().filter(r => r.mk === e.monthKeys[0]).reduce((s, r) => s + r.totAmt, 0);
  assert(Math.abs(firstMonthNet - raw) < 2, "duplicates summed");
});

T("derive: trends have the right sign and forecasts exist", () => {
  const e = derive(syntheticRows());
  const alpha = e.plazasD.find(p => p.name === "Alpha");
  const beta = e.plazasD.find(p => p.name === "Beta");
  assert(alpha.c[0][2] > 0.10, "Alpha grows ~15% p.a., got " + alpha.c[0][2]);
  assert(beta.c[0][2] < 0, "Beta declines, got " + beta.c[0][2]);
  assert(alpha.c[0][3] > alpha.c[0][0], "growing plaza forecast > last 12M");
});

T("privacy: no plaza-level time series in the payload", () => {
  const e = derive(syntheticRows());
  for (const p of e.plazasD)
    for (const [k, v] of Object.entries(p)) {
      if (!Array.isArray(v)) continue;
      if (k === "c") { assert(v.length === 6 && v.every(x => x.length === 4)); continue; }
      if (k === "m") { assert(v.length === 6 && v.every(x => x == null || x.length === 11)); continue; }
      assert(v.length <= 6, "unexpected array on plaza record: " + k);
    }
});

T("plaza model coefficients reconstruct trend and forecast", () => {
  const e = derive(syntheticRows());
  const alpha = e.plazasD.find(p => p.name === "Alpha");
  assert(alpha.m && alpha.m[0], "coefficients embedded for >=24-month plaza");
  const mp = alpha.m[0];
  // trend from coefficients must match the embedded derived trend
  assert(Math.abs(Math.expm1(mp[1] * 12) - alpha.c[0][2]) < 2e-3, "trend consistency");
  // reconstructed 12-month forecast sum must match embedded fcst12
  const evalM = (t, h) => {
    let lf = mp[0] + mp[1] * t;
    for (let k = 1; k <= 4; k++)
      lf += mp[2 + 2 * (k - 1)] * Math.sin(2 * Math.PI * k * t / 12) + mp[3 + 2 * (k - 1)] * Math.cos(2 * Math.PI * k * t / 12);
    return Math.max(Math.expm1(lf), 0);
  };
  let s = 0;
  for (let i = 1; i <= 12; i++) s += evalM(alpha.k1 + i - alpha.k0, i);
  assert(Math.abs(s - alpha.c[0][3]) / alpha.c[0][3] < 0.01, "fcst12 reconstruction: " + s + " vs " + alpha.c[0][3]);
});

T("coordinates: invalid/missing excluded", () => {
  const e = derive(syntheticRows());
  assert.strictEqual(e.plazasD.filter(p => p.la != null).length, 2);
});

/* ---------- end-to-end assembly ---------- */
T("build: CSV -> HTML end to end", () => {
  const hdr = "Plaza Name,State,Lat1,Long1,Month_Year,CAR_JEEP_CNT,CAR_JEEP_AMT,LCV_CNT,LCV_AMT,BUS_TRUCK_CNT,BUS_TRUCK_AMT,3_AXLE_CNT,3_AXLE_AMT,4_6_AXLE_CNT,4_6_AXLE_AMT,OSV_CNT,OSV_AMT,TOTAL_CNT,TOTAL_AMT";
  const lines = [hdr];
  for (let t = 0; t < 41; t++) {
    const y = 2023 + Math.floor(t / 12), m = (t % 12) + 1;
    const tot = 1e6 * (1 + 0.01 * t);
    lines.push(['"Test Plaza"', "State X", 25.1, 80.2, `${y}-${String(m).padStart(2, "0")}-01`,
      5000, tot * 0.3, 500, tot * 0.07, 800, tot * 0.28, 300, tot * 0.14, 250, tot * 0.175, 60, tot * 0.035,
      6910, tot].join(","));
  }
  const tmp = path.join(os.tmpdir(), "toll_test.csv");
  fs.writeFileSync(tmp, lines.join("\n"));
  const { rows } = loadRows(tmp);
  assert.strictEqual(rows.length, 41);
  const html = assemble(derive(rows), path.join(__dirname, "..", "src"));
  assert(html.includes("const EMBEDDED ="), "payload embedded");
  assert(html.includes("Deeptraffic Private Limited"), "copyright");
  assert(html.includes("linkedin.com/in/vivekg138"), "linkedin");
  assert(html.includes("not investment advice"), "disclaimer");
  assert(html.includes("openstreetmap.org"), "osm attribution/tiles");
});

console.log("\n" + pass + " tests passed" + (process.exitCode ? " (with failures)" : ""));
