// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Pages live : teaser, decodeur live, TV, vue du jour.
var liveTimer = null;

function liveTrackCounts(laps){
  var counts={};
  laps.forEach(function(l){var track=l._track||'Non classe';counts[track]=(counts[track]||0)+1;});
  return counts;
}

function dateKeyFromValue(value){
  var s=String(value||'').trim();
  var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1];
  var t=Date.parse(s);
  if(Number.isFinite(t)){
    var d=new Date(t);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  return '';
}

function todayKey(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function liveDayPilotName(l){
  var name=String(l._pilot||'').trim();
  if(!name||name==='Pilote inconnu'||name.indexOf('Inconnu')>=0||/^[0-9]+/.test(name)){
    return normalizeTransponder(l.transponder)||name||'Puce inconnue';
  }
  return name;
}

function liveDaySourceLaps(dayKey){
  var rows=[], o=getOverrides(), order=0;
  function add(l,ctx){
    var dateKey=dateKeyFromValue(l.date||l.session_date||ctx.session_date||ctx.session_name);
    if(dateKey!==dayKey)return;
    var t=lapSeconds(l);
    if(!Number.isFinite(t)||t<=0)return;
    var tp=ctx.transponder||l.transponder||'';
    var lapNo=l.lap_no||l.lap||l.number||'';
    var startTime=l.start_time||l.started_at||'';
    var lapId=l.lap_id||l.id||lapKey(ctx.activity_id,tp,lapNo,startTime,t);
    if(o.excluded[lapId]||l.exclude_from_records||l.excluded)return;
    order++;
    rows.push(Object.assign({},l,{
      lap_id:lapId,
      activity_id:ctx.activity_id||'',
      session_id:ctx.session_id||ctx.activity_id||'',
      session_name:ctx.session_name||'',
      session_date:ctx.session_date||'',
      transponder:tp,
      pilot_name:ctx.pilot_name||lapPilot(l),
      _time:t,
      _track:forcedTrack(lapId)||normalizeTrackValue(l.track||ctx.track,l),
      _pilot:ctx.pilot_name||lapPilot(l),
      _date:ctx.session_date||l.date||l.session_date||'',
      _order:order
    }));
  }
  if(DATA&&Array.isArray(DATA.activities)&&DATA.activities.length){
    DATA.activities.forEach(function(a){
      var id=a.id||a.activity_id||a.session_id||'', name=a.name||a.title||a.session_name||a.date_fr||a.date||'', date=a.date||a.session_date||a.created_at||'';
      (a.participants||[]).forEach(function(p){
        var pilot=p.pilot_name||p.name||p.driver||('Inconnu #'+(p.transponder||'')), tp=p.transponder||p.transponder_id||'';
        (p.laps||[]).forEach(function(l){add(l,{activity_id:id,session_id:id,session_name:name,session_date:date,pilot_name:pilot,transponder:tp,track:l.track||p.track||null});});
      });
    });
    return rows;
  }
  return getAllLaps().filter(function(l){return dateKeyFromValue(l._date||l.session_date||l.date||l.session_name)===dayKey;});
}

function liveDayRows(laps){
  var map=new Map();
  laps.forEach(function(l){
    var key=liveDayPilotName(l);
    var item=map.get(key)||{pilot:key,laps:0,best:Infinity,last:null,total:0,tracks:{},lastDate:''};
    item.laps++;
    item.total+=l._time;
    if(!item.last||(l._order||0)>((item.last&&item.last._order)||0))item.last=l;
    item.lastDate=l._date||l.session_name||'';
    item.tracks[l._track]=true;
    if(l._time<item.best)item.best=l._time;
    map.set(key,item);
  });
  return Array.from(map.values()).map(function(r){
    r.avg=r.laps?r.total/r.laps:null;
    r.track=Object.keys(r.tracks).join(' / ')||'-';
    return r;
  }).sort(function(a,b){return a.best-b.best||b.laps-a.laps||a.pilot.localeCompare(b.pilot);});
}

function liveDayTable(rows){
  if(!rows.length)return '<p class="small">Aucun tour date du jour pour le moment.</p>';
  return '<div class="table-wrap live-day-table"><table><thead><tr><th>#</th><th>Pilote / puce</th><th>Tours</th><th>Meilleur</th><th>Tour actuel</th><th>Moyenne</th><th>Piste</th></tr></thead><tbody>'+
    rows.map(function(r,i){
      return '<tr>' +
        '<td>'+(i+1)+'</td>' +
        '<td><strong>'+escapeHtml(r.pilot)+'</strong></td>' +
        '<td>'+r.laps+'</td>' +
        '<td><strong>'+fmtTimeS(r.best)+'</strong></td>' +
        '<td>'+fmtTimeS(r.last&&r.last._time)+'</td>' +
        '<td>'+fmtTimeS(r.avg)+'</td>' +
        '<td><span class="badge">'+escapeHtml(r.track)+'</span></td>' +
      '</tr>';
    }).join('')+'</tbody></table></div>';
}

function liveTimingTeaserPage(){
  if(liveTimer) clearTimeout(liveTimer);
  app.innerHTML=
    '<section class="live-teaser card">'+
      '<div class="live-teaser-copy">'+
        '<span class="badge live-teaser-badge">En preparation</span>'+
        '<h1>Live timing MRCP</h1>'+
        '<p>Les chronos en direct depuis le decodeur arrivent bientot sur le dashboard.</p>'+
        '<div class="live-teaser-grid">'+
          '<div><span>Classement live</span><strong>Tours</strong></div>'+
          '<div><span>Chronos instantanes</span><strong>Best / dernier</strong></div>'+
          '<div><span>Affichage paddock</span><strong>TV ready</strong></div>'+
        '</div>'+
      '</div>'+
      '<div class="live-teaser-screen" aria-hidden="true">'+
        '<div class="live-teaser-row is-leader"><b>1</b><span>Alexis D.</span><strong>31.548 s</strong></div>'+
        '<div class="live-teaser-row"><b>2</b><span>Pilote MRCP</span><strong>+0.284</strong></div>'+
        '<div class="live-teaser-row"><b>3</b><span>Puce 5926001</span><strong>+0.912</strong></div>'+
        '<div class="live-teaser-pulse">Connexion decodeur en cours</div>'+
      '</div>'+
    '</section>';
}

function liveDecoderTime(v){return Number.isFinite(Number(v))?Number(v).toFixed(3)+' s':'-';}
function livePilotLabel(r){
  var name=String((r&&r.pilot)||'').trim();
  if(!name||name.indexOf('Inconnu #')===0||name==='Pilote inconnu')return String((r&&r.transponder)||'-');
  return name;
}
function liveDecoderRows(rows){
  return (rows||[]).slice().sort(function(a,b){
    var lapDiff=Number(b.laps||0)-Number(a.laps||0);
    if(lapDiff)return lapDiff;
    var bestA=Number.isFinite(Number(a.best_lap))?Number(a.best_lap):Infinity;
    var bestB=Number.isFinite(Number(b.best_lap))?Number(b.best_lap):Infinity;
    if(bestA!==bestB)return bestA-bestB;
    return livePilotLabel(a).localeCompare(livePilotLabel(b));
  }).map(function(r,i){
    var row=Object.assign({},r);
    row.position=i+1;
    return row;
  });
}
function liveLeaderBest(rows){
  var leader=(rows||[])[0]||null;
  var value=leader&&Number(leader.best_lap);
  return Number.isFinite(value)?value:null;
}
function liveDecoderGap(v,leaderBest){
  var value=Number(v);
  var leader=Number(leaderBest);
  if(!Number.isFinite(value)||!Number.isFinite(leader))return '-';
  var gap=value-leader;
  if(Math.abs(gap)<0.0005)return 'Leader';
  return '+'+gap.toFixed(3)+' s';
}
function liveDecoderTable(rows){
  var sorted=liveDecoderRows(rows);
  var leaderBest=liveLeaderBest(sorted);
  if(!sorted.length)return '<p class="small">Aucun passage live decodeur pour le moment.</p>';
  return '<div class="table-wrap live-day-table"><table><thead><tr><th>#</th><th>Pilote / puce</th><th>Tours</th><th>Dernier</th><th>Meilleur</th><th>Moyenne</th><th>Ecart leader</th><th>Piste</th></tr></thead><tbody>'+
    sorted.map(function(r,i){
      return '<tr>'+
        '<td>'+(r.position||i+1)+'</td>'+
        '<td><strong>'+escapeHtml(livePilotLabel(r))+'</strong><div class="small">'+escapeHtml(r.transponder||'')+'</div></td>'+
        '<td>'+Number(r.laps||0)+'</td>'+
        '<td>'+liveDecoderTime(r.last_lap)+'</td>'+
        '<td><strong>'+liveDecoderTime(r.best_lap)+'</strong></td>'+
        '<td>'+liveDecoderTime(r.avg_lap)+'</td>'+
        '<td><strong>'+liveDecoderGap(r.best_lap,leaderBest)+'</strong></td>'+
        '<td><span class="badge">'+escapeHtml(r.track||'-')+'</span></td>'+
      '</tr>';
    }).join('')+'</tbody></table></div>';
}

async function fetchLiveDecoderState(){
  var res=await fetch(LIVE_DECODER_URL+'?ts='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw new Error('Etat live decodeur indisponible : HTTP '+res.status);
  return res.json();
}

function liveDecoderPage(){
  if(liveTimer) clearTimeout(liveTimer);
  app.innerHTML='<section class="card"><div class="panel-title"><h2>Live timing reel</h2><span class="badge">route test cachee</span></div><p class="small">Lecture directe du decodeur AMB/P3. Cette page n est pas encore visible dans le menu utilisateur.</p><div id="liveDecoderContent"><p class="small">Chargement...</p></div></section>';
  fetchLiveDecoderState().then(function(state){
    var latest=state.latest_passing||{};
    var rows=liveDecoderRows(state.ranking||[]);
    document.getElementById('liveDecoderContent').innerHTML=
      '<div class="grid">'+
        '<div class="card"><h3>Connexion</h3><div class="big">'+(state.connected?'OK':'-')+'</div><p class="small">'+escapeHtml(state.message||'')+'</p></div>'+
        '<div class="card"><h3>Passages</h3><div class="big">'+Number(state.passings_count||0)+'</div><p class="small">'+escapeHtml(state.local_time||state.generated_at||'')+'</p></div>'+
        '<div class="card"><h3>Tours</h3><div class="big">'+Number(state.laps_count||0)+'</div><p class="small">'+Number(state.pilots_count||0)+' pilotes / puces · '+escapeHtml(state.session_date||'-')+'</p></div>'+
        '<div class="card"><h3>Dernier passage</h3><div class="big">'+escapeHtml(latest.transponder||'-')+'</div><p class="small">'+escapeHtml(livePilotLabel(latest))+' '+liveDecoderTime(latest.lap_time)+'</p></div>'+
      '</div>'+
      '<section class="card"><div class="panel-title"><h2>Classement decodeur</h2><span class="small">'+escapeHtml(state.track||'-')+'</span></div>'+liveDecoderTable(rows)+'</section>';
  }).catch(function(e){
    document.getElementById('liveDecoderContent').innerHTML='<p class="small">Live decodeur non actif : '+escapeHtml(e.message)+'</p>';
  }).finally(function(){
    liveTimer=setTimeout(liveDecoderPage,3000);
  });
}

function liveTvRows(rows){
  var sorted=liveDecoderRows(rows);
  var leaderBest=liveLeaderBest(sorted);
  if(!sorted.length)return '<div class="live-tv-empty">En attente des premiers passages</div>';
  return sorted.slice(0,8).map(function(r,i){
    return '<div class="live-tv-row">'+
      '<div class="live-tv-pos">'+(r.position||i+1)+'</div>'+
      '<div class="live-tv-pilot"><strong>'+escapeHtml(livePilotLabel(r))+'</strong><span>'+escapeHtml(r.transponder||'')+'</span></div>'+
      '<div class="live-tv-stat"><span>Tours</span><strong>'+Number(r.laps||0)+'</strong></div>'+
      '<div class="live-tv-stat"><span>Dernier</span><strong>'+liveDecoderTime(r.last_lap)+'</strong></div>'+
      '<div class="live-tv-stat"><span>Best</span><strong>'+liveDecoderTime(r.best_lap)+'</strong></div>'+
      '<div class="live-tv-stat"><span>Moy.</span><strong>'+liveDecoderTime(r.avg_lap)+'</strong></div>'+
      '<div class="live-tv-stat"><span>Ecart</span><strong>'+liveDecoderGap(r.best_lap,leaderBest)+'</strong></div>'+
    '</div>';
  }).join('');
}

function liveTvVoiceEnabled(){return hashParam('voice','0')==='1';}
function liveTvVoiceLabel(){return liveTvVoiceEnabled()?'Synthese vocale ON':'Synthese vocale OFF';}
function liveTvVoiceText(latest){
  var pilot=livePilotLabel(latest);
  var lap=Number(latest.lap_time);
  if(Number.isFinite(lap)&&lap>0)return pilot+', '+lap.toFixed(3).replace('.',',')+' secondes';
  return pilot+', passage detecte';
}
function announceLivePassing(state){
  if(!liveTvVoiceEnabled())return;
  if(!('speechSynthesis' in window)||!window.SpeechSynthesisUtterance)return;
  var latest=state&&state.latest_passing;
  if(!latest||!latest.seen_at)return;
  var key=[latest.seen_at,latest.transponder,latest.lap_time,state.passings_count].join('|');
  if(key===liveVoiceLastKey)return;
  var seenAt=Date.parse(latest.seen_at);
  if(Number.isFinite(seenAt)&&Date.now()-seenAt>20000){liveVoiceLastKey=key;return;}
  var now=Date.now();
  if(now-liveVoiceLastAt<1200)return;
  liveVoiceLastKey=key;
  liveVoiceLastAt=now;
  var utterance=new window.SpeechSynthesisUtterance(liveTvVoiceText(latest));
  utterance.lang='fr-FR';
  utterance.rate=1;
  utterance.pitch=1;
  try{window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);}catch(e){}
}

function liveDecoderTvPage(){
  if(liveTimer) clearTimeout(liveTimer);
  document.body.classList.add('live-tv');
  app.innerHTML='<section class="live-tv-board"><div class="live-tv-header"><div><div class="live-status"><span class="live-dot"></span> LIVE REEL MRCP</div><h1>Live timing</h1></div><div class="live-tv-head-right"><div class="live-tv-voice">'+liveTvVoiceLabel()+'</div><div class="live-tv-clock">'+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+'</div></div></div><div id="liveTvContent" class="live-tv-content"><div class="live-tv-empty">Chargement du decodeur...</div></div></section>';
  fetchLiveDecoderState().then(function(state){
    var latest=state.latest_passing||{};
    var rows=liveDecoderRows(state.ranking||[]);
    announceLivePassing(state);
    document.getElementById('liveTvContent').innerHTML=
      '<div class="live-tv-hero">'+
        '<div><span class="small">Connexion</span><strong>'+(state.connected?'OK':'Hors ligne')+'</strong><em>'+escapeHtml(state.message||'')+'</em></div>'+
        '<div><span class="small">Passages</span><strong>'+Number(state.passings_count||0)+'</strong><em>'+escapeHtml(state.session_date||'-')+'</em></div>'+
        '<div><span class="small">Tours</span><strong>'+Number(state.laps_count||0)+'</strong><em>'+Number(state.pilots_count||0)+' pilotes / puces</em></div>'+
        '<div class="live-tv-last"><span class="small">Dernier passage</span><strong>'+escapeHtml(livePilotLabel(latest))+'</strong><em>'+liveDecoderTime(latest.lap_time)+' · '+escapeHtml(latest.track||state.track||'-')+'</em></div>'+
      '</div>'+
      '<div class="live-tv-ranking">'+liveTvRows(rows)+'</div>';
  }).catch(function(e){
    document.getElementById('liveTvContent').innerHTML='<div class="live-tv-empty">Live decodeur non actif<br><span>'+escapeHtml(e.message)+'</span></div>';
  }).finally(function(){
    liveTimer=setTimeout(liveDecoderTvPage,3000);
  });
}

function liveDayPage(){
  if(liveTimer) clearTimeout(liveTimer);
  var key=todayKey();
  var dayLaps=liveDaySourceLaps(key);
  var filtered=applyFilters(dayLaps);
  var rows=liveDayRows(filtered);
  var best=rows[0]||null;
  var counts=liveTrackCounts(dayLaps);
  var lastUpdate=new Date().toLocaleTimeString('fr-FR');

  app.innerHTML=
    '<section class="live-hero">' +
      '<div class="card live-card">' +
        '<div class="live-status"><span class="live-dot"></span> LIVE JOUR</div>' +
        '<h1 class="live-title">Live reel du jour</h1>' +
        '<p class="pilot-sub">Tableau classe par meilleur tour du jour. Les pilotes inconnus sont affiches par puce.</p>' +
        '<div class="goal-box">' +
          '<div class="goal-pill"><span class="small">Date</span><strong>'+escapeHtml(key)+'</strong></div>' +
          '<div class="goal-pill"><span class="small">Pilotes / puces</span><strong>'+rows.length+'</strong></div>' +
          '<div class="goal-pill"><span class="small">Tours du jour</span><strong>'+dayLaps.length+'</strong></div>' +
          '<div class="goal-pill"><span class="small">TT1/8</span><strong>'+(counts['TT1/8']||0)+'</strong></div>' +
          '<div class="goal-pill"><span class="small">TT1/10</span><strong>'+(counts['TT1/10']||0)+'</strong></div>' +
        '</div>' +
        '<div class="live-refresh">' +
          '<button id="manualRefreshLiveDay" class="btn-primary">Rafraichir</button>' +
          '<span class="small">Dernier rafraichissement : '+lastUpdate+'</span>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>Meilleur tour du jour</h3>' +
        '<div class="big">'+fmtTimeS(best&&best.best)+'</div>' +
        '<p>'+(best?escapeHtml(best.pilot):'-')+'</p>' +
        '<p class="small">Rafraichissement automatique toutes les 30 secondes.</p>' +
      '</div>' +
    '</section>' +
    '<section class="card">' +
      '<div class="panel-title"><h2>Classement live du jour</h2></div>' +
      renderFilters() +
      liveDayTable(rows) +
    '</section>';

  bindFilters(liveDayPage);
  var manual=document.getElementById('manualRefreshLiveDay');
  if(manual)manual.onclick=function(){location.reload();};
  liveTimer=setTimeout(function(){location.reload();},30000);
}

