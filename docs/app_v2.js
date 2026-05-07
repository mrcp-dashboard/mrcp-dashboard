const btn = document.getElementById('myProfileBtn');
const stats = document.getElementById('myStats');

btn.addEventListener('click', () => {
  const name = prompt("Nom du pilote ?");
  if (!name) return;

  localStorage.setItem('mrcp_pilot', name);

  stats.innerHTML = `
    <p><strong>Pilote :</strong> ${name}</p>
    <p>Le mode mobile pilote est activé.</p>
    <p>Les futures stats personnelles seront affichées ici.</p>
  `;
});

window.addEventListener('load', () => {
  const saved = localStorage.getItem('mrcp_pilot');
  if (saved) {
    stats.innerHTML = `
      <p><strong>Pilote :</strong> ${saved}</p>
      <p>Profil restauré automatiquement.</p>
    `;
  }
});
