let DB = null;

const app = document.getElementById('app');
const subtitle = document.getElementById('subtitle');

function fmtTime(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return Number(v).toFixed(3) + ' s';
}
function slugText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function byDateDesc(a, b) { return String(b.date || '').localeCompare(String(a.date || '')) || String(b.activity_id || b.id || '').localeCompare(String(a.activity_id || a.id || '')); }
function byBestLap(a, b) { return (Number(a.best_lap) || 9999) - (Number(b.best_lap) || 9999); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function setTitle(title) { document.title = title ? `${title} | MRCP Dashboard V2` : 'MRCP Dashboard V2'; }

function route() {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return renderHome();
  if (parts[0] === 'sessions') return renderSessions();
  if (parts[0] === 'session') return renderSession(parts[1]);
  if (parts[0] === 'pilotes') return renderPilots();
  if (parts[0] === 'pilote') return renderPilot(parts[1]);
  if (parts[0] === 'records') return renderRecords();
  renderHome();
}

async function init() {
  try {
    const res = await fetch('data_v2.json?cache=' + Date.now());
    if (!res.ok) throw new Error('Impossible de charger data_v2.json');
    DB = await res.json();
    subtitle.textContent = `${DB.summary.activities_count} sessions • ${DB.summary.pilots_count} pilotes • ${DB.summary.laps_count} tours • MAJ ${new Date(DB.generated_at).toLocaleString('fr-FR')}`;
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    app.innerHTML = `<div class="card"><h2>Erreur</h2><p>${escapeHtml(err.message)}</p><p>Vérifie que <strong>data_v2.json</strong> est dans le même dossier que index_v2.html.</p></div>`;
  }
}

function renderHome() {
  setTitle('Accueil');
  const best = DB.records?.best_lap;
  const active = DB.records?.most_active;
  const recent = [...DB.activities].sort(byDateDesc).slice(0, 8);
  const topPilots = [...DB.pilots].sort(byBestLap).slice(0, 8);
  app.innerHTML = `
    <div class="grid">
      <div class="card"><div class="muted">Sessions</div><div class="stat">${DB.summary.activities_count}</div></div>
      <div class="card"><div class="muted">Pilotes</div><div class="stat">${DB.summary.pilots_count}</div></div>
      <div class="card"><div class="muted">Tours</div><div class="stat">${DB.summary.laps_count}</div></div>
      <div class="card"><div class="muted">Meilleur tour</div><div class="stat">${best ? fmtTime(best.time) : '-'}</div><div class="muted">${best ? escapeHtml(best.pilot) : ''}</div></div>
    </div>
    <div class="card">
      <h2>Recherche rapide pilote</h2>
      <div class="toolbar"><input id="homeSearch" placeholder="Tape un nom ou transpondeur..." autofocus /></div>
      <div id="homeResults"></div>
    </div>
    <div class="two-col">
      <div class="card">
        <h2>Dernières sessions</h2>
        <table><thead><tr><th>Date</th><th>Session</th><th>Pilotes</th><th>Best</th></tr></thead><tbody>
          ${recent.map(s => `<tr><td>${escapeHtml(s.date_fr)}</td><td><a href="#/session/${s.id}">${escapeHtml(s.id)}</a></td><td>${s.pilot_count}</td><td class="best">${fmtTime(s.best_lap)}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="card">
        <h2>Top pilotes</h2>
        <table><thead><tr><th>Pilote</th><th>Best</th><th>Tours</th></tr></thead><tbody>
          ${topPilots.map(p => `<tr><td><a href="#/pilote/${p.slug}">${escapeHtml(p.name)}</a></td><td class="best">${fmtTime(p.best_lap)}</td><td>${p.total_laps}</td></tr>`).join('')}
        </tbody></table>
        <p class="muted">Pilote le plus actif : ${active ? `<a href="#/pilote/${active.slug}">${escapeHtml(active.pilot)}</a> (${active.laps} tours)` : '-'}</p>
      </div>
    </div>`;
  attachPilotSearch('homeSearch', 'homeResults', 10);
}

function attachPilotSearch(inputId, resultId, limit = 50) {
  const q = document.getElementById(inputId);
  const box = document.getElementById(resultId);
  function draw() {
    const term = norm(q.value.trim());
    if (!term) { box.innerHTML = '<p class="muted">Saisis au moins une lettre.</p>'; return; }
    const rows = DB.pilots.filter(p => norm(p.name).includes(term) || String(p.transponder).includes(term)).slice(0, limit);
    box.innerHTML = rows.length ? `<table><thead><tr><th>Pilote</th><th>Transpondeur</th><th>Sessions</th><th>Tours</th><th>Meilleur</th></tr></thead><tbody>
      ${rows.map(p => `<tr><td><a href="#/pilote/${p.slug}">${escapeHtml(p.name)}</a></td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${p.activities_count}</td><td>${p.total_laps}</td><td class="best">${fmtTime(p.best_lap)}</td></tr>`).join('')}
      </tbody></table>` : '<p>Aucun pilote trouvé.</p>';
  }
  q.addEventListener('input', draw); draw();
}

function renderSessions() {
  setTitle('Sessions');
  const rows = [...DB.activities].sort(byDateDesc);
  app.innerHTML = `<div class="card"><h2>Sessions</h2><div class="toolbar"><input id="q" placeholder="Rechercher date, pilote, session..." /></div><div id="table"></div></div>`;
  const q = document.getElementById('q');
  const table = document.getElementById('table');
  function draw() {
    const term = norm(q.value);
    const filtered = rows.filter(s => String(s.id).includes(term) || norm(s.date_fr).includes(term) || norm(s.best_pilot).includes(term));
    table.innerHTML = `<p class="muted">${filtered.length} session(s)</p><table><thead><tr><th>Date</th><th>Session</th><th>Pilotes</th><th>Tours</th><th>Meilleur tour</th><th>Meilleur pilote</th></tr></thead><tbody>
      ${filtered.map(s => `<tr><td>${escapeHtml(s.date_fr)}</td><td><a href="#/session/${s.id}">${escapeHtml(s.id)}</a></td><td>${s.pilot_count}</td><td>${s.laps_count}</td><td class="best">${fmtTime(s.best_lap)}</td><td>${escapeHtml(s.best_pilot)}</td></tr>`).join('')}
      </tbody></table>`;
  }
  q.addEventListener('input', draw); draw();
}

function renderSession(id) {
  const s = DB.activities.find(x => String(x.id) === String(id));
  if (!s) return app.innerHTML = `<div class="card">Session introuvable.</div>`;
  setTitle(`Session ${s.id}`);
  app.innerHTML = `
    <div class="card">
      <p><a href="#/sessions">← Retour sessions</a></p>
      <h2>Session ${escapeHtml(s.id)}</h2>
      <p class="muted">${escapeHtml(s.date_fr)} • ${s.pilot_count} pilotes • ${s.laps_count} tours</p>
      <div class="toolbar"><input id="qSession" placeholder="Filtrer les pilotes de cette session..." /></div>
      <div id="sessionTable"></div>
    </div>
    <div class="card"><h3>Détail tour par tour</h3><div id="lapDetails"></div></div>`;
  const q = document.getElementById('qSession');
  const table = document.getElementById('sessionTable');
  const details = document.getElementById('lapDetails');
  function draw() {
    const term = norm(q.value);
    const parts = s.participants.filter(p => norm(p.pilot_name).includes(term) || String(p.transponder).includes(term));
    table.innerHTML = `<table><thead><tr><th>Rang</th><th>Pilote</th><th>Transpondeur</th><th>Tours</th><th>Meilleur</th><th>Moyenne</th><th>Régularité</th></tr></thead><tbody>
      ${parts.map(p => `<tr><td>${p.rank}</td><td><a href="#/pilote/${p.pilot_slug}">${escapeHtml(p.pilot_name)}</a></td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${p.laps_count}</td><td class="best">${fmtTime(p.best_lap)}</td><td>${fmtTime(p.avg_lap)}</td><td>${fmtTime(p.consistency)}</td></tr>`).join('')}
      </tbody></table>`;
    details.innerHTML = parts.map(p => `<details><summary>${escapeHtml(p.pilot_name)} — ${p.laps_count} tours — best ${fmtTime(p.best_lap)}</summary>
        <table><thead><tr><th>Tour</th><th>Heure</th><th>Temps</th><th>Vitesse</th></tr></thead><tbody>
        ${p.laps.map(l => `<tr><td>${l.lap_no}</td><td>${escapeHtml(l.start_time)}</td><td class="best">${fmtTime(l.lap_time)}</td><td>${escapeHtml(l.speed)}</td></tr>`).join('')}
        </tbody></table></details>`).join('');
  }
  q.addEventListener('input', draw); draw();
}

function renderPilots() {
  setTitle('Pilotes');
  app.innerHTML = `<div class="card"><h2>Pilotes</h2><div class="toolbar"><input id="qPilots" placeholder="Rechercher nom ou transpondeur..." /></div><div id="pilotResults"></div></div>`;
  attachPilotSearch('qPilots', 'pilotResults', 500);
}

function renderPilot(slug) {
  const p = DB.pilots.find(x => x.slug === slug || slugText(x.name) === slug || String(x.transponder) === String(slug));
  if (!p) return app.innerHTML = `<div class="card">Pilote introuvable.</div>`;
  setTitle(p.name);
  const acts = [...p.activities].sort(byDateDesc);
  const progression = [...p.activities].filter(a => a.best_lap).sort((a,b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(-25);
  app.innerHTML = `
    <div class="card">
      <p><a href="#/pilotes">← Retour pilotes</a></p>
      <h2>${escapeHtml(p.name)}</h2>
      <p><span class="badge">Transpondeur ${escapeHtml(p.transponder)}</span></p>
      <div class="grid">
        <div class="card"><div class="muted">Sessions</div><div class="stat">${p.activities_count}</div></div>
        <div class="card"><div class="muted">Tours</div><div class="stat">${p.total_laps}</div></div>
        <div class="card"><div class="muted">Meilleur</div><div class="stat">${fmtTime(p.best_lap)}</div></div>
        <div class="card"><div class="muted">Moy. meilleurs</div><div class="stat">${fmtTime(p.avg_best_lap)}</div></div>
      </div>
      <h3>Progression des meilleurs tours</h3>
      <canvas id="pilotChart" height="120"></canvas>
      <h3>Historique</h3>
      <table><thead><tr><th>Date</th><th>Session</th><th>Rang</th><th>Tours</th><th>Meilleur</th><th>Moyenne</th><th>Régularité</th></tr></thead><tbody>
      ${acts.map(a => `<tr><td>${escapeHtml(a.date_fr)}</td><td><a href="#/session/${a.activity_id}">${escapeHtml(a.activity_id)}</a></td><td>${a.rank}</td><td>${a.laps_count}</td><td class="best">${fmtTime(a.best_lap)}</td><td>${fmtTime(a.avg_lap)}</td><td>${fmtTime(a.consistency)}</td></tr>`).join('')}</tbody></table>
    </div>`;
  drawSimpleLineChart('pilotChart', progression.map(a => ({label: a.date_fr || a.activity_id, value: a.best_lap})));
}

function drawSimpleLineChart(id, points) {
  const canvas = document.getElementById(id);
  if (!canvas || points.length < 2) {
    if (canvas) canvas.insertAdjacentHTML('afterend', '<p class="muted">Pas assez de données pour tracer la progression.</p>');
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(500, rect.width) * dpr;
  canvas.height = 180 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = canvas.width / dpr, h = canvas.height / dpr;
  const pad = 36;
  const vals = points.map(p => Number(p.value));
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = Math.max(0.001, max - min);
  ctx.clearRect(0,0,w,h);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, h-pad); ctx.lineTo(w-pad, h-pad); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad + i * ((w - pad*2) / (points.length - 1));
    const y = pad + ((Number(p.value) - min) / span) * (h - pad*2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.font = '12px system-ui';
  ctx.fillText(fmtTime(min), pad + 4, pad + 12);
  ctx.fillText(fmtTime(max), pad + 4, h - pad - 6);
  ctx.fillText(points[0].label, pad, h - 8);
  ctx.fillText(points[points.length - 1].label, Math.max(pad, w - pad - 90), h - 8);
}

function renderRecords() {
  setTitle('Records');
  const best = DB.records?.best_lap;
  const active = DB.records?.most_active;
  const top = [...DB.pilots].sort(byBestLap).slice(0, 20);
  app.innerHTML = `
    <div class="card">
      <h2>Records</h2>
      <table><tbody>
        <tr><th>Meilleur tour global</th><td class="best">${best ? fmtTime(best.time) : '-'}</td><td>${best ? `<a href="#/pilote/${best.slug}">${escapeHtml(best.pilot)}</a>` : ''}</td><td>${best ? `<span class="badge">${escapeHtml(best.transponder)}</span>` : ''}</td></tr>
        <tr><th>Pilote le plus actif</th><td>${active ? `<a href="#/pilote/${active.slug}">${escapeHtml(active.pilot)}</a>` : '-'}</td><td>${active ? active.laps + ' tours' : ''}</td><td>${active ? `<span class="badge">${escapeHtml(active.transponder)}</span>` : ''}</td></tr>
      </tbody></table>
    </div>
    <div class="card"><h2>Top 20 meilleurs tours</h2><table><thead><tr><th>#</th><th>Pilote</th><th>Transpondeur</th><th>Meilleur</th><th>Sessions</th><th>Tours</th></tr></thead><tbody>
      ${top.map((p,i) => `<tr><td>${i+1}</td><td><a href="#/pilote/${p.slug}">${escapeHtml(p.name)}</a></td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td class="best">${fmtTime(p.best_lap)}</td><td>${p.activities_count}</td><td>${p.total_laps}</td></tr>`).join('')}
    </tbody></table></div>`;
}

init();
