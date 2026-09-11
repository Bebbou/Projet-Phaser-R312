// Scène de jeu : pour l'instant on affiche juste le joueur pour vérifier
// que les assets se chargent bien. La carte Tiled arrivera au prochain commit.
const TILE_SIZE = 8;
const ZOOM = 4; // les tuiles font 8px, on zoome pour que ce soit jouable à l'écran

class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  preload() {
    this.load.image('tileset', 'src/assets/tilesets/colored_tilemap_packed.png');
    this.load.image('player', 'src/assets/characters/player.png');
  }

  create() {
    this.cameras.main.setZoom(ZOOM);

    // Le joueur est ancré par le bas (setOrigin(0.5, 1)) : son sprite fait
    // 8x10 alors que la grille est en 8x8, la tête dépasse au-dessus de sa case.
    this.player = this.add.sprite(TILE_SIZE * 5, TILE_SIZE * 5, 'player');
    this.player.setOrigin(0.5, 1);

    this.cameras.main.centerOn(TILE_SIZE * 5, TILE_SIZE * 5);
  }
}
