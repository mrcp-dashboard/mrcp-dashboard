// =======================================================
// MRCP Dashboard - Fix boutons profils pilotes
// Réinjecte les boutons 👤 Profil dans le dashboard
// =======================================================

(function () {
  "use strict";

  function getPilotId(pilot) {
    return String(
      pilot.id ||
      pilot.pilot_id ||
      pilot.driver_id ||
      pilot.transponder ||
      pilot.transponder_id ||
      pilot.name ||
      pilot.driver_name ||
      ""
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

  async function addProfileButtons() {
    const response = await fetch("data_v2.json?v=" + Date.now());
    const data = await response.json();

    const pilots = {};

    (data.activities || []).forEach(activity => {
      (activity.participants || []).forEach(pilot => {
        const id = getPilotId(pilot);
        if (!id) return;

        pilots[id] = {
          id,
          name: getPilotName(pilot)
        };
      });
    });

    const pilotList = Object.values(pilots);

    document.querySelectorAll("table tbody tr").forEach(row => {
      const text = row.innerText.toLowerCase();

      const found = pilotList.find(p =>
        p.name && text.includes(String(p.name).toLowerCase())
      );

      if (!found) return;

      if (row.querySelector(".pilot-profile-btn")) return;

      const td = document.createElement("td");
      td.innerHTML = `
        <a class="pilot-profile-btn" href="pilot.html?id=${encodeURIComponent(found.id)}">
          👤 Profil
        </a>
      `;

      row.appendChild(td);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(addProfileButtons, 800);
    setTimeout(addProfileButtons, 2000);
    setTimeout(addProfileButtons, 4000);
  });

})();
