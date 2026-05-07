(function(){
'use strict';

var DATA = null;
var app = document.getElementById('app');

var state = {
  track: 'all',
  isAdmin: localStorage.getItem('mrcp_admin') === '1'
};

function showError(title, err){
  var msg = err && err.message ? err.message : String(err || 'Erreur inconnue');
  app.innerHTML = '<section class="card error"><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(msg) + '</p><p class="small">Ouvre la console navigateur avec F12 pour le détail.</p></section>';
  console.error(title, err);
}

function escapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function fmtTime(v){
  var n = Number(v);
  return Number.isFinite(n) ? n.toFixed(3) + ' s' : '-';
}

function lapSeconds(l){
  return Number(
    l.lap_time != null ? l.lap_time :
    l.time != null ? l.time :
    l.seconds != null ? l.seconds :
    l.best_lap != null ? l.best_lap :
    l.duration
  );
}

function normalizeTrack(l){
  if(l.track) return l.track;
  var t = lapSeconds(l);
  if(!Number.isFinite(t)) return 'unknown';
  return t < 30 ? 'TT1/10' : 'TT1/8';
}

function normalizeTransponder(v){
  return String(v || '').replace('/0','').trim();
}

function lapPilot(l){
  return l.pilot_name || l.pilot || l.driver || l.name || l.participant_name || l.transponder || 'Pilote inconnu';
}

function lapKey(activityId, transponder, lapNo, startTime, lapTime){
  var n = Number(lapTime);
  return [activityId || '', normalizeTransponder(transponder), lapNo || '', startTime || '', Number.isFinite(n) ? n.toFixed(3) : ''].join('|');
}

function getOverrides(){
  try{
    var raw = JSON.parse(localStorage.getItem('mrcp_lap_overrides') || '{}');
    return {
      excluded: raw.excluded && typeof raw.excluded === 'object' ? raw.excluded : {},
      forced_track: raw.forced_track && typeof raw.forced_track === 'object' ? raw.forced_track : {}
    };
  }catch(e){
    return {excluded:{}, forced_track:{}};
  }
}

function setOverrides(o){
  localStorage.setItem('mrcp_lap_overrides', JSON.stringify({
    excluded: o.excluded || {},
    forced_track: o.forced_track || {}
  }, null, 2));
}

function isExcludedByAny(lapId, l){
  var overrides = getOverrides();
  return !!overrides.excluded[lapId] || !!l.exclude_from_records || !!l.excluded;
}

function forcedTrack(lapId){
  var overrides = getOverrides();
  return overrides.forced_track[lapId] || null;
}

function pushLap(rows, rawLap, context){
  var lap = Object.assign({}, rawLap || {});
  var t = lapSeconds(lap);
  if(!Number.isFinite(t) || t <= 0) return;

  var activityId = context.activity_id || context.session_id || '';
  var transponder = context.transponder || lap.transponder || '';
  var lapNo = lap.lap_no || lap.lap || lap.number || '';
  var startTime = lap.start_time || lap.started_at || '';
  var lapId = lap.lap_id || lap.id || lapKey(activityId, transponder, lapNo, startTime, t);

  if(isExcludedByAny(lapId, lap)) return;

  var pilotName = context.pilot_name || lapPilot(lap);
  var track = forcedTrack(lapId) || lap.track || context.track || normalizeTrack(lap);

  rows.push(Object.assign({}, lap, {
    lap_id: lapId,
    activity_id: activityId,
    session_id: context.session_id || activityId,
    session_name: context.session_name || lap.session_name || '',
    session_date: context.session_date || lap.session_date || lap.date || '',
    transponder: transponder,
    pilot_name: pilotName,
    _time: t,
    _track: track,
    _pilot: pilotName,
    _date: context.session_date || lap.date || lap.session_date || ''
  }));
}

function getAllLapsRaw(includeExcluded){
  var rows = [];

  if(DATA && Array.isArray(DATA.activities)){
    DATA.activities.forEach(function(a){
      var activityId = a.id || a.activity_id || a.session_id || '';
      var sessionName = a.name || a.title || a.session_name || a.date_fr || a.date || '';
      var sessionDate = a.date || a.session_date || a.created_at || '';

      (a.participants || []).forEach(function(p){
        var pilotName = p.pilot_name || p.name || p.driver || ('Inconnu #' + (p.transponder || ''));
        var transponder = p.transponder || p.transponder_id || '';
        var laps = Array.isArray(p.laps) ? p.laps : [];
        laps.forEach(function(l){
          var t = lapSeconds(l);
          if(!Number.isFinite(t) || t <= 0) return;
          var lapNo = l.lap_no || l.lap || l.number || '';
          var startTime = l.start_time || l.started_at || '';
          var lapId = l.lap_id || l.id || lapKey(activityId, transponder, lapNo, startTime, t);
          var track = forcedTrack(lapId) || l.track || p.track || normalizeTrack(l);
          var excluded = !!getOverrides().excluded[lapId] || !!l.exclude_from_records || !!l.excluded;
          if(!includeExcluded && excluded) return;
          rows.push(Object.assign({}, l, {
            lap_id: lapId,
            activity_id: activityId,
            session_id: activityId,
            session_name: sessionName,
            session_date: sessionDate,
            transponder: transponder,
            pilot_name: pilotName,
            _time: t,
            _track: track,
            _pilot: pilotName,
            _date: sessionDate,
            _excluded: excluded
          }));
        });
      });
    });
  }

  if(DATA && Array.isArray(DATA.sessions)){
    DATA.sessions.forEach(function(s){
      var sessionId = s.id || s.session_id || '';
      var sessionName = s.name || s.title || s.session_name || s.date_fr || s.date || '';
      var sessionDate = s.date || s.session_date || '';
      if(Array.isArray(s.participants)){
        s.participants.forEach(function(p){
          var pilotName = p.pilot_name || p.name || p.driver || ('Inconnu #' + (p.transponder || ''));
          var transponder = p.transponder || p.transponder_id || '';
          (p.laps || []).forEach(function(l){
            pushLap(rows, l, {
              activity_id: sessionId,
              session_id: sessionId,
              session_name: sessionName,
              session_date: sessionDate,
              pilot_name: pilotName,
              transponder: transponder,
              track: l.track || p.track || null
            });
          });
        });
      }
      var sessionLaps = s.laps || s.results || [];
      if(Array.isArray(sessionLaps)){
        sessionLaps.forEach(function(l){
          pushLap(rows, l, {
            activity_id: sessionId,
            session_id: sessionId,
            session_name: sessionName,
            session_date: sessionDate,
            pilot_name: lapPilot(l),
            transponder: l.transponder || '',
            track: l.track || null
          });
        });
      }
    });
  }

  if(DATA && Array.isArray(DATA.laps)){
    DATA.laps.forEach(function(l){
      pushLap(rows, l, {
        activity_id: l.activity_id || l.session_id || '',
        session_id: l.session_id || l.activity_id || '',
        session_name: l.session_name || '',
        session_date: l.date || l.session_date || '',
        pilot_name: lapPilot(l),
        transponder: l.transponder || '',
        track: l.track || null
      });
    });
  }

  var seen = {};
  return rows.filter(function(r){
    if(seen[r.lap_id]) return false;
    seen[r.lap_id] = true;
    return true;
  });
}

function getAllLaps(){
  return getAllLapsRaw(false);
}

function applyFilters(laps){
  if(state.track === 'all') return laps;
  return laps.filter(function(l){ return l._track === state.track; });
}

function bestByPilot(laps){
  var map = new Map();
  laps.forEach(function(l){
    if(!map.has(l._pilot) || l._time < map.get(l._pilot)._time){
      map.set(l._pilot, l);
    }
  });
  return Array.from(map.values()).sort(function(a,b){ return a._time - b._time; });
}

function allPilots(){
  return bestByPilot(getAllLaps()).map(function(l){ return l._pilot; }).sort(function(a,b){ return a.localeCompare(b); });
}

function pilotStats(name){
  var laps = getAllLaps().filter(function(l){ return l._pilot === name; });
  var sorted = laps.slice().sort(function(a,b){ return a._time - b._time; });
  var total = laps.reduce(function(sum,l){ return sum + l._time; }, 0);
  var avg = laps.length ? total / laps.length : null;
  var sessions = {};
  laps.forEach(function(l){
    var key = l.session_name || l._date || 'session';
    sessions[key] = true;
  });
  return {name:name, laps:laps, best:sorted[0], avg:avg, sessions:Object.keys(sessions).length};
}

function renderFilters(){
  return '<div class="filters">' +
    '<select id="trackFilter">' +
      '<option value="all">Toutes pistes</option>' +
      '<option value="TT1/8">TT1/8</option>' +
      '<option value="TT1/10">TT1/10</option>' +
    '</select>' +
  '</div>';
}

function bindFilters(callback){
  var t = document.getElementById('trackFilter');
  if(t){
    t.value = state.track;
    t.onchange = function(e){ state.track = e.target.value; callback(); };
  }
}

function podiumHtml(rows){
  var top = rows.slice(0,3);
  if(!top.length) return '<p class="small">Aucun chrono trouvé dans data_v2.json.</p>';
  var order = [1,0,2];
  return '<div class="podium">' + order.map(function(i){
    var r = top[i];
    if(!r) return '<div></div>';
    var cls = i === 0 ? 'first' : i === 1 ? 'second' : 'third';
    var med = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    return '<div class="step ' + cls + '">' +
      '<span class="medal">' + med + '</span>' +
      '<strong>' + escapeHtml(r._pilot) + '</strong>' +
      '<div class="time">' + fmtTime(r._time) + '</div>' +
      '<div class="small">' + escapeHtml(r._track) + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function recordsTable(rows, limit){
  limit = limit || 20;
  return '<div class="table-wrap"><table>' +
    '<thead><tr><th>#</th><th>Pilote</th><th>Temps</th><th>Piste</th><th>Session</th></tr></thead>' +
    '<tbody>' + rows.slice(0, limit).map(function(r,i){
      return '<tr>' +
        '<td>' + (i+1) + '</td>' +
        '<td><a href="#/pilote/' + encodeURIComponent(r._pilot) + '">' + escapeHtml(r._pilot) + '</a></td>' +
        '<td><strong>' + fmtTime(r._time) + '</strong></td>' +
        '<td><span class="badge">' + escapeHtml(r._track) + '</span></td>' +
        '<td>' + escapeHtml(r.session_name || r._date || '-') + '</td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>';
}

function home(){
  var laps = getAllLaps();
  var best = bestByPilot(applyFilters(laps));
  var my = localStorage.getItem('mrcp_my_pilot');

  app.innerHTML =
    '<section class="card">' +
      '<h2>Bienvenue</h2>' +
      '<p>Interface simplifiée pour les pilotes et visiteurs.</p>' +
      '<p class="small">Tours lus : ' + laps.length + ' — Pilotes : ' + bestByPilot(laps).length + '</p>' +
      (my
        ? '<p><strong>Ton profil :</strong> ' + escapeHtml(my) + '</p><a href="#/mes-chronos"><button>Voir mes chronos</button></a>'
        : '<a href="#/mes-chronos"><button>Choisir mon profil pilote</button></a>'
      ) +
    '</section>' +
    '<section class="card">' +
      '<h2>Podium rapide</h2>' +
      renderFilters() +
      podiumHtml(best) +
    '</section>' +
    '<section class="card">' +
      '<h2>Top 10</h2>' +
      recordsTable(best, 10) +
    '</section>';

  bindFilters(home);
}

function myChronos(){
  var saved = localStorage.getItem('mrcp_my_pilot');
  var pilots = allPilots();

  if(!saved){
    app.innerHTML =
      '<section class="card">' +
        '<h2>Mes chronos</h2>' +
        '<p>Choisis ton profil une fois. Il sera mémorisé sur ce téléphone.</p>' +
        '<select id="pilotSelect"><option value="">Choisir un pilote</option>' +
          pilots.map(function(p){ return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>'; }).join('') +
        '</select> ' +
        '<button id="savePilot">C’est mon profil</button>' +
      '</section>';

    document.getElementById('savePilot').onclick = function(){
      var v = document.getElementById('pilotSelect').value;
      if(v){ localStorage.setItem('mrcp_my_pilot', v); myChronos(); }
    };
    return;
  }

  var s = pilotStats(saved);
  var best18 = bestByPilot(s.laps.filter(function(l){ return l._track === 'TT1/8'; }))[0];
  var best10 = bestByPilot(s.laps.filter(function(l){ return l._track === 'TT1/10'; }))[0];
  var last = s.laps.slice(-30).reverse();

  app.innerHTML =
    '<section class="card">' +
      '<h2>Mes chronos — ' + escapeHtml(saved) + '</h2>' +
      '<button id="changePilot">Changer de pilote</button>' +
    '</section>' +
    '<section class="grid">' +
      '<div class="card"><h3>Meilleur TT1/8</h3><div class="big">' + fmtTime(best18 && best18._time) + '</div></div>' +
      '<div class="card"><h3>Meilleur TT1/10</h3><div class="big">' + fmtTime(best10 && best10._time) + '</div></div>' +
      '<div class="card"><h3>Moyenne</h3><div class="big">' + fmtTime(s.avg) + '</div></div>' +
      '<div class="card"><h3>Tours</h3><div class="big">' + s.laps.length + '</div></div>' +
      '<div class="card"><h3>Sessions</h3><div class="big">' + s.sessions + '</div></div>' +
    '</section>' +
    '<section class="card"><h3>Derniers tours</h3>' + recordsTable(last, 30) + '</section>';

  document.getElementById('changePilot').onclick = function(){
    localStorage.removeItem('mrcp_my_pilot');
    myChronos();
  };
}

function pilots(){
  var best = bestByPilot(getAllLaps());
  app.innerHTML =
    '<section class="card">' +
      '<h2>Pilotes</h2>' +
      '<input class="searchBox" id="pilotSearch" placeholder="Rechercher un pilote...">' +
      '<div id="pilotList">' + recordsTable(best, 100) + '</div>' +
    '</section>';

  document.getElementById('pilotSearch').oninput = function(e){
    var q = e.target.value.toLowerCase();
    var filtered = best.filter(function(r){ return r._pilot.toLowerCase().indexOf(q) !== -1; });
    document.getElementById('pilotList').innerHTML = recordsTable(filtered, 100);
  };
}

function pilotPage(encodedName){
  var name = decodeURIComponent(encodedName);
  var s = pilotStats(name);

  app.innerHTML =
    '<section class="card">' +
      '<h2>' + escapeHtml(name) + '</h2>' +
      '<button id="setMyProfile">C’est mon profil</button>' +
    '</section>' +
    '<section class="grid">' +
      '<div class="card"><h3>Meilleur</h3><div class="big">' + fmtTime(s.best && s.best._time) + '</div></div>' +
      '<div class="card"><h3>Moyenne</h3><div class="big">' + fmtTime(s.avg) + '</div></div>' +
      '<div class="card"><h3>Tours</h3><div class="big">' + s.laps.length + '</div></div>' +
      '<div class="card"><h3>Sessions</h3><div class="big">' + s.sessions + '</div></div>' +
    '</section>' +
    '<section class="card"><h3>Tours récents</h3>' + recordsTable(s.laps.slice(-50).reverse(), 50) + '</section>';

  document.getElementById('setMyProfile').onclick = function(){
    localStorage.setItem('mrcp_my_pilot', name);
    location.hash = '#/mes-chronos';
  };
}

function podiums(){
  var best = bestByPilot(applyFilters(getAllLaps()));
  app.innerHTML =
    '<section class="card">' +
      '<h2>Podiums</h2>' +
      renderFilters() +
      podiumHtml(best) +
    '</section>' +
    '<section class="card">' +
      '<h2>Classement</h2>' +
      recordsTable(best, 50) +
    '</section>';
  bindFilters(podiums);
}

function adminOnly(title, body){
  if(!state.isAdmin){
    app.innerHTML = '<section class="card"><h2>Accès admin</h2><p>Page réservée à l’administrateur.</p></section>';
    return false;
  }
  app.innerHTML = '<section class="card"><h2>' + escapeHtml(title) + '</h2>' + body + '</section>';
  return true;
}

function suspiciousLaps(){
  return getAllLapsRaw(true).filter(function(l){
    if(l._excluded) return true;
    if(l._time < 8) return true;
    if(l._time >= 30 && l._time <= 45 && l._track === 'TT1/8') return true;
    if(l._pilot.indexOf('Inconnu') >= 0 || l._pilot === 'Pilote inconnu') return true;
    return false;
  }).sort(function(a,b){ return a._time - b._time; });
}

function adminRecords(){
  var laps = suspiciousLaps();
  var overrides = getOverrides();
  var rows = laps.slice(0, 300).map(function(l){
    return '<tr>' +
      '<td><code>' + escapeHtml(l.lap_id) + '</code></td>' +
      '<td>' + escapeHtml(l._pilot) + '</td>' +
      '<td><strong>' + fmtTime(l._time) + '</strong></td>' +
      '<td>' + escapeHtml(l._track) + '</td>' +
      '<td>' + escapeHtml(l.session_name || l._date || '-') + '</td>' +
      '<td>' +
        '<div class="admin-actions">' +
          '<button class="btn-danger" data-action="exclude" data-id="' + escapeHtml(l.lap_id) + '">Exclure</button>' +
          '<button class="btn-good" data-action="tt10" data-id="' + escapeHtml(l.lap_id) + '">TT1/10</button>' +
          '<button class="btn-warn" data-action="tt8" data-id="' + escapeHtml(l.lap_id) + '">TT1/8</button>' +
          '<button data-action="reset" data-id="' + escapeHtml(l.lap_id) + '">Reset</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');

  if(!adminOnly('Records admin', 
    '<p class="small">Corrections locales. Après modification, exporte <strong>lap_overrides.json</strong>, copie-le dans le projet, lance <code>python build_data_v2.py</code>, puis commit/push.</p>' +
    '<div class="grid">' +
      '<div class="card"><h3>Corrections exclusions</h3><div class="big">' + Object.keys(overrides.excluded).length + '</div></div>' +
      '<div class="card"><h3>Forçages piste</h3><div class="big">' + Object.keys(overrides.forced_track).length + '</div></div>' +
      '<div class="card"><h3>Tours suspects</h3><div class="big">' + laps.length + '</div></div>' +
    '</div>' +
    '<p><button id="exportLapOverrides">Exporter lap_overrides.json</button> <button id="copyLapOverrides">Copier JSON</button> <button id="clearLapOverrides" class="btn-danger">Vider corrections locales</button></p>' +
    '<textarea class="admin-json" id="lapOverridesText">' + escapeHtml(JSON.stringify(overrides, null, 2)) + '</textarea>' +
    '<p><button id="importLapOverrides">Importer le JSON ci-dessus</button></p>' +
    '<div class="table-wrap"><table><thead><tr><th>ID tour</th><th>Pilote</th><th>Temps</th><th>Piste</th><th>Session</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
  )) return;

  document.querySelectorAll('[data-action]').forEach(function(btn){
    btn.onclick = function(){
      var id = btn.getAttribute('data-id');
      var action = btn.getAttribute('data-action');
      var o = getOverrides();

      if(action === 'exclude') o.excluded[id] = true;
      if(action === 'tt10') o.forced_track[id] = 'TT1/10';
      if(action === 'tt8') o.forced_track[id] = 'TT1/8';
      if(action === 'reset'){
        delete o.excluded[id];
        delete o.forced_track[id];
      }

      setOverrides(o);
      adminRecords();
    };
  });

  document.getElementById('exportLapOverrides').onclick = function(){
    downloadJson('lap_overrides.json', getOverrides());
  };

  document.getElementById('copyLapOverrides').onclick = function(){
    navigator.clipboard.writeText(JSON.stringify(getOverrides(), null, 2));
    alert('JSON copié');
  };

  document.getElementById('clearLapOverrides').onclick = function(){
    if(confirm('Vider toutes les corrections locales ?')){
      setOverrides({excluded:{}, forced_track:{}});
      adminRecords();
    }
  };

  document.getElementById('importLapOverrides').onclick = function(){
    try{
      var obj = JSON.parse(document.getElementById('lapOverridesText').value);
      setOverrides(obj);
      alert('Corrections importées');
      adminRecords();
    }catch(e){
      alert('JSON invalide : ' + e.message);
    }
  };
}

function downloadJson(filename, obj){
  var blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function quality(){
  var q = (DATA && (DATA.quality || DATA.data_quality)) || {};
  var suspects = suspiciousLaps();
  adminOnly('Qualité données',
    '<div class="grid">' +
      '<div class="card"><h3>Score</h3><div class="big">' + escapeHtml(q.score != null ? q.score : (q.global_score != null ? q.global_score : '-')) + '</div></div>' +
      '<div class="card"><h3>Tours suspects</h3><div class="big">' + suspects.length + '</div></div>' +
      '<div class="card"><h3>Tours lus</h3><div class="big">' + getAllLaps().length + '</div></div>' +
    '</div>' +
    '<p><a href="#/admin-records"><button>Corriger les tours suspects</button></a></p>'
  );
}

function adminPilots(){
  var laps = getAllLaps();
  var unknown = {};
  laps.forEach(function(l){
    if(l._pilot.indexOf('Inconnu') >= 0 || l._pilot === 'Pilote inconnu'){
      unknown[l.transponder || 'sans-transpondeur'] = (unknown[l.transponder || 'sans-transpondeur'] || 0) + 1;
    }
  });
  var rows = Object.keys(unknown).map(function(tp){
    return '<tr><td>' + escapeHtml(tp) + '</td><td>' + unknown[tp] + '</td><td><input placeholder="Nom pilote"></td></tr>';
  }).join('');

  if(!adminOnly('Pilotes admin',
    '<p class="small">Préparation corrections pilotes. Pour l’instant, cette page liste les transpondeurs inconnus.</p>' +
    '<div class="table-wrap"><table><thead><tr><th>Transpondeur</th><th>Tours</th><th>Nom à associer</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
  )) return;
}

function adminPage(){
  if(!adminOnly('Admin',
    '<p>Actions disponibles :</p>' +
    '<p><a href="#/admin-records"><button>Records admin</button></a> <a href="#/quality"><button>Qualité</button></a> <a href="#/admin-pilotes"><button>Pilotes admin</button></a></p>' +
    '<ol><li>Corrige dans Records admin.</li><li>Exporte lap_overrides.json.</li><li>Copie le fichier dans le dossier projet.</li><li>Lance python build_data_v2.py.</li><li>Commit/push.</li></ol>'
  )) return;
}

function updateAdminNav(){
  var nav = document.getElementById('adminNav');
  if(nav) nav.classList.toggle('hidden', !state.isAdmin);
}

function router(){
  try{
    updateAdminNav();
    var h = location.hash || '#/';
    if(h.indexOf('#/mes-chronos') === 0) return myChronos();
    if(h.indexOf('#/pilotes') === 0) return pilots();
    if(h.indexOf('#/pilote/') === 0) return pilotPage(h.replace('#/pilote/',''));
    if(h.indexOf('#/podiums') === 0) return podiums();
    if(h.indexOf('#/quality') === 0) return quality();
    if(h.indexOf('#/admin-pilotes') === 0) return adminPilots();
    if(h.indexOf('#/admin-records') === 0) return adminRecords();
    if(h.indexOf('#/admin') === 0) return adminPage();
    return home();
  }catch(err){
    showError('Erreur d’affichage', err);
  }
}

function bindAdminButtons(){
  var adminBtn = document.getElementById('adminBtn');
  var adminExit = document.getElementById('adminExit');

  if(adminBtn){
    adminBtn.onclick = function(){
      var c = prompt('Code admin');
      if(c === 'mrcp'){
        localStorage.setItem('mrcp_admin','1');
        state.isAdmin = true;
        updateAdminNav();
        alert('Mode admin activé');
      }else if(c){
        alert('Code incorrect');
      }
    };
  }

  if(adminExit){
    adminExit.onclick = function(){
      localStorage.removeItem('mrcp_admin');
      state.isAdmin = false;
      location.hash = '#/';
      router();
    };
  }
}

async function init(){
  try{
    bindAdminButtons();
    updateAdminNav();

    var res = await fetch('data_v2.json?ts=' + Date.now());
    if(!res.ok) throw new Error('Impossible de charger data_v2.json : HTTP ' + res.status);
    DATA = await res.json();

    console.log('MRCP data loaded', {
      activities: Array.isArray(DATA.activities) ? DATA.activities.length : 0,
      sessions: Array.isArray(DATA.sessions) ? DATA.sessions.length : 0,
      flat_laps: Array.isArray(DATA.laps) ? DATA.laps.length : 0,
      parsed_laps: getAllLaps().length
    });

    router();
  }catch(err){
    showError('Erreur de chargement', err);
  }
}

window.addEventListener('hashchange', router);
init();

})();
