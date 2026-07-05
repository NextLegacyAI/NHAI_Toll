"use strict";
const { fitSeries } = require("./model");

/* combos in fixed order matching the frontend: amt/cnt x total/pas/com */
const COMBOS = [["amt","total"],["amt","pas"],["amt","com"],["cnt","total"],["cnt","pas"],["cnt","com"]];

function comboValue(rec, metric, cat) {
  // rec: { totAmt, totCnt, amt[6], cnt[6] } with class 0 = Car/Jeep/Van (passenger)
  if (cat === "total") return metric === "amt" ? rec.totAmt : rec.totCnt;
  const arr = metric === "amt" ? rec.amt : rec.cnt;
  if (cat === "pas") return arr[0];
  return arr[1] + arr[2] + arr[3] + arr[4] + arr[5];
}

/** Build the embedded payload: aggregates + derived metrics only. */
function derive(rows, title) {
  // 1. aggregate duplicates to one record per plaza-month (transactions are additive)
  const plazaMap = new Map(); // plaza -> { state, lat, lon, months: Map(mk -> rec) }
  for (const r of rows) {
    if (!plazaMap.has(r.plaza)) {
      const ok = r.lat != null && r.lon != null && r.lat > 5 && r.lat < 40 && r.lon > 65 && r.lon < 100;
      plazaMap.set(r.plaza, { state: r.state, lat: ok ? +r.lat.toFixed(4) : null, lon: ok ? +r.lon.toFixed(4) : null, months: new Map() });
    } else {
      const p0 = plazaMap.get(r.plaza);
      if (p0.lat == null && r.lat != null && r.lat > 5 && r.lat < 40 && r.lon > 65 && r.lon < 100) {
        p0.lat = +r.lat.toFixed(4); p0.lon = +r.lon.toFixed(4);
      }
    }
    const p = plazaMap.get(r.plaza);
    if (!p.months.has(r.mk))
      p.months.set(r.mk, { totAmt: 0, totCnt: 0, amt: [0,0,0,0,0,0], cnt: [0,0,0,0,0,0] });
    const m = p.months.get(r.mk);
    m.totAmt += r.totAmt; m.totCnt += r.totCnt;
    for (let j = 0; j < 6; j++) { m.amt[j] += r.amt[j]; m.cnt[j] += r.cnt[j]; }
  }

  const allKeys = new Set();
  for (const p of plazaMap.values()) for (const k of p.months.keys()) allKeys.add(k);
  const monthKeys = [...allKeys].sort((a, b) => a - b);
  const lastK = monthKeys[monthKeys.length - 1];
  const idxOf = new Map(monthKeys.map((k, i) => [k, i]));

  // 2. per-plaza derived metrics for all 6 combos
  const plazasD = [];
  const zeroTup = () => [0, 0, 0, 0, 0, 0];
  const network = monthKeys.map(zeroTup);
  const netcls = monthKeys.map(() => new Array(12).fill(0));
  const statesAgg = new Map();

  for (const [name, p] of plazaMap) {
    const ks = [...p.months.keys()].sort((a, b) => a - b);
    // accumulate aggregates
    if (!statesAgg.has(p.state)) statesAgg.set(p.state, { tup: monthKeys.map(zeroTup), plazas: 0 });
    const st = statesAgg.get(p.state);
    st.plazas++;
    let totCnt12 = 0, totAmt12 = 0;
    for (const k of ks) {
      const rec = p.months.get(k), i = idxOf.get(k);
      const t = [rec.totAmt, rec.totCnt, rec.amt[0], rec.cnt[0],
        comboValue(rec, "amt", "com"), comboValue(rec, "cnt", "com")];
      for (let j = 0; j < 6; j++) { network[i][j] += t[j]; st.tup[i][j] += t[j]; }
      for (let j = 0; j < 6; j++) { netcls[i][j] += rec.amt[j]; netcls[i][6 + j] += rec.cnt[j]; }
      if (k > lastK - 12) { totAmt12 += rec.totAmt; totCnt12 += rec.totCnt; }
    }
    // derived combos + model coefficients (coefficients only — never actual series)
    const mparams = [];
    const c = COMBOS.map(([metric, cat]) => {
      let sel12 = 0, prev = 0, n12 = 0, nPrev = 0;
      for (const k of ks) {
        const v = comboValue(p.months.get(k), metric, cat);
        if (k > lastK - 12) { sel12 += v; n12++; }
        else if (k > lastK - 24) { prev += v; nPrev++; }
      }
      const yoy = (n12 === 12 && nPrev === 12 && prev > 0) ? +(sel12 / prev - 1).toFixed(4) : null;
      let trend = null, fc12 = null, mp = null;
      if (ks.length >= 24) {
        const f = fitSeries(ks.map(k => k - ks[0]), ks.map(k => comboValue(p.months.get(k), metric, cat)), 4);
        if (isFinite(f.trendPA)) {
          trend = +f.trendPA.toFixed(4);
          let s = 0;
          for (let i = 1; i <= 12; i++) s += f.predict(ks[ks.length - 1] + i - ks[0], i).mid;
          fc12 = Math.round(s);
          mp = [+f.beta[0].toFixed(4), +f.beta[1].toFixed(6)]
            .concat(f.beta.slice(2).map(b => +b.toFixed(5)))
            .concat([+f.sigma.toFixed(4)]);
        }
      }
      mparams.push(mp);
      return [Math.round(sel12), yoy, trend, fc12];
    });
    plazasD.push({
      name, s: p.state, la: p.lat, lo: p.lon, n: ks.length,
      act: ks[ks.length - 1] > lastK - 3 ? 1 : 0,
      avg: totCnt12 > 0 ? +(totAmt12 / totCnt12).toFixed(1) : null,
      k0: ks[0], k1: ks[ks.length - 1],
      c, m: mparams.some(x => x) ? mparams : null,
    });
  }

  const states = {};
  for (const [s, v] of statesAgg) states[s] = v.tup.map(t => t.map(Math.round));

  return {
    title: title || "NHAI FASTag toll network \u2014 aggregate trends",
    monthKeys,
    network: network.map(t => t.map(Math.round)),
    states,
    netcls: netcls.map(t => t.map(Math.round)),
    plazasD,
  };
}

module.exports = { derive, comboValue, COMBOS };
