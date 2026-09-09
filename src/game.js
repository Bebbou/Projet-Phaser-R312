// Configuration principale du jeu Phaser.
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game',
  backgroundColor: '#000000',
  scene: [BootScene, MenuScene, GameScene]
};

const game = new Phaser.Game(config);
