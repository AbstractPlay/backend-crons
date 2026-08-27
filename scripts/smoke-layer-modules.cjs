'use strict';

const path = require('path');
const { createRequire } = require('module');

const layerRoot = path.resolve(
  __dirname,
  '..',
  '.serverless',
  'layers',
  'abstractplay-gameslib',
  'nodejs',
  'node_modules',
);
const anchor = path.join(layerRoot, '@abstractplay', 'gameslib', 'package.json');

try {
  const req = createRequire(anchor);
  const gl = req('@abstractplay/gameslib');
  if (!gl.gameinfo || typeof gl.GameFactory !== 'function') {
    throw new Error('@abstractplay/gameslib missing expected exports');
  }
  const rr = req('@abstractplay/recranks');
  if (typeof rr.Glicko2 !== 'function' || typeof rr.ELOBasic !== 'function') {
    throw new Error('@abstractplay/recranks missing expected exports');
  }
  console.log('smoke-layer-modules: gameslib + recranks require OK');
} catch (error) {
  console.error(`smoke-layer-modules: ${error.message}`);
  process.exit(1);
}
