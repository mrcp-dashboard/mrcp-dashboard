from pathlib import Path

root = Path("/opt/mrcp-dashboard/docs")

html = root / "live_center.html"
js = root / "mrcp_v60_live.js"
css = root / "mrcp_v60_live.css"

# ----------------------------
# HTML
# ----------------------------

h = html.read_text(encoding="utf-8", errors="ignore")

if 'data-view="hall"' not in h:

    h = h.replace(
        '<button data-view="badges">Badges</button>',
        '''<button data-view="badges">Badges</button>
      <button data-view="hall">Hall of Fame</button>'''
    )

if 'id="hallList"' not in h:

    h = h.replace(
        '</main>',
        '''
      <section id="view-hall" class="view">
        <h2>🏛️ Hall of Fame MRCP</h2>

        <div id="hallList" class="hall-grid">

          <div class="hall-card">
            <h3>🏆 Records historiques</h3>
            <div id="hallRecords"></div>
          </div>

          <div class="hall-card">
            <h3>🔥 Plus gros rouleurs</h3>
            <div id="hallLaps"></div>
          </div>

          <div class="hall-card">
            <h3>⚡ Top MRCP Rating</h3>
            <div id="hallRating"></div>
          </div>

          <div class="hall-card">
            <h3>🎯 Plus réguliers</h3>
            <div id="hallConsistency"></div>
          </div>

        </div>
      </section>

    </main>'''
    )

html.write_text(h, encoding="utf-8")

# ----------------------------
# CSS
# ----------------------------

c = css.read_text(encoding="utf-8", errors="ignore")

if ".hall-grid" not in c:

    c += r'''

.hall-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(320px,1fr));
  gap:22px;
}

.hall-card{
  background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.14);
  border-radius:24px;
  padding:22px;
}

.hall-card h3{
  margin-top:0;
  margin-bottom:18px;
  color:#ffe680;
}

.hall-entry{
  padding:12px 0;
  border-bottom:1px solid rgba(255,255,255,.08);
}

.hall-entry:last-child{
  border-bottom:none;
}

.hall-name{
  font-weight:bold;
  font-size:18px;
}

.hall-value{
  color:#b8c7ff;
  margin-top:4px;
}

'''

css.write_text(c, encoding="utf-8")

# ----------------------------
# JS
# ----------------------------

s = js.read_text(encoding="utf-8", errors="ignore")

if "function renderHallOfFame()" not in s:

    insert = r'''

function renderHallOfFame(){

  const pilots = computeRating();

  if(!pilots.length){
    return;
  }

  // --------------------
  // RECORDS
  // --------------------

  const bestLapPilot =
    [...pilots]
    .filter(p=>p.best)
    .sort((a,b)=>a.best-b.best)[0];

  document.getElementById("hallRecords").innerHTML = `
    <div class="hall-entry">
      <div class="hall-name">
        ${bestLapPilot?.name || "-"}
      </div>

      <div class="hall-value">
        ${fmtLap(bestLapPilot?.best)}
      </div>
    </div>
  `;

  // --------------------
  // LAPS
  // --------------------

  document.getElementById("hallLaps").innerHTML =
    [...pilots]
    .sort((a,b)=>b.laps-a.laps)
    .slice(0,5)
    .map(p=>`

      <div class="hall-entry">

        <div class="hall-name">
          ${p.name}
        </div>

        <div class="hall-value">
          ${p.laps} tours
        </div>

      </div>

    `).join("");

  // --------------------
  // RATING
  // --------------------

  document.getElementById("hallRating").innerHTML =
    [...pilots]
    .sort((a,b)=>b.rating-a.rating)
    .slice(0,5)
    .map(p=>`

      <div class="hall-entry">

        <div class="hall-name">
          ${p.name}
        </div>

        <div class="hall-value">
          ${p.rating} MRCP pts
        </div>

      </div>

    `).join("");

  // --------------------
  // CONSISTENCY
  // --------------------

  document.getElementById("hallConsistency").innerHTML =
    [...pilots]
    .filter(p=>p.sessions >= 5)
    .sort((a,b)=>a.best-b.best)
    .slice(0,5)
    .map(p=>`

      <div class="hall-entry">

        <div class="hall-name">
          ${p.name}
        </div>

        <div class="hall-value">
          ${fmtLap(p.best)}
        </div>

      </div>

    `).join("");
}

'''

    s = s.replace(
        "function detectRecord(){",
        insert + "\nfunction detectRecord(){"
    )

    s = s.replace(
        "renderBadges();",
        "renderBadges();\n    renderHallOfFame();"
    )

js.write_text(s, encoding="utf-8")

print("OK V6.4 Hall of Fame installé")
