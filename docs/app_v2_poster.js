// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Affiche imprimable publique : une page pensee pour etre sortie en A4 et
// punaisee au club. Le "Resume club" existant est reserve a l'admin et oriente
// diagnostic ; celle-ci est publique et met en avant les classements.

function posterQrUrl(){
  var url = location.origin + location.pathname;
  return 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(url);
}

function posterPodiumHtml(rows, title, subtitle){
  if(!rows || !rows.length) return '';
  var items = rows.slice(0, 3).map(function(r, i){
    return '<tr><td class="poster-rank">' + (['🥇','🥈','🥉'][i] || (i + 1)) + '</td>' +
      '<td>' + escapeHtml(r.pilot) + '</td>' +
      '<td class="poster-time">' + escapeHtml(r.value) + '</td></tr>';
  }).join('');
  return '<div class="poster-block"><h3>' + escapeHtml(title) + '</h3>' +
    (subtitle ? '<p class="small">' + escapeHtml(subtitle) + '</p>' : '') +
    '<table class="poster-table"><tbody>' + items + '</tbody></table></div>';
}

function posterPage(){
  var all = getAllLaps();
  var best18 = bestByPilot(all.filter(function(l){ return l._track === 'TT1/8'; }))[0] || null;
  var best10 = bestByPilot(all.filter(function(l){ return l._track === 'TT1/10'; }))[0] || null;

  // Podiums par division (la piste principale du club).
  var divisions = buildDivisions('TT1/8');
  var divisionBlocks = divisions ? divisions.map(function(d){
    return posterPodiumHtml(
      d.rows.map(function(r){ return { pilot: r._pilot, value: fmtTimeS(r._time) }; }),
      'Division ' + d.letter,
      fmtTimeS(d.best) + ' à ' + fmtTimeS(d.worst)
    );
  }).join('') : '';

  var series18 = bestSeriesByPilot(all.filter(function(l){ return l._track === 'TT1/8'; }));
  var seriesBlock = posterPodiumHtml(
    series18.map(function(s){ return { pilot: s.pilot, value: fmtTimeS(s.avg) }; }),
    'Meilleures séries de ' + SERIES_LAP_COUNT + ' tours',
    'Moyenne sur ' + SERIES_LAP_COUNT + ' tours enchaînés · TT1/8'
  );

  var progress = clubSeasonProgress();
  var progressBlock = posterPodiumHtml(
    progress.map(function(p){ return { pilot: p.pilot, value: '-' + p.gain.toFixed(3) + ' s' }; }),
    'Plus grosses progressions',
    'Gain depuis la première journée de roulage'
  );

  var generated = DATA && DATA.generated_at ? parseGeneratedAt(DATA.generated_at) : null;

  app.innerHTML =
    '<div class="print-actions"><button id="printPoster" class="btn-primary">🖨️ Imprimer / PDF</button>' +
      '<a class="btn-secondary" href="#/records-club">Voir les records</a></div>' +
    '<section class="poster">' +
      '<div class="poster-head">' +
        '<div><h1>🏁 Mini Racing Club Palois</h1>' +
          '<p class="small">Classements du club · ' + escapeHtml(new Date().toLocaleDateString('fr-FR', {day:'2-digit', month:'long', year:'numeric'})) + '</p></div>' +
        '<img class="poster-qr" src="' + posterQrUrl() + '" alt="QR code vers le dashboard">' +
      '</div>' +

      '<div class="poster-records">' +
        '<div class="poster-record"><span>Record TT1/8</span><strong>' + fmtTimeS(best18 && best18._time) + '</strong><small>' + escapeHtml(best18 ? best18._pilot : '-') + '</small></div>' +
        '<div class="poster-record"><span>Record TT1/10</span><strong>' + fmtTimeS(best10 && best10._time) + '</strong><small>' + escapeHtml(best10 ? best10._pilot : '-') + '</small></div>' +
        '<div class="poster-record"><span>Pilotes</span><strong>' + bestByPilot(all).length + '</strong><small>inscrits</small></div>' +
        '<div class="poster-record"><span>Tours</span><strong>' + all.length.toLocaleString('fr-FR') + '</strong><small>enregistrés</small></div>' +
      '</div>' +

      (divisionBlocks ? '<h2>Divisions TT1/8</h2><div class="poster-grid">' + divisionBlocks + '</div>' : '') +
      '<div class="poster-grid">' + seriesBlock + progressBlock + '</div>' +

      '<p class="poster-foot">Scanne le QR code pour retrouver ta fiche pilote, tes chronos et ta progression.' +
        (generated ? ' · Données du ' + escapeHtml(new Date(generated).toLocaleString('fr-FR')) : '') + '</p>' +
    '</section>';

  var btn = document.getElementById('printPoster');
  if(btn) btn.onclick = function(){ window.print(); };
}
