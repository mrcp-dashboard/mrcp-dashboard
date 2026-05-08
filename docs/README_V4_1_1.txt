V4.1.1 - Correctif Pilotes admin

Copie dans docs :
- app_v2.js
- styles_v2.css

Garde le reste de la V4.1.

Le menu Admin > Pilotes admin permet à nouveau :
- voir les transpondeurs détectés
- voir les noms observés
- saisir un nom officiel
- sauver localement
- exporter corrections.json
- importer/coller corrections.json

Après export :
1. Copier corrections.json dans docs/
2. python build_data_v2.py
3. git add docs
4. git commit -m "Maj corrections pilotes"
5. git push
