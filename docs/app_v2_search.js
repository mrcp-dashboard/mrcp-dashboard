// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Recherche globale : un seul champ, accessible depuis n'importe quelle page,
// pour retrouver un pilote ou une journee de roulage. Les recherches par page
// (Pilotes, Sessions, pages admin) restent en place : elles filtrent une liste,
// celle-ci navigue.

var searchIndexCache = null;
var SEARCH_MAX_PER_GROUP = 6;

// Insensible aux accents et a la casse : "gregoire" doit trouver "GRÉGOIRE".
function searchNormalize(value){
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

function buildSearchIndex(){
  if(searchIndexCache) return searchIndexCache;
  var pilots = {}, days = {};
  getAllLaps().forEach(function(l){
    var p = pilots[l._pilot];
    if(!p){
      p = pilots[l._pilot] = { name: l._pilot, transponders: {}, laps: 0, best: null };
    }
    p.laps++;
    if(p.best === null || l._time < p.best) p.best = l._time;
    // Un pilote peut avoir plusieurs puces (changement de materiel, second
    // chassis) : DORIAN GIANNETTA en a deux. Toutes doivent etre cherchables.
    var tp = normalizeTransponder(l.transponder || '');
    if(tp) p.transponders[tp] = true;

    var day = l._date || '';
    if(day){
      var d = days[day];
      if(!d) d = days[day] = { date: day, laps: 0, pilots: {} };
      d.laps++;
      d.pilots[l._pilot] = true;
    }
  });

  searchIndexCache = {
    pilots: Object.keys(pilots).map(function(k){
      var p = pilots[k];
      p.transponderList = Object.keys(p.transponders);
      p.haystack = searchNormalize(p.name + ' ' + p.transponderList.join(' '));
      return p;
    }).sort(function(a, b){ return a.name.localeCompare(b.name); }),
    days: Object.keys(days).map(function(k){
      var d = days[k];
      d.dateFr = dateFrFromValue(d.date);
      d.pilotCount = Object.keys(d.pilots).length;
      // On indexe les deux ecritures : l'utilisateur peut taper 19/04 ou 2026-04-19.
      d.haystack = searchNormalize(d.date + ' ' + d.dateFr);
      return d;
    }).sort(function(a, b){ return b.date.localeCompare(a.date); })
  };
  return searchIndexCache;
}

function runGlobalSearch(query){
  var q = searchNormalize(query);
  if(q.length < 2) return null;
  var index = buildSearchIndex();
  return {
    query: query,
    pilots: index.pilots.filter(function(p){ return p.haystack.indexOf(q) !== -1; }).slice(0, SEARCH_MAX_PER_GROUP),
    days: index.days.filter(function(d){ return d.haystack.indexOf(q) !== -1; }).slice(0, SEARCH_MAX_PER_GROUP)
  };
}

function searchResultsHtml(res){
  if(!res) return '';
  if(!res.pilots.length && !res.days.length){
    return '<div class="search-empty">Aucun résultat pour « ' + escapeHtml(res.query) + ' »</div>';
  }
  var html = '';
  if(res.pilots.length){
    html += '<div class="search-group">Pilotes</div>' + res.pilots.map(function(p){
      return '<a class="search-item" href="#/pilote/' + encodeURIComponent(p.name) + '">' +
        '<span class="search-item-main">' + escapeHtml(p.name) + '</span>' +
        '<span class="search-item-sub">' + p.laps + ' tours · ' + fmtTimeS(p.best) + '</span></a>';
    }).join('');
  }
  if(res.days.length){
    html += '<div class="search-group">Journées</div>' + res.days.map(function(d){
      return '<a class="search-item" href="#/journee?date=' + encodeURIComponent(d.date) + '">' +
        '<span class="search-item-main">' + escapeHtml(d.dateFr) + '</span>' +
        '<span class="search-item-sub">' + d.laps + ' tours · ' + d.pilotCount + ' pilotes</span></a>';
    }).join('');
  }
  return html;
}

function setupGlobalSearch(){
  var input = document.getElementById('globalSearch');
  var panel = document.getElementById('globalSearchResults');
  if(!input || !panel) return;

  function close(){ panel.classList.add('hidden'); panel.innerHTML = ''; }
  function refresh(){
    var res = runGlobalSearch(input.value);
    if(!res){ close(); return; }
    panel.innerHTML = searchResultsHtml(res);
    panel.classList.remove('hidden');
  }

  input.addEventListener('input', refresh);
  input.addEventListener('focus', refresh);
  input.addEventListener('keydown', function(ev){
    if(ev.key === 'Escape'){ input.value = ''; close(); input.blur(); }
    if(ev.key === 'Enter'){
      var first = panel.querySelector('.search-item');
      if(first){ ev.preventDefault(); location.hash = first.getAttribute('href').slice(1); input.value = ''; close(); input.blur(); }
    }
  });
  // Un clic sur un resultat change le hash : on ferme, sinon le panneau
  // resterait ouvert par-dessus la page d'arrivee.
  panel.addEventListener('click', function(ev){
    if(ev.target.closest('.search-item')){ input.value = ''; close(); }
  });
  document.addEventListener('click', function(ev){
    if(!ev.target.closest('.search-pill')) close();
  });
}
