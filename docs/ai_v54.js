// =======================================================
// MRCP Dashboard V5.4
// Intelligence Club - Pilote du jour
// =======================================================

(function () {
  "use strict";

  const DATA_FILE = "data_v2.json";

  function toSeconds(value) {
    if (value === null || value === undefined) return null;

    if (typeof value === "number") {
      return value > 0 ? value : null;
    }

    if (typeof value === "string") {
      let v = value.trim().replace(",", ".").replace("s", "");

      if (v.includes(":")) {
        const parts = v.split(":").map(Number);
        if (parts.length === 2) {
          return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3) {
          return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      }

      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    }

    return null;
  }

  function formatTime(seconds) {
    if (!seconds) return "-";
    return seconds.toFixed(3) + " s";
  }

  function getPilotId(pilot) {
    return String(
      pilot.id ||
      pilot.pilot_id ||
      pilot.driver_id ||
      pilot.transponder ||
      pilot.transponder_id ||
      pilot.name ||
      pilot.driver_name ||
      "unknown"
    );
  }

  function getPilotName(pilot) {
    return (
      pilot.name ||
      pilot.pilot_name ||
      pilot.driver ||
      pilot.driver_name ||
      pilot.full_name ||
      pilot.transponder ||
      pilot.transponder_id ||
      "Pilote inconnu"
    );
  }

  function getPilotLaps(pilot) {
    const raw =
      pilot.laps ||
      pilot.lap_times ||
      pilot.times ||
      pilot.results ||
      [];

    if (!Array.isArray(raw)) return [];

    return raw
      .map(lap => {
        if (typeof lap === "object" && lap !== null) {
          return toSeconds(
            lap.time ||
            lap.lap_time ||
            lap.seconds ||
            lap.duration ||
            lap.value
          );
        }

        return toSeconds(lap);
      })
      .filter(v => v && v > 5 && v < 180);
  }

  function average(values) {
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function standardDeviation(values) {
    if (values.length < 2) return null;

    const avg = average(values);
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;

    return Math.sqrt(variance);
  }

  function regularityScore(laps) {
    if (laps.length < 3) return 0;

    const std = standardDeviation(laps);
    if (std === null) return 0;

    return Math.max(0, Math.min(100, 100 - std * 12));
  }

  function collectPilots(data) {
    const pilots = {};
    const activities = data.activities || [];

    activities.forEach(activity => {
      const date = activity.date || activity.date_fr || "Date inconnue";
      const participants = activity.participants || [];

      participants.forEach(p => {
        const id = getPilotId(p);
        const name = getPilotName(p);
        const transponder = p.transponder || p.transponder_id || "";

        if (!pilots[id]) {
          pilots[id] = {
            id,
            name,
            transponder,
            laps: [],
            sessions: [],
            bestLap: null,
            previousBestLap: null,
            totalLaps: 0
          };
        }

        const laps = getPilotLaps(p);

        if (!laps.length) return;

        const sessionBest = Math.min(...laps);
        const sessionAverage = average(laps);

        pilots[id].laps.push(...laps);
        pilots[id].totalLaps += laps.length;

        pilots[id].sessions.push({
          date,
          lapsCount: laps.length,
          bestLap: sessionBest,
          averageLap: sessionAverage
        });

        if (pilots[id].bestLap === null || sessionBest < pilots[id].bestLap) {
          pilots[id].previousBestLap = pilots[id].bestLap;
          pilots[id].bestLap = sessionBest;
        }
      });
    });

    return Object.values(pilots);
  }

  function calculateProgressionScore(pilot) {
    if (!pilot.previousBestLap || !pilot.bestLap) return 0;

    const gain = pilot.previousBestLap - pilot.bestLap;

    if (gain <= 0) return 0;

    return Math.min(100, gain * 60);
  }

  function calculateActivityScore(pilot) {
    return Math.min(100, pilot.totalLaps / 2);
  }

  function calculatePilotScore(pilot) {
    const activity = calculateActivityScore(pilot);
    const regularity = regularityScore(pilot.laps);
    const progression = calculateProgressionScore(pilot);

    const score =
      activity * 0.35 +
      regularity * 0.35 +
      progression * 0.30;

    return {
      activity,
      regularity,
      progression,
      score,
      recordBeaten: progression > 0
    };
  }

  function getPilotOfTheDay(data) {
    const pilots = collectPilots(data);

    let best = null;

    pilots.forEach(pilot => {
      if (!pilot.laps.length) return;

      const stats = calculatePilotScore(pilot);

      pilot.activityScore = stats.activity;
      pilot.regularityScore = stats.regularity;
      pilot.progressionScore = stats.progression;
      pilot.aiScore = stats.score;
      pilot.recordBeaten = stats.recordBeaten;
      pilot.averageLap = average(pilot.laps);
      pilot.sessionsCount = pilot.sessions.length;

      if (!best || pilot.aiScore > best.aiScore) {
        best = pilot;
      }
    });

    return best;
  }

  function renderPilotOfTheDay(data) {
    const container = document.getElementById("pilot-of-day-card");

    if (!container) {
      console.warn("V5.4 : élément #pilot-of-day-card introuvable");
      return;
    }

    const pilot = getPilotOfTheDay(data);

    if (!pilot) {
      container.innerHTML = `
        <div class="ai-card">
          <div class="ai-badge">🏆 PILOTE DU JOUR</div>
          <h2>Aucune donnée disponible</h2>
          <p>Impossible de calculer le pilote du jour avec le fichier data_v2.json actuel.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="ai-card pilot-day-card">
        <div class="ai-card-header">
          <div>
            <div class="ai-badge">🏆 PILOTE DU JOUR</div>
            <h2>${pilot.name}</h2>
            <p class="ai-subtitle">
              ${pilot.transponder ? "Transpondeur : " + pilot.transponder : "Analyse automatique MRCP"}
            </p>
          </div>

          <div class="ai-score-circle">
            <span>${pilot.aiScore.toFixed(0)}</span>
            <small>/100</small>
          </div>
        </div>

        <div class="ai-grid">
          <div class="ai-stat">
            <span>Meilleur tour</span>
            <strong>${formatTime(pilot.bestLap)}</strong>
          </div>

          <div class="ai-stat">
            <span>Moyenne</span>
            <strong>${formatTime(pilot.averageLap)}</strong>
          </div>

          <div class="ai-stat">
            <span>Total tours</span>
            <strong>${pilot.totalLaps}</strong>
          </div>

          <div class="ai-stat">
            <span>Sessions</span>
            <strong>${pilot.sessionsCount}</strong>
          </div>

          <div class="ai-stat">
            <span>Régularité</span>
            <strong>${pilot.regularityScore.toFixed(0)} / 100</strong>
          </div>

          <div class="ai-stat">
            <span>Activité</span>
            <strong>${pilot.activityScore.toFixed(0)} / 100</strong>
          </div>
        </div>

        ${
          pilot.recordBeaten
            ? `<div class="ai-alert success">🔥 Record personnel battu récemment</div>`
            : `<div class="ai-alert neutral">📈 Progression stable détectée</div>`
        }

        <div class="ai-actions">
          <a href="pilot.html?id=${encodeURIComponent(pilot.id)}" class="ai-profile-btn">
            👤 Voir le profil pilote
          </a>
        </div>
      </div>
    `;
  }

  async function loadAndRenderPilotOfTheDay() {
    try {
      const response = await fetch(DATA_FILE + "?v=" + Date.now());

      if (!response.ok) {
        throw new Error("Impossible de charger " + DATA_FILE);
      }

      const data = await response.json();
      renderPilotOfTheDay(data);

    } catch (error) {
      console.error("Erreur V5.4 :", error);

      const container = document.getElementById("pilot-of-day-card");

      if (container) {
        container.innerHTML = `
          <div class="ai-card">
            <div class="ai-badge">⚠️ V5.4</div>
            <h2>Erreur de chargement</h2>
            <p>${error.message}</p>
          </div>
        `;
      }
    }
  }

  window.renderPilotOfTheDay = renderPilotOfTheDay;
  window.loadAndRenderPilotOfTheDay = loadAndRenderPilotOfTheDay;

  document.addEventListener("DOMContentLoaded", loadAndRenderPilotOfTheDay);

})();
