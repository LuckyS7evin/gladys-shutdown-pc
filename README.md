# Shutdown PC — intégration Gladys Assistant

Intégration externe pour [Gladys Assistant](https://gladysassistant.com) qui
**éteint des ordinateurs Windows et Linux via SSH**, depuis un bouton du
tableau de bord, un widget dédié ou une scène.

📖 Documentation utilisateur : [français](docs/fr.md) · [English](docs/en.md)

## Fonctionnement

- Le **serveur SSH** est intégré à Windows 10/11 (OpenSSH Server) et standard
  sous Linux : rien à installer côté ordinateur, hormis l'activer.
- Chaque ordinateur ajouté devient un **appareil Gladys** avec un seul bouton
  (feature `button` / `push`) **Éteindre**.
- Commande lancée :
  - Windows : `shutdown /s /f /t 0` (`/f` désactivable) ;
  - Linux : `sudo -n systemctl poweroff` (`systemctl poweroff` pour `root`) ;
  - ou une commande personnalisée par ordinateur.
- Authentification par la **clé ed25519 générée par l'intégration** (la clé
  publique s'affiche dans l'écran de configuration) ou par **mot de passe**.
- **Clé d'hôte épinglée** à la première connexion (TOFU) : une machine qui
  usurperait l'adresse IP de l'ordinateur est refusée.

| Surface                 | Clé du manifeste    | Code                                     |
| ----------------------- | ------------------- | ---------------------------------------- |
| Bouton de l'appareil    | —                   | `onSetValue` dans [`index.js`](index.js) |
| Gestion des ordinateurs | `actions`           | [`src/actions.js`](src/actions.js)       |
| Action de scène         | `shutdown_computer` | [`src/scenes.js`](src/scenes.js)         |
| Widget                  | `shutdown_pc`       | [`src/widgets.js`](src/widgets.js)       |

Le `config_schema` d'une intégration est un formulaire plat, sans type liste.
Les ordinateurs sont donc gérés par les **actions** du manifeste (Ajouter /
Modifier / Tester, Afficher la clé publique) et stockés dans
`/data/computers.json`, le seul volume inscriptible du conteneur. Supprimer
l'appareil dans Gladys supprime l'ordinateur.

## Structure

```
index.js              câblage du SDK (aucune logique SSH)
src/service.js        service central : ajout, modification, test, extinction
src/computers.js      validation, appareil Gladys, commandes, messages d'erreur
src/ssh.js            client SSH (ssh2) : une commande, épinglage de la clé d'hôte
src/keys.js           paire de clés ed25519 de l'intégration (/data)
src/store.js          /data/computers.json (écriture atomique, 0600)
src/probe.js          test de joignabilité TCP (widget)
src/actions.js        actions de l'écran Configuration
src/scenes.js         action de scène
src/widgets.js        widget du tableau de bord
src/config.js         configuration (délai de connexion SSH)
docs/fr.md, docs/en.md documentation utilisateur (ré-hébergée par Gladys)
test/                 node --test, sans réseau
```

## Développement

```bash
npm install
npm test               # tests unitaires (node --test)
npm run lint           # ESLint
npm run format:check   # Prettier
npx github:GladysAssistant/integration-store .   # validation du store
```

Lancer en local contre un Gladys :

```bash
DATA_DIR=./data \
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="shutdown-pc" \
LOG_LEVEL=debug \
npm start
```

## Publier

1. Ajouter le topic GitHub `gladys-assistant-integration` au dépôt.
2. Décrire les changements sous `## [Unreleased]` dans
   [`CHANGELOG.md`](CHANGELOG.md).
3. **Actions → Release → Run workflow** (`patch`, `minor` ou `major`) : le
   workflow met à jour les versions, crée le tag, construit l'image
   multi-arch `ghcr.io/luckys7evin/gladys-shutdown-pc` et publie la release.
4. Rendre le paquet ghcr **public** (Packages → Package settings → Change
   visibility) pour que Gladys puisse le télécharger.

Basé sur le [template officiel](https://github.com/GladysAssistant/integration-template-js).

## Licence

Apache-2.0
