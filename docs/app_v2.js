let DB = null;

const app = document.getElementById('app');
const subtitle = document.getElementById('subtitle');

function fmtTime(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return Number(v).toFixed(3) + ' s';
}
function slugText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function byDateDesc(a, b) { return String(b.date || '').localeCompare(String(a.date || '')); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
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
    subtitle.textContent = `${DB.summary.activities_count} sessions • ${DB.summary.pilots_count} pilotes • ${DB.summary.laps_count} tours`;
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    app.innerHTML = `<div class="card"><h2>Erreur</h2><p>${escapeHtml(err.message)}</p><p>Vérifie que <strong>data_v2.json</strong> est dans le même dossier que index_v2.html.</p></div>`;
  }
}

function renderHome() {
  const best = DB.records?.global_best_lap;
  app.innerHTML = `
    <div class="grid">
      <div class="card"><div class="muted">Sessions</div><div class="stat">${DB.summary.activities_count}</div></div>
      <div class="card"><div class="muted">Pilotes</div><div class="stat">${DB.summary.pilots_count}</div></div>
      <div class="card"><div class="muted">Tours</div><div class="stat">${DB.summary.laps_count}</div></div>
      <div class="card"><div class="muted">Meilleur tour</div><div class="stat">${best ? fmtTime(best.lap_time) : '-'}</div></div>
    </div>
    <div class="card">
      <h2>Accès rapide</h2>
      <p>Commence par consulter les sessions ou rechercher un pilote.</p>
      <p><a class="button" href="#/sessions">Voir les sessions</a> <a class="button" href="#/pilotes">Voir les pilotes</a></p>
    </div>
  `;
}

function renderSessions() {
  const rows = [...DB.activities].sort(byDateDesc);
  app.innerHTML = `
    <div class="card">
      <h2>Sessions</h2>
      <div class="toolbar"><input id="q" placeholder="Rechercher date, pilote, session..." /></div>
      <div id="table"></div>
    </div>`;
  const q = document.getElementById('q');
  const table = document.getElementById('table');
  function draw() {
    const term = q.value.toLowerCase();
    const filtered = rows.filter(s =>
      String(s.id).includes(term) || String(s.date_fr).includes(term) || String(s.best_pilot).toLowerCase().includes(term)
    );
    table.innerHTML = `
      <table><thead><tr><th>Date</th><th>Session</th><th>Pilotes</th><th>Tours</th><th>Meilleur tour</th><th>Meilleur pilote</th></tr></thead><tbody>
      ${filtered.map(s => `<tr>
        <td>${escapeHtml(s.date_fr)}</td>
        <td><a href="#/session/${s.id}">${escapeHtml(s.id)}</a></td>
        <td>${s.pilot_count}</td>
        <td>${s.laps_count}</td>
        <td class="best">${fmtTime(s.best_lap)}</td>
        <td>${escapeHtml(s.best_pilot)}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  q.addEventListener('input', draw); draw();
}

function renderSession(id) {
  const s = DB.activities.find(x => String(x.id) === String(id));
  if (!s) return app.innerHTML = `<div class="card">Session introuvable.</div>`;
  app.innerHTML = `
    <div class="card">
      <p><a href="#/sessions">← Retour sessions</a></p>
      <h2>Session ${escapeHtml(s.id)}</h2>
      <p class="muted">${escapeHtml(s.date_fr)} • ${s.pilot_count} pilotes • ${s.laps_count} tours</p>
      <table><thead><tr><th>Rang</th><th>Pilote</th><th>Transpondeur</th><th>Tours</th><th>Meilleur</th><th>Moyenne</th><th>Régularité</th></tr></thead><tbody>
      ${s.participants.map(p => `<tr>
        <td>${p.rank}</td>
        <td><a href="#/pilote/${p.pilot_slug}">${escapeHtml(p.pilot_name)}</a></td>
        <td><span class="badge">${escapeHtml(p.transponder)}</span></td>
        <td>${p.laps_count}</td>
        <td class="best">${fmtTime(p.best_lap)}</td>
        <td>${fmtTime(p.avg_lap)}</td>
        <td>${fmtTime(p.consistency)}</td>
      </tr>`).join('')}</tbody></table>
    </div>
    <div class="card">
      <h3>Détail tour par tour</h3>
      ${s.participants.map(p => `<details><summary>${escapeHtml(p.pilot_name)} — ${p.laps_count} tours</summary>
        <table><thead><tr><th>Tour</th><th>Heure</th><th>Temps</th><th>Vitesse</th></tr></thead><tbody>
        ${p.laps.map(l => `<tr><td>${l.lap_no}</td><td>${escapeHtml(l.start_time)}</td><td class="best">${fmtTime(l.lap_time)}</td><td>${escapeHtml(l.speed)}</td></tr>`).join('')}
        </tbody></table></details>`).join('')}
    </div>`;
}

function renderPilots() {
  const pilots = [...DB.pilots].sort((a,b) => String(a.name).localeCompare(String(b.name)));
  app.innerHTML = `
    <div class="card">
      <h2>Pilotes</h2>
      <div class="toolbar"><input id="q" placeholder="Rechercher nom ou transpondeur..." /></div>
      <div id="table"></div>
    </div>`;
  const q = document.getElementById('q');
  const table = document.getElementById('table');
  function draw() {
    const term = q.value.toLowerCase();
    const filtered = pilots.filter(p => String(p.name).toLowerCase().includes(term) || String(p.transponder).includes(term));
    table.innerHTML = `<table><thead><tr><th>Pilote</th><th>Transpondeur</th><th>Sessions</th><th>Tours</th><th>Meilleur tour</th><th>Moy. meilleurs</th></tr></thead><tbody>
      ${filtered.map(p => `<tr>
        <td><a href="#/pilote/${p.slug}">${escapeHtml(p.name)}</a></td>
        <td><span class="badge">${escapeHtml(p.transponder)}</span></td>
        <td>${p.activities_count}</td>
        <td>${p.total_laps}</td>
        <td class="best">${fmtTime(p.best_lap)}</td>
        <td>${fmtTime(p.avg_best_lap)}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  q.addEventListener('input', draw); draw();
}

function renderPilot(slug) {
  const p = DB.pilots.find(x => x.slug === slug || slugText(x.name) === slug);
  if (!p) return app.innerHTML = `<div class="card">Pilote introuvable.</div>`;
  const acts = [...p.activities].sort(byDateDesc);
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
      <h3>Historique</h3>
      <table><thead><tr><th>Date</th><th>Session</th><th>Rang</th><th>Tours</th><th>Meilleur</th><th>Moyenne</th><th>Régularité</th></tr></thead><tbody>
      ${acts.map(a => `<tr>
        <td>${escapeHtml(a.date_fr)}</td>
        <td><a href="#/session/${a.activity_id}">${escapeHtml(a.activity_id)}</a></td>
        <td>${a.rank}</td>
        <td>${a.laps_count}</td>
        <td class="best">${fmtTime(a.best_lap)}</td>
        <td>${fmtTime(a.avg_lap)}</td>
        <td>${fmtTime(a.consistency)}</td>
      </tr>`).join('')}</tbody></table>
    </div>`;
}

function renderRecords() {
  const best = DB.records?.global_best_lap;
  const active = DB.records?.most_active_pilot;
  app.innerHTML = `
    <div class="card">
      <h2>Records</h2>
      <table><tbody>
        <tr><th>Meilleur tour global</th><td class="best">${best ? fmtTime(best.lap_time) : '-'}</td><td>${best ? escapeHtml(best.pilot_name) : ''}</td><td>${best ? escapeHtml(best.date_fr) : ''}</td></tr>
        <tr><th>Pilote le plus actif</th><td>${active ? escapeHtml(active.name) : '-'}</td><td>${active ? active.total_laps + ' tours' : ''}</td><td></td></tr>
      </tbody></table>
    </div>`;
}

init();
