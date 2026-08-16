# CLAUDE.md

Instructions pour Claude Code sur ce depot. Details complets : [README.md](README.md)
et [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) - ce fichier ne fait que resumer ce qui
change la facon de travailler ici.

## Contexte

Dashboard web du Mini Racing Club Palois (chronos SpeedHive, profils pilotes, podiums,
live timing, admin). Le site public est un **front statique servi depuis `docs/` via
GitHub Pages** - HTML/CSS/JS classiques, **aucune etape de build, aucun bundler, aucun
module ES**. Ce qui est dans `docs/` est exactement ce qui est deploye.

Le deploiement GitHub Pages (`.github/workflows/pages.yml`) tourne sur un **planning
toutes les 15 minutes**, pas a chaque push (voir "Deploiement GitHub Pages" dans
docs/DEVELOPMENT.md pour le pourquoi). Un changement pousse sur `main` peut donc mettre
jusqu'a ~15 min a apparaitre sur le site public - normal, pas un bug.

## Workflow de travail

Le developpement se fait depuis un **clone Windows local** (ce PC). Claude commite et
pousse directement sur `main` (pas de PR dans ce workflow). En parallele, un **serveur
LXC** fait tourner la synchronisation SpeedHive : il modifie `docs/data_v2.json` et
d'autres fichiers, puis fait un `git pull --rebase` automatique et republie, en boucle,
**toutes les 3 minutes**, 24/7 ("Auto update dashboard").

**Ne jamais se connecter au LXC.** Si un diagnostic cote serveur est necessaire
(service admin API, decodeur live, etc.), donner les commandes a executer a
l'utilisateur plutot que d'essayer d'y acceder.

## Piege : le LXC pousse en continu

Le LXC push toutes les 3 minutes. Un `git push` qui echoue avec `[rejected] (fetch
first)` est normal, pas une erreur a contourner autrement.

**Toujours faire `git fetch` + `git rebase origin/main` juste avant de committer et
de pousser** (jamais `git pull` simple, jamais `merge`) :

```bash
git fetch origin
git rebase origin/main
git push origin main
```

Si `git push` est quand meme rejete (le LXC a pousse entre le rebase et le push),
refaire fetch + rebase + push - ne pas forcer (`--force`).

## Checklist avant commit (Windows)

Adaptee de docs/DEVELOPMENT.md : utiliser `py`, pas `python`.

```bash
py -m py_compile live_server.py docs/build_data_v2.py docs/admin_api.py docs/auto_check.py docs/speedhive_sync_linux.py docs/validate_dashboard_data.py docs/check_text_encoding.py
py -m pytest docs/tests
py docs/validate_dashboard_data.py
py docs/check_text_encoding.py
git status --short
```

Puis verifier au navigateur (`cd docs && py -m http.server 8000`) les pages
principales apres toute modification de `app_v2.js` / `app_v2_*.js`,
`styles_v2.css`, `data_v2.json` ou des scripts `mrcp_v*.js`.

## Pieges de app_v2.js

- **Pas de modules ES, pas de bundler.** `app_v2.js` et les fichiers `app_v2_*.js`
  (`app_v2_core.js`, `app_v2_admin_api.js`, `app_v2_laps.js`, `app_v2_pages_home.js`,
  `app_v2_pages_lists.js`, `app_v2_live.js`, `app_v2_admin_records.js`,
  `app_v2_admin_pilots.js`) sont des scripts classiques charges par des balises
  `<script>` dans `index_v2.html` et **partagent le meme scope global** (`var DATA`,
  `state`, `lapsCache`, etc. sont de vraies proprietes de `window`, pas de modules
  isoles). C'est volontaire, pour rester compatible avec le kiosque Raspberry Pi sans
  etape de build.
- **`app_v2.js` doit rester le dernier script charge** parmi les `app_v2_*.js` dans
  `index_v2.html` : il appelle `init()` immediatement a la fin de son execution, qui
  s'appuie sur toutes les fonctions/variables definies par les autres fichiers.
- Ne pas re-envelopper ces fichiers dans une IIFE sans adapter tous les autres en
  consequence (ca casserait le partage de scope global).

## Portee des commits

`git add docs` **seulement** pour les modifications du front/site (tout ce qui est
dans `docs/`). Si une modification touche un fichier **hors de `docs/`**
(`live_server.py`, `requirements.txt`, scripts a la racine, services systemd, etc.),
le signaler explicitement a l'utilisateur : ces fichiers ne sont pas deployes par
GitHub Pages, et un service devra etre redemarre manuellement sur le serveur pour
que le changement prenne effet.
