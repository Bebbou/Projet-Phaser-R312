// Scène de jeu : pour l'instant vide, on y ajoutera la carte Tiled,
// le joueur et la logique tour par tour au fur et à mesure.
class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.add.text(20, 20, 'Scène de jeu (à venir)', {
      fontSize: '18px',
      color: '#ffffff'
    });
  }
}
