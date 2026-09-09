// Scène de démarrage : charge les assets communs avant de lancer le menu.
class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Les assets (tilesets, spritesheets...) seront chargés ici au fur et à mesure.
  }

  create() {
    this.scene.start('Menu');
  }
}
