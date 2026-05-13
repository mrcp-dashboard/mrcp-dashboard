from pathlib import Path

root = Path("/opt/mrcp-dashboard/docs")

html = root / "live_center.html"
js = root / "mrcp_v60_live.js"
css = root / "mrcp_v60_live.css"

# ---------------------------------
# HTML
# ---------------------------------

html_content = html.read_text(encoding="utf-8")

if 'data-view="badges"' not in html_content:

    html_content = html_content.replace(
        '<button data-view="rating">MRCP Rating</button>',
        '''<button data-view="rating">MRCP Rating</button>
      <button data-view="badges">Badges</button>'''
    )

    html_content = html_content.replace(
        '</section>\n    </main>',
        '''
      </section>

      <section id="view-badges" class="view">
        <h2>🏅 Badges & Achievements</h2>
        <div id="badgesList" class="badges-list"></div>
      </section>

    </main>'''
    )

    html.write_text(html_content, encoding="utf-8")

# ---------------------------------
# CSS
# ---------------------------------

css_extra = r'''

.badges-list{
  display:flex;
  flex-direction:column;
  gap:18px;
}

.badge-card{
  background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.12);
  border-radius:22px;
  padding:20px;
}

.badge-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:18px;
}

.badge-name{
  font-size:24px;
  font-weight:bold;
}

.badge-rating{
  color:#ffe680;
  font-size:22px;
  font-weight:bold;
}

.badges-row{
  display:flex;
  flex-wrap:wrap;
  gap:12px;
}

.badge-pill{
  padding:10px 16px;
  border-radius:999px;
  background:linear-gradient(135deg,#3557ff,#6d8cff);
  color:white;
  font-weight:bold;
  font-size:15px;
  box-shadow:0 4px 16px rgba(0,0,0,.2);
}

.badge-gold{
  background:linear-gradient(135deg,#ffcc33,#ff9900);
}

.badge-red{
  background:linear-gradient(135deg,#ff4d4d,#b30000);
}

.badge-green{
  background:linear-gradient(135deg,#00cc88,#007755);
}

.badge-purple{
  background:linear-gradient(135deg,#9b59ff,#5e17eb);
}

'''

css_content = css.read_text(encoding="utf-8")

if ".badges-list" not in css_content:
    css.write_text(css_content + css_extra, encoding="utf-8")

# ---------------------------------
# JS
# ---------------------------------

js_content = js.read_text(encoding="utf-8")

if "function computeBadges()" not in js_content:

    insert_js = r'''

function computeBadges(){

  const ranking = computeRating();

  return ranking.map((p,index)=>{

    const badges = [];

    if(index === 0){
      badges.push({
        text:"👑 King Club",
        class:"badge-gold"
      });
    }

    if(p.laps >= 5000){
      badges.push({
        text:"🏁 Endurance",
        class:"badge-red"
      });
    }

    if(p.laps >= 1000){
      badges.push({
        text:"🔥 Rouleur fou",
        class:"badge-purple"
      });
    }

    if(p.laps >= 200){
      badges.push({
        text:"🚀 Très actif",
        class:"badge-green"
      });
    }

    if(p.sessions >= 10){
      badges.push({
        text:"🎯 Régulier",
        class:"badge-pill"
      });
    }

    if(index <= 2){
      badges.push({
        text:"⚡ Top 3 MRCP",
        class:"badge-gold"
      });
    }

    if(p.best && p.best < 35){
      badges.push({
        text:"⚡ Speed Master",
        class:"badge-red"
      });
    }

    return {
      ...p,
      badges
    };

  });

}

function renderBadges(){

  const pilots =
    computeBadges().slice(0,50);

  const el =
    document.getElementById("badgesList");

  if(!el) return;

  el.innerHTML =
    pilots.map(p=>`

    <div class="badge-card">

      <div class="badge-header">

        <div class="badge-name">
          ${p.name}
        </div>

        <div class="badge-rating">
          ${p.rating} pts
        </div>

      </div>

      <div class="badges-row">

        ${
          p.badges.map(b=>`
            <div class="badge-pill ${b.class}">
              ${b.text}
            </div>
          `).join("")
        }

      </div>

    </div>

  `).join("")

  || "<div class='item'>Aucun badge</div>";
}

'''

    js_content = js_content.replace(
        "function detectRecord(){",
        insert_js + "\nfunction detectRecord(){"
    )

    js_content = js_content.replace(
        "renderRating();",
        "renderRating();\n    renderBadges();"
    )

    js.write_text(js_content, encoding="utf-8")

print("OK V6.3 Badges installé")
