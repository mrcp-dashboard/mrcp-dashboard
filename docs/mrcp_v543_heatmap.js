(function () {

  if (window.MRCP_V543_HEATMAP_LOADED) return;
  window.MRCP_V543_HEATMAP_LOADED = true;

  function getTrack(activity, lap) {

    if (activity.track)
      return activity.track;

    const value =
      lap ||
      activity.best_lap ||
      0;

    if (value < 30)
      return "TT1/10";

    return "TT1/8";
  }

  async function buildHeatmap() {

    document
      .querySelectorAll("#mrcp-v543-heatmap")
      .forEach(el => el.remove());

    const app =
      document.getElementById("app");

    if (!app) return;

    const response =
      await fetch(
        "data_v2.json?v=" + Date.now()
      );

    const data =
      await response.json();

    const map = {};

    (data.activities || []).forEach(activity => {

      const date =
        activity.date ||
        activity.date_fr ||
        "Inconnue";

      if (!map[date]) {

        map[date] = {
          date,
          laps: 0,
          sessions: 0,
          tt10: 0,
          tt18: 0
        };
      }

      map[date].sessions += 1;

      (activity.participants || []).forEach(p => {

        const raw =
          p.laps ||
          p.lap_times ||
          p.times ||
          [];

        raw.forEach(l => {

          let sec = null;

          if (typeof l === "number")
            sec = l;

          if (typeof l === "string") {

            sec = parseFloat(
              l
                .replace(",", ".")
                .replace("s", "")
                .trim()
            );
          }

          if (
            sec &&
            sec > 5 &&
            sec < 180
          ) {

            map[date].laps += 1;

            const track =
              getTrack(activity, sec);

            if (track === "TT1/10")
              map[date].tt10 += 1;
            else
              map[date].tt18 += 1;
          }

        });

      });

    });

    const days =
      Object.values(map)
        .sort((a,b) =>
          b.laps - a.laps
        )
        .slice(0,14);

    if (!days.length)
      return;

    const maxLaps =
      Math.max(
        ...days.map(d => d.laps)
      );

    const section =
      document.createElement("section");

    section.id =
      "mrcp-v543-heatmap";

    section.innerHTML = `

      <div class="v543-box">

        <div class="v543-head">

          <span>
            HEATMAP ACTIVITE
          </span>

          <h2>
            Activite piste
          </h2>

        </div>

        <div class="v543-grid">

          ${days.map(day => {

            const intensity =
              Math.max(
                0.12,
                day.laps / maxLaps
              );

            return `

              <div
                class="v543-cell"
                style="
                  background:
                  rgba(
                    56,
                    189,
                    248,
                    ${intensity}
                  );
                "
              >

                <strong>
                  ${day.date}
                </strong>

                <small>
                  ${day.laps} tours
                </small>

                <small>
                  ${day.sessions} sessions
                </small>

                <div class="v543-tracks">

                  <span>
                    TT1/10 :
                    ${day.tt10}
                  </span>

                  <span>
                    TT1/8 :
                    ${day.tt18}
                  </span>

                </div>

              </div>

            `;

          }).join("")}

        </div>

      </div>

    `;

    const analyse =
      document.getElementById(
        "mrcp-v54-analyse-club"
      );

    if (analyse)
      analyse.insertAdjacentElement(
        "afterend",
        section
      );
    else
      app.prepend(section);

    console.log(
      "V5.4.3 heatmap affichee"
    );
  }

  function injectStyle() {

    if (
      document.getElementById(
        "mrcp-v543-style"
      )
    ) return;

    const style =
      document.createElement("style");

    style.id =
      "mrcp-v543-style";

    style.innerHTML = `

      .v543-box {

        background:
          linear-gradient(
            135deg,
            #071226,
            #0f172a
          );

        color:white;

        border-radius:24px;

        padding:24px;

        margin:0 0 22px 0;

        border:
          1px solid
          rgba(255,255,255,.08);

        box-shadow:
          0 14px 34px
          rgba(0,0,0,.25);

      }

      .v543-head span {

        display:inline-block;

        background:
          linear-gradient(
            90deg,
            #22c55e,
            #38bdf8
          );

        color:#061224;

        padding:8px 14px;

        border-radius:999px;

        font-weight:900;

        margin-bottom:12px;

      }

      .v543-head h2 {

        font-size:32px;

        margin:0 0 18px 0;

      }

      .v543-grid {

        display:grid;

        grid-template-columns:
          repeat(
            auto-fit,
            minmax(180px,1fr)
          );

        gap:14px;

      }

      .v543-cell {

        border-radius:18px;

        padding:18px;

        border:
          1px solid
          rgba(255,255,255,.08);

        backdrop-filter:blur(4px);

      }

      .v543-cell strong {

        display:block;

        font-size:18px;

        margin-bottom:12px;

      }

      .v543-cell small {

        display:block;

        opacity:.82;

        margin-bottom:6px;

      }

      .v543-tracks {

        margin-top:12px;

        display:flex;

        flex-direction:column;

        gap:4px;

        font-size:13px;

        opacity:.75;

      }

    `;

    document.head
      .appendChild(style);
  }

  function startHeatmap() {

    injectStyle();

    setTimeout(
      buildHeatmap,
      2600
    );
  }

  window.addEventListener(
    "load",
    startHeatmap
  );

  window.addEventListener(
    "hashchange",
    startHeatmap
  );

})();
