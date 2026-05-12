(function () {
  "use strict";

  function toSeconds(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return v;

    if (typeof v === "string") {
      const n = parseFloat(v.replace(",", ".").replace("s", "").trim());
      return isNaN(n) ? null : n;
    }

    if (typeof v === "object") {
      return toSeconds(v.time || v.lap_time || v.seconds || v.value);
    }

    return null;
  }

  function formatTime(v) {
    return v ? v.toFixed(3) + " s" : "-";
  }

  function getPilotId(p) {
    return String(
      p.id ||
      p.pilot_id ||
      p.driver_id ||
      p.transponder ||
      p.transponder_id ||
      p.name ||
      p.driver_name ||
      ""
    );
  }

  function getPilotName(p) {
    return (
      p.name ||
      p.pilot_name ||
      p.driver ||
      p.driver_name ||
      p.full_name ||
      p.transponder ||
      "Pilote inconnu"
    );
  }

  function average(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stdDev(arr) {
    if (arr.length < 2) return 0;
    const avg = average(arr);
    const variance = arr.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  function extractLaps(p) {
    const raw = p.laps || p.lap_times || p.times || p.results || [];
    if (!Array.isArray(raw)) return [];

    return raw
      .map(toSeconds)
      .filter(v => v && v > 5 && v < 180);
  }

  function collectPilots(data) {
    const pilots = {};
    const activities = data.activities || [];

    activities.forEach(activity => {
      const participants = activity.participants || [];

      participants.forEach(p => {
        const id = getPilotId(p);
        if (!id) return;

        const laps = extractLaps(p);
        if (!laps.length) return;

        if (!pilots[id]) {
          pilots[id] = {
            id,
            name: getPilotName(p),
            laps: [],
            sessions: 0,
            bestLap: null,
            previousBestLap: null
          };
        }

        pilots[id].laps.push(...laps);
        pilots[id].sessions += 1;

        const sessionBest = Math.min(...laps);

        if (pilots[id].bestLap === null || sessionBest < pilots[id].bestLap) {
          pilots[id].previousBestLap = pilots[id].bestLap;
          pilots[id].bestLap = sessionBest;
        }
      });
    });

    return Object.values(pilots);
  }

  function scorePilot(p) {
    const totalLaps = p.laps.length;
    const avg = average(p.laps);
    const std = stdDev(p.laps);

    const activityScore = Math.min(100, totalLaps / 2);
    const regularityScore = Math.max(0, Math.min(100, 100 - std * 12));

    let progressionScore = 0;
    let recordBeaten = false;

    if (p.previousBestLap && p.bestLap && p.bestLap < p.previousBestLap) {
      progressionScore = Math.min(100, (p.previousBestLap - p.bestLap) * 60);
      recordBeaten = true;
    }

    const totalScore =
      activityScore * 0.35 +
      regularityScore * 0.35 +
      progressionScore * 0.30;

    return {
      ...p,
      totalLaps,
      averageLap: avg,
      activityScore,
      regularityScore,
      progressionScore,
      totalScore,
      recordBeaten
    };
  }

  function getPilotOfDay(data) {
    const pilots = collectPilots(data).map(scorePilot);
    pilots.sort((a, b) => b.totalScore - a.totalScore);
    return pilots[0] || null;
  }

  function render(data) {
    const box = document.getElementById("mrcp-v54-pilote-jour");
    if (!box) return;

    const pilot = getPilotOfDay(data);

    if (!pilot) {
      box.innerHTML = `
        <div class="v54-card">
          <h2>🏆 Pilote du jour</h2>
          <p>Aucune donnée suffisante.</p>
        </div>
      `;
      return;
    }

    box.innerHTML = `
      <div class="v54-card">
        <div class="v54-badge">🏆 PILOTE DU JOUR</div>

        <div class="v54-head">
          <div>
            <h2>${pilot.name}</h2>
            <p>Analyse automatique activité + régularité + progression</p>
          </div>

          <div class="v54-score">
            <strong>${pilot.totalScore.toFixed(0)}</strong>
            <span>/100</span>
          </div>
        </div>

        <div class="v54-grid">
          <div><span>Meilleur tour</span><strong>${formatTime(pilot.bestLap)}</strong></div>
          <div><span>Moyenne</span><strong>${formatTime(pilot.averageLap)}</strong></div>
          <div><span>Total tours</span><strong>${pilot.totalLaps}</strong></div>
          <div><span>Sessions</span><strong>${pilot.sessions}</strong></div>
          <div><span>Régularité</span><strong>${pilot.regularityScore.toFixed(0)} / 100</strong></div>
          <div><span>Activité</span><strong>${pilot.activityScore.toFixed(0)} / 100</strong></div>
        </div>

        <div class="${pilot.recordBeaten ? "v54-alert-ok" : "v54-alert"}">
          ${pilot.recordBeaten ? "🔥 Record personnel battu" : "📈 Progression stable"}
        </div>

        <a class="v54-profile" href="pilot.html?id=${encodeURIComponent(pilot.id)}">
          👤 Voir le profil pilote
        </a>
      </div>
    `;
  }

  async function initV54() {
    try {
      const response = await fetch("data_v2.json?v=" + Date.now());
      const data = await response.json();
      render(data);
    } catch (e) {
      console.error("Erreur V5.4 pilote du jour", e);
    }
  }

  document.addEventListener("DOMContentLoaded", initV54);
})();
