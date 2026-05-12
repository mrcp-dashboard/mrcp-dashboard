(function () {

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

  async function buildV54Widget() {
    if (document.getElementById("mrcp-v54-widget")) {
    return;
  }
    const app = document.getElementById("app");
    if (!app) return;

    const response = await fetch("data_v2.json?v=" + Date.now());
    const data = await response.json();

    const pilots = {};

    (data.activities || []).forEach(activity => {
      (activity.participants || []).forEach(p => {
        const id = String(
          p.id ||
          p.pilot_id ||
          p.transponder ||
          p.transponder_id ||
          p.name ||
          ""
        );

        if (!id) return;

        if (!pilots[id]) {
          pilots[id] = {
            id,
            name: p.name || p.driver_name || p.transponder || "Pilote inconnu",
            laps: []
          };
        }

        const raw = p.laps || p.lap_times || p.times || [];

        raw.forEach(l => {
          const sec = toSeconds(l);
          if (sec && sec > 5 && sec < 180) {
            pilots[id].laps.push(sec);
          }
        });
      });
    });

    const list = Object.values(pilots).filter(p => p.laps.length);

    if (!list.length) {
      console.warn("V5.4 : aucun pilote trouvé");
      return;
    }

    list.forEach(p => {
      const best = Math.min(...p.laps);
      const avg = p.laps.reduce((a, b) => a + b, 0) / p.laps.length;
      const variance = p.laps.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / p.laps.length;
      const regularity = Math.max(0, 100 - Math.sqrt(variance) * 10);

      p.bestLap = best;
      p.score = regularity + p.laps.length / 5 + (100 - best);
    });

    list.sort((a, b) => b.score - a.score);

    const pilot = list[0];

    const section = document.createElement("section");
    section.id = "mrcp-v54-widget";
    section.innerHTML = `
      <div style="
        background:linear-gradient(135deg,#111827,#1e293b);
        color:white;
        border-radius:24px;
        padding:24px;
        margin:0 0 22px 0;
        border:1px solid rgba(255,255,255,.12);
        box-shadow:0 14px 34px rgba(0,0,0,.25);
      ">
        <div style="
          display:inline-block;
          background:linear-gradient(90deg,#facc15,#fb923c);
          color:#111827;
          padding:8px 14px;
          border-radius:999px;
          font-weight:900;
          margin-bottom:14px;
        ">
          ?? PILOTE DU JOUR
        </div>

        <h2 style="font-size:32px;margin:0 0 14px 0;">
          ${pilot.name}
        </h2>

        <div style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
          gap:12px;
          margin-bottom:18px;
        ">
          <div style="background:rgba(255,255,255,.08);padding:14px;border-radius:16px;">
            <span style="display:block;opacity:.7;margin-bottom:6px;">Meilleur tour</span>
            <strong style="font-size:22px;">${pilot.bestLap.toFixed(3)} s</strong>
          </div>

          <div style="background:rgba(255,255,255,.08);padding:14px;border-radius:16px;">
            <span style="display:block;opacity:.7;margin-bottom:6px;">Total tours</span>
            <strong style="font-size:22px;">${pilot.laps.length}</strong>
          </div>

          <div style="background:rgba(255,255,255,.08);padding:14px;border-radius:16px;">
            <span style="display:block;opacity:.7;margin-bottom:6px;">Score V5.4</span>
            <strong style="font-size:22px;">${pilot.score.toFixed(0)} pts</strong>
          </div>
        </div>

        <a href="pilot.html?id=${encodeURIComponent(pilot.id)}" style="
          display:inline-block;
          background:white;
          color:#111827;
          text-decoration:none;
          padding:12px 18px;
          border-radius:999px;
          font-weight:900;
        ">
          ?? Voir profil pilote
        </a>
      </div>
    `;

    app.prepend(section);

    console.log("V5.4 pilote du jour affiché :", pilot.name);
  }

  function startV54() {
    setTimeout(buildV54Widget, 1000);
    setTimeout(buildV54Widget, 2500);
    setTimeout(buildV54Widget, 5000);
  }

  window.addEventListener("load", startV54);
  window.addEventListener("hashchange", startV54);

})();