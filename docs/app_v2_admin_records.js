// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Pages admin : qualite des donnees, corrections de tours suspects.
function adminOnly(title, body){if(!state.isAdmin){app.innerHTML='<section class="card"><h2>Accès admin</h2><p>Page réservée à l’administrateur.</p></section>';return false;}app.innerHTML='<section class="card"><h2>'+escapeHtml(title)+'</h2>'+body+'</section>';return true;}
function lapSuspicionReasons(l){
  var reason=[];
  if(l._excluded) reason.push('exclu');
  if(l._time<8) reason.push('< 8s');
  if(l._time>=30&&l._time<=45&&l._track==='TT1/8') reason.push('30-45s TT1/8');
  if(l._pilot.indexOf('Inconnu')>=0||l._pilot==='Pilote inconnu'||/^[0-9]+/.test(String(l._pilot))) reason.push('pilote inconnu');
  return reason;
}
function suspiciousLaps(){return getAllLapsRaw(true).filter(function(l){return lapSuspicionReasons(l).length>0;}).sort(function(a,b){return a._time-b._time;});}
function downloadJson(filename,obj){var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
function hashParam(name, fallback){
  var raw=(location.hash.split('?')[1]||'');
  var params=new URLSearchParams(raw);
  return params.get(name)||fallback;
}
function adminRecordLapsForView(view){
  var rows;
  if(view==='tt10') rows=getAllLapsRaw(true).filter(function(l){return l._track==='TT1/10';});
  else if(view==='tt8') rows=getAllLapsRaw(true).filter(function(l){return l._track==='TT1/8';});
  else if(view==='all') rows=getAllLapsRaw(true);
  else rows=suspiciousLaps();
  return rows.sort(function(a,b){
    return (a._time-b._time)||String(b._date||b.session_name).localeCompare(String(a._date||a.session_name));
  });
}
function adminRecordViewLabel(view){
  if(view==='tt10')return'Tours TT1/10';
  if(view==='tt8')return'Tours TT1/8';
  if(view==='all')return'Tous les tours';
  return'Tours suspects';
}
function qualityGroupKey(l, type){
  return type==='session' ? (l.session_id||l.session_name||l._date||'session') : (normalizeTransponder(l.transponder)||'sans-puce');
}
function qualityGroups(laps, type){
  var map={};
  laps.forEach(function(l){
    var key=qualityGroupKey(l,type);
    if(!map[key])map[key]={key:key,label:type==='session'?(l.session_name||l._date||key):(normalizeTransponder(l.transponder)||'Sans puce'),laps:[],pilots:{},tracks:{},best:null};
    map[key].laps.push(l);
    map[key].pilots[l._pilot]=true;
    map[key].tracks[l._track]=true;
    if(!map[key].best||l._time<map[key].best._time)map[key].best=l;
  });
  return Object.values(map).sort(function(a,b){return b.laps.length-a.laps.length||((a.best?a.best._time:999)-(b.best?b.best._time:999));});
}
function qualityGroupHtml(groups, type){
  if(!groups.length)return '<p class="small">Aucun groupe à traiter.</p>';
  return '<div class="quality-groups">'+groups.slice(0,10).map(function(g){
    var pilots=Object.keys(g.pilots).slice(0,3).join(', ');
    var tracks=Object.keys(g.tracks).join(' / ');
    return '<div class="quality-group">' +
      '<div><strong>'+escapeHtml(g.label)+'</strong><div class="small">'+g.laps.length+' tours · '+escapeHtml(tracks||'-')+' · '+escapeHtml(pilots||'-')+'</div><div class="small">Meilleur : '+fmtTimeS(g.best&&g.best._time)+'</div></div>' +
      '<div class="admin-actions">' +
        '<button class="bulk-quality btn-danger" data-type="'+type+'" data-key="'+escapeHtml(g.key)+'" data-action="exclude">Exclure groupe</button>' +
        '<button class="bulk-quality btn-good" data-type="'+type+'" data-key="'+escapeHtml(g.key)+'" data-action="tt10">Tout TT1/10</button>' +
      '</div>' +
    '</div>';
  }).join('')+'</div>';
}
function adminRecords(){
  var view=hashParam('view','suspect');
  var laps=adminRecordLapsForView(view);
  var o=getOverrides();
  var puceGroups=qualityGroups(laps.filter(function(l){return normalizeTransponder(l.transponder);}), 'transponder');
  var sessionGroups=qualityGroups(laps, 'session');

  var rows=laps.slice(0,500).map(function(l){
    var reason=lapSuspicionReasons(l);

    return '<tr data-lap-id="'+escapeHtml(l.lap_id)+'" data-search="'+escapeHtml((l._pilot+' '+l.transponder+' '+l.session_name+' '+l._track+' '+reason.join(' ')).toLowerCase())+'">' +
      '<td data-label="ID tour"><code>'+escapeHtml(l.lap_id)+'</code></td>' +
      '<td data-label="Pilote/Puce">'+escapeHtml(l._pilot)+'<div class="small">'+escapeHtml(l.transponder||'')+'</div></td>' +
      '<td data-label="Temps"><strong>'+fmtTimeS(l._time)+'</strong></td>' +
      '<td data-label="Piste"><span class="badge">'+escapeHtml(l._track)+'</span></td>' +
      '<td data-label="Session">'+escapeHtml(l.session_name||l._date||'-')+'</td>' +
      '<td data-label="Raison">'+escapeHtml(reason.join(', ')||'-')+'</td>' +
      '<td data-label="Actions">' +
        '<div class="admin-actions">' +
          '<button class="record-action btn-danger" data-action="exclude" data-id="'+escapeHtml(l.lap_id)+'">Supprimer tour</button>' +
          '<button class="record-action btn-good" data-action="tt10" data-id="'+escapeHtml(l.lap_id)+'">Mettre TT1/10</button>' +
          '<button class="record-action btn-warn" data-action="tt8" data-id="'+escapeHtml(l.lap_id)+'">Mettre TT1/8</button>' +
          '<button class="record-action" data-action="reset" data-id="'+escapeHtml(l.lap_id)+'">Annuler</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');

  if(!adminOnly('Records admin',
    '<p class="small">Mode correction rapide : après un clic sur Supprimer / TT1/10 / TT1/8, la ligne disparaît automatiquement pour passer à la suivante. Ensuite applique via API ou exporte <strong>lap_overrides.json</strong>. L API fusionne avec les corrections déjà publiées.</p>' +
    '<div class="grid">' +
      '<div class="card"><h3>Exclusions</h3><div class="big" id="excludedCount">'+Object.keys(o.excluded).length+'</div></div>' +
      '<div class="card"><h3>Forçages piste</h3><div class="big" id="forcedTrackCount">'+Object.keys(o.forced_track).length+'</div></div>' +
      '<div class="card"><h3>Tours affiches</h3><div class="big" id="suspectCount">'+laps.length+'</div><p class="small">'+escapeHtml(adminRecordViewLabel(view))+'</p></div>' +
    '</div>' +
    adminPreviewHtml() +
    '<p><button id="exportLapOverrides" class="btn-primary">Exporter lap_overrides.json</button> <button id="applyLapOverridesApi" class="btn-good">Appliquer via API</button> <button id="copyLapOverrides" class="btn-secondary">Copier JSON</button> <button id="clearLapOverrides" class="btn-danger">Vider corrections records</button></p>' +
    '<div id="adminRecordsStatus" class="admin-status hidden"></div>' +
    '<div class="admin-record-toolbar"><label class="small" for="adminRecordView">Vue</label><select id="adminRecordView"><option value="suspect">Tours suspects</option><option value="tt10">Tous les TT1/10</option><option value="tt8">Tous les TT1/8</option><option value="all">Tous les tours</option></select><span class="small">Utilise cette vue pour corriger un tour TT1/10 qui n apparait pas dans les suspects.</span></div>' +
    '<section class="admin-history"><div class="panel-title"><h2>Nettoyage par puce</h2></div>'+qualityGroupHtml(puceGroups,'transponder')+'</section>' +
    '<section class="admin-history"><div class="panel-title"><h2>Nettoyage par session</h2></div>'+qualityGroupHtml(sessionGroups,'session')+'</section>' +
    '<textarea class="admin-json" id="lapOverridesText">'+escapeHtml(JSON.stringify(o,null,2))+'</textarea>' +
    '<p><button id="importLapOverrides" class="btn-secondary">Importer le JSON ci-dessus</button></p>' +
    '<input class="searchBox" id="adminRecordSearch" placeholder="Rechercher pilote, puce, session, raison...">' +
    '<div class="table-wrap admin-table-wrap"><table><thead><tr><th>ID tour</th><th>Pilote/Puce</th><th>Temps</th><th>Piste</th><th>Session</th><th>Raison</th><th>Actions</th></tr></thead><tbody id="adminRecordRows">'+rows+'</tbody></table></div>'
  )) return;

  function refreshOverrideText(){
    var current=getOverrides();
    var txt=document.getElementById('lapOverridesText');
    if(txt) txt.value=JSON.stringify(current,null,2);

    var excluded=document.getElementById('excludedCount');
    if(excluded) excluded.textContent=Object.keys(current.excluded).length;

    var forced=document.getElementById('forcedTrackCount');
    if(forced) forced.textContent=Object.keys(current.forced_track).length;

    var suspect=document.getElementById('suspectCount');
    if(suspect) suspect.textContent=document.querySelectorAll('#adminRecordRows tr').length;
  }

  var recordView=document.getElementById('adminRecordView');
  if(recordView){
    recordView.value=view;
    recordView.onchange=function(){
      location.hash='#/admin-records?view='+encodeURIComponent(recordView.value);
      adminRecords();
    };
  }

  function removeCorrectedRow(btn){
    var row=btn.closest('tr');
    if(row){
      row.classList.add('row-fixed');
      setTimeout(function(){
        if(row && row.parentNode){
          row.parentNode.removeChild(row);
          refreshOverrideText();
        }
      },120);
    }else{
      refreshOverrideText();
    }
  }

  document.querySelectorAll('.record-action').forEach(function(btn){
    btn.onclick=function(){
      var id=btn.getAttribute('data-id');
      var action=btn.getAttribute('data-action');
      var x=getOverrides();

      if(action==='exclude'){
        x.excluded[id]={reason:'Exclu admin'};
        delete x.forced_track[id];
        setOverrides(x);
        removeCorrectedRow(btn);
        return;
      }

      if(action==='tt10'){
        x.forced_track[id]='TT1/10';
        delete x.excluded[id];
        setOverrides(x);
        removeCorrectedRow(btn);
        return;
      }

      if(action==='tt8'){
        x.forced_track[id]='TT1/8';
        delete x.excluded[id];
        setOverrides(x);
        removeCorrectedRow(btn);
        return;
      }

      if(action==='reset'){
        delete x.excluded[id];
        delete x.forced_track[id];
        setOverrides(x);
        removeCorrectedRow(btn);
        return;
      }
    };
  });

  document.querySelectorAll('.bulk-quality').forEach(function(btn){
    btn.onclick=function(){
      var type=btn.getAttribute('data-type');
      var key=btn.getAttribute('data-key');
      var action=btn.getAttribute('data-action');
      var groupLaps=laps.filter(function(l){return qualityGroupKey(l,type)===key;});
      var label=type==='session'?'cette session':'cette puce';

      if(!groupLaps.length){
        alert('Aucun tour trouve pour ce groupe.');
        return;
      }

      if(action==='exclude' && !confirm('Exclure '+groupLaps.length+' tours de '+label+' ?')) return;
      if(action==='tt10' && !confirm('Forcer '+groupLaps.length+' tours de '+label+' en TT1/10 ?')) return;

      var x=getOverrides();
      groupLaps.forEach(function(l){
        if(action==='exclude'){
          x.excluded[l.lap_id]={reason:'Exclu admin groupe '+(type==='session'?'session':'puce')};
          delete x.forced_track[l.lap_id];
        }
        if(action==='tt10'){
          x.forced_track[l.lap_id]='TT1/10';
          delete x.excluded[l.lap_id];
        }
      });
      setOverrides(x);
      adminRecords();
      alert(groupLaps.length+' tours corriges. Pense a appliquer via API ou exporter le JSON.');
    };
  });

  document.getElementById('exportLapOverrides').onclick=function(){
    downloadJson('lap_overrides.json',getOverrides());
  };

  document.getElementById('applyLapOverridesApi').onclick=function(){
    applyAdminCorrections('adminRecordsStatus',this).catch(function(e){alert('API admin : '+e.message);});
  };

  document.getElementById('copyLapOverrides').onclick=function(){
    navigator.clipboard.writeText(JSON.stringify(getOverrides(),null,2));
    alert('JSON copié');
  };

  document.getElementById('clearLapOverrides').onclick=function(){
    if(confirm('Vider uniquement les corrections records locales de ce navigateur ? Les corrections déjà publiées sur GitHub seront conservées par l API.')){
      setOverrides({excluded:{},forced_track:{}});
      adminRecords();
    }
  };

  document.getElementById('importLapOverrides').onclick=function(){
    try{
      var imported=JSON.parse(document.getElementById('lapOverridesText').value);

      // Compatibilité anciens exports : excluded: {id: true}
      if(imported.excluded){
        Object.keys(imported.excluded).forEach(function(k){
          if(imported.excluded[k]===true){
            imported.excluded[k]={reason:'Exclu admin'};
          }
        });
      }

      setOverrides(imported);
      alert('Corrections records importées');
      adminRecords();
    }catch(e){
      alert('JSON invalide : '+e.message);
    }
  };

  document.getElementById('adminRecordSearch').oninput=function(e){
    var q=e.target.value.toLowerCase();
    document.querySelectorAll('#adminRecordRows tr').forEach(function(tr){
      tr.style.display = tr.getAttribute('data-search').indexOf(q) !== -1 ? '' : 'none';
    });
  };
}
function qualityTrackStats(laps){
  var map={};
  laps.forEach(function(l){
    var track=l._track||'unknown';
    if(!map[track])map[track]={track:track,laps:0,pilots:{},best:null,sum:0};
    map[track].laps++;
    map[track].pilots[l._pilot]=true;
    map[track].sum+=l._time;
    if(!map[track].best||l._time<map[track].best._time)map[track].best=l;
  });
  return Object.values(map).sort(function(a,b){return a.track.localeCompare(b.track);});
}
function qualityReasonStats(laps){
  var map={};
  laps.forEach(function(l){
    lapSuspicionReasons(l).forEach(function(reason){map[reason]=(map[reason]||0)+1;});
  });
  return Object.keys(map).sort(function(a,b){return map[b]-map[a];}).map(function(k){return{reason:k,count:map[k]};});
}
function qualityGroupRows(groups, type){
  if(!groups.length)return '<p class="small">Aucun groupe prioritaire.</p>';
  return '<div class="table-wrap"><table><thead><tr><th>'+escapeHtml(type==='session'?'Session':'Puce')+'</th><th>Tours</th><th>Pistes</th><th>Pilotes vus</th><th>Meilleur</th></tr></thead><tbody>'+
    groups.slice(0,8).map(function(g){
      return '<tr><td><strong>'+escapeHtml(g.label)+'</strong></td><td>'+g.laps.length+'</td><td>'+escapeHtml(Object.keys(g.tracks).join(' / ')||'-')+'</td><td>'+escapeHtml(Object.keys(g.pilots).slice(0,4).join(' / ')||'-')+'</td><td>'+fmtTimeS(g.best&&g.best._time)+'</td></tr>';
    }).join('')+'</tbody></table></div>';
}
function quality(){
  var all=getAllLapsRaw(true);
  var active=getAllLaps();
  var suspect=suspiciousLaps();
  var o=getOverrides();
  var reasons=qualityReasonStats(suspect);
  var tracks=qualityTrackStats(active);
  var puceGroups=qualityGroups(suspect.filter(function(l){return normalizeTransponder(l.transponder);}), 'transponder');
  var sessionGroups=qualityGroups(suspect, 'session');
  var unknownPilots=active.filter(function(l){return l._pilot.indexOf('Inconnu')>=0||l._pilot==='Pilote inconnu'||/^[0-9]+/.test(String(l._pilot));}).length;
  var fastLaps=active.filter(function(l){return l._time<8;}).length;
  var corrected=Object.keys(o.excluded).length+Object.keys(o.forced_track).length;

  var reasonHtml=reasons.length?'<div class="quality-reason-grid">'+reasons.map(function(r){
    return '<div><span class="small">'+escapeHtml(r.reason)+'</span><strong>'+r.count+'</strong></div>';
  }).join('')+'</div>':'<p class="small">Aucune raison suspecte detectee.</p>';

  var trackRows=tracks.map(function(t){
    return '<tr><td><span class="badge">'+escapeHtml(t.track)+'</span></td><td>'+t.laps+'</td><td>'+Object.keys(t.pilots).length+'</td><td><strong>'+fmtTimeS(t.best&&t.best._time)+'</strong><div class="small">'+escapeHtml((t.best&&t.best._pilot)||'-')+'</div></td><td>'+fmtTimeS(t.sum/t.laps)+'</td></tr>';
  }).join('');

  adminOnly('Qualite donnees',
    '<div class="grid">' +
      '<div class="card"><h3>Tours suspects</h3><div class="big">'+suspect.length+'</div><p class="small">A traiter dans Records admin</p></div>' +
      '<div class="card"><h3>Tours actifs</h3><div class="big">'+active.length+'</div><p class="small">'+all.length+' tours lus au total</p></div>' +
      '<div class="card"><h3>Corrections locales</h3><div class="big">'+corrected+'</div><p class="small">'+Object.keys(o.excluded).length+' exclusions, '+Object.keys(o.forced_track).length+' pistes forcees</p></div>' +
      '<div class="card"><h3>Pilotes inconnus</h3><div class="big">'+unknownPilots+'</div><p class="small">'+fastLaps+' tours sous 8s</p></div>' +
    '</div>' +
    '<p><a href="#/admin-records" class="btn-primary">Corriger les tours suspects</a> <a href="#/admin-pilotes" class="btn-secondary">Associer les pilotes</a></p>' +
    '<section class="admin-history"><div class="panel-title"><h2>Raisons detectees</h2></div>'+reasonHtml+'</section>' +
    '<section class="admin-history"><div class="panel-title"><h2>Etat par piste</h2></div><div class="table-wrap"><table><thead><tr><th>Piste</th><th>Tours</th><th>Pilotes</th><th>Meilleur</th><th>Moyenne</th></tr></thead><tbody>'+trackRows+'</tbody></table></div></section>' +
    '<section class="admin-history"><div class="panel-title"><h2>Puces a verifier</h2></div>'+qualityGroupRows(puceGroups,'transponder')+'</section>' +
    '<section class="admin-history"><div class="panel-title"><h2>Sessions a verifier</h2></div>'+qualityGroupRows(sessionGroups,'session')+'</section>'
  );
}
