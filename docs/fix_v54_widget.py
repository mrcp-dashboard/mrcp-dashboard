from pathlib import Path
import re

p = Path("mrcp_v54_widget.js")

if not p.exists():
    raise SystemExit("ERREUR: mrcp_v54_widget.js introuvable")

# Lecture tolérante
code = p.read_text(encoding="latin-1")

# Backup
Path("mrcp_v54_widget_BACKUP.js").write_text(
    code,
    encoding="latin-1"
)

# =====================================================
# Verrou global
# =====================================================

if "MRCP_V54_WIDGET_INSTALLED" not in code:

    code = code.replace(
        "(function () {",
        """(function () {

  if (window.MRCP_V54_WIDGET_INSTALLED) return;
  window.MRCP_V54_WIDGET_INSTALLED = true;""",
        1
    )

# =====================================================
# Anti doublon
# =====================================================

code = re.sub(
    r"async function buildV54Widget\(\)\s*\{",
    """async function buildV54Widget() {

    if (document.getElementById("mrcp-v54-widget")) {
      return;
    }""",
    code,
    count=1
)

# =====================================================
# startV54 propre
# =====================================================

code = re.sub(
    r"function startV54\(\)\s*\{[\s\S]*?\}",
    """function startV54() {
    setTimeout(buildV54Widget, 1500);
  }""",
    code,
    count=1
)

# =====================================================
# Sauvegarde
# =====================================================

p.write_text(code, encoding="latin-1")

print("OK : widget V5.4 corrigé")
print("Backup :", "mrcp_v54_widget_BACKUP.js")
