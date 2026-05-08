# Installation V4.2 Admin API sur LXC

## 1. Copier les fichiers dans le LXC

Copie dans `/opt/mrcp-dashboard/docs` :
- `admin_api.py`
- `app_v2.js`
- `styles_v2.css`

Copie le service dans :
- `/etc/systemd/system/mrcp-admin-api.service`

## 2. Installer Flask

```bash
cd /opt/mrcp-dashboard
source venv/bin/activate
pip install flask flask-cors
```

## 3. Choisir un token secret

Édite le service :

```bash
nano /etc/systemd/system/mrcp-admin-api.service
```

Remplace :

```text
CHANGE_MOI_TOKEN_SECRET
```

par un vrai code secret, par exemple :

```text
mrcp-2026-super-secret
```

## 4. Démarrer le service

```bash
systemctl daemon-reload
systemctl enable mrcp-admin-api
systemctl start mrcp-admin-api
systemctl status mrcp-admin-api
```

## 5. Tester depuis le LXC

```bash
curl http://127.0.0.1:5055/health
```

## 6. Tester depuis le navigateur

Dans le dashboard :

```text
Admin → Admin
```

URL API :

```text
http://IP_DU_LXC:5055
```

Token : celui défini dans le service.

Clique :

```text
Appliquer corrections + Push GitHub
```

## Important sécurité

Cette API doit rester sur ton réseau local. Ne l’expose pas sur Internet sans reverse proxy HTTPS + authentification.
