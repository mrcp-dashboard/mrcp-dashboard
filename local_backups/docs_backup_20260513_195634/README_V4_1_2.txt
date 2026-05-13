V4.1.2 - Correctif admin complet

Copie dans docs :
- app_v2.js
- styles_v2.css

Corrige :
- Admin > Pilotes admin :
  - champ texte visible pour associer une puce à un pilote
  - liste déroulante pilotes existants
  - bouton Associer
  - bouton Supprimer
  - export/import corrections.json

- Admin > Records admin :
  - Supprimer tour
  - Mettre TT1/10
  - Mettre TT1/8
  - Annuler
  - export/import lap_overrides.json

Après corrections :
1. Exporter corrections.json et/ou lap_overrides.json
2. Copier les fichiers dans docs/
3. python build_data_v2.py
4. git add docs
5. git commit -m "Maj corrections admin"
6. git pull --rebase
7. git push
