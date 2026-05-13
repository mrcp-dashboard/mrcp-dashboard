from pathlib import Path

p = Path("index_v2.html")
s = p.read_text(encoding="utf-8", errors="ignore")

# Ajoute une classe admin aux boutons/liens techniques si elle n'existe pas déjà
keywords = [
    "Health Check",
    "Maintenance",
    "Qualité",
    "Admin",
    "Intelligence",
    "update",
    "backup"
]

for kw in keywords:
    s = s.replace(f">{kw}<", f' data-admin="1">{kw}<')

if "MRCP INDEX ADMIN ONLY" not in s:
    s = s.replace("</body>", r'''
<script>
/* MRCP INDEX ADMIN ONLY */
(function(){
  const params = new URLSearchParams(window.location.search);
  const isAdmin = params.get("admin") === "1";

  if(isAdmin) return;

  document.querySelectorAll("[data-admin='1']").forEach(el=>{
    el.style.display = "none";
  });
})();
</script>
</body>''')

p.write_text(s, encoding="utf-8")
print("OK admin uniquement sur index_v2.html")
