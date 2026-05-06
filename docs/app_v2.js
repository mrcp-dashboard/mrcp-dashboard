let DB = null;

let PILOT_NAMES = {};
let LOCAL_NAMES = {};

function normalizeTransponder(t) {
  return String(t || '').trim().replace(/\/0$/, '');
}
function loadLocalNames() {
  try { LOCAL_NAMES = JSON.parse(localStorage.getItem('mrcp_pilot_names') || '{}'); }
  catch { LOCAL_NAMES = {}; }
}
function saveLocalNames() {
  localStorage.setItem('mrcp_pilot_names', JSON.stringify(LOCAL_NAMES, null, 2));
}
async function loadPilotNamesFile() {
  try {
    const res = await fetch('speedhive_pilots.json?cache=' + Date.now());
    if (res.ok) PILOT_NAMES = await res.json();
  } catch (_) { PILOT_NAMES = {}; }
}
function pilotNameFor(transponder, fallback) {
  const t = normalizeTransponder(transponder);
  return LOCAL_NAMES[t] || PILOT_NAMES[t] || fallback || `Inconnu #${t}`;
}
function applyPilotNames() {
  if (!DB) return;
  const oldToNewSlug = new Map();
  DB.pilots.forEach(p => {
    const oldSlug = p.slug;
    const name = pilotNameFor(p.transponder, p.name);
    p.name = name;
    p.slug = slugText(name + '-' + normalizeTransponder(p.transponder));
    oldToNewSlug.set(oldSlug, p.slug);
  });
  DB.activities.forEach(a => {
    a.participants.forEach(part => {
      part.pilot_name = pilotNameFor(part.transponder, part.pilot_name);
      part.pilot_slug = slugText(part.pilot_name + '-' + normalizeTransponder(part.transponder));
    });
    if (a.participants && a.participants.length) a.best_pilot = a.participants[0].pilot_name;
  });
  const best = DB.records?.best_lap;
  if (best) { best.pilot = pilotNameFor(best.transponder, best.pilot); best.slug = slugText(best.pilot + '-' + normalizeTransponder(best.transponder)); }
  const active = DB.records?.most_active;
  if (active) { active.pilot = pilotNameFor(active.transponder, active.pilot); active.slug = slugText(active.pilot + '-' + normalizeTransponder(active.transponder)); }
}
function editButton(transponder, currentName) {
  return `<button class="edit-btn" title="Modifier ce nom" onclick="editPilotName('${escapeHtml(normalizeTransponder(transponder))}', '${escapeHtml(currentName)}')">✏️</button>`;
}
function pilotNameCell(name, slug, transponder) {
  return `<a href="#/pilote/${escapeHtml(slug)}">${escapeHtml(name)}</a> ${editButton(transponder, name)}`;
}
function activityLabel(s) {
  return `${escapeHtml(s.date_fr || 'Sans date')}${s.best_pilot ? ' — ' + escapeHtml(s.best_pilot) : ''}`;
}
function editPilotName(transponder, currentName) {
  const t = normalizeTransponder(transponder);
  const name = prompt(`Nom du pilote pour le transpondeur ${t}`, (LOCAL_NAMES[t] || PILOT_NAMES[t] || currentName || '').replace(/^Inconnu #\d+$/, ''));
  if (name === null) return;
  const cleaned = name.trim();
  if (!cleaned) return;
  LOCAL_NAMES[t] = cleaned;
  saveLocalNames();
  applyPilotNames();
  route();
}
function exportPilotNames() {
  const merged = {...PILOT_NAMES, ...LOCAL_NAMES};
  const blob = new Blob([JSON.stringify(merged, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'speedhive_pilots.json';
  a.click();
  URL.revokeObjectURL(url);
}
function unknownPilots() {
  return DB.pilots.filter(p => /^Inconnu #/i.test(p.name));
}

function importPilotNamesFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      const cleaned = {};
      Object.entries(imported).forEach(([k, v]) => {
        const t = normalizeTransponder(k);
        const name = String(v || '').trim();
        if (t && name) cleaned[t] = name;
      });
      LOCAL_NAMES = {...LOCAL_NAMES, ...cleaned};
      saveLocalNames();
      applyPilotNames();
      alert(Object.keys(cleaned).length + ' nom(s) importé(s). Pense à exporter speedhive_pilots.json pour le rendre permanent.');
      route();
    } catch (e) {
      alert('Import impossible : fichier JSON invalide.');
    }
  };
  reader.readAsText(file);
}
function copyPilotNamesToClipboard() {
  const merged = {...PILOT_NAMES, ...LOCAL_NAMES};
  const text = JSON.stringify(merged, null, 2);
  navigator.clipboard.writeText(text).then(() => alert('JSON copié dans le presse-papier.'));
}
function resetLocalPilotNames() {
  if (!confirm('Effacer les modifications locales de ce navigateur ?')) return;
  LOCAL_NAMES = {};
  saveLocalNames();
  applyPilotNames();
  route();
}
function bulkEditPilotNames() {
  const merged = {...PILOT_NAMES, ...LOCAL_NAMES};
  const current = JSON.stringify(merged, null, 2);
  const next = prompt('Édition avancée JSON transpondeur → nom. Colle un JSON valide.', current);
  if (next === null) return;
  try {
    const parsed = JSON.parse(next);
    const cleaned = {};
    Object.entries(parsed).forEach(([k, v]) => {
      const t = normalizeTransponder(k);
      const name = String(v || '').trim();
      if (t && name) cleaned[t] = name;
    });
    LOCAL_NAMES = cleaned;
    saveLocalNames();
    applyPilotNames();
    route();
  } catch (e) {
    alert('JSON invalide, aucune modification appliquée.');
  }
}



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
function setTitle(title) { document.title = title ? `${title} | MRCP Dashboard V2.4` : 'MRCP Dashboard V2.4'; }

function route() {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return renderHome();
  if (parts[0] === 'sessions') return renderSessions();
  if (parts[0] === 'session') return renderSession(parts[1]);
  if (parts[0] === 'pilotes') return renderPilots();
  if (parts[0] === 'pilote') return renderPilot(parts[1]);
  if (parts[0] === 'records') return renderRecords();
  if (parts[0] === 'compare') return renderCompare();
  if (parts[0] === 'edition') return renderEdition();
  renderHome();
}

async function init() {
  try {
    const res = await fetch('data_v2.json?cache=' + Date.now());
    if (!res.ok) throw new Error('Impossible de charger data_v2.json');
    DB = await res.json();
    loadLocalNames();
    await loadPilotNamesFile();
    applyPilotNames();
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
        <table><thead><tr><th>Date</th><th>Sortie</th><th>Pilotes</th><th>Best</th></tr></thead><tbody>
          ${recent.map(s => `<tr><td>${escapeHtml(s.date_fr)}</td><td><a href="#/session/${s.id}">${activityLabel(s)}</a></td><td>${s.pilot_count}</td><td class="best">${fmtTime(s.best_lap)}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="card">
        <h2>Top pilotes</h2>
        <table><thead><tr><th>Pilote</th><th>Best</th><th>Tours</th></tr></thead><tbody>
          ${topPilots.map(p => `<tr><td>${pilotNameCell(p.name, p.slug, p.transponder)}</td><td class="best">${fmtTime(p.best_lap)}</td><td>${p.total_laps}</td></tr>`).join('')}
        </tbody></table>
        <p class="muted">Pilote le plus actif : ${active ? `${pilotNameCell(active.pilot, active.slug, active.transponder)} (${active.laps} tours)` : '-'}</p>
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
      ${rows.map(p => `<tr><td>${pilotNameCell(p.name, p.slug, p.transponder)}</td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${p.activities_count}</td><td>${p.total_laps}</td><td class="best">${fmtTime(p.best_lap)}</td></tr>`).join('')}
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
    table.innerHTML = `<p class="muted">${filtered.length} session(s)</p><table><thead><tr><th>Date</th><th>Sortie</th><th>Pilotes</th><th>Tours</th><th>Meilleur tour</th><th>Meilleur pilote</th></tr></thead><tbody>
      ${filtered.map(s => `<tr><td>${escapeHtml(s.date_fr)}</td><td><a href="#/session/${s.id}">${activityLabel(s)}</a></td><td>${s.pilot_count}</td><td>${s.laps_count}</td><td class="best">${fmtTime(s.best_lap)}</td><td>${escapeHtml(s.best_pilot)}</td></tr>`).join('')}
      </tbody></table>`;
  }
  q.addEventListener('input', draw); draw();
}

function renderSession(id) {
  const s = DB.activities.find(x => String(x.id) === String(id));
  if (!s) return app.innerHTML = `<div class="card">Session introuvable.</div>`;
  setTitle(`Sortie ${s.date_fr || ''}`);
  app.innerHTML = `
    <div class="card">
      <p><a href="#/sessions">← Retour sessions</a></p>
      <h2>Sortie du ${escapeHtml(s.date_fr || 'sans date')}</h2>
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
      ${parts.map(p => `<tr><td>${p.rank}</td><td>${pilotNameCell(p.pilot_name, p.pilot_slug, p.transponder)}</td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${p.laps_count}</td><td class="best">${fmtTime(p.best_lap)}</td><td>${fmtTime(p.avg_lap)}</td><td>${fmtTime(p.consistency)}</td></tr>`).join('')}
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
      <h3>Résumé</h3>
      <div id="pilotInsights"></div>
      <h3>Historique</h3>
      <table><thead><tr><th>Date</th><th>Sortie</th><th>Rang</th><th>Tours</th><th>Meilleur</th><th>Moyenne</th><th>Régularité</th></tr></thead><tbody>
      ${acts.map(a => `<tr><td>${escapeHtml(a.date_fr)}</td><td><a href="#/session/${a.activity_id}">Voir</a></td><td>${a.rank}</td><td>${a.laps_count}</td><td class="best">${fmtTime(a.best_lap)}</td><td>${fmtTime(a.avg_lap)}</td><td>${fmtTime(a.consistency)}</td></tr>`).join('')}</tbody></table>
    </div>`;
  document.getElementById('pilotInsights').innerHTML = pilotInsights(p);
  drawSimpleLineChart('pilotChart', progression.map(a => ({label: a.date_fr || a.activity_id, value: a.best_lap})));
}

function pilotInsights(p) {
  const acts = [...p.activities].filter(a => a.best_lap).sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!acts.length) return '<p class="muted">Pas assez de données.</p>';
  const first = acts[0], last = acts[acts.length - 1];
  const best = acts.reduce((m,a) => a.best_lap < m.best_lap ? a : m, acts[0]);
  const improvement = first.best_lap - best.best_lap;
  const recent = acts.slice(-5);
  const recentAvg = recent.reduce((s,a)=>s+a.best_lap,0) / recent.length;
  return `<div class="kpi-row">
    <span class="badge">Premier best connu : ${fmtTime(first.best_lap)}</span>
    <span class="badge">Record : ${fmtTime(best.best_lap)} le ${escapeHtml(best.date_fr)}</span>
    <span class="badge">Gain depuis début : <span class="${improvement >= 0 ? 'delta-good' : 'delta-bad'}">${improvement >= 0 ? '-' : '+'}${Math.abs(improvement).toFixed(3)} s</span></span>
    <span class="badge">Moyenne 5 dernières : ${fmtTime(recentAvg)}</span>
    <span class="badge">Dernière sortie : ${escapeHtml(last.date_fr)} / ${fmtTime(last.best_lap)}</span>
  </div>`;
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
        <tr><th>Meilleur tour global</th><td class="best">${best ? fmtTime(best.time) : '-'}</td><td>${best ? `${pilotNameCell(best.pilot, best.slug, best.transponder)}` : ''}</td><td>${best ? `<span class="badge">${escapeHtml(best.transponder)}</span>` : ''}</td></tr>
        <tr><th>Pilote le plus actif</th><td>${active ? `${pilotNameCell(active.pilot, active.slug, active.transponder)}` : '-'}</td><td>${active ? active.laps + ' tours' : ''}</td><td>${active ? `<span class="badge">${escapeHtml(active.transponder)}</span>` : ''}</td></tr>
      </tbody></table>
    </div>
    <div class="card"><h2>Top 20 meilleurs tours</h2><table><thead><tr><th>#</th><th>Pilote</th><th>Transpondeur</th><th>Meilleur</th><th>Sessions</th><th>Tours</th></tr></thead><tbody>
      ${top.map((p,i) => `<tr><td>${i+1}</td><td>${pilotNameCell(p.name, p.slug, p.transponder)}</td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td class="best">${fmtTime(p.best_lap)}</td><td>${p.activities_count}</td><td>${p.total_laps}</td></tr>`).join('')}
    </tbody></table></div>`;
}


function renderCompare() {
  setTitle('Comparer');
  const options = [...DB.pilots].sort((a,b)=>a.name.localeCompare(b.name, 'fr')).map(p => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.name)} — ${escapeHtml(p.transponder)}</option>`).join('');
  app.innerHTML = `<div class="card">
    <h2>Comparer deux pilotes</h2>
    <p class="muted">Comparaison simple basée sur le meilleur tour, le volume de tours, les sessions et la régularité moyenne.</p>
    <div class="two-col">
      <div><label>Pilote A</label><select id="pA" class="select">${options}</select></div>
      <div><label>Pilote B</label><select id="pB" class="select">${options}</select></div>
    </div>
    <div class="toolbar"><button class="button" id="swapBtn">Inverser</button></div>
    <div id="compareResult"></div>
  </div>`;
  const a = document.getElementById('pA');
  const b = document.getElementById('pB');
  if (DB.pilots.length > 1) b.selectedIndex = 1;
  function draw() {
    const pa = DB.pilots.find(p => p.slug === a.value);
    const pb = DB.pilots.find(p => p.slug === b.value);
    if (!pa || !pb) return;
    const common = commonActivities(pa, pb);
    const bestDiff = (pa.best_lap || 0) - (pb.best_lap || 0);
    document.getElementById('compareResult').innerHTML = `
      <div class="two-col">
        ${comparePilotCard(pa)}
        ${comparePilotCard(pb)}
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Écart global</h3>
        <p>Meilleur tour : <strong>${escapeHtml(pa.name)}</strong> ${fmtTime(pa.best_lap)} vs <strong>${escapeHtml(pb.name)}</strong> ${fmtTime(pb.best_lap)} — écart <span class="${bestDiff <= 0 ? 'delta-good' : 'delta-bad'}">${bestDiff > 0 ? '+' : ''}${bestDiff.toFixed(3)} s</span> pour ${escapeHtml(pa.name)}.</p>
        <h3>Sessions communes</h3>
        ${common.length ? renderCommonTable(common, pa, pb) : '<p class="muted">Aucune session commune trouvée.</p>'}
      </div>`;
  }
  a.addEventListener('change', draw); b.addEventListener('change', draw);
  document.getElementById('swapBtn').addEventListener('click', () => { const i=a.selectedIndex; a.selectedIndex=b.selectedIndex; b.selectedIndex=i; draw(); });
  draw();
}

function comparePilotCard(p) {
  const regs = p.activities.map(a => a.consistency).filter(x => Number.isFinite(Number(x)) && Number(x) > 0);
  const avgReg = regs.length ? regs.reduce((s,x)=>s+Number(x),0)/regs.length : null;
  return `<div class="card"><h3>${pilotNameCell(p.name, p.slug, p.transponder)}</h3>
    <p><span class="badge">${escapeHtml(p.transponder)}</span></p>
    <table><tbody>
      <tr><th>Meilleur tour</th><td class="best">${fmtTime(p.best_lap)}</td></tr>
      <tr><th>Sessions</th><td>${p.activities_count}</td></tr>
      <tr><th>Tours</th><td>${p.total_laps}</td></tr>
      <tr><th>Moy. meilleurs</th><td>${fmtTime(p.avg_best_lap)}</td></tr>
      <tr><th>Régularité moyenne</th><td>${fmtTime(avgReg)}</td></tr>
    </tbody></table></div>`;
}

function commonActivities(pa, pb) {
  const ma = new Map(pa.activities.map(a => [String(a.activity_id), a]));
  return pb.activities.filter(b => ma.has(String(b.activity_id))).map(b => ({a: ma.get(String(b.activity_id)), b})).sort((x,y)=>byDateDesc(x.a,y.a));
}

function renderCommonTable(common, pa, pb) {
  return `<table><thead><tr><th>Date</th><th>Sortie</th><th>${escapeHtml(pa.name)}</th><th>${escapeHtml(pb.name)}</th><th>Écart A-B</th></tr></thead><tbody>
    ${common.map(r => {
      const d = Number(r.a.best_lap) - Number(r.b.best_lap);
      return `<tr><td>${escapeHtml(r.a.date_fr)}</td><td><a href="#/session/${r.a.activity_id}">Voir</a></td><td class="best">${fmtTime(r.a.best_lap)}</td><td class="best">${fmtTime(r.b.best_lap)}</td><td class="${d <= 0 ? 'delta-good' : 'delta-bad'}">${d > 0 ? '+' : ''}${d.toFixed(3)} s</td></tr>`;
    }).join('')}
  </tbody></table>`;
}


function renderEdition() {
  setTitle('Édition pilotes');
  const unknown = unknownPilots().sort((a,b)=>String(a.transponder).localeCompare(String(b.transponder)));
  const all = [...DB.pilots].sort((a,b)=>a.name.localeCompare(b.name, 'fr'));
  const knownCount = Object.keys(PILOT_NAMES).length;
  const localCount = Object.keys(LOCAL_NAMES).length;
  app.innerHTML = `<div class="card">
    <h2>Édition des noms pilotes</h2>
    <p class="muted">Les modifications sont enregistrées d'abord dans ce navigateur. Pour les rendre permanentes, exporte <strong>speedhive_pilots.json</strong>, remplace le fichier dans ton repo, puis push GitHub.</p>
    <div class="grid">
      <div class="card"><div class="muted">Noms du fichier</div><div class="stat">${knownCount}</div></div>
      <div class="card"><div class="muted">Modifs locales</div><div class="stat">${localCount}</div></div>
      <div class="card"><div class="muted">Inconnus restants</div><div class="stat">${unknown.length}</div></div>
      <div class="card"><div class="muted">Pilotes détectés</div><div class="stat">${all.length}</div></div>
    </div>
    <div class="toolbar wrap">
      <button class="button" onclick="exportPilotNames()">Exporter speedhive_pilots.json</button>
      <button class="button" onclick="copyPilotNamesToClipboard()">Copier le JSON</button>
      <button class="button" onclick="bulkEditPilotNames()">Édition JSON avancée</button>
      <button class="button danger" onclick="resetLocalPilotNames()">Effacer modifs locales</button>
      <label class="button">Importer JSON <input type="file" accept="application/json,.json" onchange="importPilotNamesFile(this)" hidden></label>
    </div>
    <div class="card help">
      <strong>Workflow conseillé :</strong> corrige les inconnus avec ✏️ → exporte le JSON → remplace <code>speedhive_pilots.json</code> dans ton dossier → teste → <code>git add . && git commit -m "Maj pilotes" && git push</code>.
    </div>
    <h3>Pilotes inconnus à compléter (${unknown.length})</h3>
    ${unknown.length ? `<table><thead><tr><th>Transpondeur</th><th>Nom actuel</th><th>Sessions</th><th>Tours</th><th>Action</th></tr></thead><tbody>${unknown.map(p => `<tr><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${escapeHtml(p.name)}</td><td>${p.activities_count}</td><td>${p.total_laps}</td><td>${editButton(p.transponder, p.name)}</td></tr>`).join('')}</tbody></table>` : '<p>Aucun pilote inconnu avec les données chargées.</p>'}
    <h3>Tous les pilotes</h3>
    <div class="toolbar"><input id="qEdit" placeholder="Rechercher un nom ou transpondeur à modifier..." /></div>
    <div id="editTable"></div>
  </div>`;
  const q = document.getElementById('qEdit');
  const box = document.getElementById('editTable');
  function drawEditTable() {
    const term = norm(q.value);
    const rows = all.filter(p => !term || norm(p.name).includes(term) || String(p.transponder).includes(term)).slice(0, 300);
    box.innerHTML = `<p class="muted">${rows.length} pilote(s) affiché(s)</p><table><thead><tr><th>Pilote</th><th>Transpondeur</th><th>Sessions</th><th>Tours</th><th>Meilleur</th><th>Action</th></tr></thead><tbody>
      ${rows.map(p => `<tr><td>${escapeHtml(p.name)}</td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${p.activities_count}</td><td>${p.total_laps}</td><td class="best">${fmtTime(p.best_lap)}</td><td>${editButton(p.transponder, p.name)}</td></tr>`).join('')}
    </tbody></table>`;
  }
  q.addEventListener('input', drawEditTable); drawEditTable();
}

init();
