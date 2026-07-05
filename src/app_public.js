"use strict";
/* ====== Toll Trends — public build (aggregates + derived metrics only) ====== */
const C = { navy:"#123F6D", blue:"#175A96", lblue:"#5B9BD5", text:"#1E293B",
  line:"#D7DEE6", muted:"#52616E", red:"#B91C1C", green:"#15803D", amber:"#B45309" };
const CLASS_COLORS = ["#123F6D","#2E6DA4","#5B9BD5","#0E7490","#B45309","#64748B"];
const CLASS_NAMES = ["Car/Jeep/Van","LCV","Bus/Truck","3-Axle","4-6 Axle","OSV"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CAT_LABEL = { total:"All vehicles", pas:"Passenger (Car/Jeep/Van)", com:"Commercial (LCV + trucks + buses + OSV)" };
const CAT_SHORT = { total:"Total", pas:"Passenger", com:"Commercial" };
const METRIC_LABEL = { amt:"Revenue", cnt:"Traffic" };
const COMBO_IDX = { amt_total:0, amt_pas:1, amt_com:2, cnt_total:3, cnt_pas:4, cnt_com:5 };

/* ---------- model ---------- */
function lstsq(X,y){
  const n=X.length,p=X[0].length;
  const A=Array.from({length:p},()=>new Array(p+1).fill(0));
  for(let i=0;i<n;i++) for(let j=0;j<p;j++){
    for(let k=0;k<p;k++) A[j][k]+=X[i][j]*X[i][k];
    A[j][p]+=X[i][j]*y[i];
  }
  for(let col=0;col<p;col++){
    let piv=col;
    for(let r=col+1;r<p;r++) if(Math.abs(A[r][col])>Math.abs(A[piv][col])) piv=r;
    const tmp=A[col];A[col]=A[piv];A[piv]=tmp;
    if(Math.abs(A[col][col])<1e-12) continue;
    for(let r=0;r<p;r++){ if(r===col) continue;
      const f=A[r][col]/A[col][col];
      for(let k=col;k<=p;k++) A[r][k]-=f*A[col][k]; }
  }
  return A.map((row,j)=>Math.abs(row[j])<1e-12?0:row[p]/row[j]);
}
function design(t,order){
  const row=[1,t];
  for(let k=1;k<=order;k++) row.push(Math.sin(2*Math.PI*k*t/12),Math.cos(2*Math.PI*k*t/12));
  return row;
}
function fitSeries(ts,ys,order){
  const ly=ys.map(v=>Math.log1p(Math.max(v,0)));
  const X=ts.map(t=>design(t,order));
  const beta=lstsq(X,ly);
  const fit=X.map(r=>r.reduce((s,v,j)=>s+v*beta[j],0));
  const resid=ly.map((v,i)=>v-fit[i]);
  const sigma=Math.sqrt(resid.reduce((s,r)=>s+r*r,0)/Math.max(ly.length-beta.length,1));
  const mean=ly.reduce((a,b)=>a+b,0)/ly.length;
  const ssTot=ly.reduce((s,v)=>s+(v-mean)*(v-mean),0);
  const r2=ssTot>0?1-resid.reduce((s,r)=>s+r*r,0)/ssTot:NaN;
  const seas=new Array(12).fill(0);
  for(let m=0;m<12;m++) for(let k=1;k<=order;k++)
    seas[m]+=beta[2+2*(k-1)]*Math.sin(2*Math.PI*k*m/12)+beta[3+2*(k-1)]*Math.cos(2*Math.PI*k*m/12);
  const sMean=seas.reduce((a,b)=>a+b,0)/12;
  const sIdx=seas.map(v=>Math.exp(v-sMean));
  const predict=(t,h)=>{ h=h||0;
    const lf=design(t,order).reduce((s,v,j)=>s+v*beta[j],0);
    const w=1.96*sigma*Math.sqrt(1+h/24);
    return { mid:Math.max(Math.expm1(lf),0), lo:Math.max(Math.expm1(lf-w),0), hi:Math.max(Math.expm1(lf+w),0) }; };
  return { predict, sIdx, trendPA:Math.expm1(beta[1]*12), r2 };
}
const keyToLabel=k=>MONTHS[k%12]+"-"+Math.floor(k/12);
/* Evaluate embedded model coefficients mp=[a,b,f1..f8,sigma] at relative month t, h steps ahead */
function evalModel(mp,t,h){
  h=h||0;
  let lf=mp[0]+mp[1]*t;
  for(let k=1;k<=4;k++)
    lf+=mp[2+2*(k-1)]*Math.sin(2*Math.PI*k*t/12)+mp[3+2*(k-1)]*Math.cos(2*Math.PI*k*t/12);
  const w=1.96*mp[10]*Math.sqrt(1+h/24);
  return { mid:Math.max(Math.expm1(lf),0), lo:Math.max(Math.expm1(lf-w),0), hi:Math.max(Math.expm1(lf+w),0) };
}
/* month tuple: [amt,cnt,pasA,pasC,comA,comC] */
function tupVal(t,metric,cat){
  if(cat==="total") return metric==="amt"?t[0]:t[1];
  if(cat==="pas") return metric==="amt"?t[2]:t[3];
  return metric==="amt"?t[4]:t[5];
}

/* ---------- formatting ---------- */
function inCompact(v){
  if(v==null||isNaN(v)) return "\u2013";
  const a=Math.abs(v);
  if(a>=1e7) return (v/1e7).toLocaleString("en-IN",{maximumFractionDigits:a>=1e9?0:1})+" cr";
  if(a>=1e5) return (v/1e5).toLocaleString("en-IN",{maximumFractionDigits:1})+" L";
  if(a>=1e3) return (v/1e3).toLocaleString("en-IN",{maximumFractionDigits:0})+"k";
  return Math.round(v).toLocaleString("en-IN");
}
const vfOf=metric=>v=>metric==="amt"?"\u20B9"+inCompact(v):inCompact(v)+" txns";
const fmtPct=v=>(v==null||isNaN(v))?"\u2013":(v>=0?"+":"")+(v*100).toFixed(1)+"%";
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const trendColor=t=>t==null?"#8A97A5":t<-0.10?"#B91C1C":t<0?"#C2660A":t<0.10?"#3F8F5B":"#123F6D";

/* ---------- downloads ---------- */
function downloadCSV(name,rows){
  const csv=rows.map(r=>r.map(v=>{
    if(v==null) return "";
    const s=String(v);
    return /[",\n]/.test(s)?('"'+s.replace(/"/g,'""')+'"'):s;
  }).join(",")).join("\n");
  const a=document.createElement("a");
  a.download=name+".csv";
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  document.body.appendChild(a); a.click(); a.remove();
}
function svgToPng(container,name){
  const svg=container.querySelector("svg"); if(!svg) return;
  const w=+svg.getAttribute("width")||900, h=+svg.getAttribute("height")||360;
  const xml=new XMLSerializer().serializeToString(svg);
  const url=URL.createObjectURL(new Blob([xml],{type:"image/svg+xml;charset=utf-8"}));
  const img=new Image();
  img.onload=function(){
    const c=document.createElement("canvas"); c.width=w*2; c.height=h*2;
    const ctx=c.getContext("2d");
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height);
    ctx.scale(2,2); ctx.drawImage(img,0,0);
    URL.revokeObjectURL(url);
    try{
      const a=document.createElement("a"); a.download=name+".png"; a.href=c.toDataURL("image/png");
      document.body.appendChild(a); a.click(); a.remove();
    }catch(e){ alert("PNG export unavailable for this chart in your browser."); }
  };
  img.src=url;
}
function dlButtons(getCsv,chartDiv,name){
  const d=document.createElement("div"); d.className="dl";
  const b1=document.createElement("button"); b1.textContent="\u2913 CSV";
  b1.addEventListener("click",()=>downloadCSV(name,getCsv()));
  const b2=document.createElement("button"); b2.textContent="\u2913 PNG";
  b2.addEventListener("click",()=>svgToPng(chartDiv,name));
  d.appendChild(b1); d.appendChild(b2);
  return d;
}

/* ================= SVG chart helpers ================= */
const SVGNS="http://www.w3.org/2000/svg";
function svgEl(tag,attrs){ const e=document.createElementNS(SVGNS,tag);
  for(const k in attrs) e.setAttribute(k,attrs[k]); return e; }
function niceTicks(max){
  if(max<=0) return [0,1];
  const raw=max/4, mag=Math.pow(10,Math.floor(Math.log10(raw)));
  const step=[1,2,2.5,5,10].map(m=>m*mag).find(s=>s>=raw)||10*mag;
  const ticks=[]; for(let v=0;v<=max+1e-9;v+=step) ticks.push(v);
  if(ticks[ticks.length-1]<max) ticks.push(ticks[ticks.length-1]+step);
  return ticks;
}
function lineChart(container,opts){
  container.innerHTML="";
  const W=container.clientWidth||900, H=opts.height||360;
  const P={l:70,r:14,t:14,b:34};
  const labels=opts.labels,n=labels.length;
  let ymax=0;
  opts.series.forEach(s=>s.values.forEach(v=>{ if(v!=null&&v>ymax) ymax=v; }));
  if(opts.band) opts.band.forEach(b=>{ if(b&&b[1]>ymax) ymax=b[1]; });
  const ticks=niceTicks(ymax); ymax=ticks[ticks.length-1];
  const x=i=>P.l+(n<=1?0:(i/(n-1))*(W-P.l-P.r));
  const y=v=>H-P.b-(v/ymax)*(H-P.t-P.b);
  const svg=svgEl("svg",{width:W,height:H,role:"img"});
  svg.appendChild(svgEl("rect",{x:0,y:0,width:W,height:H,fill:"#fff"}));
  ticks.forEach(tv=>{
    svg.appendChild(svgEl("line",{x1:P.l,x2:W-P.r,y1:y(tv),y2:y(tv),stroke:C.line}));
    const t=svgEl("text",{x:P.l-8,y:y(tv)+4,"text-anchor":"end","font-size":11,fill:C.muted});
    t.textContent=(opts.yFmt||inCompact)(tv); svg.appendChild(t);
  });
  const step=Math.ceil(n/14);
  labels.forEach((lb,i)=>{ if(i%step!==0&&i!==n-1) return;
    const t=svgEl("text",{x:x(i),y:H-P.b+16,"text-anchor":"middle","font-size":10,fill:C.muted});
    t.textContent=lb; svg.appendChild(t); });
  if(opts.band){
    let d="",back="",started=false;
    opts.band.forEach((b,i)=>{ if(!b) return;
      d+=(started?" L":"M")+x(i)+" "+y(b[1]); back=" L"+x(i)+" "+y(b[0])+back; started=true; });
    if(started) svg.appendChild(svgEl("path",{d:d+back+" Z",fill:C.lblue,"fill-opacity":0.18,stroke:"none"}));
  }
  opts.series.forEach(s=>{
    let d="",started=false;
    s.values.forEach((v,i)=>{ if(v==null) return;
      d+=(started?" L":"M")+x(i)+" "+y(v); started=true; });
    const attrs={d,fill:"none",stroke:s.color,"stroke-width":2.2};
    if(s.dash) attrs["stroke-dasharray"]="6 4";
    svg.appendChild(svgEl("path",attrs));
  });
  const hover=svgEl("line",{y1:P.t,y2:H-P.b,stroke:"#8A97A5","stroke-width":1,visibility:"hidden"});
  svg.appendChild(hover);
  const tip=document.createElement("div"); tip.className="ttip"; tip.style.display="none";
  container.style.position="relative"; container.appendChild(svg); container.appendChild(tip);
  svg.addEventListener("mousemove",ev=>{
    const rect=svg.getBoundingClientRect();
    let i=Math.round((ev.clientX-rect.left-P.l)/((W-P.l-P.r)/(n-1)));
    i=Math.max(0,Math.min(n-1,i));
    hover.setAttribute("x1",x(i)); hover.setAttribute("x2",x(i)); hover.setAttribute("visibility","visible");
    let s="<b>"+esc(labels[i])+"</b>";
    opts.series.forEach(sr=>{ if(sr.values[i]!=null)
      s+="<br><span style='color:"+sr.color+"'>\u25CF</span> "+esc(sr.name)+": "+(opts.vFmt||inCompact)(sr.values[i]); });
    if(opts.band&&opts.band[i]) s+="<br>95% band: "+(opts.vFmt||inCompact)(opts.band[i][0])+" \u2013 "+(opts.vFmt||inCompact)(opts.band[i][1]);
    tip.innerHTML=s; tip.style.display="block";
    tip.style.left=Math.min(ev.clientX-rect.left+14,W-200)+"px"; tip.style.top="10px";
  });
  svg.addEventListener("mouseleave",()=>{ hover.setAttribute("visibility","hidden"); tip.style.display="none"; });
  const leg=document.createElement("div"); leg.className="legend";
  opts.series.forEach(s=>{ const sp=document.createElement("span");
    sp.innerHTML="<i style='background:"+s.color+"'></i>"+esc(s.name); leg.appendChild(sp); });
  container.appendChild(leg);
}
function barChart(container,opts){
  container.innerHTML="";
  const W=container.clientWidth||900, H=opts.height||300;
  const P={l:70,r:14,t:14,b:opts.rotate?66:30};
  const labels=opts.labels,n=labels.length,G=opts.groups;
  let ymax=0; G.forEach(g=>g.values.forEach(v=>{ if(v>ymax) ymax=v; }));
  const ticks=niceTicks(ymax); ymax=ticks[ticks.length-1];
  const y=v=>H-P.b-(v/ymax)*(H-P.t-P.b);
  const bandW=(W-P.l-P.r)/n, barW=Math.min(bandW*0.72/G.length,46);
  const svg=svgEl("svg",{width:W,height:H});
  svg.appendChild(svgEl("rect",{x:0,y:0,width:W,height:H,fill:"#fff"}));
  ticks.forEach(tv=>{
    svg.appendChild(svgEl("line",{x1:P.l,x2:W-P.r,y1:y(tv),y2:y(tv),stroke:C.line}));
    const t=svgEl("text",{x:P.l-8,y:y(tv)+4,"text-anchor":"end","font-size":11,fill:C.muted});
    t.textContent=(opts.yFmt||inCompact)(tv); svg.appendChild(t);
  });
  if(opts.refLine!=null&&opts.refLine<=ymax)
    svg.appendChild(svgEl("line",{x1:P.l,x2:W-P.r,y1:y(opts.refLine),y2:y(opts.refLine),stroke:C.text,"stroke-dasharray":"4 4"}));
  labels.forEach((lb,i)=>{
    const cx=P.l+bandW*i+bandW/2;
    G.forEach((g,gi)=>{
      const bx=cx-(G.length*barW)/2+gi*barW;
      const v=g.values[i];
      const rect=svgEl("rect",{x:bx,y:y(v),width:barW-2,height:Math.max(0,H-P.b-y(v)),
        fill:(opts.fillFn?opts.fillFn(i,gi):g.color)});
      if(opts.onClick){ rect.style.cursor="pointer"; rect.addEventListener("click",()=>opts.onClick(i)); }
      const title=svgEl("title",{}); title.textContent=lb+" \u2014 "+g.name+": "+(opts.yFmt||inCompact)(v);
      rect.appendChild(title); svg.appendChild(rect);
    });
    const t=svgEl("text",{x:cx,y:H-P.b+14,"font-size":10,fill:C.muted,
      "text-anchor":opts.rotate?"end":"middle",
      transform:opts.rotate?("rotate(-35 "+cx+" "+(H-P.b+14)+")"):""});
    t.textContent=lb; svg.appendChild(t);
  });
  container.appendChild(svg);
  if(G.length>1){
    const leg=document.createElement("div"); leg.className="legend";
    G.forEach(g=>{ const sp=document.createElement("span");
      sp.innerHTML="<i style='background:"+g.color+"'></i>"+esc(g.name); leg.appendChild(sp); });
    container.appendChild(leg);
  }
}
function stackedArea(container,opts){
  container.innerHTML="";
  const W=container.clientWidth||900, H=opts.height||360;
  const P={l:50,r:14,t:14,b:34};
  const labels=opts.labels,n=labels.length;
  const x=i=>P.l+(i/(n-1))*(W-P.l-P.r);
  const y=v=>H-P.b-v*(H-P.t-P.b);
  const svg=svgEl("svg",{width:W,height:H});
  svg.appendChild(svgEl("rect",{x:0,y:0,width:W,height:H,fill:"#fff"}));
  [0,0.25,0.5,0.75,1].forEach(tv=>{
    svg.appendChild(svgEl("line",{x1:P.l,x2:W-P.r,y1:y(tv),y2:y(tv),stroke:C.line}));
    const t=svgEl("text",{x:P.l-8,y:y(tv)+4,"text-anchor":"end","font-size":11,fill:C.muted});
    t.textContent=Math.round(tv*100)+"%"; svg.appendChild(t);
  });
  const cum=labels.map(()=>0);
  opts.series.forEach(s=>{
    let top="",bottom="";
    for(let i=0;i<n;i++){
      const lo=cum[i],hi=cum[i]+s.values[i];
      top+=(i?" L":"M")+x(i)+" "+y(hi);
      bottom=" L"+x(i)+" "+y(lo)+bottom;
      cum[i]=hi;
    }
    const path=svgEl("path",{d:top+bottom+" Z",fill:s.color,"fill-opacity":0.8,stroke:s.color,"stroke-width":0.5});
    const title=svgEl("title",{}); title.textContent=s.name; path.appendChild(title);
    svg.appendChild(path);
  });
  const step=Math.ceil(n/12);
  labels.forEach((lb,i)=>{ if(i%step!==0&&i!==n-1) return;
    const t=svgEl("text",{x:x(i),y:H-P.b+16,"text-anchor":"middle","font-size":10,fill:C.muted});
    t.textContent=lb; svg.appendChild(t); });
  container.appendChild(svg);
  const leg=document.createElement("div"); leg.className="legend";
  opts.series.forEach(s=>{ const sp=document.createElement("span");
    sp.innerHTML="<i style='background:"+s.color+"'></i>"+esc(s.name); leg.appendChild(sp); });
  container.appendChild(leg);
}

/* ================= analytics on aggregates ================= */
const S={ tab:"overview", horizon:6, metric:"amt", category:"total",
  selStates:[], plazaQuery:"", selPlaza:null, mixMode:"amt" };
let A=null;

function computeA(){
  const E=EMBEDDED, monthKeys=E.monthKeys;
  const lastK=monthKeys[monthKeys.length-1], t00=monthKeys[0], nAct=monthKeys.length;
  const l12=i=>i>=nAct-12, p12=i=>i>=nAct-24&&i<nAct-12;
  const selNet=E.network.map(t=>tupVal(t,S.metric,S.category));
  const fitSel=fitSeries(monthKeys.map(k=>k-t00),selNet,4);
  const fitTotA=fitSeries(monthKeys.map(k=>k-t00),E.network.map(t=>t[0]),4);
  const fitTotC=fitSeries(monthKeys.map(k=>k-t00),E.network.map(t=>t[1]),4);
  const futKeys=Array.from({length:S.horizon},(_,i)=>lastK+1+i);
  const labels=monthKeys.map(keyToLabel).concat(futKeys.map(keyToLabel));
  const actualArr=selNet.concat(futKeys.map(()=>null));
  const fcstArr=labels.map(()=>null), bandArr=labels.map(()=>null);
  fcstArr[nAct-1]=selNet[nAct-1];
  futKeys.forEach((k,i)=>{ const f=fitSel.predict(k-t00,i+1); fcstArr[nAct+i]=f.mid; bandArr[nAct+i]=[f.lo,f.hi]; });
  const sum=pred=>selNet.reduce((s,v,i)=>pred(i)?s+v:s,0);
  const sel12net=sum(l12), prev12net=sum(p12);
  const pas12net=E.network.reduce((s,t,i)=>l12(i)?s+tupVal(t,S.metric,"pas"):s,0);
  const com12net=E.network.reduce((s,t,i)=>l12(i)?s+tupVal(t,S.metric,"com"):s,0);
  const fcstH=futKeys.reduce((s,k,i)=>s+fitSel.predict(k-t00,i+1).mid,0);
  const lastHActual=selNet.slice(-Math.min(S.horizon,nAct)).reduce((a,b)=>a+b,0);
  const ci=COMBO_IDX[S.metric+"_"+S.category];
  const ciA=COMBO_IDX["amt_"+S.category], ciC=COMBO_IDX["cnt_"+S.category];
  const plazaStats=E.plazasD.map(p=>({
    name:p.name, state:p.s, lat:p.la, lon:p.lo, n:p.n, act:p.act,
    avgToll:(p.c[ciC][0]>0)?p.c[ciA][0]/p.c[ciC][0]:null,
    sel12:p.c[ci][0], yoy:p.c[ci][1], trend:p.c[ci][2], fcst12:p.c[ci][3],
    pas12:p.c[COMBO_IDX[S.metric+"_pas"]][0], com12:p.c[COMBO_IDX[S.metric+"_com"]][0],
    tot12amt:p.c[0][0], mp:(p.m&&p.m[ci])?p.m[ci]:null, k0:p.k0, k1:p.k1
  })).sort((a,b)=>b.sel12-a.sel12);
  const eligible=plazaStats.filter(p=>p.trend!=null&&p.act&&p.tot12amt>=1e7);
  const topGrowth=[...eligible].sort((a,b)=>b.trend-a.trend).slice(0,10);
  const lowGrowth=[...eligible].sort((a,b)=>a.trend-b.trend).slice(0,10);
  const states=Object.keys(E.states).map(s=>{
    const ser=E.states[s];
    let a12=0,aPrev=0;
    ser.forEach((t,i)=>{ const v=tupVal(t,S.metric,S.category);
      if(l12(i)) a12+=v; if(p12(i)) aPrev+=v; });
    const nplz=E.plazasD.filter(p=>p.s===s).length;
    return { state:s, plazas:nplz, a12, yoy:aPrev>0?a12/aPrev-1:null, ser };
  }).sort((a,b)=>b.a12-a.a12);
  const seasonal=MONTHS.map((m,i)=>({month:m,rev:fitTotA.sIdx[i],trf:fitTotC.sIdx[i]}));
  const mix=monthKeys.map((k,i)=>{
    const row=E.netcls[i];
    const vals=S.mixMode==="amt"?row.slice(0,6):row.slice(6);
    const tot=vals.reduce((a,b)=>a+b,0);
    return { label:keyToLabel(k), shares:vals.map(v=>tot>0?v/tot:0) };
  });
  const rates=monthKeys.map((k,i)=>{
    const row=E.netcls[i];
    return { label:keyToLabel(k), r:CLASS_NAMES.map((_,j)=>row[6+j]>0?row[j]/row[6+j]:null) };
  });
  const rates12=CLASS_NAMES.map((_,j)=>{
    let a=0,c=0;
    for(let i=Math.max(0,nAct-12);i<nAct;i++){ a+=E.netcls[i][j]; c+=E.netcls[i][6+j]; }
    return c>0?a/c:null;
  });
  const mapPts=plazaStats.filter(p=>p.lat!=null&&p.lon!=null);
  return { monthKeys,lastK,nAct,labels,actualArr,fcstArr,bandArr,fitSel,
    sel12net,pas12net,com12net,netYoY:prev12net>0?sel12net/prev12net-1:null,fcstH,lastHActual,
    plazaStats,topGrowth,lowGrowth,eligibleN:eligible.length,states,seasonal,mix,rates,rates12,
    mapPts,noCoord:plazaStats.length-mapPts.length };
}

function set(patch){ Object.assign(S,patch); A=computeA(); render(); }
function setLight(patch){ Object.assign(S,patch); render(); }

function kpi(label,value,sub,accent){
  return "<div class='kpi' style='border-top-color:"+(accent||C.navy)+"'>"+
    "<div class='kl'>"+esc(label)+"</div><div class='kv'>"+value+"</div>"+
    (sub?"<div class='ks'>"+sub+"</div>":"")+"</div>";
}
function seg(id,options,value){
  return "<span class='seg'>"+options.map(o=>
    "<button data-seg='"+id+"' data-val='"+o[0]+"' class='"+(String(value)===String(o[0])?"on":"")+"'>"+esc(o[1])+"</button>").join("")+"</span>";
}
function panel(body,title,rightNode){
  const div=document.createElement("div"); div.className="panel";
  div.innerHTML="<div class='phead'><h3>"+title+"</h3></div><div class='pbody'></div>";
  if(rightNode){
    if(typeof rightNode==="string"){ const s=document.createElement("span"); s.innerHTML=rightNode; div.querySelector(".phead").appendChild(s); }
    else div.querySelector(".phead").appendChild(rightNode);
  }
  body.appendChild(div);
  return div.querySelector(".pbody");
}

function render(){
  const vf=vfOf(S.metric);
  const hLabel=S.horizon===6?"6 months":S.horizon===12?"12 months":"5 years";
  const chartTitle=METRIC_LABEL[S.metric]+" \u00B7 "+CAT_SHORT[S.category];
  const app=document.getElementById("app");
  const tabsDef=[["overview","Overview"],["growth","Growth leaders"],["states","States"],["plazas","Plazas"],
    ["map","Map"]];
  const shareP=A.pas12net+A.com12net>0?A.pas12net/(A.pas12net+A.com12net):null;
  let h="";
  h+="<div class='meta'>"+esc(EMBEDDED.title)+" \u00B7 "+EMBEDDED.plazasD.length.toLocaleString("en-IN")+
     " plazas \u00B7 "+A.monthKeys.length+" months ("+keyToLabel(A.monthKeys[0])+" \u2013 "+keyToLabel(A.lastK)+") \u00B7 aggregate &amp; derived metrics only</div>";
  h+="<div class='kpis'>"+
    kpi(METRIC_LABEL[S.metric]+" \u00B7 "+CAT_SHORT[S.category]+" \u00B7 last 12M",vf(A.sel12net),"YoY "+fmtPct(A.netYoY))+
    kpi("Passenger \u00B7 last 12M",vf(A.pas12net),shareP!=null?(shareP*100).toFixed(1)+"% of total":"")+
    kpi("Commercial \u00B7 last 12M",vf(A.com12net),shareP!=null?((1-shareP)*100).toFixed(1)+"% of total":"")+
    kpi("Trend growth",fmtPct(A.fitSel.trendPA),"R\u00B2 "+A.fitSel.r2.toFixed(2)+" \u00B7 p.a.",C.blue)+
    kpi("Forecast \u00B7 next "+hLabel,vf(A.fcstH),
      S.horizon<=12?fmtPct(A.fcstH/A.lastHActual-1)+" vs last "+S.horizon+"M actual":"cumulative over 60 months",C.lblue)+
    "</div>";
  h+="<div class='controls'>"+
    "<label>Horizon</label>"+seg("horizon",[[6,"Short \u00B7 6M"],[12,"12M"],[60,"Long \u00B7 5Y"]],S.horizon)+
    "<label>Metric</label>"+seg("metric",[["amt","Revenue"],["cnt","Traffic"]],S.metric)+
    "<label>Category</label>"+seg("category",[["total","Total"],["pas","Passenger"],["com","Commercial"]],S.category)+
    (S.horizon===60?"<span class='warn'>5-year view is a trend-continuation scenario, not a prediction.</span>":"")+
    "</div>";
  h+="<div class='tabs'>"+tabsDef.map(t=>
    "<button data-tab='"+t[0]+"' class='"+(S.tab===t[0]?"on":"")+"'>"+t[1]+"</button>").join("")+"</div>";
  h+="<div id='tabbody'></div>";
  app.innerHTML=h;
  app.querySelectorAll("[data-seg]").forEach(b=>b.addEventListener("click",()=>{
    const id=b.getAttribute("data-seg"); let v=b.getAttribute("data-val");
    if(id==="horizon") v=+v; set({[id]:v}); }));
  app.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>setLight({tab:b.getAttribute("data-tab")})));
  const body=document.getElementById("tabbody");
  ({overview:renderOverview,growth:renderGrowth,states:renderStates,plazas:renderPlazas,
    map:renderMap})[S.tab](body,vf,hLabel,chartTitle);
}

function renderOverview(body,vf,hLabel,chartTitle){
  const cdiv=document.createElement("div");
  const getCsv=()=>{
    const rows=[["Month","Actual "+chartTitle,"Forecast","Forecast lo (95%)","Forecast hi (95%)"]];
    A.labels.forEach((lb,i)=>rows.push([lb,
      A.actualArr[i]!=null?Math.round(A.actualArr[i]):null,
      (i>=A.nAct&&A.fcstArr[i]!=null)?Math.round(A.fcstArr[i]):null,
      A.bandArr[i]?Math.round(A.bandArr[i][0]):null,
      A.bandArr[i]?Math.round(A.bandArr[i][1]):null]));
    return rows;
  };
  const pb=panel(body,"Nationwide "+esc(chartTitle)+" \u2014 actual and "+hLabel+" forecast",
    dlButtons(getCsv,cdiv,"national_trend"));
  pb.appendChild(cdiv);
  lineChart(cdiv,{labels:A.labels,height:380,vFmt:vf,
    series:[{name:"Actual",color:C.navy,values:A.actualArr},
            {name:"Forecast",color:C.blue,dash:true,values:A.fcstArr}],
    band:A.bandArr});
  const disc=document.createElement("p"); disc.className="note";
  disc.textContent="Forecasts are model estimates, not investment advice.";
  pb.appendChild(disc);
  renderSeasonality(body);
  renderMix(body);
  renderTollRates(body);
}

function renderGrowth(body,vf,hLabel,chartTitle){
  const intro=document.createElement("div"); intro.className="note";
  intro.innerHTML="Ranked by fitted trend growth p.a. of <b>"+CAT_SHORT[S.category].toLowerCase()+" "+
    METRIC_LABEL[S.metric].toLowerCase()+"</b> among "+A.eligibleN.toLocaleString("en-IN")+
    " eligible plazas: \u226524 months history, currently active, \u2265\u20B91 cr total revenue last 12M. Click a plaza for its summary.";
  body.appendChild(intro);
  const wrap=document.createElement("div"); wrap.className="cols"; body.appendChild(wrap);
  [["Top 10 \u00B7 high growth",A.topGrowth,C.green],["Bottom 10 \u00B7 declining",A.lowGrowth,C.red]].forEach(cfg=>{
    const col=document.createElement("div"); col.className="col"; wrap.appendChild(col);
    const pb=panel(col,cfg[0]);
    const maxAbs=Math.max.apply(null,cfg[1].map(x=>Math.abs(x.trend)).concat([0.01]));
    let t="<table><tr><th>Plaza</th><th>State</th><th class='r'>Trend p.a.</th><th class='r'>YoY</th><th class='r'>Last 12M</th></tr>";
    cfg[1].forEach(p=>{
      t+="<tr class='click' data-plaza=\""+esc(p.name)+"\"><td><b>"+esc(p.name)+"</b>"+
        "<div class='gbar' style='background:"+cfg[2]+";width:"+Math.min(100,Math.abs(p.trend)/maxAbs*100)+"%'></div></td>"+
        "<td class='mut'>"+esc(p.state)+"</td>"+
        "<td class='r' style='color:"+cfg[2]+";font-weight:700'>"+fmtPct(p.trend)+"</td>"+
        "<td class='r'>"+fmtPct(p.yoy)+"</td><td class='r'>"+vf(p.sel12)+"</td></tr>";
    });
    pb.innerHTML=t+"</table>";
  });
  body.querySelectorAll("[data-plaza]").forEach(r=>r.addEventListener("click",()=>{
    setLight({selPlaza:r.getAttribute("data-plaza"),plazaQuery:r.getAttribute("data-plaza"),tab:"plazas"}); }));
}

function renderStates(body,vf,hLabel,chartTitle){
  const pb1=panel(body,esc(chartTitle)+" by state \u2014 last 12 months",
    "<span class='note'>click a bar to add it to the trend chart (up to 6)</span>");
  const top15=A.states.slice(0,15);
  const bdiv=document.createElement("div"); pb1.appendChild(bdiv);
  barChart(bdiv,{labels:top15.map(s=>s.state),rotate:true,yFmt:vf,
    groups:[{name:chartTitle,color:C.navy,values:top15.map(s=>s.a12)}],
    fillFn:i=>S.selStates.indexOf(top15[i].state)>=0?C.lblue:C.navy,
    onClick:i=>{ const st=top15[i].state;
      const sel=S.selStates.indexOf(st)>=0?S.selStates.filter(x=>x!==st):S.selStates.concat([st]).slice(-6);
      setLight({selStates:sel}); }});
  const cdiv=document.createElement("div");
  let chartRows=null;
  const getCsv=()=>chartRows||[["No states selected"]];
  const pb2=panel(body,S.selStates.length?("Monthly "+esc(chartTitle)+" with "+hLabel+" forecast \u2014 "+esc(S.selStates.join(", "))):"Monthly trend \u2014 select states above",
    S.selStates.length?dlButtons(getCsv,cdiv,"state_trends"):null);
  if(S.selStates.length){
    const futKeys=Array.from({length:S.horizon},(_,i)=>A.lastK+1+i);
    const labels=A.monthKeys.map(keyToLabel).concat(futKeys.map(keyToLabel));
    const series=[];
    const COLORS=["#123F6D","#2E6DA4","#0E7490","#B45309","#5B9BD5","#64748B"];
    chartRows=[["Month"].concat(S.selStates.map(s=>[s+" actual",s+" forecast"]).flat())];
    const cols={};
    S.selStates.forEach((sname,i)=>{
      const st=A.states.find(x=>x.state===sname); if(!st) return;
      const act=st.ser.map(t=>tupVal(t,S.metric,S.category)).concat(futKeys.map(()=>null));
      const fc=labels.map(()=>null);
      const ks=A.monthKeys;
      const fit=fitSeries(ks.map(k=>k-ks[0]),st.ser.map(t=>tupVal(t,S.metric,S.category)),4);
      fc[A.nAct-1]=act[A.nAct-1];
      futKeys.forEach((k,j)=>{ fc[A.nAct+j]=fit.predict(k-ks[0],j+1).mid; });
      series.push({name:sname,color:COLORS[i%6],values:act});
      series.push({name:sname+" (forecast)",color:COLORS[i%6],dash:true,values:fc});
      cols[sname]={act,fc};
    });
    labels.forEach((lb,i)=>{
      const row=[lb];
      S.selStates.forEach(s=>{ const c=cols[s]||{act:[],fc:[]};
        row.push(c.act[i]!=null?Math.round(c.act[i]):null,(i>=A.nAct&&c.fc[i]!=null)?Math.round(c.fc[i]):null); });
      chartRows.push(row);
    });
    pb2.appendChild(cdiv);
    lineChart(cdiv,{labels,series,height:340,vFmt:vf});
  }
  let t="<table><tr><th>State</th><th>Plazas</th><th>"+esc(chartTitle)+" last 12M</th><th>YoY</th><th class='r'>Avg toll / txn \u00B7 "+esc(CAT_SHORT[S.category])+" (12M)</th></tr>";
  A.states.slice(0,12).forEach(s=>{
    let a=0,c=0;
    for(let i=Math.max(0,A.nAct-12);i<A.nAct;i++){
      a+=tupVal(s.ser[i],"amt",S.category); c+=tupVal(s.ser[i],"cnt",S.category); }
    const rate=c>0?a/c:null;
    t+="<tr><td><b>"+esc(s.state)+"</b></td><td>"+s.plazas+"</td><td>"+vf(s.a12)+"</td>"+
      "<td style='color:"+(s.yoy>0?C.green:C.red)+"'>"+fmtPct(s.yoy)+"</td>"+
      "<td class='r'>"+(rate!=null?"\u20B9"+Math.round(rate).toLocaleString("en-IN"):"\u2013")+"</td></tr>"; });
  const tdiv=document.createElement("div"); tdiv.innerHTML=t+"</table>"; pb2.appendChild(tdiv);
}

function renderPlazas(body,vf,hLabel,chartTitle){
  const pb=panel(body,"Find a plaza");
  pb.innerHTML="<input id='pq' type='text' placeholder='Type a plaza name\u2026' value=\""+esc(S.plazaQuery)+"\">"+
    "<div id='psugg'></div><div class='note' id='phint'></div><div id='pdetail'></div>";
  const sugg=pb.querySelector("#psugg"), hint=pb.querySelector("#phint"), det=pb.querySelector("#pdetail");
  function drawSugg(){
    const q=S.plazaQuery.toLowerCase();
    const list=(q?A.plazaStats.filter(p=>p.name.toLowerCase().indexOf(q)>=0):A.plazaStats).slice(0,12);
    sugg.innerHTML=list.map(p=>"<button class='chip"+(S.selPlaza===p.name?" on":"")+"' data-p=\""+esc(p.name)+"\">"+
      esc(p.name)+" <span class='mut'>\u00B7 "+esc(p.state)+"</span></button>").join("");
    hint.textContent=q?"":"Showing top plazas by the selected measure, last 12 months.";
    sugg.querySelectorAll("[data-p]").forEach(b=>b.addEventListener("click",()=>{
      S.selPlaza=b.getAttribute("data-p"); drawSugg(); drawDetail(); }));
  }
  pb.querySelector("#pq").addEventListener("input",e=>{ S.plazaQuery=e.target.value; drawSugg(); });
  function drawDetail(){
    det.innerHTML="";
    if(!S.selPlaza) return;
    const p=A.plazaStats.find(x=>x.name===S.selPlaza); if(!p) return;
    const share=(p.pas12+p.com12)>0?p.com12/(p.pas12+p.com12):null;
    det.innerHTML="<h3 class='ph2'>"+esc(S.selPlaza)+" \u00B7 "+esc(p.state)+" \u2014 derived indicators ("+esc(chartTitle)+")</h3>"+
      "<div class='kpis'>"+
      kpi(CAT_SHORT[S.category]+" "+METRIC_LABEL[S.metric]+" \u00B7 12M",vf(p.sel12))+
      kpi("Passenger \u00B7 12M",vf(p.pas12))+
      kpi("Commercial \u00B7 12M",vf(p.com12),share!=null?(share*100).toFixed(0)+"% of "+METRIC_LABEL[S.metric].toLowerCase():"")+
      kpi("YoY",fmtPct(p.yoy),"",C.blue)+
      kpi("Trend p.a.",fmtPct(p.trend),p.trend!=null?(p.n+" months history"):(p.n+" months (needs \u226524)"),C.blue)+
      kpi("Forecast \u00B7 next 12M",p.fcst12!=null?vf(p.fcst12):"\u2013","fixed 12-month horizon",C.lblue)+
      kpi("Avg toll / txn \u00B7 "+CAT_SHORT[S.category],p.avgToll!=null?"\u20B9"+Math.round(p.avgToll).toLocaleString("en-IN"):"\u2013","last 12M, selected category")+
      "</div><div id='pchartwrap'></div>";
    const wrap=det.querySelector("#pchartwrap");
    if(p.mp){
      const histKeys=[]; for(let k=p.k0;k<=p.k1;k++) histKeys.push(k);
      const futKeys=Array.from({length:S.horizon},(_,i)=>p.k1+1+i);
      const labels=histKeys.map(keyToLabel).concat(futKeys.map(keyToLabel));
      const nH=histKeys.length;
      const modeled=histKeys.map(k=>evalModel(p.mp,k-p.k0,0).mid).concat(futKeys.map(()=>null));
      const fc=labels.map(()=>null), band=labels.map(()=>null);
      fc[nH-1]=modeled[nH-1];
      futKeys.forEach((k,i)=>{ const f=evalModel(p.mp,k-p.k0,i+1); fc[nH+i]=f.mid; band[nH+i]=[f.lo,f.hi]; });
      const cdiv=document.createElement("div");
      const getCsv=()=>{
        const rows=[["Month","Modeled "+chartTitle+" (estimate)","Forecast","Forecast lo (95%)","Forecast hi (95%)"]];
        labels.forEach((lb,i)=>rows.push([lb,
          modeled[i]!=null?Math.round(modeled[i]):null,
          (i>=nH&&fc[i]!=null)?Math.round(fc[i]):null,
          band[i]?Math.round(band[i][0]):null, band[i]?Math.round(band[i][1]):null]));
        return rows;
      };
      const head=document.createElement("div"); head.className="phead";
      head.innerHTML="<h3 style='margin:0;font-size:15px;color:#123F6D'>Modeled trajectory and "+hLabel+" projection</h3>";
      head.appendChild(dlButtons(getCsv,cdiv,("plaza_"+S.selPlaza).replace(/[^A-Za-z0-9_-]+/g,"_")));
      wrap.appendChild(head); wrap.appendChild(cdiv);
      lineChart(cdiv,{labels,height:320,vFmt:vf,
        series:[{name:"Modeled history (estimate)",color:C.lblue,values:modeled},
                {name:"Projection",color:C.navy,dash:true,values:fc}],
        band});
      const note=document.createElement("p"); note.className="note";
      note.textContent="The curve is the fitted model estimate reconstructed from published model coefficients \u2014 actual monthly plaza data is not contained in this page. Use the Horizon control above for 6-month, 1-year or 5-year projections. Forecasts are model estimates, not investment advice.";
      wrap.appendChild(note);
    } else {
      wrap.innerHTML="<p class='note'>No model available for this plaza (needs \u226524 months of history).</p>";
    }
    const priv=document.createElement("p"); priv.className="note";
    priv.textContent="For detailed plaza-level datasets, see the contact details in the footer.";
    det.appendChild(priv);
  }
  drawSugg(); drawDetail();
}

/* -------- map with OSM basemap (Web Mercator) -------- */
function renderMap(body,vf,hLabel,chartTitle){
  const pb=panel(body,"Plaza map \u2014 dot size = "+esc(chartTitle.toLowerCase())+" last 12M, color = trend growth",
    "<span class='note'>"+A.mapPts.length.toLocaleString("en-IN")+" plazas with coordinates \u00B7 "+A.noCoord+" without \u00B7 click a dot for its summary</span>");
  const pts=A.mapPts;
  if(!pts.length){ pb.innerHTML="<div class='note'>No coordinates in the dataset.</div>"; return; }
  const Z=6, N=Math.pow(2,Z);
  const merX=lon=>(lon+180)/360*N;
  const merY=lat=>{ const r=lat*Math.PI/180;
    return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*N; };
  const lons=pts.map(p=>p.lon), lats=pts.map(p=>p.lat);
  const xMinT=Math.floor(Math.min.apply(null,lons.map(merX))), xMaxT=Math.floor(Math.max.apply(null,lons.map(merX)));
  const yMinT=Math.floor(Math.min.apply(null,lats.map(merY))), yMaxT=Math.floor(Math.max.apply(null,lats.map(merY)));
  const W=(xMaxT-xMinT+1)*256, H=(yMaxT-yMinT+1)*256;
  const px=lon=>(merX(lon)-xMinT)*256, py=lat=>(merY(lat)-yMinT)*256;
  const wrap=document.createElement("div"); wrap.style.position="relative";
  const svg=svgEl("svg",{viewBox:"0 0 "+W+" "+H,style:"width:100%;max-width:900px;display:block;margin:0 auto;background:#DCE6EE;border-radius:6px"});
  for(let tx=xMinT;tx<=xMaxT;tx++) for(let ty=yMinT;ty<=yMaxT;ty++){
    const img=svgEl("image",{x:(tx-xMinT)*256,y:(ty-yMinT)*256,width:256,height:256});
    img.setAttributeNS("http://www.w3.org/1999/xlink","href","https://tile.openstreetmap.org/"+Z+"/"+tx+"/"+ty+".png");
    img.setAttribute("href","https://tile.openstreetmap.org/"+Z+"/"+tx+"/"+ty+".png");
    svg.appendChild(img);
  }
  const info=document.createElement("div"); info.className="ttip"; info.style.display="none";
  const maxV=Math.max.apply(null,pts.map(p=>p.sel12).concat([1]));
  pts.forEach(p=>{
    const c=svgEl("circle",{cx:px(p.lon),cy:py(p.lat),r:3.5+7*Math.sqrt(p.sel12/maxV),
      fill:trendColor(p.trend),"fill-opacity":0.8,stroke:"#fff","stroke-width":1,style:"cursor:pointer"});
    c.addEventListener("mouseenter",()=>{
      info.innerHTML="<b>"+esc(p.name)+"</b><br>"+esc(p.state)+"<br>"+esc(chartTitle)+" 12M: "+vf(p.sel12)+
        "<br>Trend: <span style='color:"+trendColor(p.trend)+";font-weight:700'>"+fmtPct(p.trend)+"</span> p.a.";
      info.style.display="block";
      const box=svg.getBoundingClientRect(), scale=box.width/W;
      info.style.left=Math.min(px(p.lon)*scale+14,box.width-210)+"px";
      info.style.top=Math.max(py(p.lat)*scale-10,4)+"px";
    });
    c.addEventListener("mouseleave",()=>{ info.style.display="none"; });
    c.addEventListener("click",()=>setLight({selPlaza:p.name,plazaQuery:p.name,tab:"plazas"}));
    svg.appendChild(c);
  });
  wrap.appendChild(svg); wrap.appendChild(info); pb.appendChild(wrap);
  const attr=document.createElement("div"); attr.className="osm-attr";
  attr.innerHTML='Basemap \u00A9 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (loads online; dots render regardless)';
  pb.appendChild(attr);
  const leg=document.createElement("div"); leg.className="legend center";
  [["< \u221210% p.a.","#B91C1C"],["\u221210 \u2013 0%","#C2660A"],["0 \u2013 10%","#3F8F5B"],["> 10% p.a.","#123F6D"],["no fit (<24M)","#8A97A5"]]
    .forEach(l=>{ const sp=document.createElement("span");
      sp.innerHTML="<i style='background:"+l[1]+";border-radius:50%'></i>"+l[0]; leg.appendChild(sp); });
  pb.appendChild(leg);
}

/* -------- toll per transaction by class (descriptive feature, no trend/forecast) -------- */
function renderTollRates(body){
  const clsIdx=S.category==="pas"?[0]:S.category==="com"?[1,2,3,4,5]:[0,1,2,3,4,5];
  const avgSeries=A.rates.map((r,i)=>{
    const row=EMBEDDED.netcls[i];
    let a=0,c=0; clsIdx.forEach(j=>{ a+=row[j]; c+=row[6+j]; });
    return c>0?a/c:null;
  });
  const cdiv=document.createElement("div");
  const getCsv=()=>{
    const rows=[["Month"].concat(clsIdx.map(j=>CLASS_NAMES[j]+" avg toll (Rs/txn)")).concat([CAT_SHORT[S.category]+" average (Rs/txn)"])];
    A.rates.forEach((r,i)=>rows.push([r.label]
      .concat(clsIdx.map(j=>r.r[j]!=null?Math.round(r.r[j]*10)/10:null))
      .concat([avgSeries[i]!=null?Math.round(avgSeries[i]*10)/10:null])));
    return rows;
  };
  const pb=panel(body,"Average toll per transaction \u2014 "+esc(CAT_LABEL[S.category])+", nationwide monthly (actuals only)",
    dlButtons(getCsv,cdiv,"toll_per_transaction"));
  pb.appendChild(cdiv);
  const series=clsIdx.map(j=>({name:CLASS_NAMES[j],color:CLASS_COLORS[j],values:A.rates.map(r=>r.r[j])}));
  if(clsIdx.length>1) series.push({name:CAT_SHORT[S.category]+" average",color:"#1E293B",dash:true,values:avgSeries});
  lineChart(cdiv,{labels:A.rates.map(r=>r.label),height:340,
    yFmt:v=>"\u20B9"+Math.round(v),vFmt:v=>"\u20B9"+v.toFixed(0),series});
  const note=document.createElement("p"); note.className="note";
  note.textContent="Effective average rate (class revenue \u00F7 class transactions) for the selected vehicle category \u2014 use the Category control above to switch between Total, Passenger and Commercial. Historical actuals only; no trend fit or forecast is applied here. Step changes usually mark toll rate revisions (typically April, WPI-linked).";
  pb.appendChild(note);
}

function renderSeasonality(body){
  const cdiv=document.createElement("div");
  const pb=panel(body,"Network seasonal index by calendar month (1.00 = average month)",
    dlButtons(()=>[["Month","Revenue index","Traffic index"]].concat(A.seasonal.map(s=>[s.month,+s.rev.toFixed(3),+s.trf.toFixed(3)])),cdiv,"seasonality"));
  pb.appendChild(cdiv);
  barChart(cdiv,{labels:A.seasonal.map(s=>s.month),height:360,refLine:1,yFmt:v=>v.toFixed(2),
    groups:[{name:"Revenue",color:C.navy,values:A.seasonal.map(s=>s.rev)},
            {name:"Traffic",color:C.lblue,values:A.seasonal.map(s=>s.trf)}]});
  const note=document.createElement("p"); note.className="note";
  note.textContent="Multiplicative indices from the detrended fit of network totals \u2014 values above 1.00 mean the month runs above trend. A July\u2013October dip with a December peak is the typical monsoon pattern on Indian NH corridors.";
  pb.appendChild(note);
}

function renderMix(body){
  const segNode=document.createElement("span");
  segNode.innerHTML=seg("mixMode",[["amt","Revenue"],["cnt","Traffic"]],S.mixMode);
  const pb=panel(body,"Vehicle class share over time",segNode);
  const cdiv=document.createElement("div"); pb.appendChild(cdiv);
  stackedArea(cdiv,{labels:A.mix.map(m=>m.label),height:380,
    series:CLASS_NAMES.map((nm,j)=>({name:nm,color:CLASS_COLORS[j],values:A.mix.map(m=>m.shares[j])}))});
  segNode.querySelectorAll("[data-seg='mixMode']").forEach(b=>b.addEventListener("click",()=>{
    set({mixMode:b.getAttribute("data-val")}); }));
}

/* boot */
window.addEventListener("DOMContentLoaded",()=>{
  A=computeA();
  document.getElementById("method-open").addEventListener("click",()=>{document.getElementById("method-modal").style.display="flex";});
  document.getElementById("method-close").addEventListener("click",()=>{document.getElementById("method-modal").style.display="none";});
  document.getElementById("method-modal").addEventListener("click",e=>{ if(e.target.id==="method-modal") document.getElementById("method-modal").style.display="none"; });
  render();
});
