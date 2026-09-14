// Scène de jeu : le joueur se déplace case par case avec les flèches ou ZQSD,
// sur la carte Tiled chargée depuis src/assets/maps/map.json.
// Pas encore de système de tour (ça viendra ensuite).
var TAILLE_TUILE = 8;
var ZOOM = 4; // les tuiles font 8px, on zoome pour que ce soit jouable à l'écran

var joueur;
var grilleX = 5;
var grilleY = 5;
var clavier;
var zqsd;
var camera;
var carte;
var calqueMur;

function preloadGame() {
  this.load.image('tileset', 'src/assets/tilesets/colored_tilemap_packed.png');
  this.load.image('player', 'src/assets/characters/player.png');
  this.load.tilemapTiledJSON('salle1', 'src/assets/maps/map.json');
}

function createGame() {
  camera = this.cameras.main;

  // La carte : deux calques, "sol" (décor) et "mur" (bloque le déplacement).
  carte = this.make.tilemap({ key: 'salle1' });
  var tileset = carte.addTilesetImage('colored_tilemap_packed', 'tileset');
  carte.createLayer('sol', tileset, 0, 0);
  calqueMur = carte.createLayer('mur', tileset, 0, 0);

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

// Déplace le joueur d'une case, seulement si la case visée n'est pas un mur.
// Le système de tour (pièges, ennemis) viendra se greffer ici ensuite.
function deplacer(dx, dy) {
  var nouvelleX = grilleX + dx;
  var nouvelleY = grilleY + dy;

  if (!caseLibre(nouvelleX, nouvelleY)) {
    return;
  }

  grilleX = nouvelleX;
  grilleY = nouvelleY;
  majPositionJoueur();
}

// Une case est libre si elle est dans la carte et que le calque "mur" n'y a
// pas de tuile.
function caseLibre(col, row) {
  var tuileMur = calqueMur.getTileAt(col, row);
  return tuileMur === null || tuileMur === undefined;
}

function majPositionJoueur() {
  joueur.x = grilleX * TAILLE_TUILE + TAILLE_TUILE / 2;
  joueur.y = (grilleY + 1) * TAILLE_TUILE;
}

var sceneGame = {
  key: 'Game',
  preload: preloadGame,
  create: createGame,
  update: updateGame
};
