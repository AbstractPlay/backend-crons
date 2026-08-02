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
    let version = rootPackageJson.dependencies?.[pkg] || rootPackageJson.devDependencies?.[pkg];
    if (!version) throw new Error(`Could not find ${pkg} in package.json`);
    if (version.startsWith('file:')) {
      const rel = version.slice('file:'.length);
      version = `file:${path.resolve(__dirname, '..', rel)}`;
    }
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
    ];
    for (const item of toRemove) {
      const itemPath = path.join(gameslibDir, item);
      if (await fs.pathExists(itemPath)) {
        console.log(`   - Removing ${itemPath}`);
        await fs.remove(itemPath);
      }
    }
    // file: deps can resolve to broken junctions on Windows; copy en locales from the project install.
    const sourceLocalesEn = path.resolve(__dirname, '../node_modules/@abstractplay/gameslib/locales/en');
    const targetLocalesEn = path.join(gameslibDir, 'locales', 'en');
    if (await fs.pathExists(sourceLocalesEn)) {
      await fs.ensureDir(path.join(gameslibDir, 'locales'));
      await fs.copy(sourceLocalesEn, targetLocalesEn, { overwrite: true });
      console.log(`   - Ensured English locale bundles in layer gameslib`);
    }
    // Drop non-English locale languages to save layer size.
    const localesDir = path.join(gameslibDir, 'locales');
    if (await fs.pathExists(localesDir)) {
      const localeLangs = await fs.readdir(localesDir);
      for (const lang of localeLangs) {
        if (lang !== 'en') {
          const langPath = path.join(localesDir, lang);
          console.log(`   - Removing non-English locale ${langPath}`);
          await fs.remove(langPath);
        }
      }
    }
  }

  // 5. Aggressively prune all node_modules to reduce size
  console.log(`Aggressively pruning all node_modules for ${layerName} layer...`);
  const nodeModulesDir = path.join(nodejsDir, 'node_modules'); // We'll execute from here
  const patternsToRemove = [
    // Documentation and metadata
    '**/*.md',
    '**/README*',
    '**/CHANGELOG*',
    '**/HISTORY*',
    '**/CONTRIBUTING*',
    '**/AUTHORS*',
    '**/LICENSE*',
    '**/.github',
    // Examples and tests
    '**/example',
    '**/examples',
    '**/test',
    '**/tests',
    '**/__tests__',
    '**/*.test.js',
    '**/*.spec.js',
    '**/fixtures',
    // Build artifacts and configs
    '**/*.map',
    '**/*.d.ts',
    '**/tsconfig.json',
    '**/jsconfig.json',
    '**/Makefile',
    '**/.eslintrc.js',
    // Localization (gameslib en/ locales are preserved above)
    '**/doc',
    '**/docs',
    '**/i18n',
  ];

  const { rimrafSync } = require('rimraf');
  for (const pattern of patternsToRemove) {
    try {
      rimrafSync(pattern, { cwd: nodeModulesDir, glob: true });
    } catch (err) {
      console.warn(`   - rimraf ${pattern}: ${err.message}`);
    }
  }

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
