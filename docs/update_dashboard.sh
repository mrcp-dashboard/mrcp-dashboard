#!/bin/bash
set -euo pipefail

PROJECT_ROOT="${MRCP_PROJECT_ROOT:-/opt/mrcp-dashboard}"

# notify_pilots.py a besoin de la configuration WAHA, mais ce script tourne
# depuis cron, qui n'hérite d'aucune variable d'environnement : sans ce
# fichier les rapports partiraient en mode simulation, sans rien envoyer.
# C'est le meme .env que celui du service admin (EnvironmentFile).
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  . "$PROJECT_ROOT/.env"
  set +a
fi

PROJECT_DIR="${MRCP_DOCS_DIR:-$PROJECT_ROOT/docs}"
PYTHON="${MRCP_PYTHON:-$PROJECT_ROOT/venv/bin/python}"
GIT_BRANCH="${MRCP_GIT_BRANCH:-main}"
# 20 etait trop juste : l'API trie par endTime decroissant, donc les sessions
# en cours remontent en tete, mais au-dela de ~20 pilotes en piste en meme
# temps certains sortaient de la fenetre et cessaient d'etre rafraichis
# (52 activites le 19/04/2026). Passer a 200 ne coute presque rien : les CSV
# deja telecharges sont ignores sans requete HTTP.
SPEEDHIVE_LIMIT="${MRCP_SPEEDHIVE_LIMIT:-200}"

echo "============================================================"
echo "MRCP DASHBOARD AUTO UPDATE - $(date)"
echo "============================================================"

if [ -f "$PROJECT_ROOT/venv/bin/activate" ]; then
  source "$PROJECT_ROOT/venv/bin/activate"
fi

cd "$PROJECT_ROOT"
echo "[0/6] Synchronisation Git"
git pull --rebase origin "$GIT_BRANCH"

cd "$PROJECT_DIR"
echo "[1/6] Synchronisation SpeedHive"
"$PYTHON" speedhive_sync_linux.py --limit "$SPEEDHIVE_LIMIT"

echo "[2/6] Generation data_v2.json"
"$PYTHON" build_data_v2.py

echo "[3/6] Validation data_v2.json"
"$PYTHON" validate_dashboard_data.py

cd "$PROJECT_ROOT"
echo "[4/6] Y a-t-il du nouveau a publier ?"
# data_v2.json change a chaque passage a cause de generated_at, meme quand
# personne n'a roule : sans ce filtre on commitait ~480 fois par jour pour
# rien (mesure du 20/08/2026 : 119 commits d'affilee sans aucune donnee
# nouvelle). Voir docs/tools/data_changed.py.
if "$PYTHON" "$PROJECT_DIR/tools/data_changed.py" --verbose; then
  echo "[5/6] Git commit / push"
  git add docs
  if git diff --cached --quiet; then
    echo "Aucun changement a publier"
  else
    git commit -m "Auto update dashboard $(date '+%Y-%m-%d %H:%M')"
    git pull --rebase origin "$GIT_BRANCH"
    git push origin "$GIT_BRANCH"
  fi
else
  echo "[5/6] Rien de neuf : commit ignore"
  # L'arbre doit rester propre, sinon le "git pull --rebase" du prochain
  # passage echouerait sur des modifications locales non commitees.
  git checkout -- docs/data_v2.json docs/speedhive_sync_meta.json 2>/dev/null || true
fi

# Apres le commit, et surtout a chaque passage : la fin d'un roulage se
# reconnait a l'absence de nouveaux tours, donc le script doit tourner meme
# quand la synchro n'a rien ramene. Il n'ecrit que des fichiers ignores par
# Git, l'arbre reste propre pour le prochain "git pull --rebase".
echo "[6/6] Rapports WhatsApp pilotes"
"$PYTHON" "$PROJECT_DIR/notify_pilots.py" || echo "ATTENTION: envoi des rapports en echec (la synchro, elle, est passee)"

echo "Termine"
