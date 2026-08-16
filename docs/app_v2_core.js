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
