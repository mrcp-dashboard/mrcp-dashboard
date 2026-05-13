from pathlib import Path

p = Path("index_v2.html")
s = p.read_text(encoding="utf-8", errors="ignore")

# Marque les liens techniques/admin existants
admin_keywords = [
    "Health Check",
    "TV Paddock",
    "Live Center V6",
    "TV Paddock V5.5",
    "Intelligence",
    "Admin",
    "Qualité",
    "Maintenance"
]

for kw in admin_keywords:
    s = s.replace(
        f">{kw}<",
        f' data-admin="1">{kw}<'
    )

# Ajoute le script qui masque si ?admin=1 absent
if "MRCP INDEX ADMIN MODE" not in s:
    s = s.replace("</body>", r'''
<script>
/* MRCP INDEX ADMIN MODE */
(function(){
  const params = new URLSearchParams(window.location.search);
  const isAdmin = params.get("admin") === "1";

  if(isAdmin){
    console.log("MRCP index admin mode");
    return;
  }

  document.querySelectorAll("[data-admin='1']").forEach(el=>{
    el.style.display = "none";
  });
})();
</script>
</body>''')

p.write_text(s, encoding="utf-8")
print("OK admin mode page principale installé")
