let data = null;
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

function getParticipantName(p){
  return p.pilot_name || p.name || p.pilot || p.driver || (p.transponder ? "Inconnu #" + p.transponder : "Pilote inconnu");
}

function getAllLiveLaps(){
  const rows = [];
  getActivities().forEach(a=>{
    const session = a.name || a.title || a.date_fr || a.date || a.id || "Session";
    const date = a.date_fr || a.date || "";
    (a.participants || []).forEach(p=>{
      const name = getParticipantName(p);
      const transponder = p.transponder || p.transponder_id || "";
      (p.laps || []).forEach(l=>{
        const time = Number(l.lap_time ?? l.time ?? l.seconds ?? l.best_lap);
        if(!Number.isFinite(time)) return;
        rows.push({
          pilot:name,
          transponder,
          time,
          track:l.track || p.track || "Non classe",
          session,
          date
        });
      });
    });
  });
  return rows;
}

function getPilotsFromActivities(){
  const pilots = {};
  getAllLiveLaps().forEach(l=>{
    if(!pilots[l.pilot]) pilots[l.pilot] = {name:l.pilot,laps:0,best:null,sessions:new Set()};
    pilots[l.pilot].laps += 1;
    pilots[l.pilot].sessions.add(l.session);
    if(!pilots[l.pilot].best || l.time < pilots[l.pilot].best){
      pilots[l.pilot].best = l.time;
    }
  });
  return Object.values(pilots).map(p=>({
    name:p.name,
    laps:p.laps,
    best:p.best,
    sessions:p.sessions.size
  }));
}

function liveTrackStats(){
  const stats = {};
  getAllLiveLaps().forEach(l=>{
    if(!stats[l.track]) stats[l.track] = {laps_count:0,best:null,bestPilot:"-"};
    stats[l.track].laps_count += 1;
    if(!stats[l.track].best || l.time < stats[l.track].best){
      stats[l.track].best = l.time;
      stats[l.track].bestPilot = l.pilot;
    }
  });
  return stats;
}

function renderRecords(){
  const laps = getAllLiveLaps();
  const summaryTracks = data?.summary?.tracks || {};
  const computedTracks = liveTrackStats();
  let globalBest = null;

  laps.forEach(l=>{
    if(!globalBest || l.time < globalBest.time){
      globalBest = l;
    }
  });

  function trackCount(track){
    return summaryTracks[track]?.laps_count || computedTracks[track]?.laps_count || 0;
  }

  function trackSub(track){
    return computedTracks[track]?.best ? "Best " + fmtLap(computedTracks[track].best) + " - " + computedTracks[track].bestPilot : "tours enregistres";
  }

  document.getElementById("recordsLive").innerHTML = `
    <div class="card">
      <div class="card-title">Meilleur tour global</div>
      <div class="card-value">${fmtLap(globalBest && globalBest.time)}</div>
      <div class="card-sub">${globalBest ? globalBest.pilot : "-"}</div>
    </div>
    <div class="card">
      <div class="card-title">TT1/8</div>
      <div class="card-value">${trackCount("TT1/8")}</div>
      <div class="card-sub">${trackSub("TT1/8")}</div>
    </div>
    <div class="card">
      <div class="card-title">TT1/10</div>
      <div class="card-value">${trackCount("TT1/10")}</div>
      <div class="card-sub">${trackSub("TT1/10")}</div>
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
  `).join("") || "<div class='card'>Aucun pilote trouve</div>";
}

function renderClubStats(){
  const activities = getActivities();
  const pilots = getPilotsFromActivities();
  const totalLaps = data?.summary?.laps_count || getAllLiveLaps().length;

  document.getElementById("clubStats").innerHTML = `
    <div class="stat-box"><strong>${activities.length}</strong><span>sessions</span></div>
    <div class="stat-box"><strong>${pilots.length}</strong><span>pilotes</span></div>
    <div class="stat-box"><strong>${totalLaps}</strong><span>tours</span></div>
    <div class="stat-box"><strong>${data?.data_quality?.global_score ?? "-"}</strong><span>qualite</span></div>
  `;
}

function renderHeatmap(){
  const days = {};
  getActivities().forEach(a=>{
    const d = a.date_fr || a.date || "inconnu";
    if(!days[d]) days[d] = {sessions:0,laps:0};
    days[d].sessions += 1;
    days[d].laps += (a.participants || []).reduce((sum,p)=>sum+((p.laps || []).length),0);
  });

  const entries = Object.entries(days).slice(-14);

  document.getElementById("heatmap").innerHTML = entries.map(([day,v])=>`
    <div class="heat-cell">
      <strong>${v.laps}</strong>
      <span>${day}</span>
      <span>${v.sessions} sessions</span>
    </div>
  `).join("") || "<div class='card'>Aucune activite</div>";
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
