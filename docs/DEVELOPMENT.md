# Notes de developpement MRCP Dashboard

## Deploiement GitHub Pages

`.github/workflows/pages.yml` deploie `docs/` sur GitHub Pages. Il se
declenche sur un **planning toutes les 15 minutes** (`schedule: cron`), pas
sur chaque push.

C'est volontaire : le LXC pousse un commit "Auto update dashboard" toutes les
~3 minutes. GitHub Pages n'autorise qu'un seul deploiement a la fois par
depot et annule l'ancien des qu'un nouveau demarre. Avec un declenchement sur
`push`, des qu'un deploiement met ne serait-ce que 3 minutes a se terminer,
il se fait annuler par le commit suivant avant d'aboutir - et ça boucle a
l'infini. C'est exactement ce qui s'est passe du **12 au 16 aout 2026** :
100% des deploiements ont ete annules pendant 5 jours, le site public restant
fige sur sa version du 11 aout 23:57 alors meme que les commits Git
continuaient d'arriver normalement.

Pour verifier que les deploiements aboutissent a nouveau :

```bash
gh run list --repo mrcp-dashboard/mrcp-dashboard --workflow="Deploy GitHub Pages" --limit 5
```

Si ça recommence a boucler en `cancelled`, augmenter l'intervalle du cron
(ou reduire la frequence de push du LXC) plutot que de repasser sur `push`.

`docs/admin_api.py` peut declencher un deploiement immediat (`workflow_dispatch`)
juste apres un push de corrections admin, si `MRCP_GITHUB_TOKEN` est configure
(voir "Flux admin API" plus bas et README.md > Configuration). Ca ne concerne
que les corrections admin, pas les commits automatiques du LXC - ceux-la
restent sur le planning 15 min, pour ne pas recreer la boucle d'annulation.

## Pages principales

| Page | Role |
| --- | --- |
| `index_v2.html` | Dashboard principal et routes `#/...` |
| `live_center.html` | Live Center V6, records, speaker, rating et hall of fame |
| `pilot_v65.html` | Recherche et profil pilote |
| `tv_paddock.html` | Affichage paddock/TV |
| `health_check.html` | Diagnostic front |

## Routes du dashboard principal

Les routes sont gerees dans `app_v2.js` par le hash de l'URL :

- `#/` : accueil
- `#/mes-chronos` : profil du pilote memorise en local
- `#/live` : vue live integree
- `#/pilotes` : liste des pilotes
- `#/pilote/<nom>` : fiche pilote
- `#/podiums` : records et podiums
- `#/quality` : qualite des donnees, admin uniquement
- `#/admin-pilotes` : corrections pilotes, admin uniquement
- `#/admin-records` : corrections tours, admin uniquement
- `#/admin` : hub admin

## Donnees

Le front charge `data_v2.json` avec un cache buster `?ts=...`.

Schema observe :

- `schema_version`
- `generated_at`
- `summary`
- `records`
- `activities`
- `laps`

La generation est faite par `build_data_v2.py`. Les corrections persistantes sont
dans `corrections.json` et `lap_overrides.json`.

## Series de tours consecutifs

`app_v2_laps.js` calcule la **meilleure moyenne sur N tours qui s'enchainent**
(`SERIES_LAP_COUNT = 5`), affichee sur la fiche pilote et la page Records club.

Le best lap recompense un tour isole ; la serie mesure le rythme reellement
tenu. Les deux classements different vraiment : au 16 aout 2026, le record
TT1/10 est a Fouad Elward (20.500 s) mais la meilleure serie est a NATHANAEL
(23.712 s) - Fouad n'a meme aucune serie de 5 tours.

Definition d'une serie, importante pour ne pas produire de faux chiffres :

- dans les CSV SpeedHive, `lap_no` **repart a 1 a chaque relance**. Une serie
  est donc une suite de `lap_no` qui s'incrementent de 1 ;
- le regroupement se fait par **pilote + session** avant le decoupage, sinon
  une suite pourrait melanger deux pilotes ou deux sessions ;
- un changement de piste coupe la serie (TT1/8 et TT1/10 ne se comparent pas).

Le choix de N=5 est empirique : sur les donnees d'aout 2026, 96% des pilotes
ont au moins une serie de 5 tours (41% des relances font 5 tours ou plus).
Monter N reduirait la couverture. Si le format des roulages change (relances
plus courtes), reverifier avec `docs/tools/series_coverage.py` :

```bash
py docs/tools/series_coverage.py
```

## Services

| Service | Fichier | Port par defaut |
| --- | --- | --- |
| Admin API | `docs/admin_api.py` | `5055` |
| Live timing Socket.IO | `live_server.py` | `5056` |
| Serveur statique local | `python -m http.server` depuis `docs/` | `8000` |
| Test decodeur AMB/P3 | `docs/live_decoder_test.py` | `5403` |
| Decodeur AMB/P3 live reel | `docs/live_decoder_service.py` | `5403` |

Les ports et chemins peuvent etre surcharges avec :

- `MRCP_PROJECT_ROOT`
- `MRCP_DOCS_DIR`
- `MRCP_DATA_FILE`
- `MRCP_ADMIN_API_HOST`
- `MRCP_ADMIN_API_PORT`
- `MRCP_LIVE_HOST`
- `MRCP_LIVE_PORT`
- `MRCP_LIVE_CORS_ORIGINS`

## Test live decodeur AMB/P3

Le decodeur MyLaps/AMB expose le protocole P3 en TCP, generalement sur le port
`5403`. Premier test depuis le serveur :

```bash
nc -vz 192.168.1.100 5403
```

Puis lancer le lecteur de test :

```bash
cd /opt/mrcp-dashboard/docs
../venv/bin/python live_decoder_test.py --host 192.168.1.100 --all
```

Faire passer une voiture sur la boucle. Les passages doivent afficher au moins
`PASSING transponder=... rtc=... strength=... hits=...`.

Integration live reel non publique :

```bash
cd /opt/mrcp-dashboard
cp docs/mrcp-live-decoder.service /etc/systemd/system/mrcp-live-decoder.service
systemctl daemon-reload
systemctl enable --now mrcp-live-decoder
systemctl status mrcp-live-decoder --no-pager
```

Le service ecrit `docs/live_decoder_state.json`, ignore par Git et lisible par
le serveur web. Les compteurs live sont remis a zero automatiquement quand la
date locale change. La page de test existe mais n'est pas visible dans le menu
utilisateur :

```text
http://ADRESSE_DASHBOARD/#/live-reel
```

Route kiosque plein ecran pour futur Raspberry Pi :

```text
http://ADRESSE_DASHBOARD/index_v2.html#/live-tv
```

Cette route est aussi cachee du menu utilisateur.

Synthese vocale optionnelle pour un ecran HDMI avec son :

```text
http://ADRESSE_DASHBOARD/index_v2.html#/live-tv?voice=1
```

Sans `?voice=1`, la page reste silencieuse.

Guide d'installation Raspberry Pi kiosque :

```text
docs/RASPBERRY_KIOSK.md
```

## Flux admin API

Le front ne contient plus de code admin fixe. Au clic sur Admin, il demande l'URL
de l'API et le token, puis verifie `POST /check-auth`.

Les corrections locales restent dans le navigateur tant qu'elles ne sont pas
appliquees. Depuis le hub admin ou les pages de corrections, le bouton
"Appliquer via API" envoie :

- `lap_overrides`
- `corrections`
- un message de commit

vers `POST /apply-corrections`. L'API ecrit les JSON, regenere les donnees,
commit, push, puis declenche un deploiement GitHub Pages immediat si
`MRCP_GITHUB_TOKEN` est configure (`history_entry.deploy_trigger` et
`deploy_triggered` dans la reponse indiquent si ça a marche). `POST
/restore-backup` fait la meme chose. Sans le token, tout fonctionne pareil
sauf que le deploiement attend le prochain creneau du planning (15 min).

L'API conserve aussi un filet de securite local :

- `GET /admin-status` retourne le diagnostic API, Git et fichiers critiques.
- `GET /admin-history` retourne les dernieres actions admin.
- `GET /admin-backups` liste les sauvegardes locales.
- `POST /restore-backup` restaure une sauvegarde, regenere `data_v2.json`,
  commit puis push.

Les sauvegardes sont creees dans `docs/backups/admin/` avant chaque application
ou restauration. Elles ne doivent pas etre suivies par Git.

## Checklist avant commit

```bash
py -m py_compile live_server.py docs/build_data_v2.py docs/admin_api.py docs/auto_check.py docs/speedhive_sync_linux.py docs/validate_dashboard_data.py docs/check_text_encoding.py
py -m pytest docs/tests
py docs/build_data_v2.py
py docs/validate_dashboard_data.py
py docs/check_text_encoding.py
git status --short
```

Verifier ensuite les pages principales en local, surtout apres modification de
`app_v2.js` / `app_v2_*.js`, `styles_v2.css`, `data_v2.json` ou des scripts
`mrcp_v*.js`.

## Decoupage de app_v2.js

`app_v2.js` etait un unique fichier de 2348 lignes (~150 fonctions), enveloppe
dans une IIFE (`(function(){...})()`). Il a ete decoupe en plusieurs fichiers
`app_v2_*.js`, chacun charge par un `<script>` classique dans `index_v2.html`
juste avant `app_v2.js` (qui ne garde que le routeur et le bootstrap).

Points importants pour continuer ce travail :

- Pas de modules ES ni de bundler : tous les fichiers partagent le meme scope
  global (comme `mrcp_v54_*.js`, `mrcp_v55_*.js`, `mrcp_v60_live.js`). C'est
  volontaire pour rester compatible avec le kiosque Raspberry Pi sans etape de
  build.
- L'IIFE d'origine a ete retiree : `DATA`, `state`, `lapsCache`, etc. sont
  maintenant de vraies variables globales (`var` au niveau racine d'un script
  classique = propriete de `window`). Ne pas les re-envelopper dans une IIFE
  sans adapter tous les fichiers `app_v2_*.js` en consequence.
- L'ordre de chargement dans `index_v2.html` compte : `app_v2.js` doit rester
  le **dernier** des scripts `app_v2_*`, car il appelle `init()` immediatement
  a la fin de son execution.
- Apres toute modification, tester en local (`py -m http.server 8000` dans
  `docs/`) et verifier la console navigateur sur au moins : accueil, pilotes,
  sessions, records-club, comparatif, club-today, live-timing, un profil
  pilote, et une page admin (verifier le refus d'acces sans token).

## Fichiers generes

Les logs et backups locaux ne doivent pas etre suivis par Git :

- `*.log`
- `docs/backups/`

Le dashboard public utilise `docs/data_v2.json`. Les copies de rapports et logs
peuvent rester sur le serveur, mais elles ne doivent plus bloquer les `git pull`.
