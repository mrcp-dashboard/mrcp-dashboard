# Raspberry Pi kiosque MRCP Live

Objectif : demarrer un Raspberry Pi Zero 2 W branche en HDMI sur un ecran de
podium, ouvrir automatiquement la page live TV MRCP en plein ecran, et garder la
sortie audio HDMI disponible pour la synthese vocale.

## Materiel conseille

- Raspberry Pi Zero 2 W
- Carte microSD 16 Go minimum
- Alimentation stable 5 V / 2,5 A
- Adaptateur mini-HDMI vers HDMI
- Ecran HDMI avec haut-parleurs si synthese vocale
- Clavier/souris uniquement pour la premiere configuration

## Image Raspberry

Choisir **Raspberry Pi OS avec interface graphique**. C'est le plus simple pour
Chromium en mode kiosque.

Dans Raspberry Pi Imager :

- Configurer le Wi-Fi du club
- Activer SSH
- Creer l'utilisateur, par exemple `mrcp`
- Mettre le fuseau horaire sur `Europe/Paris`

## Premiere connexion

Depuis un PC du reseau :

```bash
ssh mrcp@IP_DU_RASPBERRY
```

Mettre le systeme a jour :

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

Se reconnecter apres redemarrage.

## Installer Chromium et les outils kiosque

```bash
sudo apt update
sudo apt install -y chromium-browser unclutter x11-xserver-utils alsa-utils
```

Si `chromium-browser` n'existe pas sur l'image installee, essayer :

```bash
sudo apt install -y chromium unclutter x11-xserver-utils alsa-utils
```

## Tester l'acces au dashboard

Remplacer l'adresse si le serveur change :

```bash
curl -I http://192.168.1.2:8080/index_v2.html
```

La page kiosque silencieuse :

```text
http://192.168.1.2:8080/index_v2.html#/live-tv
```

La page kiosque avec synthese vocale :

```text
http://192.168.1.2:8080/index_v2.html#/live-tv?voice=1
```

## Page ultra legere Pi Zero 2 W

Le Pi Zero 2 W est limite pour Chromium avec le dashboard complet. Utiliser
la page noire dediee, sans librairie et sans l'application principale :

```text
http://192.168.1.2:8080/live_zero.html
```

Elle lit seulement :

```text
http://192.168.1.2:8080/live_decoder_state.json
```

Commande Chromium conseillee si le Pi Zero reste utilise :

```bash
/usr/lib/chromium/chromium \
  --kiosk \
  --start-fullscreen \
  --password-store=basic \
  --disable-gpu \
  --disable-gpu-compositing \
  --use-gl=swiftshader \
  --disable-accelerated-2d-canvas \
  --disable-dev-shm-usage \
  --no-first-run \
  --no-default-browser-check \
  http://192.168.1.2:8080/live_zero.html
```

## Script de demarrage kiosque

Creer le fichier :

```bash
nano /home/mrcp/mrcp-kiosk.sh
```

Contenu :

```bash
#!/usr/bin/env bash
set -e

URL="${MRCP_KIOSK_URL:-http://192.168.1.2:8080/index_v2.html#/live-tv?voice=1}"

xset s off || true
xset -dpms || true
xset s noblank || true
unclutter -idle 1 -root &

chromium-browser \
  --kiosk "$URL" \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000
```

Rendre le script executable :

```bash
chmod +x /home/mrcp/mrcp-kiosk.sh
```

Si la commande `chromium-browser` n'existe pas :

```bash
sed -i 's/chromium-browser/chromium/g' /home/mrcp/mrcp-kiosk.sh
```

## Lancement automatique

Creer le dossier d'autostart :

```bash
mkdir -p /home/mrcp/.config/lxsession/LXDE-pi
```

Creer le fichier :

```bash
nano /home/mrcp/.config/lxsession/LXDE-pi/autostart
```

Contenu :

```text
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@/home/mrcp/mrcp-kiosk.sh
```

Redemarrer :

```bash
sudo reboot
```
Au redemarrage, Chromium doit ouvrir directement la page live TV.

## Audio HDMI

Tester les sorties audio :

```bash
aplay -l
```

Ouvrir le mixeur :

```bash
alsamixer
```

Verifier que la sortie HDMI n'est pas en mute et monter le volume.

Selon l'image Raspberry, forcer la sortie audio HDMI peut se faire depuis :

```bash
sudo raspi-config
```

Puis :

```text
System Options > Audio > HDMI
```

Tester la synthese vocale directement dans Chromium avec l'URL :

```text
http://192.168.1.2:8080/index_v2.html#/live-tv?voice=1
```

Important : certains navigateurs bloquent l'audio tant que l'utilisateur n'a pas
clique une fois dans la page. Si cela arrive, cliquer une fois sur la page apres
le demarrage. On pourra ensuite ajouter un bouton discret "activer son" si
necessaire.

## Anti-veille ecran

Le script lance deja :

```bash
xset s off
xset -dpms
xset s noblank
```

Si l'ecran se met quand meme en veille, verifier aussi les reglages de l'ecran
physique. La prise connectee pourra couper l'ecran quand personne n'est au club.

## Diagnostic rapide

Tester que le Raspberry voit le serveur dashboard :

```bash
ping -c 3 192.168.1.2
curl -I http://192.168.1.2:8080/index_v2.html
curl http://192.168.1.2:8080/live_decoder_state.json
```

Verifier que la page live recoit bien les passages :

```bash
curl http://192.168.1.2:8080/live_decoder_state.json
```

Les champs utiles sont :

- `connected`
- `passings_count`
- `laps_count`
- `latest_passing`
- `ranking`

## Changer l'URL plus tard

Editer :

```bash
nano /home/mrcp/mrcp-kiosk.sh
```

Puis redemarrer :

```bash
sudo reboot
```
