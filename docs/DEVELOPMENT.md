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

Les ports et chemins peuvent etre surcharges avec :

- `MRCP_PROJECT_ROOT`
- `MRCP_DOCS_DIR`
- `MRCP_DATA_FILE`
- `MRCP_ADMIN_API_HOST`
- `MRCP_ADMIN_API_PORT`
- `MRCP_LIVE_HOST`
- `MRCP_LIVE_PORT`
- `MRCP_LIVE_CORS_ORIGINS`

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
