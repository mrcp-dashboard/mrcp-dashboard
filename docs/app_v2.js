let DB = null;

let PILOT_NAMES = {};
let LOCAL_NAMES = {};
let TRACK_FILTER = localStorage.getItem('mrcp_track_filter') || 'all'; // all | TT1/8 | TT1/10
let FAVORITES = new Set();
let LAP_OVERRIDES = { excluded: {}, forced_track: {} };
let ADMIN_MODE = localStorage.getItem('mrcp_admin_mode') === '1';
let MY_PILOT_TRANSPONDER = localStorage.getItem('mrcp_my_pilot_transponder') || '';


function setTrackFilter(track) {
  TRACK_FILTER = track || 'all';
  localStorage.setItem('mrcp_track_filter', TRACK_FILTER);
  route();
}
function trackBadge(track) {
  if (!track || track === 'all') return 'Toutes pistes';
  return track;
}

function loadLapOverrides() {
  try {
    const raw = JSON.parse(localStorage.getItem('mrcp_lap_overrides') || '{}');
    LAP_OVERRIDES = {
      excluded: raw.excluded && typeof raw.excluded === 'object' ? raw.excluded : {},
      forced_track: raw.forced_track && typeof raw.forced_track === 'object' ? raw.forced_track : {}
    };
  } catch (_) { LAP_OVERRIDES = { excluded: {}, forced_track: {} }; }
}
function saveLapOverrides() {
  localStorage.setItem('mrcp_lap_overrides', JSON.stringify(LAP_OVERRIDES, null, 2));
}
function lapKey(activityId, transponder, lapNo, startTime, lapTime) {
  return [activityId, normalizeTransponder(transponder), lapNo ?? '', startTime ?? '', Number(lapTime).toFixed(3)].join('|');
}
function lapIdFromContext(activity, participant, lap) {
  return lapKey(activity?.id || activity?.activity_id || '', participant?.transponder || '', lap?.lap_no || '', lap?.start_time || '', lap?.lap_time);
}
function lapIsExcludedById(id) { return !!LAP_OVERRIDES.excluded[id]; }
function forcedTrackById(id) { return LAP_OVERRIDES.forced_track[id] || null; }
function effectiveLapTrack(lap, id) {
  return forcedTrackById(id) || lap?.track || inferTrackFromSeconds(lap?.lap_time);
}
function adminBadge() {
  return ADMIN_MODE ? '<span class="badge admin-badge">Admin</span>' : '';
}
function requireAdmin() {
  if (ADMIN_MODE) return true;
  const pin = prompt('Code admin local ?');
  // Ce code n’est pas une vraie sécurité serveur : il cache juste les boutons aux visiteurs classiques.
  if (pin === 'mrcp') {
    ADMIN_MODE = true;
    localStorage.setItem('mrcp_admin_mode', '1');
    return true;
  }
  alert('Code incorrect.');
  return false;
}
function exitAdmin() {
  ADMIN_MODE = false;
  localStorage.removeItem('mrcp_admin_mode');
  route();
}
function setLapExcluded(id, label) {
  if (!requireAdmin()) return;
  const reason = prompt('Pourquoi exclure ce tour des records/podiums ?', label || 'Erreur chrono / mauvaise piste');
  if (reason === null) return;
  LAP_OVERRIDES.excluded[id] = { reason: reason || 'Exclu par admin', at: new Date().toISOString() };
  saveLapOverrides();
  route();
}
function restoreLap(id) {
  if (!requireAdmin()) return;
  delete LAP_OVERRIDES.excluded[id];
  delete LAP_OVERRIDES.forced_track[id];
  saveLapOverrides();
  route();
}
function forceLapTrack(id, track) {
  if (!requireAdmin()) return;
  LAP_OVERRIDES.forced_track[id] = track;
  delete LAP_OVERRIDES.excluded[id];
  saveLapOverrides();
  route();
}
function exportLapOverrides() {
  downloadText('lap_overrides.json', JSON.stringify(LAP_OVERRIDES, null, 2), 'application/json;charset=utf-8');
}
function importLapOverridesFromText() {
  if (!requireAdmin()) return;
  const current = JSON.stringify(LAP_OVERRIDES, null, 2);
  const next = prompt('Colle le contenu JSON lap_overrides.json', current);
  if (next === null) return;
  try {
    const parsed = JSON.parse(next);
    LAP_OVERRIDES = {
      excluded: parsed.excluded && typeof parsed.excluded === 'object' ? parsed.excluded : {},
      forced_track: parsed.forced_track && typeof parsed.forced_track === 'object' ? parsed.forced_track : {}
    };
    saveLapOverrides();
    route();
  } catch (e) { alert('JSON invalide.'); }
}
function adminLapButtons(row) {
  if (!ADMIN_MODE || !row?.lap_id) return '';
  const id = escapeHtml(row.lap_id);
  const ex = lapIsExcludedById(row.lap_id);
  return `<div class="admin-actions">
    ${ex ? `<button class="button danger" onclick="restoreLap('${id}')">Restaurer</button>` : `<button class="button danger" onclick="setLapExcluded('${id}', '${escapeHtml(row.pilot_name || '')} ${fmtTime(row.lap_time)}')">Exclure</button>`}
    <button class="button" onclick="forceLapTrack('${id}', 'TT1/10')">Forcer TT1/10</button>
    <button class="button" onclick="forceLapTrack('${id}', 'TT1/8')">Forcer TT1/8</button>
  </div>`;
}
function loadFavorites() {
  try { FAVORITES = new Set(JSON.parse(localStorage.getItem('mrcp_favorite_transponders') || '[]').map(normalizeTransponder)); }
  catch { FAVORITES = new Set(); }
}
function saveFavorites() {
  localStorage.setItem('mrcp_favorite_transponders', JSON.stringify([...FAVORITES]));
}
function toggleFavorite(transponder) {
  const t = normalizeTransponder(transponder);
  if (!t) return;
  if (FAVORITES.has(t)) FAVORITES.delete(t); else FAVORITES.add(t);
  saveFavorites();
  route();
}

function setMyPilot(transponder) {
  MY_PILOT_TRANSPONDER = normalizeTransponder(transponder);
  localStorage.setItem('mrcp_my_pilot_transponder', MY_PILOT_TRANSPONDER);
  alert('Profil pilote enregistré sur cet appareil.');
  location.hash = '#/mes-chronos';
}
function clearMyPilot() {
  MY_PILOT_TRANSPONDER = '';
  localStorage.removeItem('mrcp_my_pilot_transponder');
  route();
}
function myPilot() {
  if (!MY_PILOT_TRANSPONDER || !DB?.pilots) return null;
  return DB.pilots.find(p => normalizeTransponder(p.transponder) === MY_PILOT_TRANSPONDER) || null;
}
function myPilotButton(transponder) {
  const t = normalizeTransponder(transponder);
  const active = t && t === MY_PILOT_TRANSPONDER;
  return `<button class="button ${active ? 'active' : ''}" onclick="setMyPilot('${escapeHtml(t)}')">${active ? '✓ Mon profil' : 'C’est mon profil'}</button>`;
}
function myChronosHomeBlock() {
  const p = myPilot();
  if (!p) {
    return `<div class="card mobile-hero"><h2>Mes chronos</h2><p class="muted">Sur smartphone, chaque pilote peut enregistrer son profil une seule fois et retrouver directement ses statistiques.</p><a class="button" href="#/mes-chronos">Choisir mon profil</a></div>`;
  }
  return `<div class="card mobile-hero"><h2>Mes chronos</h2><p><strong>${escapeHtml(p.name)}</strong></p><div class="kpi-row"><span class="badge">Best ${fmtTime(pilotBestFor(p))}</span><span class="badge">${pilotSessionsFor(p)} sessions</span><span class="badge">${pilotTotalFor(p)} tours</span></div><a class="button" href="#/mes-chronos">Voir mes chronos</a></div>`;
}

function favoriteButton(transponder) {
  const t = normalizeTransponder(transponder);
  const active = FAVORITES.has(t);
  return `<button class="fav-btn ${active ? 'active' : ''}" title="${active ? 'Retirer des favoris' : 'Ajouter aux favoris'}" onclick="toggleFavorite('${escapeHtml(t)}')">${active ? '★' : '☆'}</button>`;
}
function favoritePilots() {
  return filteredPilots().filter(p => FAVORITES.has(normalizeTransponder(p.transponder)));
}
function copyCurrentLink() {
  navigator.clipboard.writeText(location.href).then(() => alert('Lien copié.'));
}
function inferTrackFromSeconds(seconds) {
  const v = Number(seconds);
  if (!Number.isFinite(v)) return '';
  return v < 30 ? 'TT1/10' : 'TT1/8';
}
function tracksForActivity(a) {
  if (!a) return [];
  if (Array.isArray(a.tracks) && a.tracks.length) return a.tracks;
  if (a.track) return [a.track];
  if (a.track_counts) return Object.keys(a.track_counts).filter(k => a.track_counts[k] > 0);
  const inferred = inferTrackFromSeconds(a.best_lap);
  return inferred ? [inferred] : [];
}
function tracksForParticipant(p) {
  if (!p) return [];
  if (Array.isArray(p.tracks) && p.tracks.length) return p.tracks;
  if (p.track) return [p.track];
  const inferred = inferTrackFromSeconds(p.best_lap);
  return inferred ? [inferred] : [];
}
function activityMatchesTrack(a) {
  if (TRACK_FILTER === 'all') return true;
  return tracksForActivity(a).includes(TRACK_FILTER);
}
function participantMatchesTrack(p) {
  if (TRACK_FILTER === 'all') return true;
  return tracksForParticipant(p).includes(TRACK_FILTER);
}

function lapMatchesTrack(lap, id) {
  if (lapIsExcludedById(id)) return false;
  if (TRACK_FILTER === 'all') return true;
  return effectiveLapTrack(lap, id) === TRACK_FILTER;
}
function lapsForParticipant(p, activity) {
  const laps = Array.isArray(p?.laps) ? p.laps : [];
  return laps.map(l => {
    const id = lapIdFromContext(activity, p, l);
    return {...l, lap_id: id, track: effectiveLapTrack(l, id), excluded: lapIsExcludedById(id)};
  }).filter(l => lapMatchesTrack(l, l.lap_id));
}
function metricsFromLaps(laps) {
  const times = laps.map(l => Number(l.lap_time)).filter(Number.isFinite);
  if (!times.length) return {laps_count: 0, best_lap: null, avg_lap: null, consistency: null};
  const best = Math.min(...times);
  const avg = times.reduce((s, v) => s + v, 0) / times.length;
  const variance = times.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / times.length;
  return {laps_count: times.length, best_lap: best, avg_lap: avg, consistency: Math.sqrt(variance)};
}
function participantMetrics(p, activity) {
  const laps = lapsForParticipant(p, activity);
  const m = metricsFromLaps(laps);
  return {...m, laps};
}
function sessionParticipantsForDisplay(s) {
  return (s.participants || [])
    .map(p => ({...p, _metrics: participantMetrics(p, s)}))
    .filter(p => p._metrics.laps_count > 0)
    .sort((a, b) => (a._metrics.best_lap || 9999) - (b._metrics.best_lap || 9999));
}
function allLapsFlat() {
  const rows = [];
  (DB?.activities || []).forEach(a => {
    (a.participants || []).forEach(p => {
      const pilotName = p.pilot_name || p.name || `Inconnu #${p.transponder}`;
      const pilotSlug = p.pilot_slug || slugText(pilotName + '-' + normalizeTransponder(p.transponder));
      (p.laps || []).forEach(l => {
        const id = lapIdFromContext(a, p, l);
        if (lapIsExcludedById(id)) return;
        const track = effectiveLapTrack(l, id);
        if (TRACK_FILTER !== 'all' && track !== TRACK_FILTER) return;
        rows.push({
          lap_id: id,
          activity_id: a.id,
          date: a.date,
          date_fr: a.date_fr,
          pilot_name: pilotName,
          pilot_slug: pilotSlug,
          transponder: p.transponder,
          lap_no: l.lap_no,
          start_time: l.start_time,
          lap_time: Number(l.lap_time),
          speed: l.speed,
          track
        });
      });
    });
  });
  return rows.filter(r => Number.isFinite(r.lap_time)).sort((a,b) => a.lap_time - b.lap_time);
}
function downloadText(filename, text, type='text/plain') {
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function csvEscape(v) {
  const s = String(v ?? '');
  return /[;\n\r"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportSessionCsv(activityId) {
  const s = DB.activities.find(x => String(x.id) === String(activityId));
  if (!s) return;
  const rows = [['date','piste','pilote','transpondeur','rang','tour','heure','temps','vitesse']];
  sessionParticipantsForDisplay(s).forEach((p, idx) => {
    p._metrics.laps.forEach(l => rows.push([s.date_fr, l.track || inferTrackFromSeconds(l.lap_time), p.pilot_name, p.transponder, idx + 1, l.lap_no, l.start_time, Number(l.lap_time).toFixed(3), l.speed]));
  });
  downloadText(`mrcp_session_${s.date_fr || s.id}_${TRACK_FILTER}.csv`.replace(/[^a-z0-9_.-]+/gi, '_'), rows.map(r => r.map(csvEscape).join(';')).join('\n'), 'text/csv;charset=utf-8');
}
function pilotActivitiesFor(p) {
  const acts = p.activities || [];
  if (TRACK_FILTER === 'all') return acts;
  return acts.filter(a => tracksForActivity(a).includes(TRACK_FILTER));
}
function lapsForPilotGlobal(p) {
  const t = normalizeTransponder(p?.transponder);
  const rows = [];
  (DB?.activities || []).forEach(a => {
    (a.participants || []).forEach(part => {
      if (normalizeTransponder(part.transponder) !== t) return;
      (part.laps || []).forEach(l => {
        const id = lapIdFromContext(a, part, l);
        if (lapIsExcludedById(id)) return;
        const track = effectiveLapTrack(l, id);
        if (TRACK_FILTER !== 'all' && track !== TRACK_FILTER) return;
        const sec = Number(l.lap_time);
        if (!Number.isFinite(sec)) return;
        rows.push({activity_id:a.id, date:a.date, date_fr:a.date_fr, lap_time:sec, track, lap_id:id});
      });
    });
  });
  return rows;
}
function pilotBestFor(p) {
  const laps = lapsForPilotGlobal(p);
  if (!laps.length) return null;
  return Math.min(...laps.map(l => Number(l.lap_time)));
}
function pilotTotalFor(p) {
  return lapsForPilotGlobal(p).length;
}
function pilotSessionsFor(p) {
  return new Set(lapsForPilotGlobal(p).map(l => l.activity_id)).size;
}
function avgBestLapFor(p) {
  const acts = pilotActivitiesFor(p).filter(a => Number.isFinite(Number(a.best_lap)));
  if (!acts.length) return null;
  return acts.reduce((sum, a) => sum + Number(a.best_lap), 0) / acts.length;
}
function filteredPilots() {
  return (DB?.pilots || []).filter(p => TRACK_FILTER === 'all' || lapsForPilotGlobal(p).length > 0);
}
function filteredActivities() {
  return (DB?.activities || []).filter(activityMatchesTrack);
}
function trackControls() {
  const cls = t => TRACK_FILTER === t ? 'button active' : 'button';
  return `<div class="track-filter toolbar wrap">
    <button class="${cls('all')}" onclick="setTrackFilter('all')">Toutes pistes</button>
    <button class="${cls('TT1/8')}" onclick="setTrackFilter('TT1/8')">TT1/8 ≥ 30 s</button>
    <button class="${cls('TT1/10')}" onclick="setTrackFilter('TT1/10')">TT1/10 &lt; 30 s</button>
  </div>`;
}

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
  return `${favoriteButton(transponder)} <a href="#/pilote/${escapeHtml(slug)}">${escapeHtml(name)}</a> ${editButton(transponder, name)}`;
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
function byBestLap(a, b) { return (Number(pilotBestFor(a)) || 9999) - (Number(pilotBestFor(b)) || 9999); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function setTitle(title) { document.title = title ? `${title} | MRCP Dashboard V3.4` : 'MRCP Dashboard V3.4'; }

function route() {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return renderHome();
  if (parts[0] === 'mes-chronos') return renderMyChronos();
  if (parts[0] === 'sessions') return renderSessions();
  if (parts[0] === 'session') return renderSession(parts[1]);
  if (parts[0] === 'pilotes') return renderPilots();
  if (parts[0] === 'pilote') return renderPilot(parts[1]);
  if (parts[0] === 'records') return renderRecords();
  if (parts[0] === 'podiums') return renderPodiums();
  if (parts[0] === 'graphiques') return renderGraphiques();
  if (parts[0] === 'chronos') return renderChronos();
  if (parts[0] === 'compare') return renderCompare();
  if (parts[0] === 'favoris') return renderFavorites();
  if (parts[0] === 'edition') return renderEdition();
  if (parts[0] === 'qualite') return renderDataQuality();
  if (parts[0] === 'admin') return renderAdminRecords();
  renderHome();
}

async function init() {
  try {
    const res = await fetch('data_v2.json?cache=' + Date.now());
    if (!res.ok) throw new Error('Impossible de charger data_v2.json');
    DB = await res.json();
    loadLocalNames();
    loadFavorites();
    loadLapOverrides();
    await loadPilotNamesFile();
    applyPilotNames();
    subtitle.textContent = `${DB.summary.activities_count} sessions • ${DB.summary.pilots_count} pilotes • ${DB.summary.laps_count} tours • Filtre: ${trackBadge(TRACK_FILTER)} • MAJ ${new Date(DB.generated_at).toLocaleString('fr-FR')}`;
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    app.innerHTML = `<div class="card"><h2>Erreur</h2><p>${escapeHtml(err.message)}</p><p>Vérifie que <strong>data_v2.json</strong> est dans le même dossier que index_v2.html.</p></div>`;
  }
}


function homeFavoritesBlock() {
  const favs = favoritePilots().sort(byBestLap).slice(0, 12);
  if (!favs.length) {
    return `<div class="card"><h2>Favoris</h2><p class="muted">Clique sur ☆ à côté d’un pilote pour le retrouver ici rapidement.</p></div>`;
  }
  return `<div class="card"><h2>Favoris</h2><div class="toolbar wrap"><a class="button" href="#/favoris">Voir tous les favoris</a></div>
    <table><thead><tr><th>Pilote</th><th>Best</th><th>Sessions</th><th>Tours</th></tr></thead><tbody>
      ${favs.map(p => `<tr><td>${pilotNameCell(p.name, p.slug, p.transponder)}</td><td class="best">${fmtTime(pilotBestFor(p))}</td><td>${pilotSessionsFor(p)}</td><td>${pilotTotalFor(p)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function renderHome() {
  setTitle('Accueil');
  const recent = filteredActivities().sort(byDateDesc).slice(0, 8);
  const pilots = filteredPilots();
  const topPilots = pilots.sort(byBestLap).slice(0, 8);
  const bestPilot = topPilots[0] || null;
  const activePilot = [...pilots].sort((a,b)=>pilotTotalFor(b)-pilotTotalFor(a))[0] || null;
  const lapsInFilter = TRACK_FILTER === 'all' ? DB.summary.laps_count : (DB.summary.tracks?.[TRACK_FILTER]?.laps_count || filteredActivities().reduce((sum,a)=>sum+(a.track_counts?.[TRACK_FILTER]||0),0));
  app.innerHTML = `
    ${trackControls()}
    ${qualityHomeBlock()}
    ${myChronosHomeBlock()}
    <div class="grid">
      <div class="card"><div class="muted">Sessions</div><div class="stat">${filteredActivities().length}</div></div>
      <div class="card"><div class="muted">Pilotes</div><div class="stat">${pilots.length}</div></div>
      <div class="card"><div class="muted">Tours</div><div class="stat">${lapsInFilter}</div></div>
      <div class="card"><div class="muted">Meilleur tour</div><div class="stat">${bestPilot ? fmtTime(pilotBestFor(bestPilot)) : '-'}</div><div class="muted">${bestPilot ? escapeHtml(bestPilot.name) : ''}</div></div>
    </div>
    <div class="card">
      <h2>Recherche rapide pilote</h2>
      <div class="toolbar"><input id="homeSearch" placeholder="Tape un nom ou transpondeur..." autofocus /></div>
      <div id="homeResults"></div>
    </div>
    ${homeFavoritesBlock()}
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
          ${topPilots.map(p => `<tr><td>${pilotNameCell(p.name, p.slug, p.transponder)}</td><td class="best">${fmtTime(pilotBestFor(p))}</td><td>${pilotTotalFor(p)}</td></tr>`).join('')}
        </tbody></table>
        <p class="muted">Pilote le plus actif : ${activePilot ? `${pilotNameCell(activePilot.name, activePilot.slug, activePilot.transponder)} (${pilotTotalFor(activePilot)} tours)` : '-'}</p>
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
    const rows = filteredPilots().filter(p => norm(p.name).includes(term) || String(p.transponder).includes(term)).slice(0, limit);
    box.innerHTML = rows.length ? `<table><thead><tr><th>Pilote</th><th>Transpondeur</th><th>Sessions</th><th>Tours</th><th>Meilleur</th></tr></thead><tbody>
      ${rows.map(p => `<tr><td>${pilotNameCell(p.name, p.slug, p.transponder)}</td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${pilotSessionsFor(p)}</td><td>${pilotTotalFor(p)}</td><td class="best">${fmtTime(pilotBestFor(p))}</td></tr>`).join('')}
      </tbody></table>` : '<p>Aucun pilote trouvé.</p>';
  }
  q.addEventListener('input', draw); draw();
}


function renderMyChronos() {
  setTitle('Mes chronos');
  const p = myPilot();
  if (!p) {
    app.innerHTML = `<div class="card mobile-hero"><h2>Mes chronos</h2><p class="muted">Choisis ton profil une fois depuis ce téléphone. Le choix reste enregistré dans le navigateur.</p>${trackControls()}<div class="toolbar"><input id="qMyPilot" placeholder="Chercher mon nom ou transpondeur..." autofocus /></div><div id="myPilotResults"></div></div>`;
    const q = document.getElementById('qMyPilot');
    const box = document.getElementById('myPilotResults');
    function draw() {
      const term = norm(q.value.trim());
      if (!term) { box.innerHTML = '<p class="muted">Tape ton nom, prénom ou numéro de transpondeur.</p>'; return; }
      const rows = filteredPilots().filter(x => norm(x.name).includes(term) || String(x.transponder).includes(term)).slice(0, 30);
      box.innerHTML = rows.length ? `<div class="mobile-card-list">${rows.map(x => `<div class="pilot-mobile-card"><div><strong>${escapeHtml(x.name)}</strong><div class="muted">Transpondeur ${escapeHtml(x.transponder)}</div><div class="kpi-row"><span class="badge">Best ${fmtTime(pilotBestFor(x))}</span><span class="badge">${pilotSessionsFor(x)} sessions</span><span class="badge">${pilotTotalFor(x)} tours</span></div></div><button class="button" onclick="setMyPilot('${escapeHtml(normalizeTransponder(x.transponder))}')">C’est moi</button></div>`).join('')}</div>` : '<p>Aucun pilote trouvé.</p>';
    }
    q.addEventListener('input', draw); draw();
    return;
  }
  const acts = pilotActivitiesFor(p).sort(byDateDesc);
  const progression = pilotActivitiesFor(p).filter(a => a.best_lap).sort((a,b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(-30);
  const bestAct = acts.filter(a => a.best_lap).sort((a,b)=>a.best_lap-b.best_lap)[0] || null;
  const lastAct = acts[0] || null;
  const totalLaps = pilotTotalFor(p);
  const sessions = pilotSessionsFor(p);
  const best = pilotBestFor(p);
  app.innerHTML = `<div class="card mobile-hero my-chronos">
    <p><a href="#/">← Accueil</a></p>
    <h2>Mes chronos — ${escapeHtml(p.name)}</h2>
    ${trackControls()}
    <div class="toolbar wrap">${myPilotButton(p.transponder)}<a class="button" href="#/pilote/${escapeHtml(p.slug)}">Fiche complète</a><button class="button" onclick="copyCurrentLink()">Partager</button><button class="button danger" onclick="clearMyPilot()">Changer de pilote</button></div>
    <div class="grid mobile-grid">
      <div class="card"><div class="muted">Meilleur tour</div><div class="stat">${fmtTime(best)}</div><div class="muted">${bestAct ? escapeHtml(bestAct.date_fr) : ''}</div></div>
      <div class="card"><div class="muted">Sessions</div><div class="stat">${sessions}</div></div>
      <div class="card"><div class="muted">Tours</div><div class="stat">${totalLaps}</div></div>
      <div class="card"><div class="muted">Moy. meilleurs</div><div class="stat">${fmtTime(avgBestLapFor(p))}</div></div>
    </div>
    <h3>Résumé personnel</h3>
    <div>${pilotInsights(p)}</div>
    <h3>Progression</h3>
    <canvas id="myPilotChart" height="130"></canvas>
    <h3>Dernières sorties</h3>
    <div class="mobile-card-list">${acts.slice(0, 12).map(a => `<div class="pilot-mobile-card"><div><strong>${escapeHtml(a.date_fr)}</strong><div class="muted">${escapeHtml(a.track || trackBadge(TRACK_FILTER))}</div><div class="kpi-row"><span class="badge">Best ${fmtTime(a.best_lap)}</span><span class="badge">Moy ${fmtTime(a.avg_lap)}</span><span class="badge">${a.laps_count} tours</span></div></div><a class="button" href="#/session/${escapeHtml(a.activity_id)}">Voir</a></div>`).join('')}</div>
  </div>`;
  drawSimpleLineChart('myPilotChart', progression.map(a => ({label: a.date_fr || a.activity_id, value: a.best_lap})));
}

function renderSessions() {
  setTitle('Sessions');
  const rows = filteredActivities().sort(byDateDesc);
  app.innerHTML = `<div class="card"><h2>Sessions — ${trackBadge(TRACK_FILTER)}</h2>${trackControls()}<div class="toolbar"><input id="q" placeholder="Rechercher date ou pilote..." /></div><div id="table"></div></div>`;
  const q = document.getElementById('q');
  const table = document.getElementById('table');
  function draw() {
    const term = norm(q.value);
    const filtered = rows.filter(s => norm(s.date_fr).includes(term) || norm(s.best_pilot).includes(term));
    table.innerHTML = `<p class="muted">${filtered.length} session(s)</p><table><thead><tr><th>Date</th><th>Piste</th><th>Sortie</th><th>Pilotes</th><th>Tours</th><th>Meilleur tour</th><th>Meilleur pilote</th></tr></thead><tbody>
      ${filtered.map(s => `<tr><td>${escapeHtml(s.date_fr)}</td><td><span class="badge">${escapeHtml(s.track || tracksForActivity(s).join(', '))}</span></td><td><a href="#/session/${s.id}">${activityLabel(s)}</a></td><td>${s.pilot_count}</td><td>${TRACK_FILTER === 'all' ? s.laps_count : (s.track_counts?.[TRACK_FILTER] || (activityMatchesTrack(s) ? s.laps_count : 0))}</td><td class="best">${fmtTime(s.best_lap)}</td><td>${escapeHtml(s.best_pilot)}</td></tr>`).join('')}
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
      ${trackControls()}
      <p class="muted">${escapeHtml(s.date_fr)} • ${escapeHtml(s.track || tracksForActivity(s).join(', '))} • ${s.pilot_count} pilotes • ${TRACK_FILTER === 'all' ? s.laps_count : (s.track_counts?.[TRACK_FILTER] || 0)} tours</p>
      <div class="toolbar wrap"><input id="qSession" placeholder="Filtrer les pilotes de cette session..." /><button class="button" onclick="exportSessionCsv('${escapeHtml(s.id)}')">Exporter CSV</button><button class="button" onclick="copyCurrentLink()">Copier lien session</button></div>
      <div id="sessionPodium"></div>
      <div id="sessionTable"></div>
    </div>
    <div class="card"><h3>Détail tour par tour</h3><p class="muted">Les tours affichés suivent le filtre piste actif.</p><div id="lapDetails"></div></div>`;
  const q = document.getElementById('qSession');
  const table = document.getElementById('sessionTable');
  const details = document.getElementById('lapDetails');
  const podium = document.getElementById('sessionPodium');
  function draw() {
    const term = norm(q.value);
    const parts = sessionParticipantsForDisplay(s).filter(p => norm(p.pilot_name).includes(term) || String(p.transponder).includes(term));
    podium.innerHTML = renderSessionPodium(parts);
    table.innerHTML = `<table><thead><tr><th>Rang</th><th>Piste</th><th>Pilote</th><th>Transpondeur</th><th>Tours</th><th>Meilleur</th><th>Moyenne</th><th>Régularité</th></tr></thead><tbody>
      ${parts.map((p, idx) => `<tr><td>${idx + 1}</td><td><span class="badge">${escapeHtml(TRACK_FILTER === 'all' ? (p.track || tracksForParticipant(p).join(', ')) : TRACK_FILTER)}</span></td><td>${pilotNameCell(p.pilot_name, p.pilot_slug, p.transponder)}</td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${p._metrics.laps_count}</td><td class="best">${fmtTime(p._metrics.best_lap)}</td><td>${fmtTime(p._metrics.avg_lap)}</td><td>${fmtTime(p._metrics.consistency)}</td></tr>`).join('')}
      </tbody></table>`;
    details.innerHTML = parts.map((p, idx) => `<details><summary>#${idx + 1} — ${escapeHtml(p.pilot_name)} — ${p._metrics.laps_count} tours — best ${fmtTime(p._metrics.best_lap)}</summary>
        <table><thead><tr><th>Tour</th><th>Piste</th><th>Heure</th><th>Temps</th><th>Vitesse</th>${ADMIN_MODE ? '<th>Admin</th>' : ''}</tr></thead><tbody>
        ${p._metrics.laps.map(l => `<tr><td>${l.lap_no}</td><td><span class="badge">${escapeHtml(l.track || inferTrackFromSeconds(l.lap_time))}</span></td><td>${escapeHtml(l.start_time)}</td><td class="best">${fmtTime(l.lap_time)}</td><td>${escapeHtml(l.speed)}</td>${ADMIN_MODE ? `<td>${adminLapButtons({lap_id:l.lap_id, pilot_name:p.pilot_name, lap_time:l.lap_time})}</td>` : ''}</tr>`).join('')}
        </tbody></table></details>`).join('');
  }
  q.addEventListener('input', draw); draw();
}

function renderPilots() {
  setTitle('Pilotes');
  app.innerHTML = `<div class="card"><h2>Pilotes — ${trackBadge(TRACK_FILTER)}</h2>${trackControls()}<div class="toolbar"><input id="qPilots" placeholder="Rechercher nom ou transpondeur..." /></div><div id="pilotResults"></div></div>`;
  attachPilotSearch('qPilots', 'pilotResults', 500);
}

function renderPilot(slug) {
  const p = DB.pilots.find(x => x.slug === slug || slugText(x.name) === slug || String(x.transponder) === String(slug));
  if (!p) return app.innerHTML = `<div class="card">Pilote introuvable.</div>`;
  setTitle(p.name);
  const acts = pilotActivitiesFor(p).sort(byDateDesc);
  const progression = pilotActivitiesFor(p).filter(a => a.best_lap).sort((a,b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(-25);
  app.innerHTML = `
    <div class="card">
      <p><a href="#/pilotes">← Retour pilotes</a></p>
      <h2>${favoriteButton(p.transponder)} ${escapeHtml(p.name)}</h2>
      <div class="toolbar wrap">${myPilotButton(p.transponder)}<button class="button" onclick="copyCurrentLink()">Copier lien pilote</button><button class="button" onclick="window.print()">Imprimer fiche</button></div>
      ${trackControls()}
      <p><span class="badge">Transpondeur ${escapeHtml(p.transponder)}</span> <span class="badge">${trackBadge(TRACK_FILTER)}</span></p>
      <div class="grid">
        <div class="card"><div class="muted">Sessions</div><div class="stat">${pilotSessionsFor(p)}</div></div>
        <div class="card"><div class="muted">Tours</div><div class="stat">${pilotTotalFor(p)}</div></div>
        <div class="card"><div class="muted">Meilleur</div><div class="stat">${fmtTime(pilotBestFor(p))}</div></div>
        <div class="card"><div class="muted">Moy. meilleurs</div><div class="stat">${fmtTime(avgBestLapFor(p))}</div></div>
      </div>
      <h3>Progression des meilleurs tours</h3>
      <canvas id="pilotChart" height="120"></canvas>
      <h3>Résumé</h3>
      <div id="pilotInsights"></div>
      <h3>Historique</h3>
      <table><thead><tr><th>Date</th><th>Piste</th><th>Sortie</th><th>Rang</th><th>Tours</th><th>Meilleur</th><th>Moyenne</th><th>Régularité</th></tr></thead><tbody>
      ${acts.map(a => `<tr><td>${escapeHtml(a.date_fr)}</td><td><span class="badge">${escapeHtml(a.track || '')}</span></td><td><a href="#/session/${a.activity_id}">Voir</a></td><td>${a.rank}</td><td>${a.laps_count}</td><td class="best">${fmtTime(a.best_lap)}</td><td>${fmtTime(a.avg_lap)}</td><td>${fmtTime(a.consistency)}</td></tr>`).join('')}</tbody></table>
    </div>`;
  document.getElementById('pilotInsights').innerHTML = pilotInsights(p);
  drawSimpleLineChart('pilotChart', progression.map(a => ({label: a.date_fr || a.activity_id, value: a.best_lap})));
}

function pilotInsights(p) {
  const acts = pilotActivitiesFor(p).filter(a => a.best_lap).sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')));
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


function bestProgressions(limit = 10) {
  return filteredPilots().map(p => {
    const acts = pilotActivitiesFor(p).filter(a => Number.isFinite(Number(a.best_lap))).sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')));
    if (acts.length < 2) return null;
    const first = acts[0];
    const best = acts.reduce((m,a) => Number(a.best_lap) < Number(m.best_lap) ? a : m, acts[0]);
    const gain = Number(first.best_lap) - Number(best.best_lap);
    return {p, first, best, gain};
  }).filter(x => x && x.gain > 0).sort((a,b) => b.gain - a.gain).slice(0, limit);
}


function podiumCard(title, rows, metricFn, unitLabel = '') {
  const medals = ['🥇','🥈','🥉'];
  return `<div class="podium-card card"><h3>${escapeHtml(title)}</h3>${rows.length ? `<div class="podium">
    ${rows.slice(0,3).map((p,i)=>`<div class="podium-place place-${i+1}"><div class="medal">${medals[i]}</div><div class="podium-name">${pilotNameCell(p.name, p.slug, p.transponder)}</div><div class="podium-score">${metricFn(p)}${unitLabel}</div></div>`).join('')}
  </div>` : '<p class="muted">Pas assez de données.</p>'}</div>`;
}

function renderSessionPodium(parts) {
  if (!parts || !parts.length) return '<p class="muted">Aucun tour pour ce filtre piste.</p>';
  return `<div class="podium-inline"><h3>Podium de la sortie</h3><div class="podium">
    ${parts.slice(0,3).map((p,i)=>`<div class="podium-place place-${i+1}"><div class="medal">${['🥇','🥈','🥉'][i]}</div><div class="podium-name">${pilotNameCell(p.pilot_name, p.pilot_slug, p.transponder)}</div><div class="podium-score">${fmtTime(p._metrics.best_lap)}</div><div class="muted small">${p._metrics.laps_count} tours</div></div>`).join('')}
  </div></div>`;
}

function regularityForPilot(p) {
  const vals = pilotActivitiesFor(p).map(a => Number(a.consistency)).filter(v => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  return vals.reduce((s,v)=>s+v,0)/vals.length;
}

function renderPodiums() {
  setTitle('Podiums');
  const pilots = filteredPilots();
  const fastest = [...pilots].filter(p => Number.isFinite(Number(pilotBestFor(p)))).sort(byBestLap);
  const active = [...pilots].sort((a,b)=>pilotTotalFor(b)-pilotTotalFor(a)).filter(p => pilotTotalFor(p) > 0);
  const regular = [...pilots].map(p => ({...p, _reg: regularityForPilot(p)})).filter(p => p._reg).sort((a,b)=>a._reg-b._reg);
  const prog = bestProgressions(3).map(x => ({...x.p, _gain: x.gain}));
  app.innerHTML = `<div class="card"><h2>Podiums — ${trackBadge(TRACK_FILTER)}</h2>${trackControls()}<p class="muted">Podiums automatiques selon le filtre piste actif.</p></div>
  <div class="podium-grid">
    ${podiumCard('Meilleurs tours', fastest, p => fmtTime(pilotBestFor(p)))}
    ${podiumCard('Plus actifs', active, p => pilotTotalFor(p), ' tours')}
    ${podiumCard('Plus réguliers', regular, p => fmtTime(p._reg))}
    ${podiumCard('Meilleures progressions', prog, p => '-' + Number(p._gain).toFixed(3) + ' s')}
  </div>`;
}

function drawBarChart(id, rows, opts = {}) {
  const canvas = document.getElementById(id);
  if (!canvas || !rows.length) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(520, rect.width) * dpr;
  canvas.height = (opts.height || 260) * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = canvas.width / dpr, h = canvas.height / dpr;
  const padL = 120, padR = 20, padT = 18, padB = 28;
  const values = rows.map(r => Number(r.value)).filter(Number.isFinite);
  const max = Math.max(...values, 0.001);
  const barH = Math.max(14, (h - padT - padB) / rows.length - 8);
  const textColor = getComputedStyle(document.body).getPropertyValue('--text') || '#e5e7eb';
  const mutedColor = getComputedStyle(document.body).getPropertyValue('--muted') || '#94a3b8';
  const accentColor = getComputedStyle(document.body).getPropertyValue('--accent') || '#38bdf8';
  ctx.clearRect(0,0,w,h);
  ctx.font = '12px system-ui';
  rows.forEach((r, i) => {
    const y = padT + i * (barH + 8);
    const bw = (Number(r.value) / max) * (w - padL - padR);
    ctx.fillStyle = mutedColor;
    ctx.fillText(String(r.label).slice(0,18), 8, y + barH - 3);
    ctx.fillStyle = accentColor;
    ctx.fillRect(padL, y, bw, barH);
    ctx.fillStyle = textColor;
    ctx.fillText(opts.format ? opts.format(r.value) : String(r.value), padL + bw + 6, y + barH - 3);
  });
}

function renderGraphiques() {
  setTitle('Graphiques');
  const fastest = filteredPilots().filter(p=>Number.isFinite(Number(pilotBestFor(p)))).sort(byBestLap).slice(0,10);
  const active = filteredPilots().sort((a,b)=>pilotTotalFor(b)-pilotTotalFor(a)).slice(0,10);
  const progressions = bestProgressions(10);
  const sessions = filteredActivities().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).slice(-30);
  app.innerHTML = `<div class="card"><h2>Graphiques — ${trackBadge(TRACK_FILTER)}</h2>${trackControls()}<p class="muted">Première version graphique simple, sans librairie externe, compatible GitHub Pages.</p></div>
  <div class="two-col">
    <div class="card"><h3>Top 10 meilleurs tours</h3><canvas id="chartFastest" height="220"></canvas></div>
    <div class="card"><h3>Top 10 volume de tours</h3><canvas id="chartActive" height="220"></canvas></div>
  </div>
  <div class="two-col">
    <div class="card"><h3>Meilleures progressions</h3><canvas id="chartProgress" height="220"></canvas></div>
    <div class="card"><h3>Volume des 30 dernières sorties</h3><canvas id="chartSessions" height="220"></canvas></div>
  </div>`;
  drawBarChart('chartFastest', fastest.map(p=>({label:p.name, value:Number(pilotBestFor(p))})), {format:fmtTime});
  drawBarChart('chartActive', active.map(p=>({label:p.name, value:pilotTotalFor(p)})), {format:v=>String(Math.round(v))});
  drawBarChart('chartProgress', progressions.map(r=>({label:r.p.name, value:Number(r.gain)})), {format:v=>'-'+Number(v).toFixed(3)+' s'});
  drawBarChart('chartSessions', sessions.map(s=>({label:s.date_fr || s.id, value: TRACK_FILTER === 'all' ? Number(s.laps_count || 0) : Number(s.track_counts?.[TRACK_FILTER] || 0)})), {format:v=>String(Math.round(v))});
}


function renderRecords() {
  setTitle('Records');
  const pilots = filteredPilots().filter(p => pilotBestFor(p));
  const top = pilots.sort(byBestLap).slice(0, 20);
  const best = top[0] || null;
  const active = [...filteredPilots()].sort((a,b)=>pilotTotalFor(b)-pilotTotalFor(a))[0] || null;
  app.innerHTML = `
    <div class="card">
      <h2>Records — ${trackBadge(TRACK_FILTER)}</h2>
      ${trackControls()}
      <table><tbody>
        <tr><th>Meilleur tour</th><td class="best">${best ? fmtTime(pilotBestFor(best)) : '-'}</td><td>${best ? `${pilotNameCell(best.name, best.slug, best.transponder)}` : ''}</td><td>${best ? `<span class="badge">${escapeHtml(best.transponder)}</span>` : ''}</td></tr>
        <tr><th>Pilote le plus actif</th><td>${active ? `${pilotNameCell(active.name, active.slug, active.transponder)}` : '-'}</td><td>${active ? pilotTotalFor(active) + ' tours' : ''}</td><td>${active ? `<span class="badge">${escapeHtml(active.transponder)}</span>` : ''}</td></tr>
      </tbody></table>
    </div>
    <div class="card"><h2>Top 20 meilleurs tours</h2><table><thead><tr><th>#</th><th>Pilote</th><th>Transpondeur</th><th>Meilleur</th><th>Sessions</th><th>Tours</th></tr></thead><tbody>
      ${top.map((p,i) => `<tr><td>${i+1}</td><td>${pilotNameCell(p.name, p.slug, p.transponder)}</td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td class="best">${fmtTime(pilotBestFor(p))}</td><td>${pilotSessionsFor(p)}</td><td>${pilotTotalFor(p)}</td></tr>`).join('')}
    </tbody></table></div>
    ${renderProgressionsBlock()}
  `;
}

function renderProgressionsBlock() {
  const rows = bestProgressions(10);
  return `<div class="card"><h2>Meilleures progressions</h2><p class="muted">Gain entre le premier meilleur tour connu et le record personnel actuel, selon le filtre piste actif.</p>${rows.length ? `<table><thead><tr><th>#</th><th>Pilote</th><th>Premier best</th><th>Record</th><th>Gain</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${pilotNameCell(r.p.name, r.p.slug, r.p.transponder)}</td><td>${fmtTime(r.first.best_lap)}<br><span class="muted small">${escapeHtml(r.first.date_fr)}</span></td><td class="best">${fmtTime(r.best.best_lap)}<br><span class="muted small">${escapeHtml(r.best.date_fr)}</span></td><td class="delta-good">-${r.gain.toFixed(3)} s</td></tr>`).join('')}</tbody></table>` : '<p>Pas assez de données.</p>'}</div>`;
}


function renderChronos() {
  setTitle('Chronos');
  const all = allLapsFlat();
  app.innerHTML = `<div class="card">
    <h2>Chronos tour par tour — ${trackBadge(TRACK_FILTER)}</h2>
    ${trackControls()}
    <p class="muted">Classement des meilleurs tours individuels, toutes sessions confondues. Pratique pour vérifier les records et retrouver rapidement une sortie.</p>
    <div class="toolbar wrap"><input id="qChronos" placeholder="Rechercher pilote, transpondeur ou date..." /><button class="button" id="copyTopChronos">Copier le top 100 CSV</button></div>
    <div id="chronoTable"></div>
  </div>`;
  const q = document.getElementById('qChronos');
  const box = document.getElementById('chronoTable');
  function filteredRows() {
    const term = norm(q.value);
    return all.filter(r => !term || norm(r.pilot_name).includes(term) || String(r.transponder).includes(term) || norm(r.date_fr).includes(term));
  }
  function draw() {
    const rows = filteredRows().slice(0, 300);
    box.innerHTML = `<p class="muted">${filteredRows().length} tour(s) trouvé(s), top ${rows.length} affiché(s).</p><table><thead><tr><th>#</th><th>Temps</th><th>Piste</th><th>Pilote</th><th>Date</th><th>Session</th><th>Tour</th><th>Heure</th>${ADMIN_MODE ? '<th>Admin</th>' : ''}</tr></thead><tbody>
      ${rows.map((r,i) => `<tr><td>${i+1}</td><td class="best">${fmtTime(r.lap_time)}</td><td><span class="badge">${escapeHtml(r.track)}</span></td><td>${pilotNameCell(r.pilot_name, r.pilot_slug, r.transponder)}</td><td>${escapeHtml(r.date_fr)}</td><td><a href="#/session/${r.activity_id}">Voir</a></td><td>${escapeHtml(r.lap_no)}</td><td>${escapeHtml(r.start_time)}</td>${ADMIN_MODE ? `<td>${adminLapButtons(r)}</td>` : ''}</tr>`).join('')}
    </tbody></table>`;
  }
  document.getElementById('copyTopChronos').addEventListener('click', () => {
    const rows = filteredRows().slice(0,100);
    const csv = [['rang','temps','piste','pilote','transpondeur','date','session','tour','heure']].concat(rows.map((r,i)=>[i+1, r.lap_time.toFixed(3), r.track, r.pilot_name, r.transponder, r.date_fr, r.activity_id, r.lap_no, r.start_time]));
    navigator.clipboard.writeText(csv.map(row => row.map(csvEscape).join(';')).join('\n')).then(()=>alert('Top 100 copié en CSV.'));
  });
  q.addEventListener('input', draw); draw();
}



function qualityHomeBlock() {
  const q = DB?.data_quality || null;
  if (!q) return '';
  const score = Number(q.global_score ?? 100);
  const cls = score >= 90 ? 'quality-good' : score >= 70 ? 'quality-warn' : 'quality-bad';
  const suspects = Number(q.suspicious_laps_count || 0);
  const unknown = Number(q.unknown_pilots_count || 0);
  const excluded = Number(q.overrides?.excluded_count || 0);
  const forced = Number(q.overrides?.forced_track_count || 0);
  return `<div class="card quality-banner ${cls}">
    <div><h2>Qualité des données</h2><p class="muted">Score ${score}/100 • ${suspects} tour(s) suspect(s) • ${unknown} pilote(s) inconnu(s) • ${excluded} exclu(s) • ${forced} piste(s) forcée(s)</p></div>
    <a class="button" href="#/qualite">Contrôler</a>
  </div>`;
}

function renderDataQuality() {
  setTitle('Qualité données');
  const q = DB?.data_quality || {};
  const suspects = Array.isArray(q.suspicious_laps) ? q.suspicious_laps : [];
  const unknowns = Array.isArray(q.unknown_pilots) ? q.unknown_pilots : [];
  const sessions = Array.isArray(q.sessions_quality) ? q.sessions_quality : [];
  const override = q.overrides || {};
  app.innerHTML = `<div class="card">
    <h2>Fiabilisation des données</h2>
    <p class="muted">Cette page sert à contrôler les erreurs qui faussent records, podiums et graphiques. Les corrections définitives passent par <code>lap_overrides.json</code> puis <code>python build_data_v2.py</code>.</p>
    <div class="grid">
      <div class="card"><div class="muted">Score global</div><div class="stat">${escapeHtml(q.global_score ?? '-')}</div></div>
      <div class="card"><div class="muted">Tours suspects</div><div class="stat">${escapeHtml(q.suspicious_laps_count ?? suspects.length)}</div></div>
      <div class="card"><div class="muted">Pilotes inconnus</div><div class="stat">${escapeHtml(q.unknown_pilots_count ?? unknowns.length)}</div></div>
      <div class="card"><div class="muted">Corrections</div><div class="stat">${escapeHtml((override.excluded_count || 0) + (override.forced_track_count || 0))}</div></div>
    </div>
    <div class="toolbar wrap"><a class="button" href="#/admin">Ouvrir admin corrections</a><button class="button" onclick="exportLapOverrides()">Exporter lap_overrides.json</button></div>
  </div>
  <div class="card"><h2>Tours suspects prioritaires</h2><p class="muted">Principalement les tours TT1/8 entre 30 et 45 s : souvent des TT1/10 lents comptés sur la mauvaise piste.</p>${renderQualitySuspects(suspects)}</div>
  <div class="card"><h2>Pilotes inconnus</h2>${unknowns.length ? `<table><thead><tr><th>Transpondeur</th><th>Tours</th><th>Best</th><th>Action</th></tr></thead><tbody>${unknowns.slice(0,150).map(u=>`<tr><td><span class="badge">${escapeHtml(u.transponder)}</span></td><td>${escapeHtml(u.laps_count)}</td><td class="best">${fmtTime(u.best_lap)}</td><td>${editButton(u.transponder, '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun pilote inconnu détecté.</p>'}</div>
  <div class="card"><h2>Qualité par session</h2>${sessions.length ? `<table><thead><tr><th>Score</th><th>Date</th><th>Piste</th><th>Tours</th><th>Suspects</th><th>Inconnus</th><th>Session</th></tr></thead><tbody>${sessions.slice(0,120).map(s=>`<tr><td><span class="badge">${escapeHtml(s.quality_score)}</span></td><td>${escapeHtml(s.date_fr)}</td><td>${escapeHtml((s.tracks || []).join(', '))}</td><td>${escapeHtml(s.laps_count)}</td><td>${escapeHtml(s.suspicious_laps_count)}</td><td>${escapeHtml(s.unknown_pilots_count)}</td><td><a href="#/session/${escapeHtml(s.id)}">Voir</a></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Pas de rapport session.</p>'}</div>`;
}
function renderQualitySuspects(rows) {
  if (!rows.length) return '<p class="muted">Aucun tour suspect détecté.</p>';
  return `<table><thead><tr><th>Temps</th><th>Piste</th><th>Raison</th><th>Pilote</th><th>Date</th><th>Session</th><th>Admin</th></tr></thead><tbody>${rows.slice(0,250).map(r=>`<tr><td class="best">${fmtTime(r.lap_time)}</td><td><span class="badge">${escapeHtml(r.track)}</span></td><td>${escapeHtml(r.reason || '')}</td><td>${pilotNameCell(r.pilot_name, r.pilot_slug || slugText((r.pilot_name||'')+'-'+normalizeTransponder(r.transponder)), r.transponder)}</td><td>${escapeHtml(r.date_fr)}</td><td><a href="#/session/${escapeHtml(r.activity_id)}">Voir</a></td><td>${ADMIN_MODE ? adminLapButtons(r) : '<a href="#/admin">Admin</a>'}</td></tr>`).join('')}</tbody></table>`;
}

function renderAdminRecords() {
  setTitle('Admin records');
  if (!ADMIN_MODE && !requireAdmin()) return renderHome();
  const allRaw = [];
  (DB?.activities || []).forEach(a => {
    (a.participants || []).forEach(p => {
      const pilotName = p.pilot_name || p.name || `Inconnu #${p.transponder}`;
      const pilotSlug = p.pilot_slug || slugText(pilotName + '-' + normalizeTransponder(p.transponder));
      (p.laps || []).forEach(l => {
        const id = lapIdFromContext(a, p, l);
        const baseTrack = l.track || inferTrackFromSeconds(l.lap_time);
        const track = effectiveLapTrack(l, id);
        const sec = Number(l.lap_time);
        if (!Number.isFinite(sec)) return;
        allRaw.push({lap_id:id, activity_id:a.id, date_fr:a.date_fr, pilot_name:pilotName, pilot_slug:pilotSlug, transponder:p.transponder, lap_no:l.lap_no, start_time:l.start_time, lap_time:sec, baseTrack, track, excluded:lapIsExcludedById(id), reason:LAP_OVERRIDES.excluded[id]?.reason || ''});
      });
    });
  });
  const suspicious = allRaw
    .filter(r => !r.excluded && r.lap_time >= 30 && r.lap_time < 45 && r.track === 'TT1/8')
    .sort((a,b)=>a.lap_time-b.lap_time)
    .slice(0,200);
  const excluded = allRaw.filter(r => r.excluded).sort((a,b)=>a.lap_time-b.lap_time).slice(0,200);
  const forced = allRaw.filter(r => LAP_OVERRIDES.forced_track[r.lap_id]).sort((a,b)=>a.lap_time-b.lap_time).slice(0,200);
  app.innerHTML = `<div class="card">
    <h2>Mode admin — corrections records/podiums ${adminBadge()}</h2>
    <p class="muted">Ici tu peux exclure un tour des records/podiums ou forcer sa piste. Les données SpeedHive restent intactes : les corrections sont stockées localement dans ce navigateur, puis peuvent devenir définitives avec export lap_overrides.json + rebuild.</p>
    <div class="toolbar wrap"><button class="button" onclick="exportLapOverrides()">Exporter lap_overrides.json</button><button class="button" onclick="importLapOverridesFromText()">Importer/coller JSON</button><button class="button danger" onclick="exitAdmin()">Quitter admin</button></div>
    <p class="muted"><strong>Important :</strong> pour rendre ces corrections permanentes sur ton poste, exporte le JSON et garde-le avec ton projet. Sur GitHub Pages statique, les visiteurs ne verront pas tes corrections locales tant qu’on ne les intègre pas dans le fichier généré.</p>
  </div>
  <div class="card"><h2>Suspects TT1/8 proches de 30 s</h2><p class="muted">Tours ≥ 30 s et &lt; 45 s actuellement classés TT1/8. Ce sont souvent des TT1/10 lents.</p>${renderAdminLapTable(suspicious)}</div>
  <div class="card"><h2>Tours forcés</h2>${forced.length ? renderAdminLapTable(forced) : '<p class="muted">Aucun tour forcé.</p>'}</div>
  <div class="card"><h2>Tours exclus</h2>${excluded.length ? renderAdminLapTable(excluded, true) : '<p class="muted">Aucun tour exclu.</p>'}</div>`;
}
function renderAdminLapTable(rows, showReason=false) {
  if (!rows.length) return '<p class="muted">Aucun tour.</p>';
  return `<table><thead><tr><th>Temps</th><th>Piste</th><th>Pilote</th><th>Date</th><th>Tour</th>${showReason ? '<th>Raison</th>' : ''}<th>Actions</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="best">${fmtTime(r.lap_time)}</td><td><span class="badge">${escapeHtml(r.track)}</span>${r.baseTrack !== r.track ? `<br><span class="muted small">base ${escapeHtml(r.baseTrack)}</span>` : ''}</td><td>${pilotNameCell(r.pilot_name, r.pilot_slug, r.transponder)}</td><td><a href="#/session/${r.activity_id}">${escapeHtml(r.date_fr)}</a></td><td>${escapeHtml(r.lap_no)}</td>${showReason ? `<td>${escapeHtml(r.reason)}</td>` : ''}<td>${adminLapButtons(r)}</td></tr>`).join('')}
  </tbody></table>`;
}

function renderCompare() {
  setTitle('Comparer');
  const options = filteredPilots().sort((a,b)=>a.name.localeCompare(b.name, 'fr')).map(p => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.name)} — ${escapeHtml(p.transponder)}</option>`).join('');
  app.innerHTML = `<div class="card">
    <h2>Comparer deux pilotes — ${trackBadge(TRACK_FILTER)}</h2>
    ${trackControls()}
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
  if (filteredPilots().length > 1) b.selectedIndex = 1;
  function draw() {
    const pa = DB.pilots.find(p => p.slug === a.value);
    const pb = DB.pilots.find(p => p.slug === b.value);
    if (!pa || !pb) return;
    const common = commonActivities(pa, pb);
    const bestDiff = (pilotBestFor(pa) || 0) - (pilotBestFor(pb) || 0);
    document.getElementById('compareResult').innerHTML = `
      <div class="two-col">
        ${comparePilotCard(pa)}
        ${comparePilotCard(pb)}
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Écart global</h3>
        <p>Meilleur tour : <strong>${escapeHtml(pa.name)}</strong> ${fmtTime(pilotBestFor(pa))} vs <strong>${escapeHtml(pb.name)}</strong> ${fmtTime(pilotBestFor(pb))} — écart <span class="${bestDiff <= 0 ? 'delta-good' : 'delta-bad'}">${bestDiff > 0 ? '+' : ''}${bestDiff.toFixed(3)} s</span> pour ${escapeHtml(pa.name)}.</p>
        <h3>Sessions communes</h3>
        ${common.length ? renderCommonTable(common, pa, pb) : '<p class="muted">Aucune session commune trouvée.</p>'}
      </div>`;
  }
  a.addEventListener('change', draw); b.addEventListener('change', draw);
  document.getElementById('swapBtn').addEventListener('click', () => { const i=a.selectedIndex; a.selectedIndex=b.selectedIndex; b.selectedIndex=i; draw(); });
  draw();
}

function comparePilotCard(p) {
  const regs = pilotActivitiesFor(p).map(a => a.consistency).filter(x => Number.isFinite(Number(x)) && Number(x) > 0);
  const avgReg = regs.length ? regs.reduce((s,x)=>s+Number(x),0)/regs.length : null;
  return `<div class="card"><h3>${pilotNameCell(p.name, p.slug, p.transponder)}</h3>
    <p><span class="badge">${escapeHtml(p.transponder)}</span></p>
    <table><tbody>
      <tr><th>Meilleur tour</th><td class="best">${fmtTime(pilotBestFor(p))}</td></tr>
      <tr><th>Sessions</th><td>${pilotSessionsFor(p)}</td></tr>
      <tr><th>Tours</th><td>${pilotTotalFor(p)}</td></tr>
      <tr><th>Moy. meilleurs</th><td>${fmtTime(avgBestLapFor(p))}</td></tr>
      <tr><th>Régularité moyenne</th><td>${fmtTime(avgReg)}</td></tr>
    </tbody></table></div>`;
}

function commonActivities(pa, pb) {
  const ma = new Map(pilotActivitiesFor(pa).map(a => [String(a.activity_id), a]));
  return pilotActivitiesFor(pb).filter(b => ma.has(String(b.activity_id))).map(b => ({a: ma.get(String(b.activity_id)), b})).sort((x,y)=>byDateDesc(x.a,y.a));
}

function renderCommonTable(common, pa, pb) {
  return `<table><thead><tr><th>Date</th><th>Sortie</th><th>${escapeHtml(pa.name)}</th><th>${escapeHtml(pb.name)}</th><th>Écart A-B</th></tr></thead><tbody>
    ${common.map(r => {
      const d = Number(r.a.best_lap) - Number(r.b.best_lap);
      return `<tr><td>${escapeHtml(r.a.date_fr)}</td><td><a href="#/session/${r.a.activity_id}">Voir</a></td><td class="best">${fmtTime(r.a.best_lap)}</td><td class="best">${fmtTime(r.b.best_lap)}</td><td class="${d <= 0 ? 'delta-good' : 'delta-bad'}">${d > 0 ? '+' : ''}${d.toFixed(3)} s</td></tr>`;
    }).join('')}
  </tbody></table>`;
}



function renderFavorites() {
  setTitle('Favoris');
  const favs = favoritePilots().sort(byBestLap);
  app.innerHTML = `<div class="card">
    <h2>Mes pilotes favoris — ${trackBadge(TRACK_FILTER)}</h2>
    ${trackControls()}
    <p class="muted">Les favoris sont enregistrés dans ce navigateur. Utilise ☆ / ★ à côté d’un nom de pilote.</p>
    ${favs.length ? `<table><thead><tr><th>Pilote</th><th>Transpondeur</th><th>Sessions</th><th>Tours</th><th>Meilleur</th><th>Moy. meilleurs</th></tr></thead><tbody>
      ${favs.map(p => `<tr><td>${pilotNameCell(p.name, p.slug, p.transponder)}</td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${pilotSessionsFor(p)}</td><td>${pilotTotalFor(p)}</td><td class="best">${fmtTime(pilotBestFor(p))}</td><td>${fmtTime(avgBestLapFor(p))}</td></tr>`).join('')}
    </tbody></table>` : '<p>Aucun favori pour l’instant.</p>'}
  </div>`;
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
      ${rows.map(p => `<tr><td>${escapeHtml(p.name)}</td><td><span class="badge">${escapeHtml(p.transponder)}</span></td><td>${pilotSessionsFor(p)}</td><td>${pilotTotalFor(p)}</td><td class="best">${fmtTime(pilotBestFor(p))}</td><td>${editButton(p.transponder, p.name)}</td></tr>`).join('')}
    </tbody></table>`;
  }
  q.addEventListener('input', drawEditTable); drawEditTable();
}

init();
