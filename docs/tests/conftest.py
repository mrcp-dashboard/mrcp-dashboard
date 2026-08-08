import sys
from pathlib import Path

# build_data_v2.py vit dans docs/, un niveau au-dessus de ce dossier de tests.
# On l'ajoute au sys.path pour pouvoir faire `import build_data_v2` quel que
# soit le repertoire depuis lequel pytest est lance.
DOCS_DIR = Path(__file__).resolve().parents[1]
if str(DOCS_DIR) not in sys.path:
    sys.path.insert(0, str(DOCS_DIR))
