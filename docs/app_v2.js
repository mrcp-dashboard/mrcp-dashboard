let DATA=null;
const app=document.getElementById("app");
const state={track:"all",period:"all",isAdmin:localStorage.getItem("mrcp_admin")==="1"};

function fmtTime(v){const n=Number(v);return Number.isFinite(n)?n.toFixed(3)+" s":"-"}
function lapSeconds(l){return Number(l.lap_time??l.time??l.seconds??l.best_lap)}
function normalizeTrack(l){if(l.track)return l.track;const t=lapSeconds(l);return Number.isFinite(t)?(t<30?"TT1/10":"TT1/8"):"unknown"}
function lapPilot(l){return l.pilot_name||l.pilot||l.driver||l.name||l.transponder||"Pilote inconnu"}
function getAllLaps(){
 let laps=[];
 if(Array.isArray(DATA?.laps))laps.push(...DATA.laps);
 if(Array.isArray(DATA?.sessions)){
  DATA.sessions.forEach(s=>{
   (s.laps||s.results||[]).forEach(l=>laps.push({...l,session_name:s.name||s.title,session_date:s.date||s.session_date}));
  });
 }
 return laps.map((l,i)=>({...l,_idx:i,_time:lapSeconds(l),_track:normalizeTrack(l),_pilot:lapPilot(l),_date:l.date||l.session_date||""}))
  .filter(l=>Number.isFinite(l._time)&&l._time>0&&!l.exclude_from_records&&!l.excluded);
}
function applyFilters(laps){
 let out=laps;
 if(state.track!=="all")out=out.filter(l=>l._track===state.track);
 return out;
}
function bestByPilot(laps){
 const m=new Map();
 laps.forEach(l=>{if(!m.has(l._pilot)||l._time<m.get(l._pilot)._time)m.set(l._pilot,l)});
 return [...m.values()].sort((a,b)=>a._time-b._time);
}
function renderFilters(){return `<div class="filters"><select id="trackFilter"><option value="all">Toutes pistes</option><option value="TT1/8">TT1/8</option><option value="TT1/10">TT1/10</option></select></div>`}
function bindFilters(cb){const t=document.getElementById("trackFilter");if(t){t.value=state.track;t.onchange=e=>{state.track=e.target.value;cb()}}}
function podiumHtml(rows){
 const top=rows.slice(0,3); if(!top.length)return `<p class="small">Aucun chrono.</p>`;
 const order=[1,0,2];
 return `<div class="podium">`+order.map(i=>{const r=top[i];if(!r)return`<div></div>`;const cls=i===0?"first":i===1?"second":"third";const med=i===0?"🥇":i===1?"🥈":"🥉";return `<div class="step ${cls}"><span class="medal">${med}</span><strong>${r._pilot}</strong><div class="time">${fmtTime(r._time)}</div><div class="small">${r._track}</div></div>`}).join("")+`</div>`;
}
function recordsTable(rows,limit=20){
 return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Pilote</th><th>Temps</th><th>Piste</th></tr></thead><tbody>`+
 rows.slice(0,limit).map((r,i)=>`<tr><td>${i+1}</td><td><a href="#/pilote/${encodeURIComponent(r._pilot)}">${r._pilot}</a></td><td><strong>${fmtTime(r._time)}</strong></td><td><span class="badge">${r._track}</span></td></tr>`).join("")+
 `</tbody></table></div>`;
}
function allPilots(){return bestByPilot(getAllLaps()).map(l=>l._pilot).sort((a,b)=>a.localeCompare(b))}
function pilotStats(name){const laps=getAllLaps().filter(l=>l._pilot===name);const best=[...laps].sort((a,b)=>a._time-b._time)[0];const avg=laps.length?laps.reduce((a,b)=>a+b._time,0)/laps.length:null;return{name,laps,best,avg,sessions:new Set(laps.map(l=>l.session_name||l._date)).size}}
function home(){
 const best=bestByPilot(applyFilters(getAllLaps())); const my=localStorage.getItem("mrcp_my_pilot");
 app.innerHTML=`<section class="card"><h2>Bienvenue</h2><p>Interface simplifiée pour les pilotes et visiteurs.</p>${my?`<p><strong>Ton profil :</strong> ${my}</p><a href="#/mes-chronos"><button>Voir mes chronos</button></a>`:`<a href="#/mes-chronos"><button>Choisir mon profil pilote</button></a>`}</section><section class="card"><h2>Podium rapide</h2>${renderFilters()}${podiumHtml(best)}</section><section class="card"><h2>Top 10</h2>${recordsTable(best,10)}</section>`;
 bindFilters(home);
}
function myChronos(){
 const saved=localStorage.getItem("mrcp_my_pilot"); const pilots=allPilots();
 if(!saved){app.innerHTML=`<section class="card"><h2>Mes chronos</h2><p>Choisis ton profil une fois. Il sera mémorisé sur ce téléphone.</p><select id="pilotSelect"><option value="">Choisir un pilote</option>${pilots.map(p=>`<option value="${p}">${p}</option>`).join("")}</select> <button id="savePilot">C'est mon profil</button></section>`;document.getElementById("savePilot").onclick=()=>{const v=document.getElementById("pilotSelect").value;if(v){localStorage.setItem("mrcp_my_pilot",v);myChronos()}};return}
 const s=pilotStats(saved); const best18=bestByPilot(s.laps.filter(l=>l._track==="TT1/8"))[0]; const best10=bestByPilot(s.laps.filter(l=>l._track==="TT1/10"))[0];
 app.innerHTML=`<section class="card"><h2>Mes chronos — ${saved}</h2><button onclick="localStorage.removeItem('mrcp_my_pilot');location.reload()">Changer de pilote</button></section><section class="grid"><div class="card"><h3>Meilleur TT1/8</h3><div class="big">${fmtTime(best18?._time)}</div></div><div class="card"><h3>Meilleur TT1/10</h3><div class="big">${fmtTime(best10?._time)}</div></div><div class="card"><h3>Moyenne</h3><div class="big">${fmtTime(s.avg)}</div></div><div class="card"><h3>Tours</h3><div class="big">${s.laps.length}</div></div><div class="card"><h3>Sessions</h3><div class="big">${s.sessions}</div></div></section>`;
}
function pilots(){
 const best=bestByPilot(getAllLaps());
 app.innerHTML=`<section class="card"><h2>Pilotes</h2><input class="searchBox" id="pilotSearch" placeholder="Rechercher un pilote..."><div id="pilotList">${recordsTable(best,100)}</div></section>`;
 document.getElementById("pilotSearch").oninput=e=>{const q=e.target.value.toLowerCase();document.getElementById("pilotList").innerHTML=recordsTable(best.filter(r=>r._pilot.toLowerCase().includes(q)),100)}
}
function pilotPage(n){const name=decodeURIComponent(n);const s=pilotStats(name);app.innerHTML=`<section class="card"><h2>${name}</h2><button onclick="localStorage.setItem('mrcp_my_pilot','${name.replaceAll("'","\\'")}');location.hash='#/mes-chronos'">C'est mon profil</button></section><section class="grid"><div class="card"><h3>Meilleur</h3><div class="big">${fmtTime(s.best?._time)}</div></div><div class="card"><h3>Moyenne</h3><div class="big">${fmtTime(s.avg)}</div></div><div class="card"><h3>Tours</h3><div class="big">${s.laps.length}</div></div><div class="card"><h3>Sessions</h3><div class="big">${s.sessions}</div></div></section>`}
function podiums(){const best=bestByPilot(applyFilters(getAllLaps()));app.innerHTML=`<section class="card"><h2>Podiums</h2>${renderFilters()}${podiumHtml(best)}</section><section class="card"><h2>Classement</h2>${recordsTable(best,50)}</section>`;bindFilters(podiums)}
function adminOnly(title,body){if(!state.isAdmin){app.innerHTML=`<section class="card"><h2>Accès admin</h2><p>Page réservée à l'administrateur.</p></section>`;return}app.innerHTML=`<section class="card"><h2>${title}</h2>${body}</section>`}
function quality(){const q=DATA.quality||DATA.data_quality||{};adminOnly("Qualité données",`<div class="grid"><div class="card"><h3>Score</h3><div class="big">${q.score??q.global_score??"-"}</div></div><div class="card"><h3>Tours suspects</h3><div class="big">${(DATA.suspect_laps||q.suspect_laps||[]).length}</div></div></div>`)}
function adminPage(){adminOnly("Admin",`<p>Zone réservée admin : corrections, imports/exports et publication.</p>`)}
function adminPilots(){adminOnly("Pilotes admin",`<p>Corrections pilotes / transpondeurs.</p>`)}
function adminRecords(){adminOnly("Records admin",`<p>Exclusions et forçage TT1/8 / TT1/10.</p>`)}
function updateAdminNav(){document.getElementById("adminNav").classList.toggle("hidden",!state.isAdmin)}
function router(){updateAdminNav();const h=location.hash||"#/";if(h.startsWith("#/mes-chronos"))return myChronos();if(h.startsWith("#/pilotes"))return pilots();if(h.startsWith("#/pilote/"))return pilotPage(h.replace("#/pilote/",""));if(h.startsWith("#/podiums"))return podiums();if(h.startsWith("#/quality"))return quality();if(h.startsWith("#/admin-pilotes"))return adminPilots();if(h.startsWith("#/admin-records"))return adminRecords();if(h.startsWith("#/admin"))return adminPage();return home()}
document.getElementById("adminBtn").onclick=()=>{const c=prompt("Code admin");if(c==="mrcp"){localStorage.setItem("mrcp_admin","1");state.isAdmin=true;updateAdminNav();alert("Mode admin activé")}else if(c)alert("Code incorrect")};
document.getElementById("adminExit").onclick=()=>{localStorage.removeItem("mrcp_admin");state.isAdmin=false;location.hash="#/";router()};
async function init(){try{const res=await fetch("data_v2.json?ts="+Date.now());DATA=await res.json();router()}catch(e){app.innerHTML=`<section class="card"><h2>Erreur</h2><p>${e.message}</p><p>Vérifie que data_v2.json est dans le même dossier.</p></section>`}}
window.addEventListener("hashchange",router);init();
