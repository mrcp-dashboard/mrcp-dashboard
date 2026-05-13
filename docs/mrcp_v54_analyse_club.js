(function () {

  if (window.MRCP_V54_ANALYSE_CLUB_LOCK) return;
  window.MRCP_V54_ANALYSE_CLUB_LOCK = true;

  function toSeconds(l) {
    if (typeof l === "number") return l;

    if (typeof l === "string") {
      var v = parseFloat(l.replace(",", ".").replace("s", "").trim());
      return isNaN(v) ? null : v;
    }

    if (typeof l === "object" && l !== null) {
      return toSeconds(l.time || l.lap_time || l.seconds || l.value);
    }

    return null;
  }

  function avg(arr) {
    return arr.reduce(function(a,b){ return a + b; }, 0) / arr.length;
  }

  function std(arr) {
    if (arr.length < 2) return 999;
    var a = avg(arr);
    return Math.sqrt(arr.reduce(function(s,v){
      return s + Math.pow(v - a, 2);
    }, 0) / arr.length);
  }

  function cleanOldBlocks() {
    document.querySelectorAll("#mrcp-v54-analyse-club").forEach(function(el){
      el.remove();
    });

    document.querySelectorAll(".v54-analysis-box").forEach(function(el){
      var parent = el.closest("section");
      if (parent) parent.remove();
      else el.remove();
    });
  }

  async function buildAnalyseClub() {

    cleanOldBlocks();

    var app = document.getElementById("app");
    if (!app) return;

    var response = await fetch("data_v2.json?v=" + Date.now());
    var data = await response.json();

    var pilots = {};

    (data.activities || []).forEach(function(activity) {

      (activity.participants || []).forEach(function(p) {

        var id = String(
          p.id ||
          p.pilot_id ||
          p.driver_id ||
          p.transponder ||
          p.transponder_id ||
          p.name ||
          ""
        );

        if (!id) return;

        var name =
          p.pilot_name ||
          p.driver_name ||
          p.driver ||
          p.nom ||
          p.name ||
          p.transponder ||
          "Pilote inconnu";

        if (!pilots[id]) {
          pilots[id] = {
            id: id,
            name: name,
            laps: [],
            sessions: 0,
            bests: []
          };
        }

        var raw = p.laps || p.lap_times || p.times || [];
        var laps = [];

        raw.forEach(function(l) {
          var sec = toSeconds(l);
          if (sec && sec > 5 && sec < 180) laps.push(sec);
        });

        if (laps.length) {
          pilots[id].laps = pilots[id].laps.concat(laps);
          pilots[id].sessions += 1;
          pilots[id].bests.push(Math.min.apply(null, laps));
        }

      });

    });

    var list = Object.values(pilots).filter(function(p){
      return p.laps.length >= 5;
    });

    if (!list.length) return;

    list.forEach(function(p) {
      p.totalLaps = p.laps.length;
      p.bestLap = Math.min.apply(null, p.laps);
      p.averageLap = avg(p.laps);
      p.std = std(p.laps);
      p.regularity = Math.max(0, 100 - p.std * 10);

      if (p.bests.length >= 2) {
        p.progression = p.bests[0] - p.bests[p.bests.length - 1];
      } else {
        p.progression = 0;
      }
    });

    var mostRegular = list.slice().sort(function(a,b){
      return b.regularity - a.regularity;
    })[0];

    var mostActive = list.slice().sort(function(a,b){
      return b.totalLaps - a.totalLaps;
    })[0];

    var bestProgress = list.slice().sort(function(a,b){
      return b.progression - a.progression;
    })[0];

    var section = document.createElement("section");
    section.id = "mrcp-v54-analyse-club";

    section.innerHTML =
      '<div class="v54-analysis-box">' +

        '<div class="v54-analysis-title">' +
          '<span>V5.4 ANALYSE CLUB</span>' +
          '<h2>Intelligence pilotes</h2>' +
        '</div>' +

        '<div class="v54-analysis-grid">' +

          '<div class="v54-analysis-card">' +
            '<div class="v54-icon">REG</div>' +
            '<span>Pilote le plus regulier</span>' +
            '<strong>' + mostRegular.name + '</strong>' +
            '<small>Regularite : ' + mostRegular.regularity.toFixed(0) + ' / 100</small>' +
            '<a href="pilot.html?id=' + encodeURIComponent(mostRegular.id) + '">Profil</a>' +
          '</div>' +

          '<div class="v54-analysis-card">' +
            '<div class="v54-icon">ACT</div>' +
            '<span>Pilote le plus actif</span>' +
            '<strong>' + mostActive.name + '</strong>' +
            '<small>' + mostActive.totalLaps + ' tours enregistres</small>' +
            '<a href="pilot.html?id=' + encodeURIComponent(mostActive.id) + '">Profil</a>' +
          '</div>' +

          '<div class="v54-analysis-card">' +
            '<div class="v54-icon">PROG</div>' +
            '<span>Meilleure progression</span>' +
            '<strong>' + bestProgress.name + '</strong>' +
            '<small>Gain estime : ' + bestProgress.progression.toFixed(3) + ' s</small>' +
            '<a href="pilot.html?id=' + encodeURIComponent(bestProgress.id) + '">Profil</a>' +
          '</div>' +

        '</div>' +

      '</div>';

    var pilotDay = document.getElementById("mrcp-v54-widget");

    if (pilotDay) {
      pilotDay.insertAdjacentElement("afterend", section);
    } else {
      app.prepend(section);
    }
  }

  function injectStyle() {
    if (document.getElementById("mrcp-v54-analyse-style")) return;

    var style = document.createElement("style");
    style.id = "mrcp-v54-analyse-style";

    style.innerHTML =
      '.v54-analysis-box {' +
        'background: linear-gradient(135deg, #020617, #172554);' +
        'color: white;' +
        'border-radius: 24px;' +
        'padding: 24px;' +
        'margin: 0 0 22px 0;' +
        'border: 1px solid rgba(255,255,255,.12);' +
        'box-shadow: 0 14px 34px rgba(0,0,0,.25);' +
      '}' +

      '.v54-analysis-title span {' +
        'display: inline-block;' +
        'background: linear-gradient(90deg,#38bdf8,#818cf8);' +
        'color: #020617;' +
        'padding: 8px 14px;' +
        'border-radius: 999px;' +
        'font-weight: 900;' +
        'margin-bottom: 12px;' +
      '}' +

      '.v54-analysis-title h2 {' +
        'font-size: 30px;' +
        'margin: 0 0 18px 0;' +
      '}' +

      '.v54-analysis-grid {' +
        'display: grid;' +
        'grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));' +
        'gap: 14px;' +
      '}' +

      '.v54-analysis-card {' +
        'background: rgba(255,255,255,.08);' +
        'border-radius: 18px;' +
        'padding: 18px;' +
        'border: 1px solid rgba(255,255,255,.08);' +
      '}' +

      '.v54-icon {' +
        'display:inline-block;' +
        'font-size: 13px;' +
        'font-weight: 900;' +
        'background: rgba(255,255,255,.12);' +
        'padding: 6px 10px;' +
        'border-radius: 999px;' +
        'margin-bottom: 10px;' +
      '}' +

      '.v54-analysis-card span {' +
        'display: block;' +
        'opacity: .72;' +
        'font-size: 13px;' +
        'margin-bottom: 8px;' +
      '}' +

      '.v54-analysis-card strong {' +
        'display: block;' +
        'font-size: 22px;' +
        'margin-bottom: 8px;' +
      '}' +

      '.v54-analysis-card small {' +
        'display: block;' +
        'opacity: .82;' +
        'margin-bottom: 14px;' +
      '}' +

      '.v54-analysis-card a {' +
        'display: inline-block;' +
        'background: white;' +
        'color: #111827;' +
        'text-decoration: none;' +
        'padding: 9px 14px;' +
        'border-radius: 999px;' +
        'font-weight: 900;' +
      '}';

    document.head.appendChild(style);
  }

  function startAnalyse() {
    injectStyle();
    setTimeout(buildAnalyseClub, 2200);
  }

  window.addEventListener("load", startAnalyse);
  window.addEventListener("hashchange", startAnalyse);

})();
