// Point d'entree : routage des hash, initialisation, bootstrap PWA/admin.
// La logique est repartie dans les fichiers app_v2_*.js charges juste avant
// celui-ci (voir docs/DEVELOPMENT.md). Comme le reste du projet, ce sont des
// scripts classiques qui partagent le meme scope global (pas de modules ES).

function showError(title,err){app.innerHTML='<section class="card"><h2>'+escapeHtml(title)+'</h2><p>'+escapeHtml(err&&err.message?err.message:String(err))+'</p></section>';console.error(err);}
function router(){try{updateAdminNav();setActiveNav();var h=location.hash||'#/';document.body.classList.toggle('live-tv',h.indexOf('#/live-tv')===0);if(h.indexOf('#/live-timing')===0)return liveTimingTeaserPage();if(h.indexOf('#/live-tv')===0)return liveDecoderTvPage();if(h.indexOf('#/live-reel')===0)return liveDecoderPage();if(h.indexOf('#/journee')===0)return dayViewPage();if(h.indexOf('#/jour')===0)return clubTodayPage();
    if(h.indexOf('#/club-today')===0)return clubTodayPage();if(h.indexOf('#/records-club')===0)return clubRecordsPage();if(h.indexOf('#/rouleurs')===0)return ridersPage();if(h.indexOf('#/comparatif')===0)return comparePage();if(h.indexOf('#/affiche')===0)return posterPage();if(h.indexOf('#/divisions')===0)return divisionsPage();if(h.indexOf('#/qr-profil')===0)return qrProfilePage();if(h.indexOf('#/historique-records')===0)return recordHistoryPage();if(h.indexOf('#/mes-chronos')===0)return myChronos();if(h.indexOf('#/sessions')===0)return sessionsPage();if(h.indexOf('#/pilotes')===0)return pilots();if(h.indexOf('#/pilote-session/')===0)return pilotSessionPage(h.replace('#/pilote-session/',''));if(h.indexOf('#/pilote/')===0)return pilotPage(h.replace('#/pilote/',''));if(h.indexOf('#/podiums')===0)return clubRecordsPage();if(h.indexOf('#/quality')===0)return quality();if(h.indexOf('#/admin-summary')===0)return adminSummaryPage();if(h.indexOf('#/admin-unknown-pilots')===0)return adminUnknownPilotsPage();if(h.indexOf('#/admin-pilotes')===0)return adminPilots();if(h.indexOf('#/admin-records')===0)return adminRecords();if(h.indexOf('#/admin')===0)return adminPage();return home();}catch(e){showError('Erreur affichage',e);}}
function bindAdmin(){
  var modal=document.getElementById('adminLoginModal');
  var urlInput=document.getElementById('adminLoginUrl');
  var tokenInput=document.getElementById('adminLoginToken');
  var errorBox=document.getElementById('adminLoginError');
  var submitBtn=document.getElementById('adminLoginSubmit');
  var cancelBtn=document.getElementById('adminLoginCancel');

  function showLoginError(message){
    if(!errorBox) return;
    errorBox.textContent=message;
    errorBox.classList.remove('hidden');
  }
  function hideLoginError(){
    if(errorBox){errorBox.textContent='';errorBox.classList.add('hidden');}
  }
  function openLogin(){
    if(!modal) return;
    var current=getAdminConfig();
    if(urlInput) urlInput.value=current.apiUrl||'http://127.0.0.1:5055';
    if(tokenInput) tokenInput.value=current.token||'';
    hideLoginError();
    modal.classList.remove('hidden');
    if(urlInput) urlInput.focus();
  }
  function closeLogin(){
    if(modal) modal.classList.add('hidden');
  }
  async function submitLogin(){
    var apiUrl=(urlInput&&urlInput.value||'').trim();
    var token=(tokenInput&&tokenInput.value||'').trim();
    if(!apiUrl||!token){
      showLoginError('URL et token sont obligatoires.');
      return;
    }
    hideLoginError();
    if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Connexion...';}
    try{
      await checkAdminToken(apiUrl, token);
      closeLogin();
      router();
    }catch(e){
      showLoginError('Accès refusé : '+e.message);
    }finally{
      if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Se connecter';}
    }
  }

  var a=document.getElementById('adminBtn');if(a)a.onclick=openLogin;
  var b=document.getElementById('adminBtnTop');if(b)b.onclick=openLogin;
  var e=document.getElementById('adminExit');if(e)e.onclick=function(){clearAdminConfig();state.isAdmin=false;location.hash='#/';router();};

  if(submitBtn) submitBtn.onclick=submitLogin;
  if(cancelBtn) cancelBtn.onclick=closeLogin;
  if(modal) modal.addEventListener('click',function(ev){if(ev.target===modal)closeLogin();});
  [urlInput,tokenInput].forEach(function(input){
    if(!input) return;
    input.addEventListener('keydown',function(ev){
      if(ev.key==='Enter'){ev.preventDefault();submitLogin();}
      if(ev.key==='Escape'){ev.preventDefault();closeLogin();}
    });
  });
}

function setupPwa(){
  var installBtn=document.getElementById('installPwaBtn');
  var standalone=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches;
  if(window.navigator&&window.navigator.standalone)standalone=true;
  if(installBtn&&standalone)installBtn.classList.add('hidden');
  if('serviceWorker' in navigator){
    var refreshing=false;
    navigator.serviceWorker.addEventListener('controllerchange',function(){
      if(refreshing)return;
      refreshing=true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js?v=20260528-install1').then(function(reg){
      if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
      reg.addEventListener('updatefound',function(){
        var worker=reg.installing;
        if(!worker)return;
        worker.addEventListener('statechange',function(){
          if(worker.state==='installed'&&navigator.serviceWorker.controller){
            worker.postMessage({type:'SKIP_WAITING'});
          }
        });
      });
    }).catch(function(e){console.log('SW non enregistré',e);});
  }
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e;if(installBtn){installBtn.classList.remove('hidden');installBtn.textContent="Installer l'app";}});
  window.addEventListener('appinstalled',function(){deferredPrompt=null;if(installBtn)installBtn.classList.add('hidden');});
  if(installBtn){installBtn.onclick=async function(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt=null;
      installBtn.classList.add('hidden');
      return;
    }
    var ua=navigator.userAgent||'';
    var ios=/iphone|ipad|ipod/i.test(ua);
    if(ios){
      alert("Sur iPhone : ouvre le bouton Partager de Safari, puis choisis \"Sur l'ecran d'accueil\".");
    }else{
      alert("Si le bouton installation ne s'ouvre pas, utilise le menu du navigateur puis \"Installer l'application\" ou \"Ajouter a l'ecran d'accueil\".");
    }
  };}
}

async function readCachedDashboardData(){
  if(!('caches' in window))return null;
  var cache=await caches.open(DATA_CACHE_NAME);
  var res=await cache.match(DATA_URL);
  if(!res||!res.ok)return null;
  return res.json();
}

async function fetchFreshDashboardData(){
  var res=await fetch(DATA_URL+'?ts='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw new Error('Impossible de charger data_v2.json : HTTP '+res.status);
  var text=await res.text();
  if('caches' in window){
    var cache=await caches.open(DATA_CACHE_NAME);
    await cache.put(DATA_URL,new Response(text,{headers:{'Content-Type':'application/json'}}));
  }
  return JSON.parse(text);
}

async function init(){
  try{
    setupTheme(); bindAdmin(); setupPwa(); updateAdminNav(); setupDataFreshness();
    var today=document.getElementById('todayLabel');if(today)today.textContent=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
    var renderedFromCache=false;
    try{
      var cached=await readCachedDashboardData();
      if(cached){DATA=cached;clearDerivedCache();router();updateDataFreshness();renderedFromCache=true;}
    }catch(cacheError){console.log('Cache data ignore',cacheError);}
    try{
      DATA=await fetchFreshDashboardData();
      clearDerivedCache();
      router();
      updateDataFreshness();
    }catch(fetchError){
      if(!renderedFromCache)throw fetchError;
      console.log('Rafraichissement data impossible',fetchError);
    }
  }catch(e){showError('Erreur de chargement',e);}
}
window.addEventListener('hashchange',router);
init();
