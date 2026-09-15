// Scène de jeu : le joueur se déplace case par case avec les flèches ou ZQSD,
// sur la carte Tiled chargée depuis src/assets/maps/map.json.
// Pas encore de système de tour (ça viendra ensuite).
var TAILLE_TUILE = 8;
var ZOOM = 4; // les tuiles font 8px, on zoome pour que ce soit jouable à l'écran
var SAUT_DUREE = 140; // ms, durée du petit saut entre deux cases
var SAUT_HAUTEUR = 3; // px, hauteur du rebond

var joueur;
var grilleX = 5;
var grilleY = 5;
var clavier;
var zqsd;
var camera;
var carte;
var calqueMur;
var sceneJeu; // référence à la scène, nécessaire pour lancer des tweens
var enDeplacement = false; // bloque les entrées pendant le petit saut

function preloadGame() {
  this.load.image('tileset', 'src/assets/tilesets/colored_tilemap_packed.png');
  this.load.image('player', 'src/assets/characters/player.png');
  this.load.tilemapTiledJSON('salle1', 'src/assets/maps/map.json');
}

function createGame() {
  sceneJeu = this;
  camera = this.cameras.main;

  // La carte : deux calques, "sol" (décor) et "mur" (bloque le déplacement).
  carte = this.make.tilemap({ key: 'salle1' });
  var tileset = carte.addTilesetImage('colored_tilemap_packed', 'tileset');
  carte.createLayer('sol', tileset, 0, 0);
  calqueMur = carte.createLayer('mur', tileset, 0, 0);
  dessinerGrille();

  camera.setZoom(ZOOM);
  // La salle est plus petite que l'écran (zoomée), donc on la centre une
  // bonne fois pour toutes plutôt que de suivre le joueur — ça évitera
  // aussi l'effet "collé en haut à gauche" que donnent des bounds ici.
  camera.centerOn(carte.widthInPixels / 2, carte.heightInPixels / 2);

  // Le joueur est ancré par le bas (setOrigin(0.5, 1)) : son sprite fait
  // 8x10 alors que la grille est en 8x8, la tête dépasse au-dessus de sa case.
  // Créé après les calques pour s'afficher par-dessus.
  joueur = this.add.sprite(0, 0, 'player');
  joueur.setOrigin(0.5, 1);
  joueur.x = grilleX * TAILLE_TUILE + TAILLE_TUILE / 2;
  joueur.y = (grilleY + 1) * TAILLE_TUILE;

  clavier = this.input.keyboard.createCursorKeys();

  // Le code clavier du navigateur correspond à la position physique de la
  // touche façon QWERTY, pas à la lettre affichée. Sur un clavier AZERTY,
  // la touche "Z" envoie donc le code de "W", et "Q" celui de "A" — c'est
  // pour ça qu'on mappe sur W/A/S/D même si le joueur tape Z/Q/S/D.
  zqsd = this.input.keyboard.addKeys({
    haut: Phaser.Input.Keyboard.KeyCodes.W,
    gauche: Phaser.Input.Keyboard.KeyCodes.A,
    bas: Phaser.Input.Keyboard.KeyCodes.S,
    droite: Phaser.Input.Keyboard.KeyCodes.D
  });
}

function updateGame() {
  if (enDeplacement) {
    return; // on attend la fin du petit saut avant d'accepter une nouvelle touche
  }

  if (Phaser.Input.Keyboard.JustDown(clavier.up) || Phaser.Input.Keyboard.JustDown(zqsd.haut)) {
    deplacer(0, -1);
  } else if (Phaser.Input.Keyboard.JustDown(clavier.down) || Phaser.Input.Keyboard.JustDown(zqsd.bas)) {
    deplacer(0, 1);
  } else if (Phaser.Input.Keyboard.JustDown(clavier.left) || Phaser.Input.Keyboard.JustDown(zqsd.gauche)) {
    deplacer(-1, 0);
  } else if (Phaser.Input.Keyboard.JustDown(clavier.right) || Phaser.Input.Keyboard.JustDown(zqsd.droite)) {
    deplacer(1, 0);
  }
}

// Déplace le joueur d'une case, seulement si la case visée n'est pas un mur.
// Le système de tour (pièges, ennemis) viendra se greffer ici ensuite.
function deplacer(dx, dy) {
  var nouvelleX = grilleX + dx;
  var nouvelleY = grilleY + dy;

  if (!caseLibre(nouvelleX, nouvelleY)) {
    return;
  }

  // Gauche/droite : on retourne le sprite plutôt que de dessiner un
  // deuxième dessin, le perso n'ayant pas de détail asymétrique.
  if (dx !== 0) {
    joueur.setFlipX(dx < 0);
  }

  grilleX = nouvelleX;
  grilleY = nouvelleY;
  animerDeplacement();
}

// Dessine un quadrillage discret par-dessus la carte pour bien faire sentir
// que le jeu se joue case par case (la tuile de sol est un aplat uni, sans
// ça on ne voit pas du tout les limites des cases).
function dessinerGrille() {
  var grille = sceneJeu.add.graphics();
  grille.lineStyle(0.5, 0xffffff, 0.06);

  for (var x = 0; x <= carte.widthInPixels; x += TAILLE_TUILE) {
    grille.lineBetween(x, 0, x, carte.heightInPixels);
  }
  for (var y = 0; y <= carte.heightInPixels; y += TAILLE_TUILE) {
    grille.lineBetween(0, y, carte.widthInPixels, y);
  }
}

// Une case est libre si elle est dans la carte et que le calque "mur" n'y a
// pas de tuile. Important de vérifier les limites : une case hors carte n'a
// pas de tuile non plus, donc sans ce test elle serait considérée "libre".
function caseLibre(col, row) {
  if (col < 0 || col >= carte.width || row < 0 || row >= carte.height) {
    return false;
  }
  var tuileMur = calqueMur.getTileAt(col, row);
  return tuileMur === null || tuileMur === undefined;
}

// Petit saut animé entre la case de départ et la case d'arrivée : la
// position x avance en ligne droite pendant que y dessine un arc (monte
// puis redescend), pour donner un mouvement plus vivant qu'un télétransport.
function animerDeplacement() {
  var yDepart = joueur.y;
  var xArrivee = grilleX * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yArrivee = (grilleY + 1) * TAILLE_TUILE;

  // Le pic du saut doit être au-dessus des DEUX positions (départ et
  // arrivée), sinon ça ne "monte" jamais quand on descend — ça glisse en
  // deux temps sans jamais décoller, d'où l'effet pas vraiment sauté.
  var yPic = Math.min(yDepart, yArrivee) - SAUT_HAUTEUR;

  enDeplacement = true;

  sceneJeu.tweens.add({
    targets: joueur,
    x: xArrivee,
    duration: SAUT_DUREE,
    ease: 'Linear'
  });

  sceneJeu.tweens.chain({
    targets: joueur,
    tweens: [
      { y: yPic, duration: SAUT_DUREE / 2, ease: 'Sine.easeOut' },
      { y: yArrivee, duration: SAUT_DUREE / 2, ease: 'Sine.easeIn' }
    ],
    onComplete: function () {
      enDeplacement = false;
    }
  });
}

var sceneGame = {
  key: 'Game',
  preload: preloadGame,
  create: createGame,
  update: updateGame
};
