"use strict";
const fs = require("fs");
const path = require("path");

/** Assemble the single-file site from the embedded payload and src assets. */
function assemble(embedded, srcDir) {
  const read = f => fs.readFileSync(path.join(srcDir, f), "utf8");
  const css = read("style_public.css");
  const app = read("app_public.js");
  const method = read("method_public.html");
  const dataJson = JSON.stringify(embedded);

  const footer =
    '<footer><div class="finner">' +
    '<p class="fabout"><b>About this analysis</b> \u00B7 Prepared by <b>Vivek Gupta</b>, transportation engineering ' +
    'researcher and founder at Deeptraffic \u2014 specialising in traffic analytics, pavement performance and ' +
    'transportation systems. Connect on ' +
    '<a href="https://www.linkedin.com/in/vivekg138/" target="_blank" rel="noopener">LinkedIn</a>.</p>' +
    '<p class="fcontact">For enquiries, detailed datasets or custom analyses: ' +
    '<a href="mailto:vivek@roadsetu.com">vivek@roadsetu.com</a></p>' +
    '<p class="flegal">\u00A9 <span id="yr"></span> Deeptraffic Private Limited \u00B7 All rights reserved \u00B7 ' +
    'Forecasts are model estimates, not investment advice.</p>' +
    "</div></footer>" +
    '<script>document.getElementById("yr").textContent=new Date().getFullYear();</script>';

  return "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n" +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<title>Toll Network Trends \u2014 Deeptraffic</title>\n" +
    "<style>" + css + "</style>\n</head>\n<body>\n" +
    '<header><div class="inner"><div>' +
    '<div class="title">Toll Network Traffic &amp; Revenue Trends</div>' +
    '<div class="sub">Aggregate trends, seasonality and forecasts \u00B7 a Deeptraffic analysis</div>' +
    '</div><button id="method-open">Understand the model</button></div></header>\n' +
    '<main><div id="app"><p style="padding:40px;color:#52616E">Loading\u2026</p></div></main>\n' +
    method + footer +
    "<script>\nconst EMBEDDED = " + dataJson + ";\n</script>\n" +
    "<script>\n" + app + "\n</script>\n</body>\n</html>\n";
}

module.exports = { assemble };
