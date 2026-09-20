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
var indicateurDirection;
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

var leviers = {}; // clé "col,row" -> { x, y, actif, sprite }

var portes = {}; // clé "col,row" -> { x, y, ouverte, sprite }

var toucheE, toucheF;

var PV_INITIAL = 3;
var pv = PV_INITIAL;
var textePV;
var camHUD;

// Direction où le joueur "regarde", mise à jour à chaque déplacement.
// Ne correspond à aucun sprite différent (pas de sprite de dos) — c'est une
// donnée purement logique qui sert à savoir où part le tir.
var direction = { x: 0, y: 1 }; // vers le bas par défaut

var toucheEspace;
var DUREE_TIR = 25; // ms par case parcourue par le projectile
var COULEUR_TIR = 0xffe066;

var ennemis = {}; // clé "col,row" -> { x, y, sprite }
var COULEUR_ENNEMI = 0x9b59b6;
var DEGAT_ENNEMI = 1;
var COULEUR_ATTAQUE_ENNEMI = 0xe74c3c;
var DUREE_ATTAQUE_ENNEMI = 120;

function preloadGame() {
  this.load.image('tileset', 'src/assets/tilesets/colored_tilemap_packed.png');
  this.load.image('player', 'src/assets/characters/player.png');
  this.load.image('levier_inactif', 'src/assets/props/levierROUG.png');
  this.load.image('levier_actif', 'src/assets/props/levierVERT.png');
  this.load.image('porte', 'src/assets/props/porte.png');
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
  pv = PV_INITIAL;
  direction = { x: 0, y: 1 };
  objectifs = {};
  nbObjectifsRestants = 0;
  grapheObjectifs = undefined;
  pieges = {};
  graphePieges = undefined;
  leviers = {};
  portes = {};
  ennemis = {};

  // La carte : calques "sol" (décor), "mur" (bloque le déplacement),
  // "objectifs", "pieges", "leviers" et "portes" (données de gameplay,
  // jamais affichés tels quels — on dessine nos propres marqueurs par-dessus).
  carte = this.make.tilemap({ key: 'salle1' });
  var tileset = carte.addTilesetImage('colored_tilemap_packed', 'tileset');
  carte.createLayer('sol', tileset, 0, 0);
  calqueMur = carte.createLayer('mur', tileset, 0, 0);
  chargerObjectifs();
  chargerPieges();
  chargerLeviers();
  chargerPortes();
  chargerEnnemis();
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

  // Petite flèche qui suit le joueur et pointe dans sa direction de visée —
  // le sprite ne change pas entre haut/bas (pas de sprite de dos), donc sans
  // ça impossible de savoir où partira le prochain tir.
  indicateurDirection = this.add.graphics();
  majIndicateurDirection();

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
  // E et F sont à la même position physique en AZERTY et QWERTY, pas besoin
  // du remapping qu'on fait pour Z/Q (voir plus haut).
  toucheE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  toucheF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
  toucheEspace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

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
  textePV = sceneJeu.add.text(4, 24, 'PV : ' + pv, {
    fontSize: '16px',
    color: '#ffffff'
  });

  var elementsHUD = [texteTour, textePV];
  elementsHUD.forEach(function (objet) {
    camera.ignore(objet);
  });
  camHUD = sceneJeu.cameras.add(0, 0, sceneJeu.scale.width, sceneJeu.scale.height);
  camHUD.ignore(sceneJeu.children.list.filter(function (objet) {
    return elementsHUD.indexOf(objet) === -1;
  }));
}

// À appeler pour tout objet créé PENDANT la partie (balle, futur ennemi...),
// après le démarrage du HUD. La caméra HUD fait un instantané une seule fois
// à sa création (voir creerHUD) : tout ce qui apparaît après lui échappe et
// se retrouve affiché en double, à ses coordonnées brutes — souvent tout
// près du texte du HUD, d'où l'effet "point bizarre à côté du score".
function masquerAuHUD(objet) {
  if (camHUD) {
    camHUD.ignore(objet);
  }
}

// Repositionne la petite flèche de visée contre le joueur, dans sa direction
// actuelle. Appelée à chaque frame : ça la fait suivre le joueur même
// pendant l'animation du petit saut, sans avoir à la relier à la main à
// chaque endroit où la position ou la direction changent.
function majIndicateurDirection() {
  // Petit décalage dans la direction visée : pile centré sur le joueur, la
  // flèche se confondait avec son sprite. Un léger décalage (sans aller
  // jusqu'au bord de la case) la sort juste assez du personnage pour rester
  // lisible, sans paraître détachée de lui.
  var DECALAGE = 7;
  var cx = joueur.x + direction.x * DECALAGE;
  var cy = joueur.y - TAILLE_TUILE / 2 + direction.y * DECALAGE; // le joueur est ancré par le bas
  var taille = 2;

  // Triangle dessiné à la main pour chaque direction plutôt que pivoté :
  // une forme pivotée par Phaser ne tourne pas forcément pile autour de son
  // centre visuel, ce qui donnait un petit décalage disgracieux au
  // changement de direction. Là, les 4 formes sont symétriques par
  // construction, centrées sur le même point.
  var points;
  if (direction.x === 1) {
    points = [cx - taille, cy - taille, cx - taille, cy + taille, cx + taille, cy];
  } else if (direction.x === -1) {
    points = [cx + taille, cy - taille, cx + taille, cy + taille, cx - taille, cy];
  } else if (direction.y === 1) {
    points = [cx - taille, cy - taille, cx + taille, cy - taille, cx, cy + taille];
  } else {
    points = [cx - taille, cy + taille, cx + taille, cy + taille, cx, cy - taille];
  }

  // Pas de contour : il accentuait l'effet "forme vectorielle" qui jure
  // avec le pixel art. Juste un aplat transparent, discret.
  indicateurDirection.clear();
  indicateurDirection.fillStyle(COULEUR_TIR, 0.45);
  indicateurDirection.fillTriangle(points[0], points[1], points[2], points[3], points[4], points[5]);
}

function updateGame() {
  majIndicateurDirection();

  if (joueurMort) {
    if (Phaser.Input.Keyboard.JustDown(toucheR)) {
      sceneJeu.scene.restart();
    }
    return;
  }

  if (enDeplacement) {
    return; // on attend la fin du petit saut avant d'accepter une nouvelle touche
  }

  // Shift + direction : se tourner sans se déplacer ni consommer de tour
  // (utile pour viser une case libre sans y marcher). Direction seule :
  // déplacement normal (qui tourne aussi le joueur au passage).
  var seTournerSeulement = clavier.shift.isDown;

  if (Phaser.Input.Keyboard.JustDown(clavier.up) || Phaser.Input.Keyboard.JustDown(zqsd.haut)) {
    seTournerSeulement ? seTourner(0, -1) : deplacer(0, -1);
  } else if (Phaser.Input.Keyboard.JustDown(clavier.down) || Phaser.Input.Keyboard.JustDown(zqsd.bas)) {
    seTournerSeulement ? seTourner(0, 1) : deplacer(0, 1);
  } else if (Phaser.Input.Keyboard.JustDown(clavier.left) || Phaser.Input.Keyboard.JustDown(zqsd.gauche)) {
    seTournerSeulement ? seTourner(-1, 0) : deplacer(-1, 0);
  } else if (Phaser.Input.Keyboard.JustDown(clavier.right) || Phaser.Input.Keyboard.JustDown(zqsd.droite)) {
    seTournerSeulement ? seTourner(1, 0) : deplacer(1, 0);
  } else if (Phaser.Input.Keyboard.JustDown(toucheE) || Phaser.Input.Keyboard.JustDown(toucheF)) {
    interagir();
  } else if (Phaser.Input.Keyboard.JustDown(toucheEspace)) {
    tirer();
  }
}

// Tourne le joueur dans une direction sans le déplacer ni consommer de
// tour — c'est cette direction que suivra le prochain tir.
function seTourner(dx, dy) {
  // Gauche/droite : on retourne le sprite plutôt que de dessiner un
  // deuxième dessin, le perso n'ayant pas de détail asymétrique.
  if (dx !== 0) {
    joueur.setFlipX(dx < 0);
  }
  direction = { x: dx, y: dy };
}

// Déplace le joueur d'une case, seulement si la case visée n'est pas un mur.
// Un déplacement refusé (mur) ne consomme pas de tour — mais le joueur se
// retourne quand même dans cette direction (gratuit), pour pouvoir viser un
// mur qu'il ne peut pas traverser sans avoir à en faire le tour pour s'y
// tourner face.
function deplacer(dx, dy) {
  seTourner(dx, dy);

  var nouvelleX = grilleX + dx;
  var nouvelleY = grilleY + dy;

  if (!caseLibre(nouvelleX, nouvelleY)) {
    return;
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
// pas de tuile, qu'elle n'est pas une tuile objectif déjà coloriée (redevient
// infranchissable une fois coloriée), qu'elle n'est pas une porte encore
// fermée, et qu'elle n'a pas de levier (un levier s'actionne depuis une case
// adjacente avec E/F, pas en marchant dessus). Important de vérifier les
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
  var porte = portes[col + ',' + row];
  if (porte && !porte.ouverte) {
    return false;
  }
  if (leviers[col + ',' + row]) {
    return false;
  }
  if (ennemis[col + ',' + row]) {
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
    ouvrirPortes(); // toutes les tuiles objectif coloriées : la sortie s'ouvre
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

// Appelée une fois l'action du joueur terminée (l'animation de saut finie,
// un tir, ou une interaction). Ordre du tour : le joueur a agi, les pièges
// décrémentent, puis chaque ennemi joue.
function finDuTour() {
  if (joueurMort) {
    return;
  }

  numeroTour++;
  texteTour.setText('Tour : ' + numeroTour);
  decrementerPieges();

  if (joueurMort) {
    return; // mort à cause d'un piège qui vient de s'effondrer sous lui
  }
  jouerTourEnnemis();
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

// Lit le calque "leviers" de la carte Tiled (s'il existe) : chaque case non
// vide devient un levier activable via E/F en étant adjacent. Sprite rouge
// tant qu'inactif, vert une fois actionné (voir interagir()).
function chargerLeviers() {
  var calque = carte.getLayer('leviers');
  if (!calque) {
    return;
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        var sprite = sceneJeu.add.image(
          col * TAILLE_TUILE + TAILLE_TUILE / 2,
          row * TAILLE_TUILE + TAILLE_TUILE / 2,
          'levier_inactif'
        );
        leviers[col + ',' + row] = { x: col, y: row, actif: false, sprite: sprite };
      }
    }
  }
}

// Lit le calque "portes" de la carte Tiled (s'il existe) : chaque case non
// vide devient une porte fermée par défaut, qui bloque le déplacement
// jusqu'à ce qu'un levier soit actionné ou que tous les objectifs le soient.
function chargerPortes() {
  var calque = carte.getLayer('portes');
  if (!calque) {
    return;
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        var sprite = sceneJeu.add.image(
          col * TAILLE_TUILE + TAILLE_TUILE / 2,
          row * TAILLE_TUILE + TAILLE_TUILE / 2,
          'porte'
        );
        portes[col + ',' + row] = { x: col, y: row, ouverte: false, sprite: sprite };
      }
    }
  }
}

// Ouvre toutes les portes de la salle (un seul circuit, pas de liaison
// levier <-> porte précise pour l'instant — suffisant tant qu'il n'y a
// qu'une salle et peu de portes). Une porte ouverte disparaît simplement :
// la case redevient du sol normal.
function ouvrirPortes() {
  for (var cle in portes) {
    var p = portes[cle];
    if (!p.ouverte) {
      p.ouverte = true;
      p.sprite.setVisible(false);
    }
  }
}

// Touche E/F : actionne le premier levier trouvé adjacent au joueur (haut,
// bas, gauche, droite). Coûte un tour, comme un déplacement.
function interagir() {
  var casesAdjacentes = [
    [grilleX, grilleY - 1],
    [grilleX, grilleY + 1],
    [grilleX - 1, grilleY],
    [grilleX + 1, grilleY]
  ];

  for (var i = 0; i < casesAdjacentes.length; i++) {
    var cle = casesAdjacentes[i][0] + ',' + casesAdjacentes[i][1];
    var levier = leviers[cle];
    if (levier && !levier.actif) {
      levier.actif = true;
      levier.sprite.setTexture('levier_actif');
      ouvrirPortes();
      finDuTour();
      return;
    }
  }
}

// Une case bloque un tir si elle est hors carte, contient un mur, ou une
// porte encore fermée. Contrairement au déplacement, un tir n'est pas
// bloqué par un levier ou une tuile objectif — le projectile passe dessus.
function caseBloquePourTir(col, row) {
  if (col < 0 || col >= carte.width || row < 0 || row >= carte.height) {
    return true;
  }
  var tuileMur = calqueMur.getTileAt(col, row);
  if (tuileMur !== null && tuileMur !== undefined) {
    return true;
  }
  var porte = portes[col + ',' + row];
  if (porte && !porte.ouverte) {
    return true;
  }
  return false;
}

// Touche Espace : tire en ligne droite dans la direction où le joueur
// regarde (sa dernière direction de déplacement). Le tir avance case par
// case jusqu'à un mur/porte fermée, un ennemi (qu'il tue), ou le bord de la
// carte. Coûte un tour.
function tirer() {
  var col = grilleX;
  var row = grilleY;
  var cibleEnnemi = null;

  while (true) {
    var prochainCol = col + direction.x;
    var prochainRow = row + direction.y;
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

  animerTir(col, row, cibleEnnemi);
}

// Anime un petit projectile qui voyage du joueur jusqu'à la case touchée,
// puis consomme un tour. La vitesse dépend de la distance parcourue (une
// case = DUREE_TIR ms) pour que le tir reste instantané visuellement même
// sur une longue portée, sans être un téléport brutal sur une courte.
// Si cibleEnnemi est renseigné, l'ennemi est détruit à l'impact.
function animerTir(colCible, rowCible, cibleEnnemi) {
  var xDepart = grilleX * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yDepart = grilleY * TAILLE_TUILE + TAILLE_TUILE / 2;
  var xArrivee = colCible * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yArrivee = rowCible * TAILLE_TUILE + TAILLE_TUILE / 2;
  var distance = Math.abs(colCible - grilleX) + Math.abs(rowCible - grilleY);

  var balle = sceneJeu.add.circle(xDepart, yDepart, 1, COULEUR_TIR);
  masquerAuHUD(balle);
  enDeplacement = true;

  sceneJeu.tweens.add({
    targets: balle,
    x: xArrivee,
    y: yArrivee,
    duration: Math.max(distance, 1) * DUREE_TIR,
    ease: 'Linear',
    onComplete: function () {
      balle.destroy();
      if (cibleEnnemi) {
        tuerEnnemi(cibleEnnemi);
      }
      finDuTour();
      enDeplacement = false;
    }
  });
}

// Retire des PV au joueur ; à 0, il meurt. Même mort que dans le trou, un
// seul système de game over pour les deux causes.
function subirDegat(quantite) {
  pv -= quantite;
  if (pv < 0) {
    pv = 0;
  }
  textePV.setText('PV : ' + pv);
  if (pv <= 0) {
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

// Lit le calque "ennemis" de la carte Tiled (s'il existe) : chaque case non
// vide devient un ennemi. Pas encore de sprite dédié — un simple cercle de
// couleur, comme les premiers marqueurs objectifs/pièges avant d'avoir de
// vrais sprites.
function chargerEnnemis() {
  var calque = carte.getLayer('ennemis');
  if (!calque) {
    return;
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        var sprite = sceneJeu.add.circle(
          col * TAILLE_TUILE + TAILLE_TUILE / 2,
          row * TAILLE_TUILE + TAILLE_TUILE / 2,
          TAILLE_TUILE / 2 - 1,
          COULEUR_ENNEMI
        );
        ennemis[col + ',' + row] = { x: col, y: row, sprite: sprite };
      }
    }
  }
}

// Anime une petite attaque (rouge, pour la distinguer du tir jaune du
// joueur) qui part de la case de l'ennemi vers le joueur, et ne lui inflige
// les dégâts qu'une fois arrivée — sans ça les PV baissaient sans qu'on
// voie jamais l'ennemi attaquer, ce qui donnait une impression de hasard.
function animerAttaqueEnnemi(colEnnemi, rowEnnemi) {
  var xDepart = colEnnemi * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yDepart = rowEnnemi * TAILLE_TUILE + TAILLE_TUILE / 2;
  var xArrivee = grilleX * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yArrivee = grilleY * TAILLE_TUILE + TAILLE_TUILE / 2;

  var projectile = sceneJeu.add.circle(xDepart, yDepart, 1.2, COULEUR_ATTAQUE_ENNEMI);
  masquerAuHUD(projectile);

  sceneJeu.tweens.add({
    targets: projectile,
    x: xArrivee,
    y: yArrivee,
    duration: DUREE_ATTAQUE_ENNEMI,
    ease: 'Linear',
    onComplete: function () {
      projectile.destroy();
      subirDegat(DEGAT_ENNEMI);
    }
  });
}

// Détruit un ennemi (touché par un tir du joueur).
function tuerEnnemi(cle) {
  var ennemi = ennemis[cle];
  if (!ennemi) {
    return;
  }
  ennemi.sprite.destroy();
  delete ennemis[cle];
}

// Vrai s'il n'y a ni mur ni porte fermée entre deux cases alignées (même
// ligne ou même colonne) — sert à savoir si un ennemi voit le joueur en
// ligne droite pour lui tirer dessus. Ne regarde pas les autres ennemis :
// simplification acceptable vu le nombre d'ennemis en jeu.
function ligneLibreEntre(col1, row1, col2, row2) {
  if (col1 === col2) {
    var pasRow = row2 > row1 ? 1 : -1;
    for (var r = row1 + pasRow; r !== row2; r += pasRow) {
      if (caseBloquePourTir(col1, r)) {
        return false;
      }
    }
    return true;
  }
  if (row1 === row2) {
    var pasCol = col2 > col1 ? 1 : -1;
    for (var c = col1 + pasCol; c !== col2; c += pasCol) {
      if (caseBloquePourTir(c, row1)) {
        return false;
      }
    }
    return true;
  }
  return false; // pas aligné
}

// Une case est libre pour un ennemi si elle est dans la carte, sans mur, ni
// porte fermée, ni autre ennemi. Le joueur n'est pas dans cette liste : un
// ennemi qui "marcherait" sur le joueur l'attaque plutôt (voir jouerTourEnnemis).
function caseLibrePourEnnemi(col, row) {
  if (col < 0 || col >= carte.width || row < 0 || row >= carte.height) {
    return false;
  }
  var tuileMur = calqueMur.getTileAt(col, row);
  if (tuileMur !== null && tuileMur !== undefined) {
    return false;
  }
  var porte = portes[col + ',' + row];
  if (porte && !porte.ouverte) {
    return false;
  }
  if (ennemis[col + ',' + row]) {
    return false;
  }
  return true;
}

// Fait jouer chaque ennemi une fois : s'il voit le joueur aligné avec lui
// (même ligne/colonne, sans obstacle entre les deux), il lui tire dessus ;
// sinon il avance d'une case vers lui (ou l'attaque au contact s'il est déjà
// adjacent). Appelée à la fin de chaque tour du joueur.
function jouerTourEnnemis() {
  for (var cle in ennemis) {
    var ennemi = ennemis[cle];

    var aligneMemeCol = ennemi.x === grilleX;
    var aligneMemeRow = ennemi.y === grilleY;
    if ((aligneMemeCol || aligneMemeRow) && ligneLibreEntre(ennemi.x, ennemi.y, grilleX, grilleY)) {
      animerAttaqueEnnemi(ennemi.x, ennemi.y);
      continue;
    }

    deplacerEnnemiVersJoueur(ennemi, cle);
  }
}

// Avance un ennemi d'une case vers le joueur (essaie d'abord l'axe où la
// distance est la plus grande). Si la case visée est celle du joueur,
// l'ennemi attaque au contact au lieu de s'y déplacer.
function deplacerEnnemiVersJoueur(ennemi, cle) {
  var dx = grilleX - ennemi.x;
  var dy = grilleY - ennemi.y;
  var tentatives = [];

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) tentatives.push([Math.sign(dx), 0]);
    if (dy !== 0) tentatives.push([0, Math.sign(dy)]);
  } else {
    if (dy !== 0) tentatives.push([0, Math.sign(dy)]);
    if (dx !== 0) tentatives.push([Math.sign(dx), 0]);
  }

  for (var i = 0; i < tentatives.length; i++) {
    var col = ennemi.x + tentatives[i][0];
    var row = ennemi.y + tentatives[i][1];

    if (col === grilleX && row === grilleY) {
      animerAttaqueEnnemi(ennemi.x, ennemi.y);
      return;
    }

    if (caseLibrePourEnnemi(col, row)) {
      delete ennemis[cle];
      ennemi.x = col;
      ennemi.y = row;
      ennemi.sprite.x = col * TAILLE_TUILE + TAILLE_TUILE / 2;
      ennemi.sprite.y = row * TAILLE_TUILE + TAILLE_TUILE / 2;
      ennemis[col + ',' + row] = ennemi;
      return;
    }
  }
  // Aucune des deux cases n'est libre : l'ennemi reste sur place ce tour.
}

var sceneGame = {
  key: 'Game',
  preload: preloadGame,
  create: createGame,
  update: updateGame
};
