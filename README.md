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
- `docs/app_v2.js` : point d'entree, routage hash et bootstrap (PWA, admin).
  La logique est repartie dans plusieurs fichiers `docs/app_v2_*.js` charges
  juste avant lui (scripts classiques, meme scope global, pas de modules ES) :
  - `app_v2_core.js` : etat global et utilitaires de base (formatage, theme).
  - `app_v2_admin_api.js` : appels a l'API admin locale.
  - `app_v2_laps.js` : agregation des tours et graphiques SVG.
  - `app_v2_pages_home.js` : accueil, podiums, profil pilote complet.
  - `app_v2_pages_lists.js` : mes chronos, pilotes, sessions, records, comparatif.
  - `app_v2_live.js` : pages live (teaser, decodeur, TV, vue du jour).
  - `app_v2_divisions.js` : divisions de niveau (poules A/B/C par piste).
  - `app_v2_poster.js` : affiche club imprimable, admin (`#/affiche`).
  - `app_v2_rythme.js` : frequentation par jour, heure et mois (`#/rythme`).
  - `app_v2_search.js` : recherche globale (pilote, puce, journee).
  - `app_v2_admin_records.js` : qualite des donnees et corrections de tours.
  - `app_v2_admin_pilots.js` : corrections pilotes/transpondeurs, hub admin.
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

Il ecrit `docs/data_v2.json`.

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

Le mode admin du dashboard principal est accessible via le bouton Admin, qui ouvre
une fenetre modale (plus confortable au clavier tactile qu'une suite de `prompt()`).
Elle demande :

- l'URL de l'API admin locale, par exemple `http://127.0.0.1:5055`
- le token configure dans `MRCP_ADMIN_TOKEN`

En cas d'echec, l'erreur s'affiche dans la modale elle-meme (les champs restent
remplis pour corriger et reessayer, pas d'`alert()` bloquante).

Le token est garde dans le `localStorage` du navigateur utilise pour administrer.
Le bouton "Quitter" oublie cet acces local.

Depuis "Pilotes admin", un formulaire permet d'**ajouter une puce qui n'a pas
encore roule** : le nouveau membre est pre-enregistre, et son nom s'applique
automatiquement des son premier tour. Ces puces apparaissent dans le tableau
avec la mention "Pre-enregistree" tant qu'elles n'ont aucun tour.

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
- `GET /admin-status` pour verifier le dossier pilote, l'etat Git, les fichiers
  critiques et les dernieres actions.
- `GET /admin-history` pour afficher les dernieres actions admin.
- `GET /admin-backups` pour lister les sauvegardes locales.
- `POST /restore-backup` pour restaurer une sauvegarde, regenerer les donnees,
  commit et push Git.

Avant chaque application ou restauration, l'API cree une sauvegarde locale dans
`docs/backups/admin/`. Ce dossier est ignore par Git.

Si `MRCP_GITHUB_TOKEN` est configure, l'API declenche aussi un deploiement
GitHub Pages immediat (`workflow_dispatch`) juste apres le push - sinon le
site public attend le prochain creneau du planning (voir "Deploiement
GitHub Pages" dans docs/DEVELOPMENT.md). C'est toujours best-effort : si le
declenchement echoue, les corrections restent publiees sur Git normalement.

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
- `MRCP_GITHUB_TOKEN` : optionnel, token GitHub (scope `repo` classique ou
  `actions:write` fin-grained) permettant a `admin_api.py` de declencher
  immediatement le deploiement GitHub Pages apres une correction admin, au
  lieu d'attendre le prochain creneau du planning (jusqu'a 15 min). Laisser
  vide pour desactiver.
- `MRCP_GITHUB_REPO` : depot cible pour ce declenchement, `mrcp-dashboard/mrcp-dashboard` par defaut.

## Rapports WhatsApp aux pilotes

Un pilote qui le demande recoit un rapport de son roulage (tours, meilleur
tour, serie de 5 tours, comparaison a son record) quelques minutes apres avoir
quitte la piste.

Trois morceaux :

1. **Inscription** : la fiche pilote affiche un bouton qui ouvre WhatsApp avec
   `INSCRIPTION <nom>` deja ecrit. Renseigner le numero du bot dans
   `WHATSAPP_BOT_NUMBER` (`docs/app_v2_core.js`), au format international sans
   `+` ni espaces. Laisse vide, le bouton ne s'affiche pas.
2. **Reception** : WAHA pousse les messages entrants sur
   `POST http://<lxc>:5055/waha-webhook?token=<MRCP_WAHA_WEBHOOK_TOKEN>`
   (route de `admin_api.py`). Le numero de l'expediteur sert d'identifiant, il
   n'y a rien a saisir. `STOP` desinscrit.
3. **Envoi** : `docs/notify_pilots.py`, appele a chaque passage de
   `update_dashboard.sh`. Un rapport quand le pilote n'a plus passe de tour
   depuis 15 min, et un resume le soir s'il est sorti rouler plusieurs fois.

Variables, a mettre dans `/opt/mrcp-dashboard/.env` sur le LXC - et pas en
`Environment=` dans l'unite systemd : `update_dashboard.sh` en a besoin aussi,
or lance par cron il ne voit rien de ce qui est declare dans l'unite. Le
service admin lit ce meme fichier via `EnvironmentFile=`. Apres modification :
`systemctl restart mrcp-admin-api` (le cron, lui, relit le fichier a chaque
passage).

- `MRCP_WAHA_URL` : ex. `http://192.168.1.50:3000`. Vide = aucun envoi, les
  messages sont seulement affiches dans le journal.
- `MRCP_WAHA_SESSION` : session WAHA, `default` par defaut.
- `MRCP_WAHA_API_KEY` : cle `X-Api-Key` de WAHA.
- `MRCP_WAHA_WEBHOOK_TOKEN` : secret partage avec le webhook WAHA. Vide = la
  route refuse tout, personne ne peut s'inscrire.
- `MRCP_PUBLIC_BASE_URL` : base des liens vers la fiche pilote.
- `MRCP_NOTIFY_IDLE_MINUTES` : silence qui marque la fin d'un roulage, `15`.
- `MRCP_NOTIFY_DAY_HOUR` : heure du resume du soir, `20`.
- `MRCP_NOTIFY_DRY_RUN=1` : affiche les messages sans les envoyer.

Les contacts vivent dans `docs/pilot_notifications.json` et l'anti-doublon dans
`docs/daily_summary_sent.json`. **Ces deux fichiers sont ignores par Git** :
ce sont des donnees personnelles et le depot est public. Les sauvegarder a part
sur le serveur, ils ne sont pas repliques par le depot.

Essai a blanc, sans rien envoyer :

```bash
MRCP_NOTIFY_DRY_RUN=1 python docs/notify_pilots.py --date 2026-10-25 --now 23:00
```

## Tests

Un test de generation minimal couvre `build_data_v2.py` dans `docs/tests/`.
Il travaille sur un jeu de donnees factice (CSV + pilotes de test) genere dans
un dossier temporaire : il ne touche jamais aux fichiers reels du club
(`speedhive_csv/`, `speedhive_pilots.json`, `corrections.json`,
`lap_overrides.json`, `data_v2.json`).

```bash
py -m pytest docs/tests
```

## Verification rapide avant publication

```bash
py -m py_compile live_server.py docs/build_data_v2.py docs/admin_api.py docs/auto_check.py docs/speedhive_sync_linux.py docs/validate_dashboard_data.py docs/check_text_encoding.py
py -m pytest docs/tests
py docs/validate_dashboard_data.py
py docs/check_text_encoding.py
cd docs
py -m http.server 8000
```

Puis verifier au navigateur les pages principales listees dans "Demarrage local".

## Priorites de developpement suggerees

1. Etendre la couverture de tests (validate_dashboard_data.py, admin_api.py).
2. Continuer a affiner le decoupage de `app_v2_*.js` (les fichiers pages
   restent gros, ex. `app_v2_pages_home.js` et `app_v2_admin_records.js`).
3. Poursuivre le passage en revue mobile des pages admin : les flux longs
   (corrections pilotes/tours) gagneraient a avoir une barre d'action
   collante (`mobile-sticky-action` existe deja ailleurs).
4. TT1/10 est trop peu roulee pour alimenter les divisions (3 pilotes
   qualifies) : a revoir si la piste reprend de l'activite.
