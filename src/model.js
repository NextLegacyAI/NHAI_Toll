"use strict";
/* Structural time-series model: log1p(y) = linear trend + Fourier yearly seasonality.
   Identical math to the in-browser model in src/app_public.js. */

function lstsq(X, y) {
  const n = X.length, p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) A[j][k] += X[i][j] * X[i][k];
      A[j][p] += X[i][j] * y[i];
    }
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    const tmp = A[col]; A[col] = A[piv]; A[piv] = tmp;
    if (Math.abs(A[col][col]) < 1e-12) continue;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k <= p; k++) A[r][k] -= f * A[col][k];
    }
  }
  return A.map((row, j) => (Math.abs(row[j]) < 1e-12 ? 0 : row[p] / row[j]));
}

function design(t, order) {
  const row = [1, t];
  for (let k = 1; k <= order; k++)
    row.push(Math.sin(2 * Math.PI * k * t / 12), Math.cos(2 * Math.PI * k * t / 12));
  return row;
}

/** Fit on month indices ts (relative) and values ys. Returns trendPA, r2, predict(t,h). */
function fitSeries(ts, ys, order) {
  const ly = ys.map(v => Math.log1p(Math.max(v, 0)));
  const X = ts.map(t => design(t, order));
  const beta = lstsq(X, ly);
  const fit = X.map(r => r.reduce((s, v, j) => s + v * beta[j], 0));
  const resid = ly.map((v, i) => v - fit[i]);
  const sigma = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / Math.max(ly.length - beta.length, 1));
  const mean = ly.reduce((a, b) => a + b, 0) / ly.length;
  const ssTot = ly.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  const r2 = ssTot > 0 ? 1 - resid.reduce((s, r) => s + r * r, 0) / ssTot : NaN;
  const predict = (t, h = 0) => {
    const lf = design(t, order).reduce((s, v, j) => s + v * beta[j], 0);
    const w = 1.96 * sigma * Math.sqrt(1 + h / 24);
    return { mid: Math.max(Math.expm1(lf), 0), lo: Math.max(Math.expm1(lf - w), 0), hi: Math.max(Math.expm1(lf + w), 0) };
  };
  return { beta, sigma, trendPA: Math.expm1(beta[1] * 12), r2, predict };
}

module.exports = { lstsq, design, fitSeries };
