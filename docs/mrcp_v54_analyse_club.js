(function () {

  if (window.MRCP_V54_ANALYSE_CLUB_LOADED) return;
  window.MRCP_V54_ANALYSE_CLUB_LOADED = true;

  function toSeconds(l) {
    if (typeof l === "number") return l;

    if (typeof l === "string") {
      const v = parseFloat(l.replace(",", ".").replace("s", "").trim());
      return isNaN(v) ? null : v;
    }

    if (typeof l === "object" && l !== null) {
      return toSeconds(l.time || l.lap_time || l.seconds || l.value);
    }

    return null;
  }

  function isBadName(name) {
    if (!name) return true;
    const s = String(name).trim();
    return !s || /^[0-9]+$/.test(s) || s.length < 2;
  }

  function avg(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function std(arr) {
    if (arr.length < 2) return 999;
    const a = avg(arr);
    return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - a, 2), 0) / arr.length);
  }

  function readLocalNameMap() {
    const map = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);

      try {
        const parsed = JSON.parse(value);

        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            if (!item || typeof item !== "object") return;

            const id =
              item.id ||
              item.pilot_id ||
              item.transponder ||
              item.transponder_id ||
              item.chip ||
              item.puce;

            const name =
              item.name ||
              item.pilot_name ||
              item.driver_name ||
              item.driver ||
              item.nom;

            if (id && name && !isBadName(name)) {
              map[String(id)] = String(name);
            }
          });
        }

        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.entries(parsed).forEach(([k, v]) => {
            if (typeof v === "string" && !isBadName(v)) {
              map[String(k)] = v;
            }

            if (v && typeof v === "object") {
              const id =
                v.id ||
                v.pilot_id ||
                v.transponder ||
                v.transponder_id ||
                v.chip ||
                v.puce ||
                k;

              const name =
                v.name ||
                v.pilot_name ||
                v.driver_name ||
                v.driver ||
                v.nom;

              if (id && name && !isBadName(name)) {
                map[String(id)] = String(name);
              }
            }
          });
        }

      } catch(e) {
        if (key && value && !isBadName(value)) {
          map[String(key)] = value;
        }
      }
    }

    return map;
  }

  function buildDataNameMap(data) {
    const map = {};

    function add(id, name) {
      if (id && name && !isBadName(name)) {
        map[String(id)] = String(name);
      }
    }

    const sources = [
      data.pilots,
      data.drivers,
      data.pilot_names,
      data.driver_names,
      data.transponders,
      data.names
    ];

    sources.forEach(src => {
      if (!src) return;

      if (Array.isArray(src)) {
        src.forEach(p => {
          if (!p || typeof p !== "object") return;

          const id =
            p.id ||
            p.pilot_id ||
            p.driver_id ||
            p.transponder ||
            p.transponder_id ||
            p.chip ||
            p.puce;

          const name =
            p.name ||
            p.pilot_name ||
            p.driver_name ||
            p.driver ||
            p.nom;

          add(id, name);
        });
      }

      if (typeof src === "object" && !Array.isArray(src)) {
        Object.entries(src).forEach(([k, v]) => {
          if (typeof v === "string") {
            add(k, v);
          } else if (v && typeof v === "object") {
            add(
              v.id || v.transponder || v.transponder_id || k,
              v.name || v.pilot_name || v.driver_name || v.nom
            );
          }
        });
      }
    });

    (data.activities || []).forEach(activity => {
      (activity.participants || []).forEach(p => {
        const id =
          p.id ||
          p.pilot_id ||
          p.driver_id ||
          p.transponder ||
          p.transponder_id;

        const name =
          p.name ||
          p.pilot_name ||
          p.driver_name ||
          p.driver ||
          p.nom;

        add(id, name);
      });
    });

    return map;
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

  function getPilotName(p, nameMap) {
    const ids = [
      p.id,
      p.pilot_id,
      p.driver_id,
      p.transponder,
      p.transponder_id,
      p.name
    ].filter(Boolean).map(String);

    for (const id of ids) {
      if (nameMap[id] && !isBadName(nameMap[id])) return nameMap[id];
    }

    const direct =
      p.pilot_name ||
      p.driver_name ||
      p.driver ||
      p.nom ||
      p.name;

    if (!isBadName(direct)) return direct;

    return "Pilote inconnu";
  }

  async function buildAnalyseClub() {

    document.querySelectorAll("#mrcp-v54-analyse-club").forEach((el, index) => {
      if (index > 0) el.remove();
    });

    if (document.getElementById("mrcp-v54-analyse-club")) return;

    const app = document.getElementById("app");
    if (!app) return;

    const response = await fetch("data_v2.json?v=" + Date.now());
    const data = await response.json();

    const nameMap = {
      ...buildDataNameMap(data),
      ...readLocalNameMap()
    };

    const pilots = {};

    (data.activities || []).forEach(activity => {
      (activity.participants || []).forEach(p => {

        const id = getPilotId(p);
        if (!id) return;

        if (!pilots[id]) {
          pilots[id] = {
            id,
            name: getPilotName(p, nameMap),
            laps: [],
            sessions: 0,
            bests: []
          };
        }

        const raw = p.laps || p.lap_times || p.times || [];
        const laps = [];

        raw.forEach(l => {
          const sec = toSeconds(l);
          if (sec && sec > 5 && sec < 180) laps.push(sec);
        });

        if (laps.length) {
          pilots[id].laps.push(...laps);
          pilots[id].sessions += 1;
          pilots[id].bests.push(Math.min(...laps));
        }
      });
    });

    const list = Object.values(pilots).filter(p => p.laps.length >= 5);
    if (!list.length) return;

    list.forEach(p => {
      p.totalLaps = p.laps.length;
      p.bestLap = Math.min(...p.laps);
      p.averageLap = avg(p.laps);
      p.std = std(p.laps);
      p.regularity = Math.max(0, 100 - p.std * 10);

      if (p.bests.length >= 2) {
        p.progression = p.bests[0] - p.bests[p.bests.length - 1];
      } else {
        p.progression = 0;
      }
    });

    const mostRegular = [...list].sort((a, b) => b.regularity - a.regularity)[0];
    const mostActive = [...list].sort((a, b) => b.totalLaps - a.totalLaps)[0];
    const bestProgress = [...list].sort((a, b) => b.progression - a.progression)[0];

    const section = document.createElement("section");
    section.id = "mrcp-v54-analyse-club";

    section.innerHTML = `
      <div class="v54-analysis-box">

        <div class="v54-analysis-title">
          <span>?? V5.4 ANALYSE CLUB</span>
          <h2>Intelligence pilotes</h2>
        </div>

        <div class="v54-analysis-grid">

          <div class="v54-analysis-card">
            <div class="v54-icon">??</div>
            <span>Pilote le plus régulier</span>
            <strong>${mostRegular.name}</strong>
            <small>Régularité : ${mostRegular.regularity.toFixed(0)} / 100</small>
            <a href="pilot.html?id=${encodeURIComponent(mostRegular.id)}">?? Profil</a>
          </div>

          <div class="v54-analysis-card">
            <div class="v54-icon">??</div>
            <span>Pilote le plus actif</span>
            <strong>${mostActive.name}</strong>
            <small>${mostActive.totalLaps} tours enregistrés</small>
            <a href="pilot.html?id=${encodeURIComponent(mostActive.id)}">?? Profil</a>
          </div>

          <div class="v54-analysis-card">
            <div class="v54-icon">??</div>
            <span>Meilleure progression</span>
            <strong>${bestProgress.name}</strong>
            <small>Gain estimé : ${bestProgress.progression.toFixed(3)} s</small>
            <a href="pilot.html?id=${encodeURIComponent(bestProgress.id)}">?? Profil</a>
          </div>

        </div>

      </div>
    `;

    const pilotDay = document.getElementById("mrcp-v54-widget");

    if (pilotDay) {
      pilotDay.insertAdjacentElement("afterend", section);
    } else {
      app.prepend(section);
    }
  }

  function injectStyle() {
    if (document.getElementById("mrcp-v54-analyse-style")) return;

    const style = document.createElement("style");
    style.id = "mrcp-v54-analyse-style";

    style.innerHTML = `
      .v54-analysis-box {
        background: linear-gradient(135deg, #020617, #172554);
        color: white;
        border-radius: 24px;
        padding: 24px;
        margin: 0 0 22px 0;
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 14px 34px rgba(0,0,0,.25);
      }

      .v54-analysis-title span {
        display: inline-block;
        background: linear-gradient(90deg,#38bdf8,#818cf8);
        color: #020617;
        padding: 8px 14px;
        border-radius: 999px;
        font-weight: 900;
        margin-bottom: 12px;
      }

      .v54-analysis-title h2 {
        font-size: 30px;
        margin: 0 0 18px 0;
      }

      .v54-analysis-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 14px;
      }

      .v54-analysis-card {
        background: rgba(255,255,255,.08);
        border-radius: 18px;
        padding: 18px;
        border: 1px solid rgba(255,255,255,.08);
      }

      .v54-icon {
        font-size: 28px;
        margin-bottom: 8px;
      }

      .v54-analysis-card span {
        display: block;
        opacity: .72;
        font-size: 13px;
        margin-bottom: 8px;
      }

      .v54-analysis-card strong {
        display: block;
        font-size: 22px;
        margin-bottom: 8px;
      }

      .v54-analysis-card small {
        display: block;
        opacity: .82;
        margin-bottom: 14px;
      }

      .v54-analysis-card a {
        display: inline-block;
        background: white;
        color: #111827;
        text-decoration: none;
        padding: 9px 14px;
        border-radius: 999px;
        font-weight: 900;
      }
    `;

    document.head.appendChild(style);
  }

  function startAnalyse() {
    injectStyle();
    setTimeout(buildAnalyseClub, 2000);
  }

  window.addEventListener("load", startAnalyse);
  window.addEventListener("hashchange", startAnalyse);

})();