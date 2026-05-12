(function () {
  const DATA_URL = "data_v2.json?v=" + Date.now();

  function clean(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  function getPilotId(p) {
    return clean(
      p.id ||
      p.pilot_id ||
      p.driver_id ||
      p.transponder ||
      p.transponder_id ||
      p.number ||
      p.name ||
      p.pilot_name ||
      p.driver ||
      p.driver_name ||
      ""
    );
  }

  function getPilotName(p) {
    return clean(
      p.name ||
      p.pilot_name ||
      p.driver ||
      p.driver_name ||
      p.display_name ||
      p.id ||
      p.pilot_id ||
      p.transponder ||
      ""
    );
  }

  function createButton(id) {
    const a = document.createElement("a");
    a.className = "pilot-profile-btn-v53";
    a.href = "pilot.html?id=" + encodeURIComponent(id);
    a.textContent = "Profil";
    return a;
  }

  function injectStyle() {
    if (document.getElementById("pilot-profile-style-v53")) return;

    const style = document.createElement("style");
    style.id = "pilot-profile-style-v53";
    style.textContent = `
      .pilot-profile-btn-v53 {
        display: inline-block;
        background: #2563eb;
        color: white !important;
        padding: 5px 9px;
        border-radius: 9px;
        text-decoration: none;
        font-size: 11px;
        font-weight: 700;
        margin-left: 7px;
        white-space: nowrap;
        vertical-align: middle;
      }

      .pilot-profile-btn-v53:hover {
        background: #1d4ed8;
        color: white !important;
      }

      .pilot-profile-btn-v53::before {
        content: "👤 ";
      }
    `;
    document.head.appendChild(style);
  }

  function collectPilots(data) {
    const pilots = new Map();

    for (const p of data.pilots || []) {
      const id = getPilotId(p);
      const name = getPilotName(p);
      if (id && name) pilots.set(name.toLowerCase(), id);
    }

    for (const activity of data.activities || []) {
      for (const p of activity.participants || []) {
        const id = getPilotId(p);
        const name = getPilotName(p);
        if (id && name) pilots.set(name.toLowerCase(), id);
      }

      if (activity.best_pilot) {
        const name = clean(activity.best_pilot);
        if (name && !pilots.has(name.toLowerCase())) {
          pilots.set(name.toLowerCase(), name);
        }
      }
    }

    return pilots;
  }

  function addButtons(pilots) {
    const cells = document.querySelectorAll("td, th, div, span, p, li");

    cells.forEach(el => {
      if (el.dataset.profileChecked === "1") return;
      if (el.querySelector(".pilot-profile-btn-v53")) return;

      const text = clean(el.childNodes[0]?.textContent || el.textContent);
      if (!text) return;

      const normalized = text.toLowerCase();

      for (const [name, id] of pilots.entries()) {
        if (!name || !id) continue;

        const nameOk =
          normalized === name ||
          normalized.includes(name);

        if (nameOk && name.length >= 3) {
          el.appendChild(createButton(id));
          el.dataset.profileChecked = "1";
          break;
        }
      }
    });
  }

  async function init() {
    injectStyle();

    try {
      const res = await fetch(DATA_URL);
      const data = await res.json();
      const pilots = collectPilots(data);

      addButtons(pilots);

      setInterval(() => {
        addButtons(pilots);
      }, 2000);

      console.log("V5.3 profils pilotes : boutons ajoutés");
    } catch (e) {
      console.warn("V5.3 profils pilotes : impossible de charger les liens", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
