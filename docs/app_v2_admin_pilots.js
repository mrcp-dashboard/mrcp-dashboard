// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Pages admin : corrections pilotes/transpondeurs, resume club, hub admin.
function getPilotCorrections(){
  try{
    var raw=JSON.parse(localStorage.getItem('mrcp_pilot_corrections')||'{}');
    return {
      names: raw.names && typeof raw.names==='object' ? raw.names : {},
      transponders: raw.transponders && typeof raw.transponders==='object' ? raw.transponders : {}
    };
  }catch(e){
    return {names:{}, transponders:{}};
  }
}

function setPilotCorrections(c){
  localStorage.setItem('mrcp_pilot_corrections', JSON.stringify({
    names:c.names||{},
    transponders:c.transponders||{}
  }, null, 2));
}

function exportPilotCorrections(){
  downloadJson('corrections.json', getPilotCorrections());
}

function transponderSummary(){
  var map = {};
  getAllLapsRaw(true).forEach(function(l){
    var tp = normalizeTransponder(l.transponder || '');
    if(!tp) tp = 'sans-transpondeur';
    if(!map[tp]){
      map[tp] = {
        transponder: tp,
        names: {},
        laps: 0,
        best: Infinity,
        tracks: {}
      };
    }
    map[tp].names[l._pilot] = true;
    map[tp].laps += 1;
    if(l._time < map[tp].best) map[tp].best = l._time;
    map[tp].tracks[l._track] = true;
  });
  return Object.values(map).sort(function(a,b){return b.laps-a.laps;});
}

// Puces enregistrees a la main mais qui n'ont encore jamais roule : elles
// n'apparaissent dans aucun tour, donc transponderSummary() les ignore. On les
// reinjecte pour que l'admin puisse les revoir et les corriger.
function preRegisteredRows(corrections, detectedRows){
  var vues = {};
  detectedRows.forEach(function(r){ vues[r.transponder] = true; });
  return Object.keys(corrections.transponders || {}).filter(function(tp){
    return !vues[tp];
  }).map(function(tp){
    return {
      transponder: tp,
      names: {},
      laps: 0,
      best: null,
      tracks: {},
      preRegistered: true
    };
  }).sort(function(a, b){ return a.transponder.localeCompare(b.transponder); });
}

function addPilotChip(rawTransponder, rawName){
  var tp = normalizeTransponder(rawTransponder);
  var name = String(rawName || '').trim();

  if(!tp) return { ok:false, message:'Renseigne un numéro de puce.' };
  if(!/^[0-9]+$/.test(tp)) return { ok:false, message:'Le numéro de puce ne doit contenir que des chiffres (reçu : ' + tp + ').' };
  if(!name) return { ok:false, message:'Renseigne le nom du pilote.' };

  var corrections = getPilotCorrections();
  if(corrections.transponders[tp]){
    return { ok:false, message:'La puce ' + tp + ' est déjà associée à ' + corrections.transponders[tp] + '. Modifie-la dans le tableau ci-dessous.' };
  }
  // Deja vue dans les donnees : ce n'est pas un ajout, c'est une correction.
  var dejaVue = transponderSummary().some(function(r){ return r.transponder === tp; });

  corrections.transponders[tp] = name;
  setPilotCorrections(corrections);
  return {
    ok: true,
    dejaVue: dejaVue,
    message: dejaVue
      ? 'Puce ' + tp + ' associée à ' + name + '. Elle avait déjà roulé : ses tours existants prendront ce nom.'
      : 'Puce ' + tp + ' pré-enregistrée pour ' + name + '. Elle apparaîtra dès son premier tour.'
  };
}

function adminPilots(){
  var corrections = getPilotCorrections();
  var detected = transponderSummary();
  var preRegistered = preRegisteredRows(corrections, detected);
  var rows = preRegistered.concat(detected);
  var q = '';
  var htmlRows = rows.map(function(r){
    var currentName = corrections.transponders[r.transponder] || Object.keys(r.names)[0] || '';
    var names = Object.keys(r.names).join(' / ');
    var tracks = Object.keys(r.tracks).join(' / ');
    return '<tr data-search="'+escapeHtml((r.transponder+' '+names+' '+currentName).toLowerCase())+'">' +
      '<td data-label="Puce"><strong>'+escapeHtml(r.transponder)+'</strong></td>' +
      '<td data-label="Noms vus">'+(r.preRegistered?'<span class="badge badge-warn">Pré-enregistrée</span>':escapeHtml(names))+'</td>' +
      '<td data-label="Tours">'+(r.preRegistered?'-':r.laps)+'</td>' +
      '<td data-label="Best">'+fmtTimeS(r.best)+'</td>' +
      '<td data-label="Piste"><span class="badge">'+escapeHtml(tracks)+'</span></td>' +
      '<td data-label="Nom officiel"><input class="pilot-name-input" data-tp="'+escapeHtml(r.transponder)+'" value="'+escapeHtml(currentName)+'" placeholder="Nom pilote officiel"></td>' +
      '<td data-label="Action"><button class="save-pilot-name btn-primary" data-tp="'+escapeHtml(r.transponder)+'">Sauver</button></td>' +
    '</tr>';
  }).join('');

  if(!adminOnly('Pilotes admin',
    '<p class="small">Associe une puce/transpondeur à un nom pilote officiel. Ensuite exporte <strong>corrections.json</strong>, copie-le dans le projet, puis relance <code>python build_data_v2.py</code>.</p>' +
    '<div class="grid">' +
      '<div class="card"><h3>Transpondeurs détectés</h3><div class="big">'+detected.length+'</div></div>' +
      '<div class="card"><h3>Associations locales</h3><div class="big">'+Object.keys(corrections.transponders).length+'</div></div>' +
      '<div class="card"><h3>Pré-enregistrées</h3><div class="big">'+preRegistered.length+'</div><div class="small">pas encore roulé</div></div>' +
    '</div>' +
    '<section class="card"><h3>➕ Ajouter une puce qui n’a pas encore roulé</h3>' +
      '<p class="small">Pour inscrire un nouveau membre avant sa première sortie : son nom sera appliqué dès son premier tour, sans avoir à y repenser.</p>' +
      '<div class="admin-add-chip">' +
        '<input id="newChipTransponder" inputmode="numeric" placeholder="Numéro de puce" autocomplete="off">' +
        '<input id="newChipName" placeholder="Nom du pilote" autocomplete="off">' +
        '<button id="addChipBtn" class="btn-primary">Ajouter</button>' +
      '</div>' +
      '<div id="addChipStatus" class="admin-status hidden"></div>' +
    '</section>' +
    adminPreviewHtml() +
    '<p><button id="exportPilotCorrections" class="btn-primary">Exporter corrections.json</button> <button id="applyPilotCorrectionsApi" class="btn-good">Appliquer via API</button> <button id="copyPilotCorrections" class="btn-secondary">Copier JSON</button> <button id="clearPilotCorrections" class="btn-danger">Vider corrections pilotes</button></p>' +
    '<div id="adminPilotsStatus" class="admin-status hidden"></div>' +
    '<textarea class="admin-json" id="pilotCorrectionsText">'+escapeHtml(JSON.stringify(corrections,null,2))+'</textarea>' +
    '<p><button id="importPilotCorrections" class="btn-secondary">Importer le JSON ci-dessus</button></p>' +
    '<input class="searchBox" id="adminPilotSearch" placeholder="Rechercher transpondeur ou pilote...">' +
    '<div class="table-wrap admin-table-wrap"><table><thead><tr><th>Puce</th><th>Noms vus</th><th>Tours</th><th>Best</th><th>Piste</th><th>Nom officiel</th><th>Action</th></tr></thead><tbody id="adminPilotRows">'+htmlRows+'</tbody></table></div>'
  )) return;

  var chipTp = document.getElementById('newChipTransponder');
  var chipName = document.getElementById('newChipName');
  var chipBtn = document.getElementById('addChipBtn');
  function submitChip(){
    var res = addPilotChip(chipTp.value, chipName.value);
    if(!res.ok){
      setAdminStatus('addChipStatus', 'error', 'Ajout impossible', escapeHtml(res.message));
      return;
    }
    // On re-rend la page pour que la nouvelle puce apparaisse dans le tableau,
    // puis on reaffiche le message que ce rendu vient d'effacer.
    adminPilots();
    setAdminStatus('addChipStatus', res.dejaVue ? 'warn' : 'ok', 'Puce enregistrée', escapeHtml(res.message));
  }
  if(chipBtn) chipBtn.onclick = submitChip;
  [chipTp, chipName].forEach(function(input){
    if(!input) return;
    input.addEventListener('keydown', function(ev){
      if(ev.key === 'Enter'){ ev.preventDefault(); submitChip(); }
    });
  });

  document.querySelectorAll('.save-pilot-name').forEach(function(btn){
    btn.onclick=function(){
      var tp=btn.getAttribute('data-tp');
      var input=null; document.querySelectorAll('.pilot-name-input').forEach(function(el){ if(el.getAttribute('data-tp')===tp) input=el; });
      var name=input ? input.value.trim() : '';
      var c=getPilotCorrections();
      if(name){
        c.transponders[tp]=name;
      }else{
        delete c.transponders[tp];
      }
      setPilotCorrections(c);
      document.getElementById('pilotCorrectionsText').value=JSON.stringify(c,null,2);
      alert('Association enregistrée localement pour '+tp);
    };
  });

  document.getElementById('exportPilotCorrections').onclick=function(){
    exportPilotCorrections();
  };

  document.getElementById('applyPilotCorrectionsApi').onclick=function(){
    applyAdminCorrections('adminPilotsStatus',this).catch(function(e){alert('API admin : '+e.message);});
  };

  document.getElementById('copyPilotCorrections').onclick=function(){
    navigator.clipboard.writeText(JSON.stringify(getPilotCorrections(),null,2));
    alert('JSON copié');
  };

  document.getElementById('clearPilotCorrections').onclick=function(){
    if(confirm('Vider toutes les corrections pilotes locales ?')){
      setPilotCorrections({names:{},transponders:{}});
      adminPilots();
    }
  };

  document.getElementById('importPilotCorrections').onclick=function(){
    try{
      var obj=JSON.parse(document.getElementById('pilotCorrectionsText').value);
      setPilotCorrections(obj);
      alert('Corrections pilotes importées');
      adminPilots();
    }catch(e){
      alert('JSON invalide : '+e.message);
    }
  };

  document.getElementById('adminPilotSearch').oninput=function(e){
    var query=e.target.value.toLowerCase();
    document.querySelectorAll('#adminPilotRows tr').forEach(function(tr){
      tr.style.display = tr.getAttribute('data-search').indexOf(query) !== -1 ? '' : 'none';
    });
  };
}
function adminSummaryPage(){
  var all=getAllLaps(), month=periodFilteredLaps('month'), today=liveDaySourceLaps(todayKey());
  var best18=bestByPilot(all.filter(function(l){return l._track==='TT1/8';}))[0]||null;
  var best10=bestByPilot(all.filter(function(l){return l._track==='TT1/10';}))[0]||null;
  var riders=riderRows(month).slice(0,8);
  var todayRows=liveDayRows(today).slice(0,8);
  var progress=bestProgression('month');
  var body=
    '<div class="admin-print-actions"><button id="printAdminSummary" class="btn-primary">Imprimer / PDF</button><a class="btn-secondary" href="#/records-club">Voir records club</a></div>' +
    '<section class="admin-print-report">' +
      '<div class="print-report-head"><div><span class="badge">MRCP</span><h1>Résumé club</h1><p class="small">Document admin imprimable - '+escapeHtml(new Date().toLocaleDateString('fr-FR'))+'</p></div><strong>Dashboard MRCP</strong></div>' +
      '<div class="club-record-grid admin-print-grid">' +
        clubRecordBox('Record TT1/8',fmtTimeS(best18&&best18._time),best18?best18._pilot+' · '+(best18._date||''):'')+
        clubRecordBox('Record TT1/10',fmtTimeS(best10&&best10._time),best10?best10._pilot+' · '+(best10._date||''):'')+
        clubRecordBox('Tours ce mois',month.length.toLocaleString('fr-FR'),fmtKm(totalDistanceKm(month))+' km estimes')+
        clubRecordBox('Progression du mois',progress?'+'+progress.gain.toFixed(3)+' s':'-',progress?progress.pilot+' · '+progress.track:'')+
      '</div>' +
      '<div class="report-columns">' +
        '<div class="card"><h2>Top rouleurs du mois</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Pilote</th><th>Tours</th><th>Km</th></tr></thead><tbody>'+riders.map(function(r,i){return '<tr><td>'+(i+1)+'</td><td>'+escapeHtml(r.pilot)+'</td><td>'+r.laps+'</td><td>'+fmtKm(r.km)+'</td></tr>';}).join('')+'</tbody></table></div></div>' +
        '<div class="card"><h2>Aujourd hui</h2>'+liveDayTable(todayRows)+'</div>' +
      '</div>' +
    '</section>';
  if(!adminOnly('Résumé club imprimable', body))return;
  var btn=document.getElementById('printAdminSummary');
  if(btn)btn.onclick=function(){window.print();};
}
function isUnknownPilotName(name){
  var s=String(name||'').trim();
  return !s||s==='Pilote inconnu'||s.indexOf('Inconnu')>=0||/^[0-9]+/.test(s);
}
function unknownTransponders(){
  var corrections=getPilotCorrections();
  return transponderSummary().map(function(r){
    r.namesList=Object.keys(r.names);
    r.currentName=corrections.transponders[r.transponder]||'';
    r.unknown=!r.currentName&&(r.namesList.some(isUnknownPilotName)||r.namesList.length>1);
    return r;
  }).filter(function(r){return r.unknown;}).sort(function(a,b){
    return (a.currentName?1:0)-(b.currentName?1:0)||b.laps-a.laps;
  });
}
function adminUnknownPilotsPage(){
  var corrections=getPilotCorrections();
  var rows=unknownTransponders();
  var htmlRows=rows.map(function(r){
    var names=r.namesList.join(' / ');
    var tracks=Object.keys(r.tracks).join(' / ');
    return '<tr data-search="'+escapeHtml((r.transponder+' '+names+' '+r.currentName).toLowerCase())+'">' +
      '<td data-label="Puce"><strong>'+escapeHtml(r.transponder)+'</strong></td>' +
      '<td data-label="Noms vus">'+escapeHtml(names||'-')+'</td>' +
      '<td data-label="Tours">'+r.laps+'</td>' +
      '<td data-label="Best">'+fmtTimeS(r.best)+'</td>' +
      '<td data-label="Piste"><span class="badge">'+escapeHtml(tracks||'-')+'</span></td>' +
      '<td data-label="Nom officiel"><input class="pilot-name-input" data-tp="'+escapeHtml(r.transponder)+'" value="'+escapeHtml(r.currentName)+'" placeholder="Nom pilote officiel"></td>' +
      '<td data-label="Action"><button class="save-unknown-pilot btn-primary" data-tp="'+escapeHtml(r.transponder)+'">Sauver</button></td>' +
    '</tr>';
  }).join('');
  if(!adminOnly('Puces inconnues',
    '<p class="small">Vue ciblée pour identifier les nouveaux pilotes ou transpondeurs encore affichés comme inconnus. Les corrections restent locales jusqu au bouton Appliquer via API.</p>' +
    '<div class="grid"><div class="card"><h3>À identifier</h3><div class="big">'+rows.length+'</div></div><div class="card"><h3>Associations locales</h3><div class="big">'+Object.keys(corrections.transponders).length+'</div></div></div>' +
    '<p><button id="applyUnknownPilotsApi" class="btn-good">Appliquer via API</button> <button id="copyUnknownPilots" class="btn-secondary">Copier corrections JSON</button> <a class="btn-secondary" href="#/admin-pilotes">Pilotes admin complet</a></p>' +
    '<div id="adminUnknownStatus" class="admin-status hidden"></div>' +
    '<input class="searchBox" id="unknownPilotSearch" placeholder="Rechercher puce ou nom...">' +
    '<div class="table-wrap admin-table-wrap"><table><thead><tr><th>Puce</th><th>Noms vus</th><th>Tours</th><th>Best</th><th>Piste</th><th>Nom officiel</th><th>Action</th></tr></thead><tbody id="unknownPilotRows">'+(htmlRows||'<tr><td colspan="7">Aucune puce inconnue.</td></tr>')+'</tbody></table></div>'
  ))return;
  document.querySelectorAll('.save-unknown-pilot').forEach(function(btn){
    btn.onclick=function(){
      var tp=btn.getAttribute('data-tp');
      var input=null; document.querySelectorAll('.pilot-name-input').forEach(function(el){if(el.getAttribute('data-tp')===tp)input=el;});
      var name=input?input.value.trim():'';
      var c=getPilotCorrections();
      if(name)c.transponders[tp]=name;else delete c.transponders[tp];
      setPilotCorrections(c);
      alert('Association enregistrée localement pour '+tp);
      adminUnknownPilotsPage();
    };
  });
  var apply=document.getElementById('applyUnknownPilotsApi');
  if(apply)apply.onclick=function(){applyAdminCorrections('adminUnknownStatus',this).catch(function(e){alert('API admin : '+e.message);});};
  var copy=document.getElementById('copyUnknownPilots');
  if(copy)copy.onclick=function(){navigator.clipboard.writeText(JSON.stringify(getPilotCorrections(),null,2));alert('JSON copié');};
  var search=document.getElementById('unknownPilotSearch');
  if(search)search.oninput=function(e){
    var query=e.target.value.toLowerCase();
    document.querySelectorAll('#unknownPilotRows tr').forEach(function(tr){tr.style.display=(tr.getAttribute('data-search')||'').indexOf(query)!==-1?'':'none';});
  };
}
function adminPage(){
  var cfg=getAdminConfig();
  adminOnly('Admin',
    '<p><a href="#/admin-records" class="btn-primary">Records admin</a> <a href="#/admin-pilotes" class="btn-primary">Pilotes admin</a> <a href="#/admin-unknown-pilots" class="btn-primary">Puces inconnues</a> <a href="#/admin-summary" class="btn-secondary">Résumé club</a> <a href="#/quality" class="btn-secondary">Qualite</a></p>' +
    '<div class="grid">' +
      '<div class="card"><h3>API admin</h3><p class="small">Les corrections peuvent etre exportees en JSON ou appliquees directement via l API locale.</p><div class="goal-box"><div class="goal-pill"><span class="small">URL</span><strong>'+escapeHtml(cfg.apiUrl||'Non configuree')+'</strong></div><div class="goal-pill"><span class="small">Token</span><strong>'+(cfg.token?'Configure':'Manquant')+'</strong></div></div><p><button id="testAdminApi" class="btn-secondary">Tester API</button> <button id="applyAllCorrections" class="btn-good">Appliquer corrections + push</button> <button id="resetAdminApi" class="btn-danger">Oublier acces admin</button></p></div>' +
      '<div class="card"><h3>Corrections locales</h3>'+adminPreviewHtml()+'</div>' +
    '</div>' +
    '<div id="adminHubStatus" class="admin-status hidden"></div>' +
    '<ol><li>Corrige les tours dans Records admin.</li><li>Associe les puces dans Pilotes admin.</li><li>Clique sur Appliquer corrections + push si l API locale est configuree.</li><li>Sinon exporte les JSON et lance la generation manuellement.</li></ol>' +
    '<div class="admin-history"><div class="panel-title"><h2>Diagnostic admin</h2><button id="refreshAdminDiagnostics" class="btn-secondary">Rafraichir</button></div><div id="adminDiagnostics"><div class="small">Chargement...</div></div></div>' +
    '<div class="admin-history"><div class="panel-title"><h2>Sauvegardes admin</h2><button id="refreshAdminBackups" class="btn-secondary">Rafraichir</button></div><div id="adminBackups"><div class="small">Chargement...</div></div></div>' +
    '<div class="admin-history"><div class="panel-title"><h2>Historique admin</h2><button id="refreshAdminHistory" class="btn-secondary">Rafraichir</button></div><div id="adminHistory"><div class="small">Chargement...</div></div></div>'
  );
  var test=document.getElementById('testAdminApi');
  if(test)test.onclick=function(){adminFetch('/check-auth',{method:'POST'}).then(function(){alert('API admin OK');}).catch(function(e){alert('API admin : '+e.message);});};
  var apply=document.getElementById('applyAllCorrections');
  if(apply)apply.onclick=function(){applyAdminCorrections('adminHubStatus',this).catch(function(e){alert('API admin : '+e.message);});};
  var refresh=document.getElementById('refreshAdminHistory');
  if(refresh)refresh.onclick=function(){loadAdminHistory();};
  var refreshBackups=document.getElementById('refreshAdminBackups');
  if(refreshBackups)refreshBackups.onclick=function(){loadAdminBackups();};
  var refreshDiagnostics=document.getElementById('refreshAdminDiagnostics');
  if(refreshDiagnostics)refreshDiagnostics.onclick=function(){loadAdminStatus();};
  loadAdminStatus();
  loadAdminBackups();
  loadAdminHistory();
  var reset=document.getElementById('resetAdminApi');
  if(reset)reset.onclick=function(){if(confirm('Oublier acces admin sur ce navigateur ?')){clearAdminConfig();state.isAdmin=false;location.hash='#/';router();}};
}
