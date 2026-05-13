let data = null;

function fmtLap(v){
  if(!v && v !== 0) return "-";
  return Number(v).toFixed(3) + "s";
}

function getActivities(){
  return data?.activities || [];
}

function resolvePilotName(p){
  const candidates = [
    p.display_name,
    p.pilot_name,
    p.driver_name,
    p.driver,
    p.pilot,
    p.full_name,
    p.name
  ];

  for(const c of candidates){
    if(!c) continue;
    const txt = String(c).trim();
    if(/^\d+$/.test(txt)) continue;
    if(txt.length < 2) continue;
    return txt;
  }

  return "Puce " + (
    p.transponder ||
    p.transponder_id ||
    p.chip ||
    p.name ||
    "inconnue"
  );
}

function getPilots(){
  const pilots = {};

  getActivities().forEach(a=>{
    (a.participants || []).forEach(p=>{
      const name = resolvePilotName(p);

      if(!pilots[name]){
        pilots[name] = {
          name,
          laps:0,
          best:null,
          sessions:0,
          history:[]
        };
      }

      const laps =
        p.laps_count ||
        p.lap_count ||
        (p.laps ? p.laps.length : 0) ||
        0;

      const best =
        p.best_lap ||
        p.best ||
        p.bestLap ||
        null;

      pilots[name].laps += laps;
      pilots[name].sessions += 1;

      if(best && (!pilots[name].best || best < pilots[name].best)){
        pilots[name].best = best;
      }

      pilots[name].history.push({
        date:a.date_fr || a.date || "Session",
        laps,
        best
      });
    });
  });

  return Object.values(pilots);
}

function computeRating(){
  const pilots = getPilots();
  let globalBest = null;

  pilots.forEach(p=>{
    if(p.best && (!globalBest || p.best < globalBest)){
      globalBest = p.best;
    }
  });

  return pilots.map(p=>{
    const bestScore =
      p.best && globalBest
      ? Math.max(0, 400 - ((p.best - globalBest) * 100))
      : 0;

    const activityScore = Math.min(250, p.laps * 0.4);
    const sessionScore = Math.min(150, p.sessions * 5);
    const regularityScore = p.best ? Math.max(0, 200 - (p.best * 2)) : 0;

    return {
      ...p,
      rating:Math.round(bestScore + activityScore + sessionScore + regularityScore)
    };
  }).sort((a,b)=>b.rating-a.rating);
}

function badgesFor(p,index){
  const badges = [];

  if(index === 0) badges.push(["👑 King Club","gold"]);
  if(index <= 2) badges.push(["⚡ Top 3 MRCP","gold"]);
  if(p.laps >= 5000) badges.push(["🏁 Endurance","red"]);
  if(p.laps >= 1000) badges.push(["🔥 Rouleur fou","purple"]);
  if(p.laps >= 200) badges.push(["🚀 Très actif","green"]);
  if(p.sessions >= 10) badges.push(["🎯 Régulier",""]);
  if(p.best && p.best < 35) badges.push(["⚡ Speed Master","red"]);
  if(!badges.length) badges.push(["🔰 Rookie",""]);

  return badges;
}

function showProfile(name){
  const ranking = computeRating();
  const index = ranking.findIndex(p=>p.name === name);
  const p = ranking[index];

  if(!p) return;

  document.getElementById("profile").classList.remove("hidden");
  document.getElementById("pilotName").textContent = p.name;
  document.getElementById("pilotRating").textContent = p.rating + " MRCP pts";
  document.getElementById("bestLap").textContent = fmtLap(p.best);
  document.getElementById("totalLaps").textContent = p.laps;
  document.getElementById("sessions").textContent = p.sessions;

  document.getElementById("badges").innerHTML =
    badgesFor(p,index).map(b=>`
      <div class="badge ${b[1]}">${b[0]}</div>
    `).join("");

  document.getElementById("history").innerHTML =
    p.history.slice(-12).reverse().map(h=>`
      <div class="history-item">
        <strong>${h.date}</strong>
        <small>${h.laps} tours — best ${fmtLap(h.best)}</small>
      </div>
    `).join("");

  const url = new URL(window.location.href);
  url.searchParams.set("name", p.name);
  history.replaceState(null,"",url.toString());
}

function renderSearch(q=""){
  const box = document.getElementById("searchResults");

  if(!q){
    box.innerHTML = "";
    return;
  }

  const pilots = computeRating()
    .filter(p=>p.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0,10);

  box.innerHTML = pilots.map(p=>`
    <div class="result" data-name="${p.name}">
      ${p.name} — ${p.rating} pts
    </div>
  `).join("");

  box.querySelectorAll(".result").forEach(el=>{
    el.addEventListener("click",()=>{
      showProfile(el.dataset.name);
      box.innerHTML = "";
      document.getElementById("pilotSearch").value = el.dataset.name;
    });
  });
}

async function init(){
  const res = await fetch("data_v2.json?ts=" + Date.now());
  data = await res.json();

  const params = new URLSearchParams(window.location.search);
  const name = params.get("name");

  if(name){
    document.getElementById("pilotSearch").value = name;
    showProfile(name);
  }

  document.getElementById("pilotSearch").addEventListener("input",e=>{
    renderSearch(e.target.value);
  });
}

init();
