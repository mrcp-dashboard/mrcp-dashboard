from pathlib import Path

p = Path("live_center.html")

s = p.read_text(encoding="utf-8", errors="ignore")

# -----------------------------------
# Ajoute data-admin aux boutons admin
# -----------------------------------

replacements = {
    'data-view="rating"': 'data-view="rating" data-admin="1"',
    'data-view="badges"': 'data-view="badges" data-admin="1"',
    'data-view="hall"': 'data-view="hall" data-admin="1"',
}

for old,new in replacements.items():
    s = s.replace(old,new)

# -----------------------------------
# Script admin mode
# -----------------------------------

if "MRCP ADMIN MODE" not in s:

    inject = r'''
<script>

/* MRCP ADMIN MODE */

(function(){

  const params =
    new URLSearchParams(window.location.search);

  const isAdmin =
    params.get("admin") === "1";

  if(isAdmin){
    console.log("MRCP admin mode");
    return;
  }

  document
    .querySelectorAll("[data-admin='1']")
    .forEach(el=>{
      el.style.display = "none";
    });

})();

</script>
'''

    s = s.replace("</body>", inject + "\n</body>")

p.write_text(s, encoding="utf-8")

print("OK Admin Mode V6.8 installé")
