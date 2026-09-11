// Écran d'accueil : un simple bouton texte cliquable pour lancer la partie.
function createMenu() {
  var centreX = this.cameras.main.width / 2;
  var centreY = this.cameras.main.height / 2;

  this.add.text(centreX, centreY - 60, 'Projet Phaser R312', {
    fontSize: '32px',
    color: '#ffffff'
  }).setOrigin(0.5);

  var boutonJouer = this.add.text(centreX, centreY + 20, 'Jouer', {
    fontSize: '24px',
    color: '#ffffff',
    backgroundColor: '#333333',
    padding: { x: 20, y: 10 }
  }).setOrigin(0.5);

  boutonJouer.setInteractive({ useHandCursor: true });
  boutonJouer.on('pointerdown', function () {
    this.scene.start('Game');
  }, this);
}

var sceneMenu = {
  key: 'Menu',
  create: createMenu
};
