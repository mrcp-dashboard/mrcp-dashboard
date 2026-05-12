// =======================================================
// MRCP Dashboard V5.4 - Pilote du jour
// Module externe SAFE : ne modifie pas la V5.3
// =======================================================
(function () {
  "use strict";

  var DATA_FILE = "data_v2.json";
  var lastRenderKey = "";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toSeconds(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;

    if (typeof value === "string") {
      var clean = value.trim().replace(",", ".").replace("s", "");
      if (clean.indexOf(":") !== -1) {
        var parts = clean.split(":").map(Number);
        if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
        if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      var n = parseFloat(clean);
      return Number.isFinite(n) ? n : null;
    }

    if (typeof value === "object") {
      return toSeconds(value._time || value.time || value.lap_time || value.seconds || value.best_lap || value.duration || value.value);
    }

    return null;
  }

  function formatTime(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n.toFixed(3) + " s" : "-";
  }

  function normalizeTrack(lap, fallbackTrack) {
    if (lap && lap.track) return lap.track;
    if (fallbackTrack) return fallbackTrack;
    var t = toSeconds(lap);
    if (!Number.isFinite(t)) return "Inconnue";
    return t < 30 ? "TT1/10" : "TT1/8";
  }

  function lapPilot(lap, fallback) {
    return fallback || (lap && (lap.pilot_name || lap.pilot || lap.driver || lap.name || lap.participant_name || lap.transponder)) || "Pilote inconnu";
  }

  function getPilotId(pilot, pilotName) {
    return String(
      (pilot && (pilot.id || pilot.pilot_id || pilot.driver_id || pilot.transponder || pilot.transponder_id)) ||
      pilotName ||
      ""
    );
  }

  function getPilotName(pilot) {
    return String(
      (pilot && (pilot.name || pilot.pilot_name || pilot.driver || pilot.driver_name || pilot.full_name || pilot.transponder || pilot.transponder_id)) ||
      "Pilote inconnu"
    );
  }

  function average(values) {
    if (!values.length) return null;
    return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
  }

  function stdDev(values) {
    if (values.length < 2) return 0;
    var avg = average(values);
    var variance = values.reduce(function (sum, v) { return sum + Math.pow(v - avg, 2); }, 0) / values.length;
    return Math.sqrt(variance);
  }

  function ensurePilot(map, id, name, transponder) {
    if (!id) id = name;
    if (!map[id]) {
      map[id] = {
        id: id,
        name: name || "Pilote inconnu",
        transponder: transponder || "",
        laps: [],
        sessions: {},
        sessionBests: [],
        tracks: {},
        bestLap: null,
        bestTrack: ""
      };
    }
    return map[id];
  }

  function addLap(map, lap, ctx) {
    var time = toSeconds(lap);
    if (!Number.isFinite(time) || time <= 5 || time >= 180) return;

    var name = lapPilot(lap, ctx.pilotName);
    var id = String(ctx.id || (lap && (lap.pilot_id || lap.driver_id || lap.transponder)) || name);
    var track = normalizeTrack(lap, ctx.track);
    var sessionKey = ctx.sessionId || ctx.sessionName || ctx.date || "session";

    var p = ensurePilot(map, id, name, ctx.transponder || (lap && lap.transponder) || "");
    p.laps.push(time);
    p.sessions[sessionKey] = true;
    p.tracks[track] = true;

    if (p.bestLap === null || time < p.bestLap) {
      p.bestLap = time;
      p.bestTrack = track;
    }

    var existing = p.sessionBests.find(function (s) { return s.key === sessionKey; });
    if (!existing) {
      p.sessionBests.push({ key: sessionKey, date: ctx.date || "", best: time });
    } else if (time < existing.best) {
      existing.best = time;
    }
  }

  function collectPilots(data) {
    var map = {};

    if (data && Array.isArray(data.activities)) {
      data.activities.forEach(function (activity) {
        var activityId = activity.id || activity.activity_id || activity.session_id || "";
        var activityName = activity.name || activity.title || activity.session_name || activity.date_fr || activity.date || "";
        var activityDate = activity.date || activity.session_date || activity.created_at || "";

        (activity.participants || []).forEach(function (participant) {
          var pilotName = getPilotName(participant);
          var pilotId = getPilotId(participant, pilotName);
          var transponder = participant.transponder || participant.transponder_id || "";
          var laps = participant.laps || participant.lap_times || participant.times || participant.results || [];
          if (!Array.isArray(laps)) return;

          laps.forEach(function (lap) {
            addLap(map, lap, {
              id: pilotId,
              pilotName: pilotName,
              transponder: transponder,
              sessionId: activityId,
              sessionName: activityName,
              date: activityDate,
              track: (lap && lap.track) || participant.track || activity.track || null
            });
          });
        });
      });
    }

    if (data && Array.isArray(data.sessions)) {
      data.sessions.forEach(function (session) {
        var sid = session.id || session.session_id || "";
        var sname = session.name || session.title || session.session_name || session.date_fr || session.date || "";
        var sdate = session.date || session.session_date || "";

        (session.participants || []).forEach(function (participant) {
          var pilotName = getPilotName(participant);
          var pilotId = getPilotId(participant, pilotName);
          var transponder = participant.transponder || participant.transponder_id || "";
          var laps = participant.laps || participant.lap_times || participant.times || participant.results || [];
          if (!Array.isArray(laps)) return;
          laps.forEach(function (lap) {
            addLap(map, lap, { id: pilotId, pilotName: pilotName, transponder: transponder, sessionId: sid, sessionName: sname, date: sdate, track: (lap && lap.track) || participant.track || null });
          });
        });

        (session.laps || session.results || []).forEach(function (lap) {
          addLap(map, lap, { id: (lap && (lap.pilot_id || lap.driver_id || lap.transponder)) || "", pilotName: lapPilot(lap), transponder: lap && lap.transponder, sessionId: sid, sessionName: sname, date: sdate, track: lap && lap.track });
        });
      });
    }

    if (data && Array.isArray(data.laps)) {
      data.laps.forEach(function (lap) {
        addLap(map, lap, { id: (lap && (lap.pilot_id || lap.driver_id || lap.transponder)) || "", pilotName: lapPilot(lap), transponder: lap && lap.transponder, sessionId: lap && (lap.session_id || lap.activity_id), sessionName: lap && lap.session_name, date: lap && (lap.date || lap.session_date), track: lap && lap.track });
      });
    }

    return Object.keys(map).map(function (id) { return map[id]; });
  }

  function scorePilot(pilot) {
    var totalLaps = pilot.laps.length;
    var avg = average(pilot.laps);
    var std = stdDev(pilot.laps);
    var sessions = Object.keys(pilot.sessions).length;

    pilot.sessionBests.sort(function (a, b) { return String(a.date || a.key).localeCompare(String(b.date || b.key)); });

    var progressionScore = 0;
    var recordBeaten = false;
    if (pilot.sessionBests.length >= 2) {
      var previous = pilot.sessionBests.slice(0, -1).reduce(function (best, s) { return Math.min(best, s.best); }, Infinity);
      var last = pilot.sessionBests[pilot.sessionBests.length - 1].best;
      if (Number.isFinite(previous) && last < previous) {
        progressionScore = Math.min(100, (previous - last) * 60);
        recordBeaten = true;
      }
    }

    var activityScore = Math.min(100, totalLaps / 2);
    var regularityScore = Math.max(0, Math.min(100, 100 - std * 12));
    var totalScore = activityScore * 0.35 + regularityScore * 0.35 + progressionScore * 0.30;

    return Object.assign({}, pilot, {
      totalLaps: totalLaps,
      sessionsCount: sessions,
      averageLap: avg,
      regularityScore: regularityScore,
      activityScore: activityScore,
      progressionScore: progressionScore,
      totalScore: totalScore,
      recordBeaten: recordBeaten
    });
  }

  function getPilotOfDay(data) {
    var pilots = collectPilots(data)
      .filter(function (p) { return p.laps.length >= 3; })
      .map(scorePilot)
      .sort(function (a, b) { return b.totalScore - a.totalScore; });

    return pilots[0] || null;
  }

  function renderPilotOfDay(data) {
    var box = document.getElementById("mrcp-v54-pilote-jour");
    if (!box) return;

    var pilot = getPilotOfDay(data);
    if (!pilot) {
      box.innerHTML = '<section class="card v54-card"><h2>🏆 Pilote du jour</h2><p class="small">Aucune donnée suffisante pour calculer le pilote du jour.</p></section>';
      return;
    }

    var key = pilot.id + "|" + pilot.totalScore.toFixed(2) + "|" + pilot.totalLaps;
    if (key === lastRenderKey && box.innerHTML) return;
    lastRenderKey = key;

    box.innerHTML =
      '<section class="card v54-card">' +
        '<div class="v54-badge">🏆 PILOTE DU JOUR</div>' +
        '<div class="v54-head">' +
          '<div>' +
            '<h2>' + escapeHtml(pilot.name) + '</h2>' +
            '<p>Analyse automatique : activité + régularité + progression</p>' +
          '</div>' +
          '<div class="v54-score"><strong>' + pilot.totalScore.toFixed(0) + '</strong><span>/100</span></div>' +
        '</div>' +
        '<div class="v54-grid">' +
          '<div><span>Meilleur tour</span><strong>' + formatTime(pilot.bestLap) + '</strong></div>' +
          '<div><span>Moyenne</span><strong>' + formatTime(pilot.averageLap) + '</strong></div>' +
          '<div><span>Total tours</span><strong>' + pilot.totalLaps + '</strong></div>' +
          '<div><span>Sessions</span><strong>' + pilot.sessionsCount + '</strong></div>' +
          '<div><span>Régularité</span><strong>' + pilot.regularityScore.toFixed(0) + ' / 100</strong></div>' +
          '<div><span>Activité</span><strong>' + pilot.activityScore.toFixed(0) + ' / 100</strong></div>' +
        '</div>' +
        '<div class="' + (pilot.recordBeaten ? 'v54-alert-ok' : 'v54-alert') + '">' +
          (pilot.recordBeaten ? '🔥 Record personnel battu sur la dernière session' : '📈 Progression stable détectée') +
        '</div>' +
        '<a class="v54-profile" href="pilot.html?id=' + encodeURIComponent(pilot.id) + '">👤 Voir le profil pilote</a>' +
      '</section>';
  }

  async function loadDataAndRender() {
    var box = document.getElementById("mrcp-v54-pilote-jour");
    if (!box) return;

    try {
      var response = await fetch(DATA_FILE + "?v=" + Date.now());
      if (!response.ok) throw new Error("HTTP " + response.status);
      var data = await response.json();
      renderPilotOfDay(data);
    } catch (error) {
      console.error("V5.4 pilote du jour", error);
      box.innerHTML = '<section class="card v54-card"><h2>🏆 Pilote du jour</h2><p class="small">Erreur de chargement V5.4.</p></section>';
    }
  }

  function watchHomeInjection() {
    loadDataAndRender();
    var target = document.getElementById("app") || document.body;
    if (!target || !window.MutationObserver) return;

    var observer = new MutationObserver(function () {
      if (document.getElementById("mrcp-v54-pilote-jour")) {
        loadDataAndRender();
      }
    });

    observer.observe(target, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", watchHomeInjection);
  if (document.readyState !== "loading") watchHomeInjection();
})();
