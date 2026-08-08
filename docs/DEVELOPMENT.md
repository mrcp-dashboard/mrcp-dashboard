# Notes de developpement MRCP Dashboard

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
commit puis push.

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
`app_v2.js`, `styles_v2.css`, `data_v2.json` ou des scripts `mrcp_v*.js`.

## Fichiers generes

Les logs et backups locaux ne doivent pas etre suivis par Git :

- `*.log`
- `docs/backups/`

Le dashboard public utilise `docs/data_v2.json`. Les copies de rapports et logs
peuvent rester sur le serveur, mais elles ne doivent plus bloquer les `git pull`.
