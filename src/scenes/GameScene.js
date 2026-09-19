// Scène de jeu : le joueur se déplace case par case avec les flèches ou ZQSD,
// sur la carte Tiled chargée depuis src/assets/maps/map.json.
//
// Système de tour : chaque déplacement valide du joueur fait avancer le
// monde d'un tour (finDuTour()). Pour l'instant ça ne fait qu'incrémenter
// un compteur affiché à l'écran, mais c'est le point d'accroche où viendront
// se greffer le compte à rebours des pièges et le tour des ennemis.
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
var numeroTour = 0;
var texteTour;
var objectifs = {}; // clé "col,row" -> { x, y, colore }
var nbObjectifsRestants = 0;
var grapheObjectifs;
var COULEUR_OBJECTIF = 0xf5c445;

var pieges = {}; // clé "col,row" -> { x, y, compteur, effondre, texte }
var graphePieges;
var COMPTEUR_INITIAL = 3;
var COULEUR_PIEGE_ACTIF = 0xd9534f;
var COULEUR_TROU = 0x000000;

var joueurMort = false;
var toucheR;
var texteMort;

function preloadGame() {
  this.load.image('tileset', 'src/assets/tilesets/colored_tilemap_packed.png');
  this.load.image('player', 'src/assets/characters/player.png');
  this.load.tilemapTiledJSON('salle1', 'src/assets/maps/map.json');
}

function createGame() {
  sceneJeu = this;
  camera = this.cameras.main;

  // Remise à zéro de l'état : la scène peut être relancée (mort du joueur),
  // et ces variables sont globales au script donc elles survivraient sinon
  // d'une partie à l'autre.
  grilleX = 5;
  grilleY = 5;
  numeroTour = 0;
  enDeplacement = false;
  joueurMort = false;
  objectifs = {};
  nbObjectifsRestants = 0;
  grapheObjectifs = undefined;
  pieges = {};
  graphePieges = undefined;

  // La carte : calques "sol" (décor), "mur" (bloque le déplacement),
  // "objectifs" et "pieges" (données de gameplay, jamais affichés tels
  // quels — on dessine nos propres marqueurs par-dessus).
  carte = this.make.tilemap({ key: 'salle1' });
  var tileset = carte.addTilesetImage('colored_tilemap_packed', 'tileset');
  carte.createLayer('sol', tileset, 0, 0);
  calqueMur = carte.createLayer('mur', tileset, 0, 0);
  chargerObjectifs();
  chargerPieges();
  dessinerGrille();
  dessinerObjectifs();
  dessinerPieges();

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
  toucheR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

  // Le HUD est créé en dernier : la caméra dédiée (voir plus bas) capture
  // un instantané de "tout ce qui existe déjà" pour l'ignorer, donc tout
  // élément de jeu doit être créé AVANT ce bloc.
  creerHUD();
}

// Compteur de tour temporaire (fera partie du vrai HUD plus tard).
// La caméra de jeu est zoomée x4 : un texte fixé avec setScrollFactor(0) se
// retrouve mal placé/invisible dans ce cas (bug connu de Phaser avec zoom
// != 1). La solution fiable : une deuxième caméra dédiée au HUD, à zoom
// normal, qui ne voit que ce texte — la caméra de jeu l'ignore.
function creerHUD() {
  texteTour = sceneJeu.add.text(4, 4, 'Tour : 0', {
    fontSize: '16px',
    color: '#ffffff'
  });

  camera.ignore(texteTour);
  var camHUD = sceneJeu.cameras.add(0, 0, sceneJeu.scale.width, sceneJeu.scale.height);
  camHUD.ignore(sceneJeu.children.list.filter(function (objet) {
    return objet !== texteTour;
  }));
}

function updateGame() {
  if (joueurMort) {
    if (Phaser.Input.Keyboard.JustDown(toucheR)) {
      sceneJeu.scene.restart();
    }
    return;
  }

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
// Un déplacement refusé (mur) ne consomme pas de tour.
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
  verifierObjectif();
  verifierPiege();
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

// Une case est libre si elle est dans la carte, que le calque "mur" n'y a
// pas de tuile, et qu'elle n'est pas une tuile objectif déjà coloriée
// (redevient infranchissable une fois coloriée). Important de vérifier les
// limites : une case hors carte n'a pas de tuile non plus, donc sans ce
// test elle serait considérée "libre".
function caseLibre(col, row) {
  if (col < 0 || col >= carte.width || row < 0 || row >= carte.height) {
    return false;
  }
  var tuileMur = calqueMur.getTileAt(col, row);
  if (tuileMur !== null && tuileMur !== undefined) {
    return false;
  }
  var objectif = objectifs[col + ',' + row];
  if (objectif && objectif.colore) {
    return false;
  }
  return true;
}

// Lit le calque "objectifs" de la carte Tiled (s'il existe) : chaque case
// non vide y devient une tuile objectif à colorier. Le calque n'est jamais
// affiché tel quel — on dessine nos propres marqueurs (voir dessinerObjectifs)
// plutôt que de dépendre d'une tuile précise du tileset.
function chargerObjectifs() {
  var calque = carte.getLayer('objectifs');
  if (!calque) {
    return; // la carte n'a pas encore ce calque, rien à charger
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        objectifs[col + ',' + row] = { x: col, y: row, colore: false };
        nbObjectifsRestants++;
      }
    }
  }
}

// Redessine tous les marqueurs d'objectifs : un contour pour une tuile pas
// encore coloriée, un carré plein une fois coloriée.
function dessinerObjectifs() {
  if (!grapheObjectifs) {
    grapheObjectifs = sceneJeu.add.graphics();
  }
  grapheObjectifs.clear();

  for (var cle in objectifs) {
    var o = objectifs[cle];
    var px = o.x * TAILLE_TUILE;
    var py = o.y * TAILLE_TUILE;
    if (o.colore) {
      grapheObjectifs.fillStyle(COULEUR_OBJECTIF, 0.9);
      grapheObjectifs.fillRect(px + 1, py + 1, TAILLE_TUILE - 2, TAILLE_TUILE - 2);
    } else {
      grapheObjectifs.lineStyle(0.5, COULEUR_OBJECTIF, 0.7);
      grapheObjectifs.strokeRect(px + 1.5, py + 1.5, TAILLE_TUILE - 3, TAILLE_TUILE - 3);
    }
  }
}

// Si le joueur vient d'arriver sur une tuile objectif pas encore coloriée,
// on la colorie. Appelée juste après avoir posé le pied sur la case.
function verifierObjectif() {
  var objectif = objectifs[grilleX + ',' + grilleY];
  if (!objectif || objectif.colore) {
    return;
  }

  objectif.colore = true;
  nbObjectifsRestants--;
  dessinerObjectifs();

  if (nbObjectifsRestants === 0) {
    // Toutes les tuiles objectif sont coloriées : l'ouverture de la porte
    // de sortie viendra se brancher ici (prochaine étape du projet).
    console.log('Toutes les tuiles objectif sont coloriées !');
  }
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
      finDuTour();
      enDeplacement = false;
    }
  });
}

// Appelée une fois l'action du joueur terminée (l'animation de saut finie).
// C'est ici que viendront se brancher, dans cet ordre : le compte à rebours
// des tuiles-pièges "rocher", puis le tour de chaque ennemi.
function finDuTour() {
  if (joueurMort) {
    return;
  }

  numeroTour++;
  texteTour.setText('Tour : ' + numeroTour);
  decrementerPieges();
}

// Lit le calque "pieges" de la carte Tiled (s'il existe) : chaque case non
// vide devient un piège rocher, avec un compte à rebours et un texte
// affichant le nombre de tours restants avant effondrement.
function chargerPieges() {
  var calque = carte.getLayer('pieges');
  if (!calque) {
    return;
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        var texte = sceneJeu.add.text(
          col * TAILLE_TUILE + TAILLE_TUILE / 2,
          row * TAILLE_TUILE + TAILLE_TUILE / 2,
          String(COMPTEUR_INITIAL),
          { fontSize: '6px', color: '#ffffff' }
        ).setOrigin(0.5);

        pieges[col + ',' + row] = {
          x: col,
          y: row,
          compteur: COMPTEUR_INITIAL,
          effondre: false,
          texte: texte
        };
      }
    }
  }
}

// Redessine le fond de chaque piège : rouge/orangé tant qu'il n'est pas
// effondré, noir (trou) une fois effondré.
function dessinerPieges() {
  if (!graphePieges) {
    graphePieges = sceneJeu.add.graphics();
  }
  graphePieges.clear();

  for (var cle in pieges) {
    var p = pieges[cle];
    var px = p.x * TAILLE_TUILE;
    var py = p.y * TAILLE_TUILE;
    graphePieges.fillStyle(p.effondre ? COULEUR_TROU : COULEUR_PIEGE_ACTIF, p.effondre ? 1 : 0.5);
    graphePieges.fillRect(px, py, TAILLE_TUILE, TAILLE_TUILE);
  }
}

// Décrémente le compte à rebours de chaque piège pas encore effondré ; à 0,
// le piège devient un trou. Appelée à la fin de chaque tour.
function decrementerPieges() {
  var unPiegeVientDeSEffondrer = false;

  for (var cle in pieges) {
    var p = pieges[cle];
    if (p.effondre) {
      continue;
    }
    p.compteur--;
    if (p.compteur <= 0) {
      p.effondre = true;
      p.texte.setVisible(false);
      unPiegeVientDeSEffondrer = true;
    } else {
      p.texte.setText(String(p.compteur));
    }
  }

  if (unPiegeVientDeSEffondrer) {
    dessinerPieges();
    verifierPiege(); // le joueur peut se retrouver sur un trou qui vient d'apparaître sous lui
  }
}

// Si le joueur se trouve sur un trou (piège effondré), il meurt.
function verifierPiege() {
  var piege = pieges[grilleX + ',' + grilleY];
  if (piege && piege.effondre) {
    mourir();
  }
}

// Mort du joueur : bloque les entrées et affiche un message d'invite à
// recommencer. Pas encore de vrai écran de game over (viendra avec le HUD).
function mourir() {
  if (joueurMort) {
    return;
  }
  joueurMort = true;
  joueur.setTint(0xff0000);

  texteMort = sceneJeu.add.text(
    sceneJeu.scale.width / 2,
    sceneJeu.scale.height / 2,
    'Tu es mort\nAppuie sur R pour recommencer',
    { fontSize: '20px', color: '#ffffff', align: 'center' }
  ).setOrigin(0.5);
  camera.ignore(texteMort); // visible seulement via la caméra HUD (voir creerHUD)
}

var sceneGame = {
  key: 'Game',
  preload: preloadGame,
  create: createGame,
  update: updateGame
};
