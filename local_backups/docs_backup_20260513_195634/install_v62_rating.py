from pathlib import Path

root = Path("/opt/mrcp-dashboard/docs")

html = root / "live_center.html"
js = root / "mrcp_v60_live.js"
css = root / "mrcp_v60_live.css"

# -------------------------
# AJOUT ONGLET HTML
# -------------------------

html_content = html.read_text(encoding="utf-8")

if 'data-view="rating"' not in html_content:

    html_content = html_content.replace(
        '<button data-view="pilots">Pilotes</button>',
        '''<button data-view="pilots">Pilotes</button>
      <button data-view="rating">MRCP Rating</button>'''
    )

    html_content = html_content.replace(
        '</section>\n    </main>',
        '''
      </section>

      <section id="view-rating" class="view">
        <h2>🏆 MRCP Rating</h2>
        <div id="ratingList" class="rating-list"></div>
      </section>

    </main>'''
    )

    html.write_text(html_content, encoding="utf-8")

# -------------------------
# AJOUT CSS
# -------------------------

css_extra = r'''

.rating-list{
  display:flex;
  flex-direction:column;
  gap:14px;
}

.rating-card{
  background:rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.12);
  border-radius:20px;
  padding:18px;
  display:grid;
  grid-template-columns:80px 1fr 120px 120px 120px 120px;
  align-items:center;
  gap:12px;
}

.rating-rank{
  font-size:34px;
  font-weight:bold;
}

.rating-name{
  font-size:22px;
  font-weight:bold;
}

.rating-score{
  font-size:28px;
  color:#ffe680;
  font-weight:bold;
}

.rating-small{
  color:#b8c7ff;
}

@media(max-width:900px){

  .rating-card{
    grid-template-columns:1fr;
  }

}
'''

css_content = css.read_text(encoding="utf-8")

if ".rating-list" not in css_content:
    css.write_text(css_content + css_extra, encoding="utf-8")

# -------------------------
# AJOUT JS
# -------------------------

js_content = js.read_text(encoding="utf-8")

if "function computeRating()" not in js_content:

    insert_code = r'''

function computeRating(){

  const pilots = getPilots();

  if(!pilots.length){
    return [];
  }

  let globalBest = null;

  pilots.forEach(p=>{
    if(p.best && (!globalBest || p.best < globalBest)){
      globalBest = p.best;
    }
  });

  return pilots.map(p=>{

    const bestScore =
      p.best && globalBest
      ? Math.max(
          0,
          400 - ((p.best - globalBest) * 100)
        )
      : 0;

    const activityScore =
      Math.min(250, p.laps * 0.4);

    const sessionScore =
      Math.min(150, p.sessions * 5);

    const regularityScore =
      p.best
      ? Math.max(
          0,
          200 - (p.best * 2)
        )
      : 0;

    const total =
      Math.round(
        bestScore +
        activityScore +
        sessionScore +
        regularityScore
      );

    return {
      ...p,
      rating:total
    };

  })
  .sort((a,b)=>b.rating-a.rating);
}

function renderRating(){

  const ranking =
    computeRating().slice(0,50);

  document.getElementById("ratingList").innerHTML =
    ranking.map((p,i)=>`

    <div class="rating-card">

      <div class="rating-rank">
        #${i+1}
      </div>

      <div>
        <div class="rating-name">
          ${p.name}
        </div>

        <div class="rating-small">
          ${p.sessions} sessions
        </div>
      </div>

      <div>
        <div class="rating-score">
          ${p.rating}
        </div>

        <div class="rating-small">
          MRCP pts
        </div>
      </div>

      <div>
        <strong>${p.laps}</strong><br>
        <span class="rating-small">tours</span>
      </div>

      <div>
        <strong>${fmtLap(p.best)}</strong><br>
        <span class="rating-small">best</span>
      </div>

      <div>
        <span class="rating-small">
          activité club
        </span>
      </div>

    </div>

  `).join("")
  ||
  "<div class='item'>Aucun pilote</div>";
}

'''

    js_content = js_content.replace(
        "function detectRecord(){",
        insert_code + "\nfunction detectRecord(){"
    )

    js_content = js_content.replace(
        "renderPilots(",
        "renderRating();\n\n    renderPilots("
    )

    js.write_text(js_content, encoding="utf-8")

print("OK V6.2 MRCP Rating installé")
