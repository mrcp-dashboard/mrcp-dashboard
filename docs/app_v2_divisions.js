// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Divisions de niveau : repartit les pilotes d'une piste en poules A/B/C selon
// leur meilleur temps, avec un podium par poule.
//
// But : sur un classement unique, les memes pilotes rapides trustent le podium
// et un debutant n'apparait jamais. Avec des poules, chacun se mesure a des
// pilotes de son niveau.

// Un pilote doit avoir un echantillon significatif : sinon un tour de chance
// isole le placerait en division A.
var DIVISION_MIN_LAPS = 10;
var DIVISION_LABELS = ['A', 'B', 'C'];
// Il faut au moins 3 pilotes par poule pour que le decoupage ait un sens.
var DIVISION_MIN_PILOTS = DIVISION_LABELS.length * 3;

// Meilleur tour par pilote sur une piste, limite aux pilotes assez roules.
function divisionEligibleRows(track){
  var trackLaps = getAllLaps().filter(function(l){ return l._track === track; });
  var counts = {};
  trackLaps.forEach(function(l){ counts[l._pilot] = (counts[l._pilot] || 0) + 1; });
  return bestByPilot(trackLaps).filter(function(r){
    return (counts[r._pilot] || 0) >= DIVISION_MIN_LAPS;
  });
}

// Decoupage en tiers egaux plutot qu'en seuils fixes : les poules restent
// equilibrees et s'ajustent toutes seules quand le niveau du club evolue.
function buildDivisions(track){
  var rows = divisionEligibleRows(track);
  if(rows.length < DIVISION_MIN_PILOTS) return null;
  var n = DIVISION_LABELS.length;
  var size = Math.floor(rows.length / n);
  var extra = rows.length % n;
  var divisions = [];
  var start = 0;
  for(var i = 0; i < n; i++){
    // Les premieres poules absorbent le reste, pour eviter une derniere poule
    // nettement plus grosse que les autres.
    var take = size + (i < extra ? 1 : 0);
    var slice = rows.slice(start, start + take);
    start += take;
    divisions.push({
      letter: DIVISION_LABELS[i],
      rows: slice,
      best: slice.length ? slice[0]._time : null,
      worst: slice.length ? slice[slice.length - 1]._time : null
    });
  }
  return divisions;
}

function myPilotName(){
  try{ return localStorage.getItem('mrcp_my_pilot') || ''; }catch(e){ return ''; }
}

function divisionOfPilot(divisions, name){
  if(!name || !divisions) return null;
  for(var i = 0; i < divisions.length; i++){
    for(var j = 0; j < divisions[i].rows.length; j++){
      if(divisions[i].rows[j]._pilot === name){
        return { letter: divisions[i].letter, rank: j + 1, total: divisions[i].rows.length };
      }
    }
  }
  return null;
}

function divisionBlockHtml(division){
  return '<section class="card division-card">' +
    '<div class="panel-title"><h2><span class="division-badge division-' + escapeHtml(division.letter) + '">' + escapeHtml(division.letter) + '</span> Division ' + escapeHtml(division.letter) + '</h2>' +
      '<span class="small">' + division.rows.length + ' pilotes · ' + fmtTimeS(division.best) + ' à ' + fmtTimeS(division.worst) + '</span></div>' +
    podiumHtml(division.rows, true) +
    recordsTable(division.rows, division.rows.length) +
  '</section>';
}

function divisionsTrackHtml(track){
  var divisions = buildDivisions(track);
  var title = '<h2>' + escapeHtml(displayTrack(track)) + '</h2>';
  if(!divisions){
    var eligible = divisionEligibleRows(track).length;
    return '<section class="card">' + title +
      '<p class="small">Pas encore assez de pilotes sur cette piste pour former des divisions : ' +
      eligible + ' pilote' + (eligible > 1 ? 's' : '') + ' avec au moins ' + DIVISION_MIN_LAPS +
      ' tours, il en faut ' + DIVISION_MIN_PILOTS + '.</p></section>';
  }
  var mine = divisionOfPilot(divisions, myPilotName());
  var banner = mine
    ? '<p class="division-mine">Tu es en <strong>Division ' + escapeHtml(mine.letter) + '</strong> · ' + mine.rank + '<sup>e</sup> sur ' + mine.total + '.</p>'
    : '';
  return '<section class="card">' + title + banner +
    '<p class="small">Les pilotes ayant au moins ' + DIVISION_MIN_LAPS +
    ' tours sur cette piste sont répartis en trois groupes de niveau, du plus rapide au plus lent. Chaque division a son propre podium.</p></section>' +
    divisions.map(divisionBlockHtml).join('');
}

function divisionsPage(){
  app.innerHTML = '<section class="card club-record-hero"><div><span class="badge">Poules de niveau</span>' +
      '<h1>🥇 Divisions</h1>' +
      '<p class="pilot-sub">Chacun se mesure à des pilotes de son niveau : trois divisions par piste, chacune avec son podium.</p></div>' +
      '<a class="mini-button" href="#/records-club">Records club</a></section>' +
    divisionsTrackHtml('TT1/8') +
    divisionsTrackHtml('TT1/10');
}
