from pathlib import Path

root = Path("/opt/mrcp-dashboard/docs")

html = r'''<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>MRCP Live Center V6</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="mrcp_v60_live.css">
</head>
<body>
  <div class="live-app">
    <header>
      <div>
        <h1>MRCP LIVE CENTER</h1>
        <p>V6.0 — live timing intelligent</p>
      </div>
      <div class="status">
        <span id="liveDot"></span>
        <strong id="liveStatus">Connexion données...</strong>
      </div>
    </header>

    <nav>
      <button class="active" data-view="live">Live</button>
      <button data-view="records">Records</button>
      <button data-view="speaker">Speaker</button>
      <button data-view="pilots">Pilotes</button>
    </nav>

    <main>
      <section id="view-live" class="view active">
        <h2>⚡ Dernière activité live</h2>
        <div id="liveFeed" class="feed"></div>
      </section>

      <section id="view-records" class="view">
        <h2>🏆 Records détectés</h2>
        <div id="recordFeed" class="feed"></div>
      </section>

      <section id="view-speaker" class="view">
        <h2>🎙️ Speaker mode</h2>
        <div id="speakerBox" class="speaker-box"></div>
      </section>

      <section id="view-pilots" class="view">
        <h2>📱 Pilotes live</h2>
        <input id="pilotSearch" placeholder="Rechercher un pilote...">
        <div id="pilotList" class="pilot-list"></div>
      </section>
    </main>

    <footer>
      <span id="lastUpdate">Dernière mise à jour : --</span>
      <span>MRCP Dashboard V6.0</span>
    </footer>
  </div>

  <script src="mrcp_v60_live.js"></script>
</body>
</html>
'''

css = r'''*{box-sizing:border-box}
body{
  margin:0;
  background:#050814;
  color:white;
  font-family:Arial,Helvetica,sans-serif;
}
.live-app{
  min-height:100vh;
  padding:24px;
}
header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:22px;
  border-radius:24px;
  background:linear-gradient(135deg,#121a3a,#202f74);
}
h1{
  margin:0;
  font-size:42px;
}
header p{
  margin:6px 0 0;
  color:#b8c7ff;
}
.status{
  display:flex;
  align-items:center;
  gap:12px;
  font-size:20px;
}
#liveDot{
  width:18px;
  height:18px;
  border-radius:50%;
  background:#777;
  box-shadow:0 0 20px #777;
}
#liveDot.ok{
  background:#2cff8f;
  box-shadow:0 0 24px #2cff8f;
}
nav{
  display:flex;
  gap:12px;
  margin:22px 0;
}
nav button{
  border:0;
  border-radius:16px;
  padding:14px 22px;
  background:#151d3d;
  color:white;
  font-weight:bold;
  cursor:pointer;
}
nav button.active{
  background:#3557ff;
}
.view{
  display:none;
}
.view.active{
  display:block;
}
h2{
  font-size:32px;
}
.feed,.pilot-list{
  display:flex;
  flex-direction:column;
  gap:14px;
}
.item,.pilot-card,.speaker-box{
  background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.14);
  border-radius:20px;
  padding:18px;
}
.item strong{
  font-size:22px;
}
.item small{
  display:block;
  color:#b8c7ff;
  margin-top:6px;
}
.record{
  border-color:#ffd84a;
  box-shadow:0 0 22px rgba(255,216,74,.18);
}
.speaker-box{
  font-size:34px;
  line-height:1.5;
  min-height:220px;
}
#pilotSearch{
  width:100%;
  padding:16px;
  border-radius:14px;
  border:0;
  margin-bottom:16px;
  font-size:18px;
}
.pilot-card{
  display:grid;
  grid-template-columns:1fr 140px 140px 140px;
  gap:12px;
  align-items:center;
}
footer{
  margin-top:28px;
  display:flex;
  justify-content:space-between;
  color:#b8c7ff;
}
@media(max-width:800px){
  header{display:block}
  h1{font-size:30px}
  nav{overflow:auto}
  .pilot-card{grid-template-columns:1fr}
}
'''

js = r'''let previousSignature = null;
let data = null;
let bestKnownLap = null;
let records = [];

function fmtLap(v){
  if(!v && v !== 0) return "-";
  return Number(v).toFixed(3) + "s";
}

function nowText(){
  return new Date().toLocaleTimeString("fr-FR");
}

function getActivities(){
  return data?.activities || [];
}

function getPilots(){
  const pilots = {};
  getActivities().forEach(a=>{
    (a.participants || []).forEach(p=>{
      const name = p.name || p.pilot || p.driver || p.transponder || "Pilote inconnu";
      if(!pilots[name]) pilots[name] = {name,laps:0,best:null,sessions:0,lastDate:a.date};
      const laps = p.laps_count || p.lap_count || (p.laps ? p.laps.length : 0) || 0;
      pilots[name].laps += laps;
      pilots[name].sessions += 1;
      pilots[name].lastDate = a.date || pilots[name].lastDate;

      const best = p.best_lap || p.best || p.bestLap;
      if(best && (!pilots[name].best || best < pilots[name].best)){
        pilots[name].best = best;
      }
    });
  });
  return Object.values(pilots);
}

function makeSignature(){
  const activities = getActivities();
  const totalLaps = data?.laps_count || activities.reduce((s,a)=>s+(a.laps_count||0),0);
  return `${activities.length}-${totalLaps}`;
}

function renderLive(){
  const activities = [...getActivities()].slice(-10).reverse();

  document.getElementById("liveFeed").innerHTML = activities.map(a=>`
    <div class="item">
      <strong>${a.date_fr || a.date || "Session"}</strong>
      <small>${a.laps_count || 0} tours — ${a.pilot_count || 0} pilotes — meilleur : ${fmtLap(a.best_lap)} ${a.best_pilot || ""}</small>
    </div>
  `).join("") || "<div class='item'>Aucune activité détectée</div>";
}

function renderRecords(){
  document.getElementById("recordFeed").innerHTML = records.slice(-20).reverse().map(r=>`
    <div class="item record">
      <strong>🏆 Nouveau record : ${fmtLap(r.lap)}</strong>
      <small>${r.pilot} — ${r.time}</small>
    </div>
  `).join("") || "<div class='item'>Aucun record détecté depuis ouverture de la page</div>";
}

function renderSpeaker(){
  const latest = [...getActivities()].slice(-1)[0];

  if(!latest){
    document.getElementById("speakerBox").innerHTML = "En attente de données live...";
    return;
  }

  document.getElementById("speakerBox").innerHTML = `
    Dernière session détectée :<br>
    <strong>${latest.date_fr || latest.date}</strong><br>
    ${latest.laps_count || 0} tours enregistrés.<br>
    Meilleur tour : <strong>${fmtLap(latest.best_lap)}</strong>
    ${latest.best_pilot ? "par <strong>" + latest.best_pilot + "</strong>" : ""}
  `;
}

function renderPilots(filter=""){
  const pilots = getPilots()
    .filter(p=>p.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a,b)=>b.laps-a.laps)
    .slice(0,100);

  document.getElementById("pilotList").innerHTML = pilots.map(p=>`
    <div class="pilot-card">
      <strong>${p.name}</strong>
      <span>${p.laps} tours</span>
      <span>${fmtLap(p.best)}</span>
      <span>${p.sessions} sessions</span>
    </div>
  `).join("") || "<div class='item'>Aucun pilote trouvé</div>";
}

function detectRecord(){
  const activities = getActivities();

  activities.forEach(a=>{
    if(a.best_lap && (!bestKnownLap || a.best_lap < bestKnownLap)){
      bestKnownLap = a.best_lap;
      records.push({
        lap:a.best_lap,
        pilot:a.best_pilot || "Pilote inconnu",
        time:nowText()
      });
    }
  });
}

async function loadData(){
  try{
    const res = await fetch("data_v2.json?ts=" + Date.now());
    data = await res.json();

    const sig = makeSignature();

    if(previousSignature && previousSignature !== sig){
      detectRecord();
    }

    if(!previousSignature){
      detectRecord();
    }

    previousSignature = sig;

    document.getElementById("liveDot").classList.add("ok");
    document.getElementById("liveStatus").textContent = "Live connecté";
    document.getElementById("lastUpdate").textContent = "Dernière mise à jour : " + nowText();

    renderLive();
    renderRecords();
    renderSpeaker();
    renderPilots(document.getElementById("pilotSearch").value || "");

  }catch(e){
    document.getElementById("liveDot").classList.remove("ok");
    document.getElementById("liveStatus").textContent = "Erreur données";
  }
}

document.querySelectorAll("nav button").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
  });
});

document.getElementById("pilotSearch").addEventListener("input",e=>{
  renderPilots(e.target.value);
});

loadData();
setInterval(loadData,15000);
'''

(root / "live_center.html").write_text(html, encoding="utf-8")
(root / "mrcp_v60_live.css").write_text(css, encoding="utf-8")
(root / "mrcp_v60_live.js").write_text(js, encoding="utf-8")

index = root / "index_v2.html"
if index.exists():
    content = index.read_text(encoding="utf-8")
    if "live_center.html" not in content:
        content = content.replace("</body>", """
<div style="position:fixed;right:18px;bottom:70px;z-index:99999">
  <a href="live_center.html" target="_blank" style="background:#3557ff;color:white;padding:12px 18px;border-radius:14px;text-decoration:none;font-weight:bold;box-shadow:0 4px 18px #0008">
    ⚡ Live Center V6
  </a>
</div>
</body>""")
        index.write_text(content, encoding="utf-8")

print("OK V6.0 Live Center installé")
print("Page : live_center.html")
