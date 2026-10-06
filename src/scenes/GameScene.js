// Scène de jeu : un ou deux joueurs se déplacent case par case à travers les
// salles Tiled listées dans SALLES (voir plus bas).
//
// Système de tour : chaque déplacement (ou tir, ou interaction) valide d'un
// joueur fait avancer le monde d'un tour (finDuTour()) — les pièges
// décomptent et les ennemis jouent à ce moment-là.
//
// Deux éléments fonctionnent en temps réel avec des timers Phaser : la
// tourelle (timer récurrent) et les messages à l'écran (timer simple).
var TAILLE_TUILE = 8;
var ZOOM = 4; // les tuiles font 8px, on zoome pour que ce soit jouable à l'écran
var SAUT_DUREE = 140; // ms, durée du petit saut entre deux cases
var SAUT_HAUTEUR = 3; // px, hauteur du rebond

// La liste des salles du niveau, dans l'ordre. Pour en ajouter une, il
// suffit d'ajouter une entrée ici et de dessiner la carte correspondante
// dans Tiled (mêmes noms de calques que les autres : sol, mur, objectifs,
// pieges, leviers, portes, ennemis, sortie, depart, et tourelles en option).
// nom : affiché dans le HUD. aide : texte d'explication affiché en bas
// (optionnel, utilisé par le tutoriel).
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
var PREMIERE_SALLE_JEU = 1; // après une mort on repart ici (le tutoriel n'est joué qu'une fois)
var indexSalle = 0;

var nombreJoueurs = 1; // choisi dans le menu (1 ou 2)
var AIDE_SOLO = 'Flèches / ZQSD : bouger   Maj + direction : se tourner   Espace : tirer   E / F : levier';
var AIDE_DUO = 'J1 : ZQSD, Maj (tourner), Espace (tirer), E (levier)   |   J2 : flèches, Ctrl (tourner), Entrée (tirer), P (levier)';
var texteAide;

// Un joueur = un objet { sprite, indicateur, x, y, direction, touches, sorti }
var joueurs = [];
var departX = 5;
var departY = 5;

var camera;
var carte;
var calqueMur;
var sceneJeu; // référence à la scène, nécessaire pour lancer des tweens et des timers
var enDeplacement = false; // bloque les entrées pendant une animation
var numeroTour = 0;

var objectifs = {}; // clé "col,row" -> { x, y, colore }
var nbObjectifsRestants = 0;
var grapheObjectifs;
var COULEUR_OBJECTIF = 0xf5c445;

var sortie; // { x, y } case de sortie de la salle courante, ou null si absente
var grapheSortie;
var COULEUR_SORTIE = 0x2ecc71;

var pieges = {}; // clé "col,row" -> { x, y, compteur, effondre, texte, fond }
var COMPTEUR_INITIAL = 3;
var COULEUR_PIEGE_ACTIF = 0xd9534f;
var COULEUR_TROU = 0x000000;
var DUREE_EFFONDREMENT = 220; // ms

var leviers = {}; // clé "col,row" -> { x, y, actif, sprite }
var portes = {}; // clé "col,row" -> { x, y, ouverte, sprite }
var DUREE_OUVERTURE_PORTE = 350; // ms

var tourelles = {}; // clé "col,row" -> { x, y, fond }
var DELAI_TOURELLE = 3000; // ms entre deux tirs (timer récurrent)
var DELAI_ALERTE = 500; // ms entre le clignotement d'alerte et le tir (timer simple)
var COULEUR_TOURELLE = 0xe67e22;

var joueurMort = false;
var joueurAGagne = false;
var toucheR;
var texteMort;
var texteVictoire;
var DUREE_MESSAGE = 1500; // ms

var PV_INITIAL = 3; // les PV sont partagés entre les joueurs
var pv = PV_INITIAL;
var camHUD;
var texteHUD; // un seul texte multi-lignes pour tout le HUD
var fondHUD; // rectangle semi-transparent derrière le texte, pour la lisibilité

var DUREE_TIR = 25; // ms par case parcourue par le projectile
var COULEUR_TIR = 0xffe066;

var ennemis = {}; // clé "col,row" -> { x, y, sprite }
var TEXTURES_ENNEMI = ['ennemi1', 'ennemi2'];
var DEGAT_ENNEMI = 1;
var COULEUR_ATTAQUE_ENNEMI = 0xe74c3c;
var DUREE_ATTAQUE_ENNEMI = 120;

var musique;

function preloadGame() {
  this.load.image('tileset', 'src/assets/tilesets/colored_tilemap_packed.png');
  this.load.image('player', 'src/assets/characters/player.png');
  this.load.image('player2', 'src/assets/characters/player2.png');
  this.load.image('levier_inactif', 'src/assets/props/levierROUG.png');
  this.load.image('levier_actif', 'src/assets/props/levierVERT.png');
  this.load.image('porte', 'src/assets/props/porte.png');
  this.load.image('ennemi1', 'src/assets/characters/enemie1.png');
  this.load.image('ennemi2', 'src/assets/characters/enemie2.png');
  for (var i = 0; i < SALLES.length; i++) {
    this.load.tilemapTiledJSON(SALLES[i].cle, SALLES[i].fichier);
  }

  var sons = ['tir', 'porte', 'levier', 'objectif', 'degat', 'mort', 'ennemi_mort', 'victoire', 'musique'];
  for (var s = 0; s < sons.length; s++) {
    this.load.audio(sons[s], 'src/assets/audio/' + sons[s] + '.wav');
  }
}

// data.indexSalle : quelle salle charger (absent = on repart de la salle 1).
// data.conserverPV : si vrai, on garde les PV actuels au lieu de les
// remettre au max — c'est le cas en passant à la salle suivante, mais pas
// en recommençant après une mort.
function createGame(data) {
  sceneJeu = this;
  camera = this.cameras.main;
  data = data || {};

  indexSalle = data.indexSalle !== undefined ? data.indexSalle : 0;

  // Remise à zéro de l'état : la scène peut être relancée (mort du joueur,
  // salle suivante), et ces variables sont globales au script donc elles
  // survivraient sinon d'une partie à l'autre.
  departX = 5;
  departY = 5;
  numeroTour = 0;
  enDeplacement = false;
  joueurMort = false;
  joueurAGagne = false;
  pv = data.conserverPV ? pv : PV_INITIAL;
  joueurs = [];
  objectifs = {};
  nbObjectifsRestants = 0;
  grapheObjectifs = undefined;
  pieges = {};
  leviers = {};
  portes = {};
  ennemis = {};
  tourelles = {};
  sortie = null;
  grapheSortie = undefined;

  // La carte : calques "sol" (décor), "mur" (bloque le déplacement), puis
  // les calques de gameplay (objectifs, pieges, leviers, portes, ennemis,
  // tourelles, sortie, depart) qu'on ne dessine jamais tels quels — on
  // dessine nos propres marqueurs par-dessus.
  carte = this.make.tilemap({ key: SALLES[indexSalle].cle });
  var tileset = carte.addTilesetImage('colored_tilemap_packed', 'tileset');
  carte.createLayer('sol', tileset, 0, 0);
  calqueMur = carte.createLayer('mur', tileset, 0, 0);
  chargerObjectifs();
  chargerPieges();
  chargerLeviers();
  chargerPortes();
  chargerEnnemis();
  chargerTourelles();
  chargerSortie();
  chargerDepart();
  dessinerGrille();
  dessinerObjectifs();
  dessinerSortie();

  camera.setZoom(ZOOM);
  // La salle est plus petite que l'écran (zoomée), donc on la centre une
  // bonne fois pour toutes plutôt que de suivre le joueur.
  camera.centerOn(carte.widthInPixels / 2, carte.heightInPixels / 2);

  creerJoueurs();

  // Timer récurrent : la tourelle tire toutes les DELAI_TOURELLE ms en
  // temps réel, même si personne ne joue de tour. Le timer appartient à la
  // scène : il disparaît tout seul quand la scène est relancée.
  sceneJeu.time.addEvent({
    delay: DELAI_TOURELLE,
    callback: alerteTourelles,
    loop: true
  });

  // Musique de fond : un seul objet son pour toute la partie (le gestionnaire
  // de sons est global au jeu, il survit au redémarrage de la scène).
  if (!musique) {
    musique = sceneJeu.sound.add('musique', { loop: true, volume: 0.25 });
  }
  if (!musique.isPlaying) {
    musique.play();
  }

  toucheR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

  // Le HUD est créé en dernier : la caméra dédiée (voir plus bas) capture
  // un instantané de "tout ce qui existe déjà" pour l'ignorer, donc tout
  // élément de jeu doit être créé AVANT ce bloc.
  creerHUD();
}

// Joue un bruitage chargé dans preloadGame().
function jouerSon(nom) {
  sceneJeu.sound.play(nom);
}

// Crée le(s) joueur(s) sur la case de départ. Le joueur 1 se déplace avec
// Z/Q/S/D (K.Z, K.Q...).
function creerJoueurs() {
  var K = Phaser.Input.Keyboard.KeyCodes;
  var touches1 = {
    haut: [K.Z], bas: [K.S], gauche: [K.Q], droite: [K.D],
    tirer: [K.SPACE], interagir: [K.E, K.F], tourner: [K.SHIFT]
  };
  if (nombreJoueurs === 1) {
    // En solo, les flèches marchent aussi.
    touches1.haut.push(K.UP);
    touches1.bas.push(K.DOWN);
    touches1.gauche.push(K.LEFT);
    touches1.droite.push(K.RIGHT);
  }
  joueurs.push(creerJoueur(departX, departY, touches1, 'player'));

  if (nombreJoueurs === 2) {
    var touches2 = {
      haut: [K.UP], bas: [K.DOWN], gauche: [K.LEFT], droite: [K.RIGHT],
      tirer: [K.ENTER], interagir: [K.P], tourner: [K.CTRL]
    };
    // Le joueur 2 apparaît sur la première case libre voisine du départ.
    var voisins = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]];
    var x2 = departX;
    var y2 = departY;
    for (var i = 0; i < voisins.length; i++) {
      if (caseLibre(departX + voisins[i][0], departY + voisins[i][1])) {
        x2 = departX + voisins[i][0];
        y2 = departY + voisins[i][1];
        break;
      }
    }
    joueurs.push(creerJoueur(x2, y2, touches2, 'player2'));
  }
}

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

// Vrai si l'une des touches de la liste vient d'être enfoncée.
function touchePressee(liste) {
  for (var i = 0; i < liste.length; i++) {
    if (Phaser.Input.Keyboard.JustDown(liste[i])) {
      return true;
    }
  }
  return false;
}

// Joueur présent sur une case (hors joueur déjà sorti), sinon null.
function joueurSur(col, row) {
  for (var i = 0; i < joueurs.length; i++) {
    if (!joueurs[i].sorti && joueurs[i].x === col && joueurs[i].y === row) {
      return joueurs[i];
    }
  }
  return null;
}

// La caméra de jeu est zoomée x4 : un texte fixé avec setScrollFactor(0) se
// retrouve mal placé/invisible dans ce cas (bug connu de Phaser avec zoom
// != 1). La solution fiable : une deuxième caméra dédiée au HUD, à zoom
// normal, qui ne voit que le panneau créé ici — la caméra de jeu l'ignore.
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
    lineSpacing: 3
  }).setOrigin(0.5, 1);

  var elementsHUD = [fondHUD, texteHUD, texteAide];
  elementsHUD.forEach(function (objet) {
    camera.ignore(objet);
  });
  camHUD = sceneJeu.cameras.add(0, 0, sceneJeu.scale.width, sceneJeu.scale.height);
  camHUD.ignore(sceneJeu.children.list.filter(function (objet) {
    return elementsHUD.indexOf(objet) === -1;
  }));
}

// Reconstruit le texte du panneau HUD à partir de l'état courant (PV,
// objectifs restants, tour). Appelée à chaque frame plutôt qu'à chaque
// changement individuel : plus simple, pas besoin de la rappeler à la main
// depuis chaque endroit du code qui modifie l'une de ces valeurs.
function majTexteHUD() {
  texteHUD.setText(
    SALLES[indexSalle].nom + '\n' +
    'PV : ' + pv + '\n' +
    'Objectifs : ' + nbObjectifsRestants + ' restant' + (nbObjectifsRestants !== 1 ? 's' : '') + '\n' +
    'Tour : ' + numeroTour
  );
}

// À appeler pour tout objet créé PENDANT la partie (balle, message...),
// après le démarrage du HUD. La caméra HUD fait un instantané une seule fois
// à sa création (voir creerHUD) : tout ce qui apparaît après lui échappe et
// se retrouve affiché en double, à ses coordonnées brutes.
function masquerAuHUD(objet) {
  if (camHUD) {
    camHUD.ignore(objet);
  }
}

// Affiche un court message au milieu de l'écran, puis le retire après
// DUREE_MESSAGE ms grâce à un timer simple (delayedCall).
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

// Repositionne la petite flèche de visée de chaque joueur contre lui, dans sa
// direction actuelle. Appelée à chaque frame : ça la fait suivre le joueur
// même pendant l'animation du petit saut.
function majIndicateurs() {
  // Petit décalage dans la direction visée : pile centré sur le joueur, la
  // flèche se confondait avec son sprite.
  var DECALAGE = 7;
  var taille = 2;

  for (var i = 0; i < joueurs.length; i++) {
    var j = joueurs[i];
    j.indicateur.clear();
    if (j.sorti) {
      continue;
    }
    var cx = j.sprite.x + j.direction.x * DECALAGE;
    var cy = j.sprite.y - TAILLE_TUILE / 2 + j.direction.y * DECALAGE; // ancré par le bas

    // Triangle dessiné à la main pour chaque direction plutôt que pivoté :
    // une forme pivotée par Phaser ne tourne pas forcément pile autour de son
    // centre visuel.
    var points;
    if (j.direction.x === 1) {
      points = [cx - taille, cy - taille, cx - taille, cy + taille, cx + taille, cy];
    } else if (j.direction.x === -1) {
      points = [cx + taille, cy - taille, cx + taille, cy + taille, cx - taille, cy];
    } else if (j.direction.y === 1) {
      points = [cx - taille, cy - taille, cx + taille, cy - taille, cx, cy + taille];
    } else {
      points = [cx - taille, cy + taille, cx + taille, cy + taille, cx, cy - taille];
    }

    // Pas de contour : il jurait avec le pixel art. Juste un aplat discret.
    j.indicateur.fillStyle(COULEUR_TIR, 0.45);
    j.indicateur.fillTriangle(points[0], points[1], points[2], points[3], points[4], points[5]);
  }
}

function updateGame() {
  majIndicateurs();
  majTexteHUD();

  // Mort ou victoire : entrées bloquées, seul R permet de recommencer une
  // partie complète depuis la salle 1 (ou le tutoriel si on y est). On passe
  // explicitement indexSalle et conserverPV — scene.restart() sans données
  // ne repart PAS à zéro : Phaser réutilise les dernières données passées.
  if (joueurMort || joueurAGagne) {
    if (Phaser.Input.Keyboard.JustDown(toucheR)) {
      var retour = indexSalle === 0 ? 0 : PREMIERE_SALLE_JEU;
      sceneJeu.scene.restart({ indexSalle: retour, conserverPV: false });
    }
    return;
  }

  for (var i = 0; i < joueurs.length; i++) {
    replacerSiHorsCarte(joueurs[i]);
  }

  if (enDeplacement) {
    return; // on attend la fin de l'animation avant d'accepter une nouvelle touche
  }

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
      tirer(j);
      return;
    }
  }
}

// Filet de sécurité "bord du monde" : si un joueur se retrouvait hors de la
// carte (ce que caseLibre() interdit déjà), on le replace au départ.
function replacerSiHorsCarte(j) {
  if (j.x < 0 || j.x >= carte.width || j.y < 0 || j.y >= carte.height) {
    j.x = departX;
    j.y = departY;
    j.sprite.x = j.x * TAILLE_TUILE + TAILLE_TUILE / 2;
    j.sprite.y = (j.y + 1) * TAILLE_TUILE;
  }
}

// Tourne le joueur dans une direction sans le déplacer ni consommer de
// tour — c'est cette direction que suivra son prochain tir.
function seTourner(j, dx, dy) {
  // Gauche/droite : on retourne le sprite plutôt que de dessiner un
  // deuxième dessin, le perso n'ayant pas de détail asymétrique.
  if (dx !== 0) {
    j.sprite.setFlipX(dx < 0);
  }
  j.direction = { x: dx, y: dy };
}

// Déplace le joueur d'une case, seulement si la case visée est libre. Un
// déplacement refusé ne consomme pas de tour — mais le joueur se retourne
// quand même dans cette direction (gratuit), pour pouvoir viser un mur sans
// avoir à en faire le tour.
function deplacer(j, dx, dy) {
  seTourner(j, dx, dy);

  var nouvelleX = j.x + dx;
  var nouvelleY = j.y + dy;

  if (!caseLibre(nouvelleX, nouvelleY)) {
    return;
  }

  j.x = nouvelleX;
  j.y = nouvelleY;
  verifierObjectif(j);
  verifierPiege(j);
  if (verifierSortie(j)) {
    return; // la salle change, inutile d'animer un déplacement dans l'ancienne
  }
  animerDeplacement(j);
}

// Dessine un quadrillage discret par-dessus la carte pour bien faire sentir
// que le jeu se joue case par case.
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
// infranchissable une fois coloriée), ni une porte encore fermée, ni un
// levier (il s'actionne depuis une case adjacente, pas en marchant dessus),
// ni une tourelle, et qu'aucun ennemi ni autre joueur ne s'y trouve.
// Important de vérifier les limites : une case hors carte n'a pas de tuile
// non plus, donc sans ce test elle serait considérée "libre".
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

// Lit le calque "objectifs" de la carte Tiled (s'il existe) : chaque case
// non vide y devient une tuile objectif à colorier.
function chargerObjectifs() {
  var calque = carte.getLayer('objectifs');
  if (!calque) {
    return; // la carte n'a pas ce calque, rien à charger
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
function verifierObjectif(j) {
  var objectif = objectifs[j.x + ',' + j.y];
  if (!objectif || objectif.colore) {
    return;
  }

  objectif.colore = true;
  nbObjectifsRestants--;
  dessinerObjectifs();
  jouerSon('objectif');

  if (nbObjectifsRestants === 0) {
    ouvrirPortes(); // toutes les tuiles objectif coloriées : la sortie s'ouvre
  }
}

// Petit saut animé entre la case de départ et la case d'arrivée : la
// position x avance en ligne droite pendant que y dessine un arc (monte
// puis redescend), pour donner un mouvement plus vivant qu'un télétransport.
function animerDeplacement(j) {
  var yDepart = j.sprite.y;
  var xArrivee = j.x * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yArrivee = (j.y + 1) * TAILLE_TUILE;

  // Le pic du saut doit être au-dessus des DEUX positions (départ et
  // arrivée), sinon ça ne "monte" jamais quand on descend.
  var yPic = Math.min(yDepart, yArrivee) - SAUT_HAUTEUR;

  enDeplacement = true;

  sceneJeu.tweens.add({
    targets: j.sprite,
    x: xArrivee,
    duration: SAUT_DUREE,
    ease: 'Linear'
  });

  sceneJeu.tweens.chain({
    targets: j.sprite,
    tweens: [
      { y: yPic, duration: SAUT_DUREE / 2, ease: 'Sine.easeOut' },
      { y: yArrivee, duration: SAUT_DUREE / 2, ease: 'Sine.easeIn' }
    ],
    onComplete: function () {
      if (j.sorti) {
        j.sprite.setVisible(false); // ce joueur a rejoint la sortie
      }
      finDuTour();
      enDeplacement = false;
    }
  });
}

// Appelée une fois l'action d'un joueur terminée (l'animation de saut finie,
// un tir, ou une interaction). Ordre du tour : le joueur a agi, les pièges
// décrémentent, puis chaque ennemi joue.
function finDuTour() {
  if (joueurMort) {
    return;
  }

  numeroTour++;
  decrementerPieges();

  if (joueurMort) {
    return; // mort à cause d'un piège qui vient de s'effondrer sous un joueur
  }
  jouerTourEnnemis();
}

// Lit le calque "pieges" de la carte Tiled (s'il existe) : chaque case non
// vide devient un piège rocher, avec un fond coloré, un compte à rebours et
// un texte affichant le nombre de tours restants avant effondrement.
function chargerPieges() {
  var calque = carte.getLayer('pieges');
  if (!calque) {
    return;
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        var cx = col * TAILLE_TUILE + TAILLE_TUILE / 2;
        var cy = row * TAILLE_TUILE + TAILLE_TUILE / 2;

        var fond = sceneJeu.add.rectangle(cx, cy, TAILLE_TUILE, TAILLE_TUILE, COULEUR_PIEGE_ACTIF, 0.5);

        // resolution : le texte est minuscule (6px) puis zoomé x4 par la
        // caméra — sans ça, les chiffres étaient flous une fois agrandis.
        var texte = sceneJeu.add.text(cx, cy, String(COMPTEUR_INITIAL), {
          fontSize: '6px',
          color: '#ffffff',
          resolution: ZOOM
        }).setOrigin(0.5);

        pieges[col + ',' + row] = {
          x: col,
          y: row,
          compteur: COMPTEUR_INITIAL,
          effondre: false,
          texte: texte,
          fond: fond
        };
      }
    }
  }
}

// Anime l'effondrement d'un piège : le fond rétrécit (comme si le sol
// s'enfonçait) puis devient un trou noir plein une fois "tombé".
function effondrerPiege(p) {
  p.effondre = true;
  p.texte.setVisible(false);

  sceneJeu.tweens.add({
    targets: p.fond,
    scaleX: 0.15,
    scaleY: 0.15,
    duration: DUREE_EFFONDREMENT,
    ease: 'Sine.easeIn',
    onComplete: function () {
      p.fond.setFillStyle(COULEUR_TROU, 1);
      p.fond.setScale(1);
    }
  });
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
      effondrerPiege(p);
      unPiegeVientDeSEffondrer = true;
    } else {
      p.texte.setText(String(p.compteur));
    }
  }

  if (unPiegeVientDeSEffondrer) {
    // un joueur peut se retrouver sur un trou qui vient d'apparaître sous lui
    for (var i = 0; i < joueurs.length; i++) {
      verifierPiege(joueurs[i]);
    }
  }
}

// Si le joueur se trouve sur un trou (piège effondré), il meurt.
function verifierPiege(j) {
  var piege = pieges[j.x + ',' + j.y];
  if (!j.sorti && piege && piege.effondre) {
    mourir();
  }
}

// Lit le calque "leviers" de la carte Tiled (s'il existe) : chaque case non
// vide devient un levier activable en étant adjacent. Sprite rouge tant
// qu'inactif, vert une fois actionné (voir interagir()).
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

// Ouvre toutes les portes de la salle. La case devient franchissable tout
// de suite, et la porte s'efface avec une petite animation (elle s'aplatit
// en devenant transparente) accompagnée d'un bruitage et d'un message.
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

// Lit le calque "tourelles" de la carte Tiled (s'il existe) : chaque case non
// vide devient une tourelle fixe, dessinée comme un carré orange. Elle tire
// en temps réel (voir alerteTourelles) et bloque déplacements et tirs.
function chargerTourelles() {
  var calque = carte.getLayer('tourelles');
  if (!calque) {
    return;
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        var fond = sceneJeu.add.rectangle(
          col * TAILLE_TUILE + TAILLE_TUILE / 2,
          row * TAILLE_TUILE + TAILLE_TUILE / 2,
          TAILLE_TUILE - 2,
          TAILLE_TUILE - 2,
          COULEUR_TOURELLE
        ).setStrokeStyle(0.5, 0x000000);
        tourelles[col + ',' + row] = { x: col, y: row, fond: fond };
      }
    }
  }
}

// Appelée toutes les DELAI_TOURELLE ms par le timer récurrent : chaque
// tourelle devient rouge pour prévenir, puis un timer simple (delayedCall)
// déclenche le tir DELAI_ALERTE ms plus tard.
function alerteTourelles() {
  if (joueurMort || joueurAGagne) {
    return;
  }
  for (var cle in tourelles) {
    tirerTourelle(tourelles[cle]);
  }
}

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

// Lit le calque "sortie" de la carte Tiled (optionnel) : au plus une case
// marque la sortie de la salle. Si le calque est absent ou vide, la salle
// n'a pas de sortie.
function chargerSortie() {
  var calque = carte.getLayer('sortie');
  if (!calque) {
    return;
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        sortie = { x: col, y: row };
        return;
      }
    }
  }
}

// Lit le calque "depart" de la carte Tiled (optionnel) : au plus une case
// marque le point d'apparition des joueurs dans cette salle. Absent, ils
// apparaissent sur la case par défaut (5,5).
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

// Dessine un marqueur vert sur la case de sortie (rien si la salle n'en a
// pas).
function dessinerSortie() {
  if (!grapheSortie) {
    grapheSortie = sceneJeu.add.graphics();
  }
  grapheSortie.clear();
  if (!sortie) {
    return;
  }
  var px = sortie.x * TAILLE_TUILE;
  var py = sortie.y * TAILLE_TUILE;
  grapheSortie.fillStyle(COULEUR_SORTIE, 0.55);
  grapheSortie.fillRect(px + 1, py + 1, TAILLE_TUILE - 2, TAILLE_TUILE - 2);
  grapheSortie.lineStyle(0.5, COULEUR_SORTIE, 0.9);
  grapheSortie.strokeRect(px + 1, py + 1, TAILLE_TUILE - 2, TAILLE_TUILE - 2);
}

// Si le joueur vient d'arriver sur la case de sortie, il est marqué "sorti"
// (son sprite disparaît à la fin de son saut). Quand TOUS les joueurs sont
// sortis, on passe à la salle suivante (les PV sont conservés), ou on
// termine le niveau si c'était la dernière. Retourne vrai si la salle est en
// train de changer.
function verifierSortie(j) {
  // joueurMort peut déjà être vrai ici si un piège vient de s'effondrer sous
  // le joueur sur cette même case : dans ce cas la mort prime.
  if (joueurMort || !sortie || j.x !== sortie.x || j.y !== sortie.y) {
    return false;
  }
  j.sorti = true;

  for (var i = 0; i < joueurs.length; i++) {
    if (!joueurs[i].sorti) {
      return false; // il reste un joueur à faire sortir
    }
  }

  if (indexSalle + 1 < SALLES.length) {
    sceneJeu.scene.restart({ indexSalle: indexSalle + 1, conserverPV: true });
  } else {
    gagner();
  }
  return true;
}

// Touche levier : actionne le premier levier trouvé adjacent au joueur
// (haut, bas, gauche, droite). Coûte un tour, comme un déplacement.
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

// Une case bloque un tir si elle est hors carte, contient un mur, une porte
// encore fermée ou une tourelle. Contrairement au déplacement, un tir n'est
// pas bloqué par un levier, une tuile objectif ou un joueur.
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
  if (tourelles[col + ',' + row]) {
    return true;
  }
  return false;
}

// Touche de tir : tire en ligne droite dans la direction où le joueur
// regarde. Le tir avance case par case jusqu'à un mur/porte fermée, un
// ennemi (qu'il tue), ou le bord de la carte. Coûte un tour.
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

// Anime un petit projectile qui voyage du joueur jusqu'à la case touchée,
// puis consomme un tour. La vitesse dépend de la distance parcourue (une
// case = DUREE_TIR ms). Si cibleEnnemi est renseigné, l'ennemi est détruit à
// l'impact.
function animerTir(j, colCible, rowCible, cibleEnnemi) {
  var xDepart = j.x * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yDepart = j.y * TAILLE_TUILE + TAILLE_TUILE / 2;
  var xArrivee = colCible * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yArrivee = rowCible * TAILLE_TUILE + TAILLE_TUILE / 2;
  var distance = Math.abs(colCible - j.x) + Math.abs(rowCible - j.y);

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

// Retire des PV (partagés) ; à 0, les joueurs meurent. Même mort que dans
// le trou, un seul système de game over pour les deux causes.
function subirDegat(quantite) {
  if (joueurMort) {
    return;
  }
  pv -= quantite;
  if (pv < 0) {
    pv = 0;
  }
  if (pv <= 0) {
    mourir();
  } else {
    jouerSon('degat');
  }
}

// Mort : bloque les entrées et affiche un message d'invite à recommencer
// (voir updateGame, qui relance la scène quand joueurMort est vrai).
function mourir() {
  if (joueurMort) {
    return;
  }
  joueurMort = true;
  jouerSon('mort');
  for (var i = 0; i < joueurs.length; i++) {
    joueurs[i].sprite.setTint(0xff0000);
  }

  texteMort = sceneJeu.add.text(
    sceneJeu.scale.width / 2,
    sceneJeu.scale.height / 2,
    'Tu es mort\nAppuie sur R pour recommencer',
    { fontSize: '20px', color: '#ffffff', align: 'center' }
  ).setOrigin(0.5);
  camera.ignore(texteMort); // visible seulement via la caméra HUD (voir creerHUD)
}

// Victoire : les joueurs ont atteint la sortie de la dernière salle. Même
// principe que mourir() (entrées bloquées, R pour recommencer).
function gagner() {
  joueurAGagne = true;
  jouerSon('victoire');

  texteVictoire = sceneJeu.add.text(
    sceneJeu.scale.width / 2,
    sceneJeu.scale.height / 2,
    'Bravo, niveau terminé !\nAppuie sur R pour recommencer',
    { fontSize: '20px', color: '#ffffff', align: 'center' }
  ).setOrigin(0.5);
  camera.ignore(texteVictoire);
}

// Lit le calque "ennemis" de la carte Tiled (s'il existe) : chaque case non
// vide devient un ennemi. Sprite tiré au hasard entre les variantes
// disponibles, juste pour un peu de diversité visuelle — les deux se
// comportent exactement pareil.
function chargerEnnemis() {
  var calque = carte.getLayer('ennemis');
  if (!calque) {
    return;
  }
  for (var row = 0; row < carte.height; row++) {
    for (var col = 0; col < carte.width; col++) {
      var tuile = calque.data[row][col];
      if (tuile && tuile.index !== -1) {
        var texture = TEXTURES_ENNEMI[Math.floor(Math.random() * TEXTURES_ENNEMI.length)];
        // Même ancrage que le joueur (8x10, ancré par le bas).
        var sprite = sceneJeu.add.sprite(
          col * TAILLE_TUILE + TAILLE_TUILE / 2,
          (row + 1) * TAILLE_TUILE,
          texture
        ).setOrigin(0.5, 1);
        ennemis[col + ',' + row] = { x: col, y: row, sprite: sprite };
      }
    }
  }
}

// Anime une petite attaque (rouge, pour la distinguer du tir jaune des
// joueurs) qui part de la case de l'attaquant (ennemi ou tourelle) vers le
// joueur visé, et ne lui inflige les dégâts qu'une fois arrivée.
function animerAttaqueEnnemi(colSource, rowSource, cible) {
  var xDepart = colSource * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yDepart = rowSource * TAILLE_TUILE + TAILLE_TUILE / 2;
  var xArrivee = cible.x * TAILLE_TUILE + TAILLE_TUILE / 2;
  var yArrivee = cible.y * TAILLE_TUILE + TAILLE_TUILE / 2;

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

// Détruit un ennemi (touché par un tir d'un joueur).
function tuerEnnemi(cle) {
  var ennemi = ennemis[cle];
  if (!ennemi) {
    return;
  }
  ennemi.sprite.destroy();
  delete ennemis[cle];
  jouerSon('ennemi_mort');
}

// Vrai s'il n'y a ni mur ni porte fermée entre deux cases alignées (même
// ligne ou même colonne) — sert à savoir si un ennemi voit un joueur en
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

// Premier joueur (pas encore sorti) aligné avec la case donnée et visible en
// ligne droite, sinon null.
function joueurAligne(col, row) {
  for (var i = 0; i < joueurs.length; i++) {
    var j = joueurs[i];
    if (!j.sorti && (j.x === col || j.y === row) && ligneLibreEntre(col, row, j.x, j.y)) {
      return j;
    }
  }
  return null;
}

// Joueur (pas encore sorti) le plus proche d'une case, sinon null.
function joueurLePlusProche(col, row) {
  var meilleur = null;
  var distanceMin = 9999;
  for (var i = 0; i < joueurs.length; i++) {
    var j = joueurs[i];
    var distance = Math.abs(j.x - col) + Math.abs(j.y - row);
    if (!j.sorti && distance < distanceMin) {
      distanceMin = distance;
      meilleur = j;
    }
  }
  return meilleur;
}

// Une case est libre pour un ennemi si elle est dans la carte, sans mur, ni
// porte fermée, ni tourelle, ni autre ennemi. Les joueurs ne sont pas dans
// cette liste : un ennemi qui "marcherait" sur un joueur l'attaque plutôt.
function caseLibrePourEnnemi(col, row) {
  if (col < 0 || col >= carte.width || row < 0 || row >= carte.height) {
    return false;
  }
  var tuileMur = calqueMur.getTileAt(col, row);
  if (tuileMur !== null && tuileMur !== undefined) {
    return false;
  }
  var cle = col + ',' + row;
  var porte = portes[cle];
  if (porte && !porte.ouverte) {
    return false;
  }
  if (tourelles[cle] || ennemis[cle]) {
    return false;
  }
  return true;
}

// Fait jouer chaque ennemi une fois : s'il voit un joueur aligné avec lui
// (même ligne/colonne, sans obstacle entre les deux), il lui tire dessus ;
// sinon il avance d'une case vers le joueur le plus proche (ou l'attaque au
// contact s'il est déjà adjacent). Appelée à la fin de chaque tour. On
// parcourt une copie de la liste : un ennemi qui se déplace change de clé
// dans "ennemis", et il ne doit pas rejouer dans le même tour.
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

// Avance un ennemi d'une case vers le joueur visé (essaie d'abord l'axe où
// la distance est la plus grande). Si la case visée est occupée par un
// joueur, l'ennemi l'attaque au contact au lieu de s'y déplacer.
function deplacerEnnemiVersJoueur(ennemi, cible) {
  var dx = cible.x - ennemi.x;
  var dy = cible.y - ennemi.y;
  var tentatives = [];

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) tentatives.push([Math.sign(dx), 0]);
    if (dy !== 0) tentatives.push([0, Math.sign(dy)]);
  } else {
    if (dy !== 0) tentatives.push([0, Math.sign(dy)]);
    if (dx !== 0) tentatives.push([Math.sign(dx), 0]);
  }

  for (var i = 0; i < tentatives.length; i++) {
    var pas = tentatives[i];
    var col = ennemi.x + pas[0];
    var row = ennemi.y + pas[1];

    // Comme le joueur : on retourne le sprite plutôt que d'avoir un dessin
    // séparé pour chaque sens horizontal.
    if (pas[0] !== 0) {
      ennemi.sprite.setFlipX(pas[0] < 0);
    }

    var victime = joueurSur(col, row);
    if (victime) {
      animerAttaqueEnnemi(ennemi.x, ennemi.y, victime);
      return;
    }

    if (caseLibrePourEnnemi(col, row)) {
      delete ennemis[ennemi.x + ',' + ennemi.y];
      ennemi.x = col;
      ennemi.y = row;
      ennemi.sprite.x = col * TAILLE_TUILE + TAILLE_TUILE / 2;
      ennemi.sprite.y = (row + 1) * TAILLE_TUILE; // ancré par le bas, comme à la création
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
