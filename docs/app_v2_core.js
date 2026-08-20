// Extrait de app_v2.js (decoupage modules) - voir docs/DEVELOPMENT.md
// Etat global, utilitaires de base (formatage, overrides, config admin), theme.
var DATA = null;
var app = document.getElementById('app');
var deferredPrompt = null;
var ADMIN_CFG_KEY = 'mrcp_admin_api_config';
var DATA_CACHE_NAME = 'mrcp-dashboard-data-v1';
var DATA_URL = 'data_v2.json';
var THEME_KEY = 'mrcp_dashboard_theme';
var LIVE_DECODER_URL = 'live_decoder_state.json';
var DEFAULT_LAP_DISTANCE_METERS = 250;
var TRACK_LAP_DISTANCE_METERS = {'TT1/8':250,'TT1/10':180};
var state = { track:'all', recordPeriod:'total', isAdmin: !!getAdminConfig().token };
var lapsCache = null;
var liveVoiceLastKey = '';
var liveVoiceLastAt = 0;

function escapeHtml(value){return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
// null/undefined/'' = pas de valeur -> '-'. Sans ce garde-fou Number(null) vaut 0
// et une absence de record s'affichait "0.000 s". Le vrai 0 reste affiche (un
// ecart au record de 0 s est legitime quand le pilote detient le record).
function fmtTime(v){if(v===null||v===undefined||v==='')return '-';var n=Number(v);return Number.isFinite(n)?n.toFixed(3):'-';}
function fmtTimeS(v){var t=fmtTime(v);return t==='-'?t:t+' s';}
function lapSeconds(l){return Number(l.lap_time ?? l.time ?? l.seconds ?? l.best_lap ?? l.duration);}
function normalizeTrack(l){if(l.track)return l.track;var t=lapSeconds(l);if(!Number.isFinite(t))return'unknown';return t<30?'TT1/10':'TT1/8';}
function normalizeTransponder(v){return String(v||'').replace('/0','').trim();}
function normalizeTrackValue(track,l){
  var s=String(track||'').trim();
  if(s&&s.toLowerCase()!=='mixte'&&s.toLowerCase()!=='unknown')return s;
  return normalizeTrack(l);
}
function displayTrack(track){
  var s=String(track||'').trim();
  if(!s||s==='unknown')return '-';
  if(s.toLowerCase()==='mixte')return 'TT1/10';
  return s;
}
function lapPilot(l){return l.pilot_name||l.pilot||l.driver||l.name||l.participant_name||l.transponder||'Pilote inconnu';}
function lapKey(activityId, transponder, lapNo, startTime, lapTime){var n=Number(lapTime);return [activityId||'',normalizeTransponder(transponder),lapNo||'',startTime||'',Number.isFinite(n)?n.toFixed(3):''].join('|');}
function getOverrides(){try{var raw=JSON.parse(localStorage.getItem('mrcp_lap_overrides')||'{}');return{excluded:raw.excluded&&typeof raw.excluded==='object'?raw.excluded:{},forced_track:raw.forced_track&&typeof raw.forced_track==='object'?raw.forced_track:{}};}catch(e){return{excluded:{},forced_track:{}};}}
function clearDerivedCache(){lapsCache=null;}
function setOverrides(o){localStorage.setItem('mrcp_lap_overrides',JSON.stringify({excluded:o.excluded||{},forced_track:o.forced_track||{}},null,2));clearDerivedCache();}
function forcedTrack(lapId,o){return (o||getOverrides()).forced_track[lapId]||null;}
function getAdminConfig(){try{var raw=JSON.parse(localStorage.getItem(ADMIN_CFG_KEY)||'{}');return{apiUrl:String(raw.apiUrl||'').replace(/\/+$/,''),token:String(raw.token||'')};}catch(e){return{apiUrl:'',token:''};}}
function setAdminConfig(cfg){localStorage.setItem(ADMIN_CFG_KEY,JSON.stringify({apiUrl:String(cfg.apiUrl||'').replace(/\/+$/,''),token:String(cfg.token||'')},null,2));}
function clearAdminConfig(){localStorage.removeItem(ADMIN_CFG_KEY);}
// --- Fraicheur des donnees -------------------------------------------------
// Le pied de page restait fige sur "Donnees en cours de chargement" : rien ne
// l'alimentait. Il affiche desormais la date des donnees publiees.
//
// Pas d'alerte basee sur l'age : depuis que le LXC ne commite plus quand rien
// n'a change (voir docs/tools/data_changed.py), `generated_at` ne bouge que
// lorsqu'il y a du nouveau. Une semaine sans roulage est donc normale, et
// colorer en rouge au bout d'une heure ne ferait que crier au loup. La date
// affichee suffit : le club sait quand il a roule.
var freshnessTimer = null;

// generated_at peut arriver sans fuseau horaire (donnees generees avant le
// passage de build_data_v2.py a un horodatage explicite, ou relues du cache) :
// dans ce cas c'est de l'UTC, car le serveur tourne en UTC. Sans ce garde-fou
// un navigateur francais lirait la date comme de l'heure de Paris, soit 2 h
// dans le futur.
function parseGeneratedAt(value){
  var s = String(value || '').trim();
  if(!s) return null;
  if(!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z';
  var t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function fmtAgeMinutes(minutes){
  if(minutes < 1) return "à l'instant";
  if(minutes < 60) return 'il y a ' + Math.round(minutes) + ' min';
  var h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  if(h < 24) return 'il y a ' + h + ' h' + (m ? ' ' + (m < 10 ? '0' : '') + m : '');
  var d = Math.floor(h / 24);
  return 'il y a ' + d + ' jour' + (d > 1 ? 's' : '');
}

function updateDataFreshness(){
  var el = document.getElementById('lastUpdateFooter');
  if(!el) return;
  var t = DATA && parseGeneratedAt(DATA.generated_at);
  if(!t){
    el.textContent = 'Données en cours de chargement';
    el.className = '';
    return;
  }
  // Marge negative possible si l'horloge du visiteur est en avance : on la
  // ramene a zero plutot que d'afficher une duree absurde.
  var minutes = Math.max(0, (Date.now() - t) / 60000);
  // Au-dela de 24 h, la date exacte est plus parlante qu'un "il y a 5 jours".
  var when = minutes < 24 * 60
    ? fmtAgeMinutes(minutes)
    : 'le ' + new Date(t).toLocaleDateString('fr-FR');
  el.textContent = 'Dernière mise à jour · ' + when;
  el.className = 'freshness';
  el.title = 'Dernière génération des données : ' + new Date(t).toLocaleString('fr-FR');
}

function setupDataFreshness(){
  updateDataFreshness();
  if(freshnessTimer) clearInterval(freshnessTimer);
  // Le kiosque Raspberry Pi laisse la page ouverte en continu : sans ce
  // rafraichissement l'age afficherait indefiniment sa valeur du chargement.
  freshnessTimer = setInterval(updateDataFreshness, 30000);
}

function applyTheme(theme){
  theme = theme === 'warm' ? 'warm' : 'green';
  document.body.classList.toggle('theme-warm', theme === 'warm');
  document.body.classList.toggle('theme-green', theme !== 'warm');
  try{localStorage.setItem(THEME_KEY, theme);}catch(e){}
  var select=document.getElementById('themeSelect');if(select)select.value=theme;
}
function setupTheme(){
  var theme='green';
  try{theme=localStorage.getItem(THEME_KEY)||'green';}catch(e){}
  applyTheme(theme);
  var select=document.getElementById('themeSelect');
  if(select)select.onchange=function(){applyTheme(select.value);};
}
