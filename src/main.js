// Configuration principale du jeu Phaser.
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true, // garde les pixels nets quand on zoome (pas de flou/anti-aliasing)
  scene: [sceneBoot, sceneMenu, sceneGame]
};

const game = new Phaser.Game(config);
