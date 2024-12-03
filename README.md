# AutoPlayManager 🎬

Un gestionnaire intelligent de lecture automatique d'épisodes avec prise en charge du mode plein écran pour les sites de streaming.

## 🌟 Fonctionnalités

- ✨ Lecture automatique du prochain épisode
- 🖥️ Gestion intelligente du mode plein écran
- ⏱️ Notification avant la fin de l'épisode
- 💾 Persistance des préférences utilisateur
- 🔄 Reprise automatique après changement de page
- 🐛 Mode débogage intégré

## 🛠️ Configuration

```javascript
const config = {
    nextEpisodeButtonSelector: '.btn[title="épisode suivant"]',
    videoContainerSelector: '.rmp-container',
    videoPlayerSelector: '.rmp-video',
    fullscreenButtonSelector: '.rmp-fullscreen',
    playButtonSelector: '.rmp-play-pause',
    checkInterval: 1000,              // Intervalle de vérification en ms
    timeBeforeEndThreshold: 90,       // Temps en secondes avant la fin pour afficher la notification
    debugMode: false                  // Activer/désactiver les logs de débogage
};
```

## 📝 Utilisation

1. Incluez le script dans votre page :
```html
<script src="autoPlayManager.js"></script>
```

2. Le manager s'initialise automatiquement :
```javascript
const autoPlayManager = new AutoPlayManager();
autoPlayManager.init();
```

## 🔧 Fonctionnalités détaillées

### Notification de fin d'épisode
- Affiche une notification élégante 90 secondes avant la fin
- Options pour passer directement à l'épisode suivant ou attendre
- Compte à rebours intégré

### Gestion du plein écran
- Mémorise la préférence de l'utilisateur
- Prompt élégant pour la reprise en plein écran
- Transition fluide entre les épisodes

### Système de persistance
- Sauvegarde des préférences dans le localStorage
- Conservation du statut plein écran entre les épisodes
- Reprise automatique de la lecture

## 🎨 Personnalisation de l'interface

Le manager inclut des styles CSS personnalisables pour :
- La notification de fin d'épisode
- Le prompt de plein écran
- Les boutons et interactions

### Toast de fin d'épisode
```css
.next-episode-toast {
    position: absolute;
    bottom: 80px;
    right: 20px;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 20px;
    border-radius: 8px;
    z-index: 9999;
}
```

### Prompt de plein écran
Styles modernes avec :
- Design adaptif
- Animations fluides
- Thème sombre élégant
- Support des icônes SVG

## 🔍 Débogage

Pour activer le mode débogage :
1. Définissez `debugMode: true` dans la configuration
2. Les logs seront affichés dans la console avec horodatage
3. Format : `[AutoPlay ${timestamp}] ${message}`

## 🤝 Contribution

N'hésitez pas à :
- Signaler des bugs
- Proposer des améliorations
- Soumettre des pull requests
