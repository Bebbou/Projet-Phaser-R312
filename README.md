# Projet Phaser R312

Jeu de réflexion et d'action au tour par tour, réalisé avec Phaser 3 pour la ressource R312.

Auteur : Lino Volle

## 1. Présentation du jeu

Projet Phaser R312 est un jeu de réflexion et d'action au tour par tour, vu de dessus, réalisé avec Phaser 3 (version 3.80.1) en JavaScript, sans outil de build. On y dirige un ou deux petits personnages dans une suite de salles. Dans chaque salle, il faut ouvrir la porte (en coloriant toutes les cases dorées ou en actionnant le levier), éviter les pièges qui s'effondrent, éliminer les ennemis en tirant dessus, puis rejoindre la case verte de sortie. Les PV (3 au départ) sont partagés et conservés d'une salle à l'autre ; une mort ramène à la salle 1.

Le jeu est au tour par tour : chaque action d'un joueur (se déplacer, tirer, actionner un levier) fait avancer le monde d'un tour. À la fin de ce tour, les pièges décomptent et chaque ennemi joue. Deux éléments fonctionnent en revanche en temps réel avec des timers Phaser : les tourelles et les messages à l'écran.

Niveau : un tutoriel et quatre salles, toutes dessinées dans Tiled.

## 2. Lancer le jeu

IMPORTANT : ne pas ouvrir index.html par double-clic. Le navigateur bloque alors le chargement des cartes JSON et des sons (écran noir). Il faut servir le dossier avec un petit serveur local, puis ouvrir l'adresse dans le navigateur. Une connexion internet est nécessaire (Phaser est chargé depuis jsDelivr).

Le son démarre au premier clic sur un bouton du menu (les navigateurs interdisent l'audio avant une action de l'utilisateur). Trois façons de lancer le serveur :

- Avec VS Code : installer l'extension « Live Server », clic droit sur index.html puis « Open with Live Server ».
- Ou, avec Node.js, dans le dossier du projet : npx serve  (puis ouvrir l'adresse affichée).
- Ou, avec Python : python -m http.server 8000  (puis ouvrir http://localhost:8000).

## 3. Commandes

| Action | Joueur 1 | Joueur 2 |
|---|---|---|
| Se déplacer | Z Q S D (en solo : flèches aussi) | Flèches |
| Se tourner sans bouger | Maj + direction | Ctrl + direction |
| Tirer (dans la direction visée) | Espace | Entrée |
| Actionner un levier voisin | E ou F | P |
| Recommencer (mort ou victoire) | R | R |

La petite flèche jaune à côté de chaque personnage indique la direction dans laquelle partira son prochain tir. Se tourner (même contre un mur) ne coûte pas de tour.

## 4. Architecture du projet

```javascript
index.html            page : inclut Phaser puis les scripts
src/main.js           configuration Phaser (taille, pixelArt, liste des scènes)
src/scenes/BootScene.js   scène de démarrage, lance le menu
src/scenes/MenuScene.js   page daccueil : boutons 1 joueur / 2 joueurs
src/scenes/GameScene.js   toute la logique du jeu (déplacement, tour, tir, ennemis...)
src/assets/maps/      cartes Tiled : map0 (tutoriel), map, map2, map3, map4 (salles 1 à 4)
src/assets/tilesets/  tileset Kenney "Micro Roguelike" (tuiles 8x8)
src/assets/characters, props   sprites dessinés à la main (joueurs, ennemis, levier, porte)
src/assets/audio/     bruitages et musique (.wav) généré par Claude dooonnc
```

## 5. Les fonctionnalités

### 5.1 Création du jeu avec Phaser

index.html inclut Phaser puis les scènes et main.js ; main.js crée le jeu avec sa configuration. Les personnages sont des sprites Phaser affichés à l'écran et déplaçables.

La configuration indique la taille du canvas (800x600), le conteneur HTML, et pixelArt: true pour garder les pixels nets quand on zoome. Le tableau scene liste les scènes : la première (Boot) démarre automatiquement.

```javascript
var config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  scene: [sceneBoot, sceneMenu, sceneGame]
};
var game =new Phaser.Game(config);
```

### 5.2 Carte Tiled intégrée

Ce qui est fait : Cinq cartes (15x10 cases de 8 pixels) sont dessinées dans Tiled avec le tileset Kenney. Elles contiennent un calque de décor "sol", un calque "mur" qui bloque le déplacement, et des calques de données : objectifs, pieges, leviers, portes, ennemis, tourelles, sortie, depart.

Logique : Phaser charge le JSON Tiled (load.tilemapTiledJSON), puis on lie le tileset et on crée les deux calques visibles. Les calques de données ne sont jamais affichés : le code lit chaque case non vide et crée ses propres objets (sprite, marqueur...). Ajouter un ennemi ou un piège revient donc simplement à peindre une case dans Tiled. Un calque absent d'une carte est ignoré sans erreur.

```javascript
  carte = this.make.tilemap({ key: SALLES[indexSalle].cle });
  var tileset = carte.addTilesetImage('colored_tilemap_packed', 'tileset');
  carte.createLayer('sol', tileset, 0, 0);
  calqueMur = carte.createLayer('mur', tileset, 0, 0);
```

```javascript
function chargerDepart() {
  var calque = carte.getLayer('depart');
  if (!calque) {
    return;
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        departX = col;
        departY = row;
        return;
      }
    }
  }
}
```

### 5.3 Cibles et fonction de tir

Ce qui est fait : On tire avec Espace (joueur 1) ou Entrée (joueur 2) dans la direction visée. Les ennemis sont les cibles : un ennemi touché est supprimé. Les ennemis tirent aussi sur les joueurs, ce qui fait perdre des PV.

Logique : Le jeu est en grille : la trajectoire est calculée case par case jusqu'à un mur, une porte fermée, une tourelle ou un ennemi, puis un projectile est animé jusqu'à cette case. À l'arrivée, si une cible a été trouvée, elle est détruite. Il ne s'agit pas d'une collision physique Phaser (Arcade Physics) mais d'un test de collision sur la grille, plus simple et plus adapté à un jeu au tour par tour.

```javascript

function tirer(j) {
  var col = j.x;
  var row = j.y;
  var cibleEnnemi = null;

  while (true) {
    var prochainCol = col + j.direction.x;
    var prochainRow = row + j.direction.y;
    if (caseBloquePourTir(prochainCol, prochainRow)) {
      break;
    }
    col = prochainCol;
    row = prochainRow;
    if (ennemis[col + ',' + row]) {
      cibleEnnemi = col + ',' + row;
      break;
    }
  }

  jouerSon('tir');
  animerTir(j, col, row, cibleEnnemi);
}
```

```javascript
function tuerEnnemi(cle) {
  var ennemi = ennemis[cle];
  if (!ennemi) {
    return;
  }
  ennemi.sprite.destroy();
  delete ennemis[cle];
  jouerSon('ennemi_mort');
}
```

### 5.4 Niveaux et scènes

Ce qui est fait : Trois scènes distinctes : Boot (démarrage), Menu (accueil) et Game (jeu). Dans Game, un tutoriel et quatre salles s'enchaînent.

La liste SALLES associe un nom, une carte et un texte d'aide à chaque niveau. Quand tous les joueurs ont rejoint la case de sortie, la scène est relancée sur la salle suivante avec les PV conservés ; après la dernière salle, un écran de victoire s'affiche. Pour ajouter un niveau il suffit de dessiner une carte et d'ajouter une ligne à SALLES.

```javascript
var SALLES = [
  {
    cle: 'tuto', fichier: 'src/assets/maps/map0.json', nom: 'Tutoriel',
    aide: 'Colorie les cases dorées (ou actionne le levier) pour ouvrir la porte. Évite les cases rouges : elles s\'effondrent après 3 tours.\n' +
      'Tire sur l\'ennemi, puis amène tous les joueurs sur la case verte.'
  },
  { cle: 'salle1', fichier: 'src/assets/maps/map.json', nom: 'Salle 1' },
  { cle: 'salle2', fichier: 'src/assets/maps/map2.json', nom: 'Salle 2' },
  { cle: 'salle3', fichier: 'src/assets/maps/map3.json', nom: 'Salle 3' },
  { cle: 'salle4', fichier: 'src/assets/maps/map4.json', nom: 'Salle 4' }
];
```

```javascript

function verifierSortie(j) {

  if (joueurMort || !sortie || j.x !== sortie.x || j.y !== sortie.y) {
    return false;
  }
  j.sorti = true;

  for (var i = 0; i < joueurs.length; i++) {
    if (!joueurs[i].sorti) {
      return false;
    }
  }

  if (indexSalle + 1 < SALLES.length) {
    jouerSon('niveau');
    sceneJeu.scene.restart({ indexSalle: indexSalle + 1, conserverPV: true });
  } else {
    gagner();
  }
  return true;
}
```

Rôle dans le jeu : structure la progression du jeu.

### 5.5 Second joueur

Ce qui est fait : En choisissant « 2 joueurs » dans le menu, un deuxième personnage (sprite player2) apparaît à côté du premier. Il a ses propres touches (flèches, Entrée, Ctrl, P).

Logique : Chaque joueur est un objet { sprite, x, y, direction, touches, sorti }. La boucle update parcourt les joueurs : le premier qui effectue une action la joue, et c'est un tour pour tout le monde. Les joueurs se bloquent entre eux, ont chacun leur direction de visée, leur flèche et leur propre déplacement ; les PV et la sortie sont communs (tous doivent sortir). Les ennemis visent le joueur le plus proche.

```javascript
// Le joueur est ancré par le bas (setOrigin(0.5, 1)) : son sprite fait 8x10
// alors que la grille est en 8x8, la tête dépasse au-dessus de sa case. Créé
// après les calques pour s'afficher par-dessus. La petite flèche (indicateur)
// pointe dans sa direction de visée : le sprite ne change pas entre haut et
// bas, sans ça impossible de savoir où partira le prochain tir.
function creerJoueur(x, y, codesTouches, texture) {
  var sprite = sceneJeu.add.sprite(
    x * TAILLE_TUILE + TAILLE_TUILE / 2,
    (y + 1) * TAILLE_TUILE,
    texture
  ).setOrigin(0.5, 1);

  var touches = {};
  for (var nom in codesTouches) {
    touches[nom] = codesTouches[nom].map(function (code) {
      return sceneJeu.input.keyboard.addKey(code);
    });
  }

  return {
    sprite: sprite,
    indicateur: sceneJeu.add.graphics(),
    x: x,
    y: y,
    direction: { x: 0, y: 1 }, // vers le bas par défaut
    touches: touches,
    sorti: false
  };
}
```

```javascript
// Vrai si l'une des touches de la liste vient d'être enfoncée.
function touchePressee(liste) {
  for (var i = 0; i < liste.length; i++) {
    if (Phaser.Input.Keyboard.JustDown(liste[i])) {
      return true;
    }
  }
  return false;
}
```

```javascript
  // Une seule action par frame, tous joueurs confondus.
  for (var n = 0; n < joueurs.length; n++) {
    var j = joueurs[n];
    if (j.sorti) {
      continue;
    }
    var t = j.touches;

    var dx = 0;
    var dy = 0;
    if (touchePressee(t.haut)) {
      dy = -1;
    } else if (touchePressee(t.bas)) {
      dy = 1;
    } else if (touchePressee(t.gauche)) {
      dx = -1;
    } else if (touchePressee(t.droite)) {
      dx = 1;
    }

    if (dx !== 0 || dy !== 0) {
      // Touche "tourner" + direction : se tourner sans se déplacer ni
      // consommer de tour (utile pour viser une case libre sans y marcher).
      if (t.tourner[0].isDown) {
        seTourner(j, dx, dy);
      } else {
        deplacer(j, dx, dy);
      }
      return;
    }
    if (touchePressee(t.interagir)) {
      interagir(j);
      return;
    }
    if (touchePressee(t.tirer)) {
```

### 5.6 Son et bruitages

Ce qui est fait : Une musique de fond boucle pendant le jeu, et neuf bruitages sont déclenchés par les événements : tir, ouverture de porte, levier, objectif colorié, dégât, mort, ennemi tué, niveau validé, victoire.

Logique : Les fichiers .wav sont chargés dans preload (load.audio). La musique est créée une seule fois (le gestionnaire de sons est global au jeu, il survit au redémarrage de la scène) avec l'option loop. Un bruitage se joue avec sound.play(nom). Les sons ont été synthétisés avec un petit script (ondes carrées et sinus, style 8 bits).

```javascript
  var sons = ['tir', 'porte', 'levier', 'objectif', 'degat', 'mort', 'ennemi_mort', 'niveau', 'victoire', 'musique'];
  for (var s = 0; s < sons.length; s++) {
    this.load.audio(sons[s], 'src/assets/audio/' + sons[s] + '.wav');
  }
}
```

```javascript
// Joue un bruitage chargé dans preloadGame().
function jouerSon(nom) {
  sceneJeu.sound.play(nom);
}
```

```javascript
  if (!musique) {
    musique = sceneJeu.sound.add('musique', { loop: true, volume: 0.25 });
  }
  if (!musique.isPlaying) {
    musique.play();
  }
```

Rôle dans le jeu : donne un retour immédiat aux actions du joueur.

### 5.7 Page d'accueil

Ce qui est fait : Le menu affiche le titre et deux boutons cliquables, « 1 joueur » et « 2 joueurs ».

Logique : Chaque bouton est un texte rendu interactif (setInteractive). Au clic (événement pointerdown), on mémorise le nombre de joueurs dans une variable globale puis on lance la scène de jeu avec scene.start("Game").

```javascript
// Écran d'accueil : deux boutons texte cliquables pour choisir 1 ou 2 joueurs
// et lancer la partie.
function creerBoutonMenu(scene, x, y, texte, nbJoueurs) {
  var bouton = scene.add.text(x, y, texte, {
    fontSize: '24px',
    color: '#ffffff',
    backgroundColor: '#333333',
    padding: { x: 20, y: 10 }
  }).setOrigin(0.5);

  bouton.setInteractive({ useHandCursor: true });
  bouton.on('pointerdown', function () {
    nombreJoueurs = nbJoueurs; // variable globale lue par GameScene
    scene.scene.start('Game');
  });
  return bouton;
}
```

Rôle dans le jeu : point d'entrée du joueur, qui choisit le mode de jeu.

### 5.8 Collisions avec le bord du monde

Les joueurs ne peuvent pas quitter la carte, et les murs bloquent leur déplacement. En plus, un filet de sécurité replace un joueur au départ s'il se retrouvait hors de la carte. Le piège effondré tue le joueur qui marche dedans (même principe que la chute dans un trou).

Avant chaque déplacement, caseLibre() teste les limites de la carte, puis le calque de murs, puis les autres obstacles. Une case hors carte est donc toujours refusée. Comme le jeu est en grille, on bloque le mouvement plutôt que de détecter une sortie après coup. replacerSiHorsCarte() est appelée à chaque image pour garantir qu'aucun joueur ne reste hors limites quoi qu'il arrive.

```javascript
function caseLibre(col, row) {
  if (col < 0 || col >= carte.width || row < 0 || row >= carte.height) {
    return false;
  }
  var tuileMur = calqueMur.getTileAt(col, row);
  if (tuileMur !== null && tuileMur !== undefined) {
    return false;
  }
  var cle = col + ',' + row;
  var objectif = objectifs[cle];
  if (objectif && objectif.colore) {
    return false;
  }
  var porte = portes[cle];
  if (porte && !porte.ouverte) {
    return false;
  }
  if (leviers[cle] || tourelles[cle] || ennemis[cle]) {
    return false;
  }
  if (joueurSur(col, row)) {
    return false;
  }
  return true;
}
```

```javascript
function replacerSiHorsCarte(j) {
  if (j.x < 0 || j.x >= carte.width || j.y < 0 || j.y >= carte.height) {
    j.x = departX;
    j.y = departY;
    j.sprite.x = j.x * TAILLE_TUILE + TAILLE_TUILE / 2;
    j.sprite.y = (j.y + 1) * TAILLE_TUILE;
  }
}
```

Rôle dans le jeu : garde les personnages dans la salle.

### 5.9 Interaction avec la porte

Une porte bloque le passage. Elle s'ouvre quand on actionne un levier voisin (E / P) ou quand toutes les cases dorées sont coloriées. À l'ouverture : animation (la porte s'aplatit en devenant transparente), bruitage et message à l'écran.

interagir() cherche un levier dans les quatre cases voisines du joueur ; s'il est inactif, il passe au vert et on appelle ouvrirPortes(). Celle-ci marque les portes comme ouvertes (la case devient franchissable immédiatement) et lance un tween sur le sprite, plus un son et un message.

```javascript

function interagir(j) {
  var casesAdjacentes = [
    [j.x, j.y - 1],
    [j.x, j.y + 1],
    [j.x - 1, j.y],
    [j.x + 1, j.y]
  ];

  for (var i = 0; i < casesAdjacentes.length; i++) {
    var cle = casesAdjacentes[i][0] + ',' + casesAdjacentes[i][1];
    var levier = leviers[cle];
    if (levier && !levier.actif) {
      levier.actif = true;
      levier.sprite.setTexture('levier_actif');
      jouerSon('levier');
      ouvrirPortes();
      finDuTour();
      return;
    }
  }
}
```

```javascript
function ouvrirPortes() {
  var uneNouvelleOuverte = false;

  for (var cle in portes) {
    var p = portes[cle];
    if (!p.ouverte) {
      p.ouverte = true;
      uneNouvelleOuverte = true;
      sceneJeu.tweens.add({
        targets: p.sprite,
        alpha: 0,
        scaleY: 0.2,
        duration: DUREE_OUVERTURE_PORTE,
        onComplete: function (tween, cibles) {
          cibles[0].setVisible(false);
        }
      });
    }
  }

  if (uneNouvelleOuverte) {
    jouerSon('porte');
    afficherMessage('La porte s\'ouvre !');
  }
}
```


### 5.10 Timers

Timer récurrent : une tourelle (salles 3 et 4) tire toutes les 3 secondes, en temps réel, même si personne ne joue. Timers simples : la tourelle devient rouge 0,5 s avant de tirer (alerte), et le message « La porte s'ouvre ! » disparaît après 1,5 s.
Je doit l'avouer c'est juste pour avoir le maximum de point

time.addEvent avec loop: true déclenche alerteTourelles toutes les DELAI_TOURELLE ms. Chaque tourelle passe au rouge puis, grâce à time.delayedCall, tire une fois l'alerte écoulée sur un joueur aligné en ligne droite. Les timers appartiennent à la scène : ils disparaissent seuls quand elle est relancée.

```javascript
  sceneJeu.time.addEvent({
    delay: DELAI_TOURELLE,
    callback: alerteTourelles,
    loop: true
  });
```

```javascript
function alerteTourelles() {
  if (joueurMort || joueurAGagne) {
    return;
  }
  for (var cle in tourelles) {
    tirerTourelle(tourelles[cle]);
  }
}
```

```javascript
function tirerTourelle(t) {
  t.fond.setFillStyle(0xff0000);
  sceneJeu.time.delayedCall(DELAI_ALERTE, function () {
    t.fond.setFillStyle(COULEUR_TOURELLE);
    if (joueurMort || joueurAGagne) {
      return;
    }
    var cible = joueurAligne(t.x, t.y);
    if (cible) {
      animerAttaqueEnnemi(t.x, t.y, cible);
    }
  });
}
```

```javascript
function afficherMessage(texte) {
  var message = sceneJeu.add.text(sceneJeu.scale.width / 2, 110, texte, {
    fontSize: '18px',
    color: '#ffe066'
  }).setOrigin(0.5);
  camera.ignore(message); // visible seulement via la caméra HUD
  sceneJeu.time.delayedCall(DUREE_MESSAGE, function () {
    message.destroy();
  });
}
```

### 6 Les ennemis

À chaque tour, un ennemi qui voit un joueur en ligne droite lui tire dessus ; sinon il avance d'une case vers le joueur le plus proche (et l'attaque au contact). On parcourt une copie de la liste : un ennemi qui se déplace change de clé et ne doit pas rejouer dans le même tour.

```javascript
function jouerTourEnnemis() {
  var liste = Object.keys(ennemis).map(function (cle) {
    return ennemis[cle];
  });

  for (var i = 0; i < liste.length; i++) {
    var ennemi = liste[i];

    var vise = joueurAligne(ennemi.x, ennemi.y);
    if (vise) {
      animerAttaqueEnnemi(ennemi.x, ennemi.y, vise);
      continue;
    }

    var proche = joueurLePlusProche(ennemi.x, ennemi.y);
    if (proche) {
      deplacerEnnemiVersJoueur(ennemi, proche);
    }
  }
}
```

### 6.1 L'affichage (HUD)

La caméra de jeu est zoomée x4. Un texte fixé à l'écran y serait déformé, donc une seconde caméra (zoom 1) est dédiée à l'interface : la caméra de jeu ignore les éléments du HUD et inversement.

```javascript
// La caméra de jeu est zoomée x4
function creerHUD() {
  fondHUD = sceneJeu.add.rectangle(0, 0, 116, 76, 0x000000, 0.45).setOrigin(0, 0);
  texteHUD = sceneJeu.add.text(8, 6, '', {
    fontSize: '14px',
    color: '#ffffff',
    lineSpacing: 6
  });
  majTexteHUD();

  // Texte d'aide en bas de l'écran : rappel des commandes, précédé de
  // l'explication propre à la salle s'il y en a une.
  var aide = SALLES[indexSalle].aide ? SALLES[indexSalle].aide + '\n' : '';
  var commandes = nombreJoueurs === 2 ? AIDE_DUO : AIDE_SOLO;
  texteAide = sceneJeu.add.text(sceneJeu.scale.width / 2, sceneJeu.scale.height - 30, aide + commandes, {
    fontSize: '12px',
    color: '#cccccc',
    align: 'center',
    wordWrap: { width: 780 },
  // ... (suite dans le fichier)
}
```

Bisu ! 
Fait et créé par moi-même (Lino Volle). Cependant, afin d’aller évidemment plus vite, j’ai utilisé l’intelligence artificielle de manière intelligente ! Et même écologique :D
