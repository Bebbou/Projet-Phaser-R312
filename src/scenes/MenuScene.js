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

function createMenu() {
  var centreX = this.cameras.main.width / 2;
  var centreY = this.cameras.main.height / 2;

  this.add.text(centreX, centreY - 80, 'Projet Phaser R312', {
    fontSize: '32px',
    color: '#ffffff'
  }).setOrigin(0.5);

  creerBoutonMenu(this, centreX, centreY, '1 joueur', 1);
  creerBoutonMenu(this, centreX, centreY + 70, '2 joueurs', 2);
}

var sceneMenu = {
  key: 'Menu',
  create: createMenu
};
