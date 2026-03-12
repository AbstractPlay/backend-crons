const fs = require('fs-extra');
const path = require('path');

async function createLayer() {
  const layerDir = path.resolve(__dirname, '../.serverless/layers/abstractplay-libs');
  const nodejsDir = path.join(layerDir, 'nodejs');
  const nodeModulesDir = path.join(nodejsDir, 'node_modules');
  const rootNodeModules = path.resolve(__dirname, '../node_modules');

  console.log('Creating abstractplay-libs layer...');

  // 1. Clean and create directory structure
  await fs.emptyDir(layerDir);
  await fs.ensureDir(nodeModulesDir);

  // 2. Copy required packages from root node_modules
  const packagesToCopy = ['@abstractplay/gameslib', '@abstractplay/renderer'];

  for (const pkg of packagesToCopy) {
    const sourcePath = path.join(rootNodeModules, pkg);
    const destPath = path.join(nodeModulesDir, pkg);
    if (await fs.pathExists(sourcePath)) {
      console.log(`Copying ${pkg} to layer...`);
      await fs.copy(sourcePath, destPath);
    } else {
      throw new Error(`Package ${pkg} not found in root node_modules. Please run 'npm install' first.`);
    }
  }

  console.log('✅ abstractplay-libs layer created successfully in .serverless/layers/abstractplay-libs');
}

createLayer().catch(err => {
  console.error('Error creating layer:', err);
  process.exit(1);
});
