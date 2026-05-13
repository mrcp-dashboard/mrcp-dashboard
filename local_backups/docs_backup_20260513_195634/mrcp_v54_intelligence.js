(function () {

  if (window.MRCP_V54_INTELLIGENCE_PAGE) return;
  window.MRCP_V54_INTELLIGENCE_PAGE = true;

  var DATA_FILE = "data_v2.json";

  function toSeconds(v) {
    if (typeof v === "number") return v;

    if (typeof v === "string") {
      var n = parseFloat(v.replace(",", ".").replace("s", "").trim());
      return isNaN(n) ? null : n;
    }

    if (typeof v === "object" && v !== null) {
      return toSeconds(v.time || v.lap_time || v.seconds || v.value);
    }

    return null;
  }

  function avg(arr) {
    return arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
  }

  function std(arr) {
    if (arr.length < 2) return 999;
    var a = avg(arr);
    return Math.sqrt(arr.reduce(function(s, v) {
      return s + Math.pow(v - a, 2);
    }, 0) / arr.length);
  }

  function getPilotId(p) {
    return String(
      p.id ||
      p.pilot_id ||
      p.driver_id ||
      p.transponder ||
      p.transponder_id ||
      p.name ||
      ""
    );
  }

  function getPilotName(p) {
    return (
      p.pilot_name ||
      p.driver_name ||
      p.driver ||
      p.nom ||
      p.name ||
      p.transponder ||
      "Pilote inconnu"
    );
  }

  function extractLaps(p) {
    var raw = p.laps || p.lap_times || p.times || p.results || [];
    var laps = [];

    if (!Array.isArray(raw)) return laps;

    raw.forEach(function(l) {
      var sec = toSeconds(l);
      if (sec && sec > 5 && sec < 180) laps.push(sec);
    });

    return laps;
  }

  function getActivityLapsCount(activity) {
    var direct =
      activity.laps_count ||
      activity.lap_count ||
      activity.total_laps ||
      activity.lapsCount;

    if (direct && !isNaN(Number(direct))) {
      return Number(direct);
    }

    var total = 0;

    (activity.participants || []).forEach(function(p) {
      total += extractLaps(p).length;
    });

    return total;
  }

  function getTrackFromLap(sec) {
    if (sec && sec < 30) return "TT1/10";
    return "TT1/8";
  }

  function collectPilots(data) {
    var pilots = {};

    (data.activities || []).forEach(function(activity) {
      (activity.participants || []).forEach(function(p) {
        var id = getPilotId(p);
        if (!id) return;

        var laps = extractLaps(p);
        if (!laps.length) return;

        if (!pilots[id]) {
          pilots[id] = {
            id: id,
            name: getPilotName(p),
            laps: [],
            sessions: 0,
            bests: []
          };
        }

        pilots[id].laps = pilots[id].laps.concat(laps);
        pilots[id].sessions += 1;
        pilots[id].bests.push(Math.min.apply(null, laps));
      });
    });

    var list = Object.values(pilots).filter(function(p) {
      return p.laps.length >= 5;
    });

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

      p.score =
        (100 - p.bestLap) +
        p.regularity +
        p.totalLaps / 5;
    });

    return list;
  }

  function renderPilotDay(pilots) {
    var pilot = pilots.slice().sort(function(a, b) {
      return b.score - a.score;
    })[0];

    if (!pilot) return "";

    return '' +
      '<section class="intel-card intel-gold">' +
        '<div class="intel-label">V5.4 - PILOTE DU JOUR</div>' +
        '<h2>' + pilot.name + '</h2>' +
        '<div class="intel-grid">' +
          '<div><span>Meilleur tour</span><strong>' + pilot.bestLap.toFixed(3) + ' s</strong></div>' +
          '<div><span>Total tours</span><strong>' + pilot.totalLaps + '</strong></div>' +
          '<div><span>Regularite</span><strong>' + pilot.regularity.toFixed(0) + ' / 100</strong></div>' +
          '<div><span>Score</span><strong>' + pilot.score.toFixed(0) + '</strong></div>' +
        '</div>' +
        '<a class="intel-btn" href="pilot.html?id=' + encodeURIComponent(pilot.id) + '">Profil pilote</a>' +
      '</section>';
  }

  function renderAnalyse(pilots) {
    if (!pilots.length) return "";

    var mostRegular = pilots.slice().sort(function(a, b) {
      return b.regularity - a.regularity;
    })[0];

    var mostActive = pilots.slice().sort(function(a, b) {
      return b.totalLaps - a.totalLaps;
    })[0];

    var bestProgress = pilots.slice().sort(function(a, b) {
      return b.progression - a.progression;
    })[0];

    return '' +
      '<section class="intel-card intel-blue">' +
        '<div class="intel-label">V5.4 - ANALYSE CLUB</div>' +
        '<h2>Intelligence pilotes</h2>' +
        '<div class="intel-grid">' +

          '<div>' +
            '<span>Pilote le plus regulier</span>' +
            '<strong>' + mostRegular.name + '</strong>' +
            '<small>Regularite : ' + mostRegular.regularity.toFixed(0) + ' / 100</small>' +
            '<a class="intel-small-btn" href="pilot.html?id=' + encodeURIComponent(mostRegular.id) + '">Profil</a>' +
          '</div>' +

          '<div>' +
            '<span>Pilote le plus actif</span>' +
            '<strong>' + mostActive.name + '</strong>' +
            '<small>' + mostActive.totalLaps + ' tours</small>' +
            '<a class="intel-small-btn" href="pilot.html?id=' + encodeURIComponent(mostActive.id) + '">Profil</a>' +
          '</div>' +

          '<div>' +
            '<span>Meilleure progression</span>' +
            '<strong>' + bestProgress.name + '</strong>' +
            '<small>Gain estime : ' + bestProgress.progression.toFixed(3) + ' s</small>' +
            '<a class="intel-small-btn" href="pilot.html?id=' + encodeURIComponent(bestProgress.id) + '">Profil</a>' +
          '</div>' +

        '</div>' +
      '</section>';
  }

  function renderHeatmap(data) {
    var map = {};

    (data.activities || []).forEach(function(activity) {
      var date = activity.date || activity.date_fr || "Inconnue";

      if (!map[date]) {
        map[date] = {
          date: date,
          laps: 0,
          sessions: 0,
          tt10: 0,
          tt18: 0
        };
      }

      map[date].sessions += 1;

      var activityTotal = getActivityLapsCount(activity);
      map[date].laps += activityTotal;

      var countedTracks = false;

      (activity.participants || []).forEach(function(p) {
        extractLaps(p).forEach(function(sec) {
          countedTracks = true;
          if (getTrackFromLap(sec) === "TT1/10") map[date].tt10 += 1;
          else map[date].tt18 += 1;
        });
      });

      if (!countedTracks && activity.track_counts) {
        if (activity.track_counts["TT1/10"]) {
          map[date].tt10 += Number(activity.track_counts["TT1/10"]) || 0;
        }
        if (activity.track_counts["TT1/8"]) {
          map[date].tt18 += Number(activity.track_counts["TT1/8"]) || 0;
        }
      }
    });

    var days = Object.values(map)
      .sort(function(a, b) { return b.laps - a.laps; })
      .slice(0, 14);

    if (!days.length) return "";

    var max = Math.max.apply(null, days.map(function(d) { return d.laps; }));

    return '' +
      '<section class="intel-card intel-green">' +
        '<div class="intel-label">V5.4.3 - HEATMAP ACTIVITE</div>' +
        '<h2>Activite piste</h2>' +
        '<div class="heat-grid">' +
          days.map(function(day) {
            var opacity = Math.max(0.18, day.laps / max);

            return '' +
              '<div class="heat-cell" style="background:rgba(56,189,248,' + opacity + ')">' +
                '<strong>' + day.date + '</strong>' +
                '<small>' + day.laps + ' tours</small>' +
                '<small>' + day.sessions + ' sessions</small>' +
                '<div class="heat-track">' +
                  '<span>TT1/10 : ' + day.tt10 + '</span>' +
                  '<span>TT1/8 : ' + day.tt18 + '</span>' +
                '</div>' +
              '</div>';
          }).join("") +
        '</div>' +
      '</section>';
  }

  function injectMenuLink() {
    if (document.querySelector('a[href="#/intelligence"]')) return;

    var nav = document.querySelector(".side-nav");
    if (!nav) return;

    var link = document.createElement("a");
    link.href = "#/intelligence";
    link.className = "nav-link";
    link.innerHTML = '<span>IA</span> <span>Intelligence</span>';

    nav.appendChild(link);
  }

  function injectStyle() {
    if (document.getElementById("mrcp-intel-style")) return;

    var style = document.createElement("style");
    style.id = "mrcp-intel-style";

    style.innerHTML =
      '.intel-card{color:white;border-radius:24px;padding:24px;margin:0 0 22px 0;border:1px solid rgba(255,255,255,.12);box-shadow:0 14px 34px rgba(0,0,0,.25)}' +
      '.intel-gold{background:linear-gradient(135deg,#111827,#1e293b)}' +
      '.intel-blue{background:linear-gradient(135deg,#020617,#172554)}' +
      '.intel-green{background:linear-gradient(135deg,#071226,#0f172a)}' +
      '.intel-label{display:inline-block;background:linear-gradient(90deg,#38bdf8,#818cf8);color:#020617;padding:8px 14px;border-radius:999px;font-weight:900;margin-bottom:12px}' +
      '.intel-gold .intel-label{background:linear-gradient(90deg,#facc15,#fb923c)}' +
      '.intel-card h2{font-size:32px;margin:0 0 18px 0}' +
      '.intel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}' +
      '.intel-grid>div{background:rgba(255,255,255,.08);border-radius:18px;padding:18px;border:1px solid rgba(255,255,255,.08)}' +
      '.intel-grid span{display:block;opacity:.72;font-size:13px;margin-bottom:8px}' +
      '.intel-grid strong{display:block;font-size:22px;margin-bottom:8px}' +
      '.intel-grid small{display:block;opacity:.82;margin-bottom:14px}' +
      '.intel-btn,.intel-small-btn{display:inline-block;background:white;color:#111827;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:900;margin-top:14px}' +
      '.heat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}' +
      '.heat-cell{border-radius:18px;padding:18px;border:1px solid rgba(255,255,255,.08)}' +
      '.heat-cell strong{display:block;font-size:18px;margin-bottom:12px}' +
      '.heat-cell small{display:block;opacity:.88;margin-bottom:6px}' +
      '.heat-track{margin-top:12px;display:flex;flex-direction:column;gap:4px;font-size:13px;opacity:.8}';

    document.head.appendChild(style);
  }

  async function renderIntelligencePage() {
    if (location.hash !== "#/intelligence") return;

    var app = document.getElementById("app");
    if (!app) return;

    app.innerHTML =
      '<section class="card">' +
        '<h2>Chargement Intelligence...</h2>' +
      '</section>';

    var response = await fetch(DATA_FILE + "?v=" + Date.now());
    var data = await response.json();

    var pilots = collectPilots(data);

    app.innerHTML =
      renderPilotDay(pilots) +
      renderAnalyse(pilots) +
      renderHeatmap(data);
  }

  function start() {
    injectStyle();
    injectMenuLink();
    setTimeout(renderIntelligencePage, 500);
  }

  window.addEventListener("load", start);
  window.addEventListener("hashchange", function() {
    setTimeout(renderIntelligencePage, 300);
  });

})();
