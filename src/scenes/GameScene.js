// Scène de jeu : le joueur se déplace case par case avec les flèches ou ZQSD.
// Pas encore de carte Tiled ni de système de tour (ça viendra ensuite) :
// pour l'instant on valide juste le déplacement en grille sur un fond vide.
var TAILLE_TUILE = 8;
var ZOOM = 4; // les tuiles font 8px, on zoome pour que ce soit jouable à l'écran

var joueur;
var grilleX = 5;
var grilleY = 5;
var clavier;
var zqsd;
var camera;

function preloadGame() {
  this.load.image('tileset', 'src/assets/tilesets/colored_tilemap_packed.png');
  this.load.image('player', 'src/assets/characters/player.png');
}

function createGame() {
  camera = this.cameras.main;
  camera.setZoom(ZOOM);

  // Le joueur est ancré par le bas (setOrigin(0.5, 1)) : son sprite fait
  // 8x10 alors que la grille est en 8x8, la tête dépasse au-dessus de sa case.
  joueur = this.add.sprite(0, 0, 'player');
  joueur.setOrigin(0.5, 1);
  majPositionJoueur();

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

// Déplace le joueur d'une case. Pour l'instant aucune limite/collision :
// ça viendra avec la carte Tiled (murs) et le système de tour.
function deplacer(dx, dy) {
  grilleX += dx;
  grilleY += dy;
  majPositionJoueur();
}

function majPositionJoueur() {
  joueur.x = grilleX * TAILLE_TUILE + TAILLE_TUILE / 2;
  joueur.y = (grilleY + 1) * TAILLE_TUILE;
  camera.centerOn(joueur.x, joueur.y);
}

var sceneGame = {
  key: 'Game',
  preload: preloadGame,
  create: createGame,
  update: updateGame
};
