import json, base64, requests, os, sys
from pathlib import Path
from datetime import datetime

GITHUB_USER  = "mrcp-dashboard"
GITHUB_TOKEN = os.environ.get("MRCP_GH_TOKEN")
if not GITHUB_TOKEN:
    print("\n  ERREUR : variable d'environnement MRCP_GH_TOKEN non definie.")
    print("  Definis-la dans Windows : setx MRCP_GH_TOKEN \"ghp_xxxxx\"")
    print("  Puis ferme et reouvre le terminal.\n")
    input("Entree pour fermer...")
    sys.exit(1)
REPO_NAME    = "mrcp-dashboard"
REPORTS_DIR  = Path("speedhive_reports")
HISTORY_FILE = Path("speedhive_history.json")

API = "https://api.github.com"
HEADERS = {
    "Authorization": "token " + GITHUB_TOKEN,
    "Accept": "application/vnd.github.v3+json",
}
PALETTE = ["#e63946","#4cc9f0","#f4a261","#2ecc71","#a855f7","#ffd166",
           "#ff6b6b","#06d6a0","#118ab2","#ef476f","#ffd700","#8ecae6",
           "#e9c46a","#f77f00","#d62828","#023e8a","#80b918","#ff99c8",
           "#c77dff","#48cae4","#74c69d","#52b788","#ffb703","#fb8500",
           "#219ebc","#e76f51","#264653","#2a9d8f","#9b2226","#005f73"]

def get_sha(path):
    r = requests.get(API+"/repos/"+GITHUB_USER+"/"+REPO_NAME+"/contents/docs/"+path, headers=HEADERS)
    return r.json().get("sha") if r.status_code == 200 else None

def push_file(path, content_bytes, msg):
    url = API+"/repos/"+GITHUB_USER+"/"+REPO_NAME+"/contents/docs/"+path
    sha = get_sha(path)
    payload = {"message": msg, "content": base64.b64encode(content_bytes).decode()}
    if sha:
        payload["sha"] = sha
    r = requests.put(url, headers=HEADERS, json=payload)
    r.raise_for_status()

def normalize_date(d):
    d = d.strip()
    parts = d.replace('-', '/').split('/')
    if len(parts) != 3:
        return d
    if len(parts[0]) == 4:
        return parts[2]+"/"+parts[1]+"/"+parts[0]
    return parts[0]+"/"+parts[1]+"/"+parts[2]

def sort_key(d):
    try:
        p = normalize_date(d).split('/')
        return p[2]+"-"+p[1]+"-"+p[0]
    except:
        return d

def clean_history(history):
    cleaned = {}
    for pid, pdata in history.items():
        if pdata['name'].startswith('Inconnu'):
            continue
        seen_dates = {}
        for sess in pdata['sessions']:
            nd = normalize_date(sess['date'])
            if nd not in seen_dates or sess['count'] > seen_dates[nd]['count']:
                seen_dates[nd] = dict(sess)
                seen_dates[nd]['date'] = nd
        sessions = sorted(seen_dates.values(), key=lambda s: sort_key(s['date']))
        if sessions:
            cleaned[pid] = {'name': pdata['name'], 'sessions': sessions}
    return cleaned

def generate_index(history, html_files):
    now = datetime.now().strftime('%d/%m/%Y a %H:%M')

    date_map = {}
    for pid, pdata in history.items():
        for sess in pdata['sessions']:
            d = sess['date']
            if d not in date_map:
                date_map[d] = {'date': d, 'pilots': set(), 'laps': 0, 'podium': []}
            date_map[d]['pilots'].add(pdata['name'])
            date_map[d]['podium'].append({'name': pdata['name'], 'best': sess['best']})
            date_map[d]['laps'] += sess['count']

    sessions_meta = []
    file_map = {}
    for hf in html_files:
        slug = hf.stem.replace('session_mrcp_', '')
        if len(slug) == 8 and slug.isdigit():
            d = slug[:2]+"/"+slug[2:4]+"/"+slug[4:]
            file_map[d] = hf.name

    for d, info in sorted(date_map.items(), key=lambda x: sort_key(x[0]), reverse=True):
        info['podium'].sort(key=lambda x: x['best'])
        sessions_meta.append({
            'date': d,
            'pilots': len(info['pilots']),
            'total_laps': info['laps'],
            'podium': info['podium'][:3],
            'file': file_map.get(d, '')
        })

    history_js  = json.dumps(history,       ensure_ascii=True)
    sessions_js = json.dumps(sessions_meta, ensure_ascii=True)
    palette_js  = json.dumps(PALETTE)
    files_js    = json.dumps([hf.name for hf in html_files])

    html = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MRCP Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root{--bg:#0f1117;--surface:#1a1d27;--surface2:#222535;--border:#2e3250;--accent:#e63946;--gold:#FFD700;--silver:#C0C0C0;--bronze:#CD7F32;--text:#e8eaf0;--muted:#7b82a8;--green:#2ecc71;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;}
header{background:linear-gradient(135deg,#1a1d27,#16192a);border-bottom:1px solid var(--border);padding:22px 40px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
.logo{font-size:26px;font-weight:900;}.logo span{color:var(--accent);}
.subtitle{color:var(--muted);font-size:13px;margin-top:3px;}
.badge{margin-left:auto;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 14px;font-size:12px;color:var(--muted);}
main{max-width:1400px;margin:0 auto;padding:28px 24px;}
.section-title{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:12px;margin-top:28px;}
.section-title:first-child{margin-top:0;}
.stats-summary{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;}
.stat-box{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;}
.stat-box .val{font-size:28px;font-weight:800;color:var(--green);font-variant-numeric:tabular-nums;}
.stat-box .lbl{font-size:11px;color:var(--muted);margin-top:4px;}
.sessions-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;}
.session-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;text-decoration:none;color:var(--text);transition:all .2s;display:block;}
.session-card:hover{border-color:var(--accent);transform:translateY(-2px);}
.session-date{font-size:16px;font-weight:700;margin-bottom:6px;}
.session-meta{font-size:11px;color:var(--muted);margin-bottom:12px;}
.session-podium{display:flex;gap:8px;}
.pcard{flex:1;background:var(--surface2);border-radius:8px;padding:8px;text-align:center;}
.pcard .medal{font-size:18px;}.pcard .pname{font-size:10px;font-weight:600;margin:3px 0 1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pcard .ptime{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;}
.pcard.gold .ptime{color:var(--gold);}.pcard.silver .ptime{color:var(--silver);}.pcard.bronze .ptime{color:var(--bronze);}
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;}
.evo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px;}
.evo-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;}
.evo-name{font-size:13px;font-weight:700;margin-bottom:12px;}
.files-section{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;}
.file-link{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 18px;text-decoration:none;color:var(--text);transition:all .2s;display:flex;align-items:center;gap:10px;}
.file-link:hover{border-color:var(--accent);transform:translateY(-1px);}
.empty-msg{color:var(--muted);font-size:12px;padding:30px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:12px;}
footer{text-align:center;padding:20px;color:var(--muted);font-size:11px;border-top:1px solid var(--border);margin-top:32px;}
</style>
</head>
<body>
<header>
  <div><div class="logo">MRCP <span>Dashboard</span></div>
  <div class="subtitle">Mini Racing Club Palois &mdash; Suivi des performances</div></div>
  <div class="badge">Mis a jour le NOW_PLACEHOLDER</div>
</header>
<main>
<div class="section-title">Resume global</div>
<div class="stats-summary" id="summary"></div>
<div class="section-title">Sessions</div>
<div class="sessions-grid" id="sessionsGrid"></div>
<div class="section-title">Rapports detailles</div>
<div class="files-section" id="filesSection"></div>
<div class="section-title">Evolution du meilleur tour</div>
<div class="chart-card"><canvas id="evoGlobal" height="160"></canvas></div>
<div class="section-title">Evolution par pilote</div>
<div class="evo-grid" id="evoGrid"></div>
</main>
<footer>MRCP Dashboard &middot; Tours 31s&ndash;50s &middot; Genere automatiquement</footer>
<script>
var SESSIONS = DATA_SESSIONS;
var HISTORY  = DATA_HISTORY;
var PALETTE  = DATA_PALETTE;
var FILES    = DATA_FILES;

function fmt(s){var m=Math.floor(s/60),sec=s-m*60,ss=sec.toFixed(3);while(ss.length<6)ss='0'+ss;return m+':'+ss;}
function sk(d){try{var p=d.split('/');return p[2]+'-'+p[1]+'-'+p[0];}catch(e){return d;}}

var allPilots=new Set(Object.values(HISTORY).map(function(p){return p.name;}));
var globalBest=999,globalBestName='';
Object.values(HISTORY).forEach(function(p){p.sessions.forEach(function(s){if(s.best<globalBest){globalBest=s.best;globalBestName=p.name;}});});
var totalLaps=Object.values(HISTORY).reduce(function(a,p){return a+p.sessions.reduce(function(b,s){return b+s.count;},0);},0);
document.getElementById('summary').innerHTML=
  '<div class="stat-box"><div class="val">'+SESSIONS.length+'</div><div class="lbl">Sessions</div></div>'+
  '<div class="stat-box"><div class="val">'+allPilots.size+'</div><div class="lbl">Pilotes</div></div>'+
  '<div class="stat-box"><div class="val">'+totalLaps+'</div><div class="lbl">Tours valides</div></div>'+
  '<div class="stat-box"><div class="val" style="font-size:20px">'+(globalBest<999?fmt(globalBest):'--')+'</div><div class="lbl">Record &mdash; '+globalBestName+'</div></div>';

var grid=document.getElementById('sessionsGrid');
var classes=['gold','silver','bronze'];
var medals=['&#127945;','&#129352;','&#129353;'];
SESSIONS.forEach(function(s){
  var podHtml='';
  s.podium.forEach(function(p,i){
    podHtml+='<div class="pcard '+classes[i]+'"><div class="medal">'+medals[i]+'</div><div class="pname">'+p.name.split(' ')[0]+'</div><div class="ptime">'+fmt(p.best)+'</div></div>';
  });
  var tag=s.file?'a':'div';
  var el=document.createElement(tag);
  el.className='session-card';
  if(s.file) el.href=s.file;
  el.innerHTML='<div class="session-date">&#127937; '+s.date+'</div>'+
    '<div class="session-meta">'+s.pilots+' pilote'+(s.pilots>1?'s':'')+' &middot; '+s.total_laps+' tours</div>'+
    '<div class="session-podium">'+podHtml+'</div>';
  grid.appendChild(el);
});

var filesEl=document.getElementById('filesSection');
FILES.forEach(function(f){
  var a=document.createElement('a');a.className='file-link';a.href=f;
  var name=f.replace('session_mrcp_','').replace('.html','');
  a.innerHTML='<span style="font-size:20px">&#128196;</span><div><div style="font-weight:700;font-size:13px">Session '+name+'</div></div>';
  filesEl.appendChild(a);
});

var pidsEvo=Object.keys(HISTORY).filter(function(pid){return HISTORY[pid].sessions.length>=2;});
if(pidsEvo.length){
  var allD=[];
  var dset={};
  pidsEvo.forEach(function(pid){HISTORY[pid].sessions.forEach(function(s){dset[s.date]=1;});});
  allD=Object.keys(dset).sort(function(a,b){return sk(a).localeCompare(sk(b));});
  new Chart(document.getElementById('evoGlobal'),{type:'line',
    data:{labels:allD,datasets:pidsEvo.map(function(pid,i){
      var p=HISTORY[pid];
      return {label:p.name.split(' ')[0],
        data:allD.map(function(d){var s=p.sessions.find(function(s){return s.date===d;});return s?s.best:null;}),
        borderColor:PALETTE[i%PALETTE.length],backgroundColor:'transparent',pointRadius:5,borderWidth:2,tension:.3,spanGaps:false};
    })},
    options:{responsive:true,plugins:{legend:{labels:{color:'#7b82a8',font:{size:10}}}},
      scales:{x:{ticks:{color:'#7b82a8',font:{size:9}},grid:{color:'#1e2136'}},
        y:{ticks:{color:'#7b82a8',callback:function(v){return fmt(v);}},grid:{color:'#1e2136'}}}}});
}else{
  document.getElementById('evoGlobal').parentElement.innerHTML='<div class="empty-msg">Pas encore assez de sessions.</div>';
}

var evoGrid=document.getElementById('evoGrid');
var hasEvo=false;
Object.keys(HISTORY).forEach(function(pid,idx){
  var p=HISTORY[pid];
  if(p.sessions.length<2) return;
  hasEvo=true;
  var col=PALETTE[idx%PALETTE.length];
  var card=document.createElement('div');card.className='evo-card';
  var cid='evo_'+pid;
  var sess=p.sessions.slice().sort(function(a,b){return sk(a.date).localeCompare(sk(b.date));});
  card.innerHTML='<div class="evo-name" style="color:'+col+'">'+p.name+'</div><canvas id="'+cid+'" height="160"></canvas>';
  evoGrid.appendChild(card);
  new Chart(document.getElementById(cid),{type:'line',
    data:{labels:sess.map(function(s){return s.date;}),datasets:[
      {label:'Meilleur',data:sess.map(function(s){return s.best;}),borderColor:col,backgroundColor:'transparent',pointRadius:5,borderWidth:2,tension:.3},
      {label:'Moyenne',data:sess.map(function(s){return s.mean;}),borderColor:col,backgroundColor:col+'22',pointRadius:3,borderWidth:1.5,tension:.3,borderDash:[4,3]}
    ]},
    options:{responsive:true,plugins:{legend:{labels:{color:'#7b82a8',font:{size:9}}}},
      scales:{x:{ticks:{color:'#7b82a8',font:{size:8}},grid:{color:'#1e2136'}},
        y:{ticks:{color:'#7b82a8',callback:function(v){return fmt(v);}},grid:{color:'#1e2136'}}}}});
});
if(!hasEvo) evoGrid.innerHTML='<div class="empty-msg">Pas encore assez de sessions.</div>';
</script>
</body>
</html>"""

    html = html.replace('NOW_PLACEHOLDER', now)
    html = html.replace('DATA_SESSIONS', sessions_js)
    html = html.replace('DATA_HISTORY',  history_js)
    html = html.replace('DATA_PALETTE',  palette_js)
    html = html.replace('DATA_FILES',    files_js)
    return html.encode('utf-8')

def main():
    print("="*60)
    print("  SpeedHive MRCP — Publication GitHub Pages")
    print("="*60)

    if not HISTORY_FILE.exists():
        print("\n  speedhive_history.json introuvable !")
        input("\nEntree..."); return

    # 1) Generation du nouveau dashboard (index, pilote_*.html, data.json)
    print("\n  Generation du dashboard...")
    try:
        import subprocess, sys
        result = subprocess.run([sys.executable, str(Path(__file__).parent / "generer_dashboard.py")],
                                capture_output=True, text=True, encoding="utf-8")
        if result.returncode != 0:
            print("  ERREUR generer_dashboard.py :")
            print(result.stdout)
            print(result.stderr)
            input("\nEntree..."); return
        print(result.stdout)
    except Exception as e:
        print("  ERREUR : " + str(e))
        input("\nEntree..."); return

    # 2) Liste des fichiers a publier
    new_index = Path(__file__).parent / "index_dashboard.html"
    data_json = REPORTS_DIR / "data.json"
    pilot_files = sorted(REPORTS_DIR.glob("pilote_*.html")) if REPORTS_DIR.exists() else []
    html_files = sorted(REPORTS_DIR.glob("session_mrcp_*.html")) if REPORTS_DIR.exists() else []

    print("  Rapports session : " + str(len(html_files)))
    print("  Pages pilotes    : " + str(len(pilot_files)))

    print("\n  Publication GitHub...\n")
    errors = 0
    pushed = 0

    # .nojekyll — INDISPENSABLE pour GitHub Pages
    print("  -> .nojekyll", end="", flush=True)
    try:
        push_file(".nojekyll", b"", "Add .nojekyll")
        print(" OK"); pushed += 1
    except Exception as e:
        print(" ERREUR : " + str(e))

    # Nouvel index (renomme en index.html cote serveur)
    print("  -> index.html", end="", flush=True)
    try:
        if new_index.exists():
            push_file("index.html", new_index.read_bytes(),
                      "Dashboard " + datetime.now().strftime('%d/%m/%Y %H:%M'))
            print(" OK"); pushed += 1
        else:
            print(" MANQUANT (index_dashboard.html non genere)"); errors += 1
    except Exception as e:
        print(" ERREUR : " + str(e)); errors += 1

    # data.json
    if data_json.exists():
        print("  -> data.json", end="", flush=True)
        try:
            push_file("data.json", data_json.read_bytes(), "Update data")
            print(" OK"); pushed += 1
        except Exception as e:
            print(" ERREUR : " + str(e)); errors += 1

    # Pages pilotes
    for pf in pilot_files:
        print("  -> " + pf.name, end="", flush=True)
        try:
            push_file(pf.name, pf.read_bytes(), "Pilote " + pf.stem)
            print(" OK"); pushed += 1
        except Exception as e:
            print(" ERREUR : " + str(e)); errors += 1

    # Rapports session
    for hf in html_files:
        print("  -> " + hf.name, end="", flush=True)
        try:
            push_file(hf.name, hf.read_bytes(), "Session " + hf.stem)
            print(" OK"); pushed += 1
        except Exception as e:
            print(" ERREUR : " + str(e)); errors += 1

    print("\n" + "="*60)
    print("  " + str(pushed) + " fichiers publies (" + str(errors) + " erreurs)")
    print("  https://" + GITHUB_USER + ".github.io/" + REPO_NAME + "/")
    print("="*60 + "\n")
    # Pause uniquement en mode interactif
    if sys.stdin.isatty():
        try:
            input("Entree pour fermer...")
        except EOFError:
            pass

if __name__ == "__main__":
    main()
