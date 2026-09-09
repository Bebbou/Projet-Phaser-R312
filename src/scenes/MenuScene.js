// Écran d'accueil : un simple bouton texte cliquable pour lancer la partie.
class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    this.add.text(centerX, centerY - 60, 'Projet Phaser R312', {
      fontSize: '32px',
      color: '#ffffff'
    }).setOrigin(0.5);

    const startButton = this.add.text(centerX, centerY + 20, 'Jouer', {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#333333',
      padding: { x: 20, y: 10 }
    }).setOrigin(0.5);

    startButton.setInteractive({ useHandCursor: true });
    startButton.on('pointerdown', () => {
      this.scene.start('Game');
    });
  }
}
