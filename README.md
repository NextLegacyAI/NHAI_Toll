<<<<<<< HEAD
# NHAI_Toll
Get IHMCL monthly series and present it
=======
# Toll Network Traffic & Revenue Trends

Single-file toll network trends dashboard by **Deeptraffic Private Limited**.
The entire toolchain is Node.js; the published site is one self-contained HTML
file with hand-drawn SVG charts and **no runtime dependencies** (the only
external requests are OpenStreetMap basemap tiles on the Map tab, with graceful
fallback).

## Data protection by design

The build embeds **aggregates and derived metrics only** — nationwide and state
monthly series plus per-plaza derived indicators (last-12M totals, YoY, trend
growth, next-12M forecast, average toll). Per-plaza time series are consumed by
the build step and never enter the published page. `npm test` includes a
privacy audit that fails the build if any plaza-level series leaks into the
payload. Raw data files are blocked from commits by `.gitignore`.

## Layout

```
bin/build.js            CLI — builds dist/index.html from the consolidated workbook
src/model.js            trend + Fourier seasonality model (log-space OLS)
src/parse.js            CSV (zero-dep) and XLSX (optional SheetJS) input
src/derive.js           aggregation + per-plaza derived metrics (6 metric×category combos)
src/assemble.js         single-file HTML assembly (header, footer, methodology modal)
src/app_public.js       the in-browser application (vanilla JS + SVG)
src/style_public.css    WCAG-AA blue/white stylesheet
src/method_public.html  methodology text ("Understand the model")
test/test.js            zero-dependency test suite (synthetic data)
dist/index.html         built site (committed so Cloudflare Pages deploys as-is)
```

## Usage

```bash
npm install         # only needed for .xlsx input (SheetJS); CSV needs nothing
npm test            # 9 tests: model recovery, parser, derive, privacy audit, e2e build

node bin/build.js Traffic_Modeling_Data_YYYYMMDD.xlsx -o dist/index.html
# or, with the Consolidated sheet exported to CSV:
node bin/build.js consolidated.csv -o dist/index.html
```

## Monthly refresh

1. `node bin/build.js <new workbook> -o dist/index.html`
2. `git commit -am "Data refresh <month>" && git push` — Cloudflare Pages redeploys.

## Deploy (Cloudflare Pages)

Workers & Pages → Create → Pages → Connect to Git → this repository.
Build command: *(none)*. Output directory: `dist`.

## Access control

Protect the deployment with Cloudflare Access (Zero Trust → Access →
Applications → Self-hosted → point at the Pages domain; add an email-OTP or SSO
policy). Authentication is enforced at the edge, before the page is served.

## Model summary

Every series is fit with `log(1+y) = trend + Fourier yearly seasonality`
(Prophet's structural form for monthly data), by ordinary least squares.
Trend p.a. = e^(12b) − 1; ~95% bands from in-sample residuals, widened with
horizon. Full details in the site's "Understand the model" modal.

## Notices

© Deeptraffic Private Limited. All rights reserved.
Forecasts are model estimates, not investment advice.
Basemap © OpenStreetMap contributors.
Enquiries: vivek@roadsetu.com · [LinkedIn](https://www.linkedin.com/in/vivekg138/)
>>>>>>> ccf1e1d (Node.js toll trends toolchain v1: build pipeline, tests, and aggregate-only single-file site)
