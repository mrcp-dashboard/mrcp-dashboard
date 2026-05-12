(function () {

  async function loadPilotOfDay() {

    try {

      const response = await fetch("data_v2.json?v=" + Date.now());
      const data = await response.json();

      const activities = data.activities || [];

      const pilots = {};

      activities.forEach(activity => {

        (activity.participants || []).forEach(p => {

          const id =
            p.id ||
            p.pilot_id ||
            p.transponder ||
            p.name;

          if (!id) return;

          if (!pilots[id]) {

            pilots[id] = {
              id,
              name:
                p.name ||
                p.driver_name ||
                p.transponder ||
                "Pilote",
              laps:[]
            };
          }

          const laps =
            p.laps ||
            p.lap_times ||
            p.times ||
            [];

          laps.forEach(l => {

            let v = null;

            if (typeof l === "number")
              v = l;

            if (typeof l === "string")
              v = parseFloat(
                l.replace(",", ".").replace("s", "")
              );

            if (
              v &&
              v > 5 &&
              v < 180
            ) {
              pilots[id].laps.push(v);
            }

          });

        });

      });

      const pilotsArray =
        Object.values(pilots)
          .filter(p => p.laps.length);

      if (!pilotsArray.length)
        return;

      pilotsArray.forEach(p => {

        p.bestLap = Math.min(...p.laps);

        const avg =
          p.laps.reduce((a,b)=>a+b,0) /
          p.laps.length;

        const variance =
          p.laps.reduce((s,v)=>
            s + Math.pow(v-avg,2)
          ,0) / p.laps.length;

        const regularity =
          Math.max(0,100-Math.sqrt(variance)*10);

        p.score =
          (100 - p.bestLap) +
          regularity +
          (p.laps.length / 5);

      });

      pilotsArray.sort((a,b)=>b.score-a.score);

      const pilot = pilotsArray[0];

      const widget = document.createElement("section");

      widget.innerHTML = `
        <div class="v54-widget">

          <div class="v54-badge">
            🏆 PILOTE DU JOUR
          </div>

          <h2>${pilot.name}</h2>

          <div class="v54-grid">

            <div>
              <span>Meilleur tour</span>
              <strong>${pilot.bestLap.toFixed(3)} s</strong>
            </div>

            <div>
              <span>Total tours</span>
              <strong>${pilot.laps.length}</strong>
            </div>

          </div>

          <a
            class="v54-profile-btn"
            href="pilot.html?id=${encodeURIComponent(pilot.id)}"
          >
            👤 Voir profil pilote
          </a>

        </div>
      `;

      const app =
        document.querySelector("#app");

      if (app)
        app.prepend(widget);

    } catch(e) {

      console.error(
        "Erreur widget V5.4",
        e
      );

    }

  }

  const style =
    document.createElement("style");

  style.innerHTML = `

    .v54-widget{
      background:linear-gradient(
        135deg,
        #111827,
        #1e293b
      );
      border-radius:24px;
      padding:24px;
      margin-bottom:20px;
      color:white;
      border:1px solid rgba(255,255,255,.08);
    }

    .v54-badge{
      display:inline-block;
      background:linear-gradient(
        90deg,
        #facc15,
        #fb923c
      );
      color:#111827;
      padding:8px 14px;
      border-radius:999px;
      font-weight:900;
      margin-bottom:14px;
    }

    .v54-widget h2{
      font-size:32px;
      margin-bottom:16px;
    }

    .v54-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:12px;
      margin-bottom:20px;
    }

    .v54-grid div{
      background:rgba(255,255,255,.06);
      border-radius:16px;
      padding:14px;
    }

    .v54-grid span{
      display:block;
      opacity:.7;
      margin-bottom:6px;
      font-size:13px;
    }

    .v54-grid strong{
      font-size:22px;
    }

    .v54-profile-btn{
      display:inline-block;
      background:white;
      color:#111827;
      text-decoration:none;
      padding:12px 18px;
      border-radius:999px;
      font-weight:900;
    }

  `;

  document.head.appendChild(style);

  window.addEventListener(
    "load",
    loadPilotOfDay
  );

})();
