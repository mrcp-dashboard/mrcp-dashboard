from pathlib import Path

root = Path("/opt/mrcp-dashboard/docs")

html = r'''<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>MRCP TV Paddock V5.5</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="mrcp_v55_tv.css">
</head>
<body>
  <div id="tv-app">
    <header class="tv-header">
      <div>
        <h1>MRCP TV PADDOCK</h1>
        <p>Live club racing dashboard</p>
      </div>
      <div class="tv-clock" id="clock">--:--</div>
    </header>

    <main id="screen-container">
      <section class="tv-screen active" data-title="Records live">
        <h2>🏆 Records live</h2>
        <div id="recordsLive" class="cards-grid"></div>
      </section>

      <section class="tv-screen" data-title="Top pilotes">
        <h2>🔥 Top pilotes actifs</h2>
        <div id="topPilots" class="ranking"></div>
      </section>

      <section class="tv-screen" data-title="Activité club">
        <h2>📊 Activité club</h2>
        <div id="clubStats" class="big-stats"></div>
      </section>

      <section class="tv-screen" data-title="Heatmap">
        <h2>🌡️ Heatmap activité</h2>
        <div id="heatmap" class="heatmap"></div>
      </section>
    </main>

    <footer>
      <span id="screenName">Records live</span>
      <span>MRCP Dashboard V5.5</span>
    </footer>
  </div>

  <script src="mrcp_v55_tv.js"></script>
</body>
</html>
'''

css = r'''*{box-sizing:border-box}
body{
  margin:0;
  background:radial-gradient(circle at top,#202b5f,#050713 70%);
  color:white;
  font-family:Arial,Helvetica,sans-serif;
  overflow:hidden;
}
#tv-app{
  width:100vw;
  height:100vh;
  padding:32px;
  display:flex;
  flex-direction:column;
}
.tv-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  border-bottom:2px solid rgba(255,255,255,.18);
  padding-bottom:20px;
}
.tv-header h1{
  margin:0;
  font-size:56px;
  letter-spacing:3px;
}
.tv-header p{
  margin:6px 0 0;
  color:#b9c7ff;
  font-size:22px;
}
.tv-clock{
  font-size:58px;
  font-weight:bold;
}
main{
  flex:1;
  position:relative;
}
.tv-screen{
  display:none;
  height:100%;
  animation:fade .8s ease;
}
.tv-screen.active{
  display:block;
}
.tv-screen h2{
  font-size:44px;
  margin:32px 0;
}
.cards-grid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:28px;
}
.card,.rank-row,.stat-box,.heat-cell{
  background:rgba(255,255,255,.1);
  border:1px solid rgba(255,255,255,.18);
  border-radius:24px;
  padding:26px;
  box-shadow:0 20px 50px rgba(0,0,0,.25);
}
.card-title{
  color:#b9c7ff;
  font-size:22px;
}
.card-value{
  font-size:48px;
  font-weight:bold;
  margin-top:12px;
}
.card-sub{
  color:#ddd;
  font-size:20px;
  margin-top:8px;
}
.ranking{
  display:flex;
  flex-direction:column;
  gap:18px;
}
.rank-row{
  display:grid;
  grid-template-columns:90px 1fr 180px 180px;
  align-items:center;
  font-size:32px;
}
.rank-pos{
  font-size:42px;
  font-weight:bold;
}
.big-stats{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:28px;
}
.stat-box strong{
  display:block;
  font-size:54px;
}
.stat-box span{
  color:#b9c7ff;
  font-size:22px;
}
.heatmap{
  display:grid;
  grid-template-columns:repeat(7,1fr);
  gap:18px;
}
.heat-cell{
  min-height:120px;
  display:flex;
  flex-direction:column;
  justify-content:center;
  align-items:center;
}
.heat-cell strong{
  font-size:34px;
}
.heat-cell span{
  margin-top:8px;
  color:#ddd;
}
footer{
  display:flex;
  justify-content:space-between;
  padding-top:18px;
  border-top:2px solid rgba(255,255,255,.18);
  color:#b9c7ff;
  font-size:22px;
}
@keyframes fade{
  from{opacity:0;transform:scale(.98)}
  to{opacity:1;transform:scale(1)}
}
'''

js = r'''let data = null;
let currentScreen = 0;

function fmtLap(v){
  if(!v && v !== 0) return "-";
  return Number(v).toFixed(3) + "s";
}

function updateClock(){
  const d = new Date();
  document.getElementById("clock").textContent =
    d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
}

function getActivities(){
  return data?.activities || [];
}

function getPilotsFromActivities(){
  const pilots = {};
  getActivities().forEach(a=>{
    (a.participants || []).forEach(p=>{
      const name = p.name || p.pilot || p.driver || p.transponder || "Pilote inconnu";
      if(!pilots[name]) pilots[name] = {name,laps:0,best:null,sessions:0};
      const laps = p.laps_count || p.lap_count || (p.laps ? p.laps.length : 0) || 0;
      pilots[name].laps += laps;
      pilots[name].sessions += 1;

      const best = p.best_lap || p.best || p.bestLap;
      if(best && (!pilots[name].best || best < pilots[name].best)){
        pilots[name].best = best;
      }
    });
  });
  return Object.values(pilots);
}

function renderRecords(){
  const tracks = data?.tracks || {};
  const activities = getActivities();

  let globalBest = null;
  let bestPilot = "-";

  activities.forEach(a=>{
    if(a.best_lap && (!globalBest || a.best_lap < globalBest)){
      globalBest = a.best_lap;
      bestPilot = a.best_pilot || "-";
    }
  });

  document.getElementById("recordsLive").innerHTML = `
    <div class="card">
      <div class="card-title">Meilleur tour global</div>
      <div class="card-value">${fmtLap(globalBest)}</div>
      <div class="card-sub">${bestPilot}</div>
    </div>
    <div class="card">
      <div class="card-title">TT1/8</div>
      <div class="card-value">${tracks["TT1/8"]?.laps_count || 0}</div>
      <div class="card-sub">tours enregistrés</div>
    </div>
    <div class="card">
      <div class="card-title">TT1/10</div>
      <div class="card-value">${tracks["TT1/10"]?.laps_count || 0}</div>
      <div class="card-sub">tours enregistrés</div>
    </div>
  `;
}

function renderTopPilots(){
  const pilots = getPilotsFromActivities()
    .sort((a,b)=>b.laps-a.laps)
    .slice(0,8);

  document.getElementById("topPilots").innerHTML = pilots.map((p,i)=>`
    <div class="rank-row">
      <div class="rank-pos">#${i+1}</div>
      <div>${p.name}</div>
      <div>${p.laps} tours</div>
      <div>${fmtLap(p.best)}</div>
    </div>
  `).join("") || "<div class='card'>Aucun pilote trouvé</div>";
}

function renderClubStats(){
  const activities = getActivities();
  const pilots = getPilotsFromActivities();

  const totalLaps = data?.laps_count ||
    activities.reduce((s,a)=>s+(a.laps_count||0),0);

  document.getElementById("clubStats").innerHTML = `
    <div class="stat-box"><strong>${activities.length}</strong><span>sessions</span></div>
    <div class="stat-box"><strong>${pilots.length}</strong><span>pilotes</span></div>
    <div class="stat-box"><strong>${totalLaps}</strong><span>tours</span></div>
    <div class="stat-box"><strong>${data?.quality_score ?? "-"}</strong><span>qualité</span></div>
  `;
}

function renderHeatmap(){
  const days = {};
  getActivities().forEach(a=>{
    const d = a.date || "inconnu";
    if(!days[d]) days[d] = {sessions:0,laps:0};
    days[d].sessions += 1;
    days[d].laps += a.laps_count || 0;
  });

  const entries = Object.entries(days).slice(-14);

  document.getElementById("heatmap").innerHTML = entries.map(([day,v])=>`
    <div class="heat-cell">
      <strong>${v.laps}</strong>
      <span>${day}</span>
      <span>${v.sessions} sessions</span>
    </div>
  `).join("") || "<div class='card'>Aucune activité</div>";
}

function rotateScreens(){
  const screens = document.querySelectorAll(".tv-screen");
  screens[currentScreen].classList.remove("active");
  currentScreen = (currentScreen + 1) % screens.length;
  screens[currentScreen].classList.add("active");
  document.getElementById("screenName").textContent =
    screens[currentScreen].dataset.title || "";
}

async function loadData(){
  const res = await fetch("data_v2.json?ts=" + Date.now());
  data = await res.json();

  renderRecords();
  renderTopPilots();
  renderClubStats();
  renderHeatmap();
}

updateClock();
setInterval(updateClock,1000);
loadData();
setInterval(loadData,60000);
setInterval(rotateScreens,12000);
'''

(root / "tv_paddock.html").write_text(html, encoding="utf-8")
(root / "mrcp_v55_tv.css").write_text(css, encoding="utf-8")
(root / "mrcp_v55_tv.js").write_text(js, encoding="utf-8")

index = root / "index_v2.html"
if index.exists():
    content = index.read_text(encoding="utf-8")

    link = '<a href="tv_paddock.html" target="_blank">📺 TV Paddock V5.5</a>'

    if "tv_paddock.html" not in content:
        content = content.replace("</body>", f"""
<div style="position:fixed;right:18px;bottom:18px;z-index:99999">
  <a href="tv_paddock.html" target="_blank" style="background:#111;color:white;padding:12px 18px;border-radius:14px;text-decoration:none;font-weight:bold;box-shadow:0 4px 18px #0008">
    📺 TV Paddock V5.5
  </a>
</div>
</body>""")
        index.write_text(content, encoding="utf-8")

print("OK V5.5 TV Paddock installée")
print("Page : tv_paddock.html")
