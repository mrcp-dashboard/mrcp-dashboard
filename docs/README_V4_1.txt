V4.1 - Live Timing / écran paddock

Copie dans docs :
- index_v2.html
- app_v2.js
- styles_v2.css
- sw.js

Garde les fichiers PWA existants :
- manifest.webmanifest
- icon-192.png
- icon-512.png

Nouveautés :
- onglet Live
- dernière activité détectée automatiquement
- classement live par meilleur tour
- dernier tour par pilote
- filtre TT1/8 / TT1/10
- refresh automatique toutes les 60 secondes
- mode TV plein écran

Important :
Le live dépend du cron Linux. Si le cron tourne toutes les 10 minutes,
le live est quasi-live toutes les 10 minutes côté données.
