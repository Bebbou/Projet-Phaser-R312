// Scène de démarrage : charge les assets communs avant de lancer le menu.
function preloadBoot() {
  // Les assets communs à tout le jeu se chargeront ici au fur et à mesure.
}

function createBoot() {
  this.scene.start('Menu');
}

var sceneBoot = {
  key: 'Boot',
  preload: preloadBoot,
  create: createBoot
};
