const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Creates a Lambda layer with specified packages and their production dependencies.
 * @param {string} layerName - The name of the layer directory to create.
 * @param {string[]} packagesToInclude - A list of package names to include.
 */
async function createLayer(layerName, packagesToInclude) {
  const layerDir = path.resolve(__dirname, `../.serverless/layers/${layerName}`);
  const nodejsDir = path.join(layerDir, 'nodejs');
  const rootPackageJson = require('../package.json');

  console.log(`Creating ${layerName} layer...`);

  // 1. Clean and create directory structure
  await fs.emptyDir(layerDir);
  await fs.ensureDir(nodejsDir);

  // Add a cache-busting file to ensure Serverless detects a change
  const cacheBustContent = `Build time: ${new Date().toISOString()}`;
  await fs.writeFile(path.join(nodejsDir, 'build-info.txt'), cacheBustContent);

  // 2. Create a package.json for the layer
  const layerPackageJson = {
    dependencies: {}
  };

  for (const pkg of packagesToInclude) {
    const version = rootPackageJson.dependencies?.[pkg] || rootPackageJson.devDependencies?.[pkg];
    if (!version) throw new Error(`Could not find ${pkg} in package.json`);
    layerPackageJson.dependencies[pkg] = version;
  }

  await fs.writeJson(path.join(nodejsDir, 'package.json'), layerPackageJson, { spaces: 2 });

  // Copy .npmrc to handle private packages if any
  const npmrcPath = path.resolve(__dirname, '../.npmrc');
  if (await fs.pathExists(npmrcPath)) {
    await fs.copy(npmrcPath, path.join(nodejsDir, '.npmrc'));
  }

  // 3. Install only production dependencies
  console.log(`Installing dependencies for ${layerName} layer...`);
  execSync('npm install --omit=dev', { cwd: nodejsDir, stdio: 'inherit' });

  // WORKAROUND: If building the gameslib layer, forcefully remove renderer dependencies.
  // The "correct" fix is to publish a new version of gameslib with renderer as a devDependency.
  // Which I've done, but it doesn't appear to be working. So forcing the issue for now.
  if (layerName === 'abstractplay-gameslib') {
    console.log('Pruning renderer dependencies from gameslib layer as a workaround...');
    const packagesToRemoveGlob = [
      'node_modules/@abstractplay/renderer',
      'node_modules/@sparticuz/chromium',
      'node_modules/puppeteer-core'
    ];
    // Use rimraf for robust deletion. It's in devDependencies.
    execSync(`npx rimraf ${packagesToRemoveGlob.join(' ')}`, { cwd: nodejsDir, stdio: 'inherit' });
  }

  // 4. Prune unnecessary files to reduce layer size
  console.log(`Pruning files for ${layerName} layer...`);
  if (layerName === 'abstractplay-gameslib') {
    const gameslibDir = path.join(nodejsDir, 'node_modules', '@abstractplay', 'gameslib');
    const toRemove = [
      'docs',
      'README.md',
      'locales',
    ];
    for (const item of toRemove) {
      const itemPath = path.join(gameslibDir, item);
      if (await fs.pathExists(itemPath)) {
        console.log(`   - Removing ${itemPath}`);
        await fs.remove(itemPath);
      }
    }
  }

  // 5. Aggressively prune all node_modules to reduce size
  console.log(`Aggressively pruning all node_modules for ${layerName} layer...`);
  const nodeModulesDir = path.join(nodejsDir, 'node_modules');
  const patternsToRemove = [
    '**/*.md',
    '**/LICENSE',
    '**/test',
    '**/tests',
    '**/doc',
    '**/docs',
    '**/example',
    '**/examples',
    '**/__tests__',
    '**/*.d.ts',
    '**/*.ts.map',
    '**/jest.config.js',
    '**/webpack.config.js',
    '**/.eslintrc.js',
    '**/.prettierrc.js',
  ].map(p => `"${path.join(nodeModulesDir, p)}"`).join(' '); // Quote paths to handle spaces

  execSync(`npx rimraf ${patternsToRemove}`, { cwd: nodejsDir, stdio: 'inherit' });

  console.log(`✅ ${layerName} layer created successfully in .serverless/layers/${layerName}`);
}

async function main() {
  await createLayer('abstractplay-gameslib', ['@abstractplay/gameslib', '@abstractplay/recranks']);
//   await createLayer('abstractplay-renderer', ['@abstractplay/renderer']);
}

main().catch(err => {
    console.error('Error creating layers:', err);
    process.exit(1);
});
