// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Rythme du club : quand roule-t-on ? Repartition des tours par jour de la
// semaine, par heure et par mois. Utile pour organiser les sessions.
//
// Barres en HTML/CSS plutot qu'en SVG : pas de calcul de viewBox, responsive
// et imprimable sans effort.

var RYTHME_JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

// getDay() renvoie 0 pour dimanche : on ramene a 0 = lundi.
function weekdayIndex(dateMs){
  var d = new Date(dateMs).getDay();
  return (d + 6) % 7;
}

function rythmeBuckets(){
  var byDay = [], byHour = {}, byMonth = {};
  for(var i = 0; i < 7; i++) byDay.push({ laps: 0, pilots: {}, days: {} });

  getAllLaps().forEach(function(l){
    var ms = lapDateMs(l);
    if(ms == null) return;
    var wd = weekdayIndex(ms);
    byDay[wd].laps++;
    byDay[wd].pilots[l._pilot] = true;
    byDay[wd].days[l._date] = true;

    var month = String(l._date || '').slice(0, 7);
    if(month){
      byMonth[month] = byMonth[month] || { laps: 0, pilots: {}, days: {} };
      byMonth[month].laps++;
      byMonth[month].pilots[l._pilot] = true;
      byMonth[month].days[l._date] = true;
    }

    var m = String(l.start_time || '').match(/^(\d{1,2}):/);
    if(m){
      var h = Number(m[1]);
      byHour[h] = byHour[h] || { laps: 0, pilots: {} };
      byHour[h].laps++;
      byHour[h].pilots[l._pilot] = true;
    }
  });
  return { byDay: byDay, byHour: byHour, byMonth: byMonth };
}

function rythmeBarsHtml(rows){
  if(!rows.length) return '<p class="small">Pas encore de données.</p>';
  var max = rows.reduce(function(m, r){ return r.value > m ? r.value : m; }, 0);
  if(!max) return '<p class="small">Pas encore de données.</p>';
  return '<div class="rythme-bars">' + rows.map(function(r){
    var pct = Math.round(r.value / max * 100);
    return '<div class="rythme-row' + (r.value === max ? ' rythme-top' : '') + '">' +
      '<div class="rythme-label">' + escapeHtml(r.label) + '</div>' +
      '<div class="rythme-track"><span class="rythme-fill" style="width:' + Math.max(pct, 1) + '%"></span></div>' +
      '<div class="rythme-value">' + r.value.toLocaleString('fr-FR') +
        (r.sub ? '<small>' + escapeHtml(r.sub) + '</small>' : '') + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function monthLabel(key){
  var noms = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  var p = String(key).split('-');
  var i = Number(p[1]) - 1;
  return (noms[i] || key) + ' ' + p[0];
}

function rythmePage(){
  var b = rythmeBuckets();

  var dayRows = b.byDay.map(function(d, i){
    return {
      label: RYTHME_JOURS[i],
      value: d.laps,
      sub: Object.keys(d.days).length + ' j · ' + Object.keys(d.pilots).length + ' pil.'
    };
  });

  var hours = Object.keys(b.byHour).map(Number).sort(function(a, z){ return a - z; });
  var hourRows = hours.map(function(h){
    return {
      label: (h < 10 ? '0' : '') + h + 'h',
      value: b.byHour[h].laps,
      sub: Object.keys(b.byHour[h].pilots).length + ' pil.'
    };
  });

  var months = Object.keys(b.byMonth).sort();
  var monthRows = months.map(function(m){
    return {
      label: monthLabel(m),
      value: b.byMonth[m].laps,
      sub: Object.keys(b.byMonth[m].days).length + ' j · ' + Object.keys(b.byMonth[m].pilots).length + ' pil.'
    };
  });

  // Phrase de synthese calculee sur les donnees, pas ecrite en dur.
  var topDay = dayRows.slice().sort(function(a, z){ return z.value - a.value; })[0];
  var topHour = hourRows.slice().sort(function(a, z){ return z.value - a.value; })[0];
  var resume = (topDay && topDay.value && topHour)
    ? 'Le club roule surtout le <strong>' + escapeHtml(topDay.label.toLowerCase()) +
      '</strong>, avec un pic vers <strong>' + escapeHtml(topHour.label) + '</strong>.'
    : '';

  app.innerHTML =
    '<section class="card club-record-hero"><div><span class="badge">Fréquentation</span>' +
      '<h1>📊 Rythme du club</h1>' +
      '<p class="pilot-sub">Quand roule-t-on ? Répartition de tous les tours enregistrés.</p>' +
      (resume ? '<p class="rythme-resume">' + resume + '</p>' : '') +
    '</div></section>' +
    '<section class="card"><h2>Par jour de la semaine</h2>' +
      '<p class="small">Nombre de tours, avec le nombre de journées de roulage et de pilotes distincts.</p>' +
      rythmeBarsHtml(dayRows) + '</section>' +
    '<section class="card"><h2>Par heure</h2>' +
      '<p class="small">Heure de passage sur la boucle de chronométrage.</p>' +
      rythmeBarsHtml(hourRows) + '</section>' +
    '<section class="card"><h2>Par mois</h2>' +
      rythmeBarsHtml(monthRows) + '</section>';
}
