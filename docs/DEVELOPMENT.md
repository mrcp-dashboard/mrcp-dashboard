# Notes de developpement MRCP Dashboard

## Deploiement GitHub Pages

`.github/workflows/pages.yml` deploie `docs/` sur GitHub Pages. Il se
declenche **sur chaque push** sur `main`, avec un planning (`schedule: cron`
toutes les 15 min) qui ne sert que de **filet de securite**.

Le LXC pousse un commit "Auto update dashboard" toutes les ~3 minutes et un
deploiement dure ~20 secondes : il n'y a aucun risque de chevauchement, et le
site public suit les donnees de pres.

### Panne du 12 au 16 aout 2026 (et fausse piste)

Pendant 5 jours, 100% des deploiements sont sortis en `cancelled` et le site
public est reste fige sur sa version du 11 aout 23:57, alors que les commits
Git continuaient d'arriver normalement.

La cause reelle etait **un deploiement bloque en etat `waiting`** (celui du
12 aout 14:30) cote API Deployments : la file etant coincee, chaque nouveau
run se faisait annuler en cascade. Le declenchement sur `push` n'y etait pour
rien - il fonctionnait sans probleme depuis le 24 mai.

Le passage temporaire a un cron seul a d'abord fait croire a une correction,
mais il a surtout degrade la fraicheur : **GitHub decale fortement les
workflows planifies**. Un cron `*/15` a livre en pratique ~32 min d'ecart
moyen, jusqu'a 42 min. D'ou le retour au declenchement sur push.

### Diagnostic si le site se fige a nouveau

```bash
gh run list --repo mrcp-dashboard/mrcp-dashboard --workflow="Deploy GitHub Pages" --limit 5
```

Une serie de `cancelled` = la file est probablement coincee. Chercher un
deploiement bloque, puis le forcer dans un etat terminal pour liberer la file :

```bash
gh api "repos/mrcp-dashboard/mrcp-dashboard/deployments?environment=github-pages&per_page=3" --jq '.[].id'
gh api "repos/mrcp-dashboard/mrcp-dashboard/deployments/<ID>/statuses" --jq '.[0].state'
gh api --method POST "repos/mrcp-dashboard/mrcp-dashboard/deployments/<ID>/statuses" -f state=error
```

Ne pas repasser sur un cron seul : ça masque le probleme et ralentit tout.

`docs/admin_api.py` peut declencher un deploiement immediat (`workflow_dispatch`)
juste apres un push de corrections admin, si `MRCP_GITHUB_TOKEN` est configure
(voir "Flux admin API" plus bas et README.md > Configuration). Ca ne concerne
que les corrections admin ; les commits automatiques du LXC declenchent deja
leur propre deploiement via le trigger `push`.

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

## Divisions de niveau et progression

Deux classements complementaires du classement au meilleur tour, tous deux
calcules cote front (aucune donnee supplementaire dans `data_v2.json`).

**Divisions** (`app_v2_divisions.js`, page `#/divisions`). Les pilotes d'une
piste sont repartis en trois poules de niveau par tiers egaux, pas par seuils
fixes : les poules restent equilibrees et suivent l'evolution du club. Deux
garde-fous :

- `DIVISION_MIN_LAPS = 10` tours sur la piste pour etre classe, sinon un tour
  de chance isole placerait un pilote en division A ;
- `DIVISION_MIN_PILOTS = 9` pilotes qualifies minimum pour former des poules.
  TT1/10 ne les atteint pas (3 pilotes qualifies contre 66 en TT1/8) : la page
  affiche alors un message explicite au lieu de poules d'un seul pilote.

**Progression** (`app_v2_laps.js`). Ecart entre le meilleur tour de la
premiere *journee* de roulage et le meilleur temps atteint depuis, par pilote
et par piste. On raisonne par journee et non par tour : un premier tour isole
(echauffement, sortie) fausserait le point de depart.

- fiche pilote : affiche des 2 journees, masque si le gain est nul ;
- podium club (page Records club) : `SEASON_PROGRESS_MIN_DAYS = 3`, plus
  exigeant car sur deux journees une premiere sortie sous la pluie suffirait a
  fabriquer une fausse grosse progression.

## Affiche club et rythme

`app_v2_poster.js` (`#/affiche`) produit une page pensee pour le papier :
records, podium de chaque division, meilleures series, plus grosses
progressions, plus un QR code vers le dashboard. **Reserve a l'admin** (c'est
lui qui imprime), lien dans le menu admin. A ne pas confondre avec "Resume
club" (`#/admin-summary`), egalement admin mais oriente diagnostic.

Le controle d'acces est fait a la main dans `posterPage()` plutot qu'avec
`adminOnly()` : cette fonction enveloppe le contenu dans une carte, ce qui
ajouterait un cadre et un titre parasites a l'impression.

Piege : `pilot_links_v53.js` parcourt tous les `td/th/div/span/p/li` de la
page et injecte un bouton "Profil" des qu'il reconnait un nom de pilote. Sur
l'affiche il en ajoutait 18. Ils sont neutralises par la seule regle
`.poster .pilot-profile-btn-v53{display:none}` : ne pas modifier
`pilot_links_v53.js` pour ca, d'autres pages dependent de son comportement.

`app_v2_rythme.js` (`#/rythme`) montre la frequentation par jour de semaine,
par heure et par mois. Les barres sont en HTML/CSS et non en SVG : responsive
et imprimable sans calcul de viewBox. La phrase de synthese est calculee sur
les donnees, pas ecrite en dur.

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
