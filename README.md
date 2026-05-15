# MRCP Dashboard

Dashboard web du Mini Racing Club Palois pour exploiter les chronos SpeedHive :
consultation des chronos, profils pilotes, podiums, records, live center, mode TV
et outils d'administration des corrections.

Le site public est servi depuis le dossier `docs/`, ce qui le rend compatible avec
GitHub Pages.

## Demarrage local

Depuis la racine du depot :

```bash
py -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
cd docs
py -m http.server 8000
```

Ouvrir ensuite :

- `http://localhost:8000/` pour l'entree par defaut
- `http://localhost:8000/index_v2.html` pour le dashboard principal
- `http://localhost:8000/live_center.html` pour le Live Center
- `http://localhost:8000/pilot_v65.html` pour les profils pilotes
- `http://localhost:8000/tv_paddock.html` pour l'affichage TV paddock
- `http://localhost:8000/health_check.html` pour le diagnostic navigateur

## Structure

- `docs/index_v2.html` : entree principale du dashboard.
- `docs/app_v2.js` : routage hash, pages publiques, pages admin et rendu global.
- `docs/styles_v2.css` : styles principaux.
- `docs/data_v2.json` : donnees consolidees utilisees par le front.
- `docs/build_data_v2.py` : generation de `data_v2.json` depuis les exports CSV SpeedHive.
- `docs/speedhive_sync_linux.py` : synchronisation SpeedHive cote serveur.
- `docs/admin_api.py` : API locale pour appliquer les corrections admin.
- `docs/live_center.html` et `docs/mrcp_v60_live.js` : experience Live Center.
- `docs/pilot_v65.html` et `docs/pilot_v65.js` : profil pilote.
- `live_server.py` : service Flask/Socket.IO pour un live timing dedie.
- `local_backups/` : copies de securite locales historiques.

## Regeneration des donnees

Depuis `docs/` :

```bash
python build_data_v2.py
```

Le script lit notamment :

- `speedhive_csv/sessions_*.csv`
- `speedhive_pilots.json`
- `corrections.json`
- `lap_overrides.json`

Il ecrit :

- `docs/data_v2.json`
- `docs/speedhive_reports/data_v2.json`

## Mise a jour serveur

Les scripts ciblent par defaut `/opt/mrcp-dashboard`, mais le chemin peut etre
modifie avec les variables d'environnement `MRCP_PROJECT_ROOT` et `MRCP_DOCS_DIR`.

```bash
cd /opt/mrcp-dashboard/docs
./update_dashboard.sh
```

ou, pour le flux V6.6 :

```bash
cd /opt/mrcp-dashboard/docs
./update_dashboard_v66.sh
```

Ces scripts synchronisent SpeedHive, regenerent les donnees, puis commit/push les
changements Git quand il y en a.

## Administration

Le mode admin du dashboard principal est accessible via le bouton Admin. Il demande
maintenant :

- l'URL de l'API admin locale, par exemple `http://127.0.0.1:5055`
- le token configure dans `MRCP_ADMIN_TOKEN`

Le token est garde dans le `localStorage` du navigateur utilise pour administrer.
Le bouton "Quitter" oublie cet acces local.

Les pages admin permettent de preparer :

- `lap_overrides.json` pour exclure ou forcer des tours.
- `corrections.json` pour associer les transpondeurs aux noms pilotes officiels.

L'API locale `docs/admin_api.py` peut appliquer ces corrections automatiquement :

```bash
cd docs
set MRCP_ADMIN_TOKEN=un-token-local
py admin_api.py
```

Quand l'API est disponible, le dashboard peut appeler directement :

- `POST /check-auth` pour verifier le token.
- `POST /apply-corrections` pour ecrire les corrections, regenerer `data_v2.json`,
  commit et push Git.

Consulter `docs/README_V4_2_ADMIN_API.txt` pour l'installation systemd sur le LXC.

## Configuration

Copier `.env.example` vers `.env` pour documenter la configuration locale. Les
variables les plus importantes sont :

- `MRCP_PROJECT_ROOT` : racine du depot sur le serveur.
- `MRCP_DOCS_DIR` : dossier servi par GitHub Pages et les scripts de donnees.
- `MRCP_DATA_FILE` : fichier JSON consomme par le live server.
- `MRCP_ADMIN_TOKEN` : token attendu par l'API admin locale.
- `MRCP_ADMIN_API_HOST` : interface d'ecoute de l'API admin.
- `MRCP_ADMIN_API_PORT` : port de l'API admin, `5055` par defaut.
- `MRCP_LIVE_PORT` : port du live timing Socket.IO, `5056` par defaut.

## Verification rapide avant publication

```bash
py -m py_compile live_server.py docs/build_data_v2.py docs/admin_api.py docs/auto_check.py docs/speedhive_sync_linux.py docs/validate_dashboard_data.py
py docs/validate_dashboard_data.py
cd docs
py -m http.server 8000
```

Puis verifier au navigateur les pages principales listees dans "Demarrage local".

## Priorites de developpement suggerees

1. Ajouter un test de generation minimal pour `build_data_v2.py`.
2. Decouper progressivement `app_v2.js` en modules plus petits.
3. Ameliorer l'experience mobile des pages admin.
