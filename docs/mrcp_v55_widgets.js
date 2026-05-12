(function () {

if (window.MRCP_V55_INSTALLED) return;
window.MRCP_V55_INSTALLED = true;

async function loadData() {
    const res = await fetch("data_v2.json?" + Date.now());
    return await res.json();
}

function stdDeviation(values) {
    if (!values.length) return 0;

    const avg = values.reduce((a,b)=>a+b,0) / values.length;

    const squareDiffs = values.map(v => Math.pow(v - avg, 2));

    const avgSquareDiff = squareDiffs.reduce((a,b)=>a+b,0) / squareDiffs.length;

    return Math.sqrt(avgSquareDiff);
}

function createCard(title, content) {
    return `
    <div class="mrcp-widget-card">
        <div class="mrcp-widget-title">${title}</div>
        <div class="mrcp-widget-content">${content}</div>
    </div>
    `;
}

function getPilotStats(data) {

    const pilots = {};

    (data.activities || []).forEach(activity => {

        (activity.participants || []).forEach(pilot => {

            const name = pilot.name || pilot.pilot_name || "Inconnu";

            if (!pilots[name]) {
                pilots[name] = {
                    laps: [],
                    totalLaps: 0,
                    sessions: 0
                };
            }

            pilots[name].sessions++;

            (pilot.laps || []).forEach(lap => {

                const t = parseFloat(lap.lap_time || lap.time || 0);

                if (t > 5 && t < 200) {
                    pilots[name].laps.push(t);
                    pilots[name].totalLaps++;
                }

            });

        });

    });

    return pilots;
}

function buildRegularityWidget(pilots) {

    const rows = [];

    Object.entries(pilots).forEach(([name, p]) => {

        if (p.laps.length < 5) return;

        const deviation = stdDeviation(p.laps);

        let badge = "";

        if (deviation < 0.3)
            badge = "🔥 Très régulier";
        else if (deviation < 0.6)
            badge = "✅ Régulier";

        rows.push({
            name,
            deviation,
            badge
        });

    });

    rows.sort((a,b)=>a.deviation-b.deviation);

    let html = `
    <table class="mrcp-table">
        <tr>
            <th>Pilote</th>
            <th>Écart type</th>
            <th>Badge</th>
        </tr>
    `;

    rows.slice(0,10).forEach(r => {

        html += `
        <tr>
            <td>${r.name}</td>
            <td>${r.deviation.toFixed(3)}</td>
            <td>${r.badge}</td>
        </tr>
        `;

    });

    html += `</table>`;

    return createCard("🎯 Régularité pilotes", html);
}

function buildActivityWidget(pilots) {

    const rows = [];

    Object.entries(pilots).forEach(([name,p]) => {

        rows.push({
            name,
            laps: p.totalLaps,
            sessions: p.sessions
        });

    });

    rows.sort((a,b)=>b.laps-a.laps);

    let html = `
    <table class="mrcp-table">
        <tr>
            <th>Pilote</th>
            <th>Tours</th>
            <th>Sessions</th>
        </tr>
    `;

    rows.slice(0,10).forEach(r => {

        html += `
        <tr>
            <td>${r.name}</td>
            <td>${r.laps}</td>
            <td>${r.sessions}</td>
        </tr>
        `;

    });

    html += `</table>`;

    return createCard("🏁 Pilotes les plus actifs", html);
}

function buildTrackHeatmap(data) {

    const hours = {};

    (data.activities || []).forEach(activity => {

        const date = new Date(activity.date);

        const h = date.getHours();

        const track = activity.track || "Inconnu";

        const key = `${track}-${h}`;

        hours[key] = (hours[key] || 0) + 1;

    });

    let html = `<div class="mrcp-heatmap">`;

    Object.entries(hours).forEach(([k,v]) => {

        const intensity = Math.min(v * 20, 100);

        html += `
        <div class="mrcp-heat-cell"
             style="opacity:${intensity/100}">
            ${k}<br>${v}
        </div>
        `;

    });

    html += `</div>`;

    return createCard("📊 Heatmap activité piste", html);
}

function buildRecordWidget(data) {

    const best = {};

    (data.activities || []).forEach(activity => {

        const track = activity.track || "Inconnu";

        const bestLap = parseFloat(activity.best_lap || 999);

        if (!best[track] || bestLap < best[track]) {
            best[track] = bestLap;
        }

    });

    let html = "";

    Object.entries(best).forEach(([track,time]) => {

        html += `
        <div class="mrcp-record-line">
            🏆 ${track} :
            <span class="mrcp-record-value">
                ${time.toFixed(3)}s
            </span>
        </div>
        `;

    });

    return createCard("⚡ Records piste", html);
}

async function initV55() {

    const data = await loadData();

    const pilots = getPilotStats(data);

    let root = document.getElementById("mrcp-v55-widgets");

    if (!root) {

        root = document.createElement("div");
        root.id = "mrcp-v55-widgets";

        document.body.appendChild(root);
    }

    root.innerHTML = `
        ${buildRegularityWidget(pilots)}
        ${buildActivityWidget(pilots)}
        ${buildRecordWidget(data)}
        ${buildTrackHeatmap(data)}
    `;

}

window.addEventListener("load", initV55);

})();
