// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

const path = require('path');
const fs = require('fs-extra');
const Handlebars = require('handlebars');
const Build = require('@jupyterlab/builder').Build;
const webpack = require('webpack');
const merge = require('webpack-merge').default;
const baseConfig = require('@jupyterlab/builder/webpack.config.base');
const { ModuleFederationPlugin } = webpack.container;

const packageData = require('./package.json');
const jlab = packageData.jupyterlab;

// Create a list of application extensions and mime extensions from
// jlab.extensions
const extensions = {};
const mimeExtensions = {};
for (const key of jlab.extensions) {
  const {
    jupyterlab: { extension, mimeExtension }
  } = require(`${key}/package.json`);
  if (extension !== undefined) {
    extensions[key] = extension === true ? '' : extension;
  }
  if (mimeExtension !== undefined) {
    mimeExtensions[key] = mimeExtension === true ? '' : mimeExtension;
  }
}

// buildDir is a temporary directory where files are copied before the build.
const buildDir = path.resolve(jlab.buildDir);
fs.emptyDirSync(buildDir);

// outputDir is where the final built assets go
const outputDir = path.resolve(jlab.outputDir);
fs.emptyDirSync(outputDir);

// <schemaDir>/schemas is where the settings schemas live
const schemaDir = path.resolve(jlab.schemaDir || outputDir);
// ensureAssets puts schemas in the schemas subdirectory
fs.emptyDirSync(path.join(schemaDir, 'schemas'));

// <themeDir>/themes is where theme assets live
const themeDir = path.resolve(jlab.themeDir || outputDir);
// ensureAssets puts themes in the themes subdirectory
fs.emptyDirSync(path.join(themeDir, 'themes'));

// Configuration to handle extension assets
const extensionAssetConfig = Build.ensureAssets({
  packageNames: jlab.extensions,
  output: buildDir,
  schemaOutput: schemaDir,
  themeOutput: themeDir
});

// Create the entry point and other assets in build directory.
const template = Handlebars.compile(
  fs.readFileSync('index.template.js').toString()
);
fs.writeFileSync(
  path.join(buildDir, 'index.js'),
  template({ extensions, mimeExtensions })
);

// Create the bootstrap file that loads federated extensions and calls the
// initialization logic in index.js
const entryPoint = path.join(buildDir, 'bootstrap.js');
fs.copySync('./bootstrap.js', entryPoint);

/**
 * Create the webpack ``shared`` configuration
 */
function createShared(packageData) {
  // Set up module federation sharing config
  const shared = {};
  const extensionPackages = packageData.jupyterlab.extensions;

  // Make sure any resolutions are shared
  for (let [pkg, requiredVersion] of Object.entries(packageData.resolutions)) {
    shared[pkg] = { requiredVersion };
  }

  // Add any extension packages that are not in resolutions (i.e., installed from npm)
  for (let pkg of extensionPackages) {
    if (!shared[pkg]) {
      shared[pkg] = {
        requiredVersion: require(`${pkg}/package.json`).version
      };
    }
  }

  // Add dependencies and sharedPackage config from extension packages if they
  // are not already in the shared config. This means that if there is a
  // conflict, the resolutions package version is the one that is shared.
  const extraShared = [];
  for (let pkg of extensionPackages) {
    let pkgShared = {};
    let {
      dependencies = {},
      jupyterlab: { sharedPackages = {} } = {}
    } = require(`${pkg}/package.json`);
    for (let [dep, requiredVersion] of Object.entries(dependencies)) {
      if (!shared[dep]) {
        pkgShared[dep] = { requiredVersion };
      }
    }

    // Overwrite automatic dependency sharing with custom sharing config
    for (let [dep, config] of Object.entries(sharedPackages)) {
      if (config === false) {
        delete pkgShared[dep];
      } else {
        if ('bundled' in config) {
          config.import = config.bundled;
          delete config.bundled;
        }
        pkgShared[dep] = config;
      }
    }
    extraShared.push(pkgShared);
  }

  // Now merge the extra shared config
  const mergedShare = {};
  for (let sharedConfig of extraShared) {
    for (let [pkg, config] of Object.entries(sharedConfig)) {
      // Do not override the basic share config from resolutions
      if (shared[pkg]) {
        continue;
      }

      // Add if we haven't seen the config before
      if (!mergedShare[pkg]) {
        mergedShare[pkg] = config;
        continue;
      }

      // Choose between the existing config and this new config. We do not try
      // to merge configs, which may yield a config no one wants
      let oldConfig = mergedShare[pkg];

      // if the old one has import: false, use the new one
      if (oldConfig.import === false) {
        mergedShare[pkg] = config;
      }
    }
  }

  Object.assign(shared, mergedShare);

  // Transform any file:// requiredVersion to the version number from the
  // imported package. This assumes (for simplicity) that the version we get
  // importing was installed from the file.
  for (let [pkg, { requiredVersion }] of Object.entries(shared)) {
    if (requiredVersion && requiredVersion.startsWith('file:')) {
      shared[pkg].requiredVersion = require(`${pkg}/package.json`).version;
    }
  }

  // Add singleton package information
  for (let pkg of packageData.jupyterlab.singletonPackages) {
    shared[pkg].singleton = true;
  }

  return shared;
}

const plugins = [
  new ModuleFederationPlugin({
    library: {
      type: 'var',
      name: ['_JUPYTERLAB', 'CORE_LIBRARY_FEDERATION']
    },
    name: 'CORE_FEDERATION',
    shared: createShared(packageData)
  })
];

module.exports = [
  merge(baseConfig, {
    mode: 'development',
    devtool: 'source-map',
    entry: ['./publicpath.js', entryPoint],
    output: {
      path: path.resolve(outputDir),
      library: {
        type: 'var',
        name: ['_JUPYTERLAB', 'CORE_OUTPUT']
      },
      filename: 'bundle.js'
    },
    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          jlab_core: {
            test: /[\\/](node_modules[\\/]@(jupyterlab|lumino)|packages)[\\/]/,
            name: 'jlab_core'
          }
        }
      }
    },
    plugins
  })
].concat(extensionAssetConfig);

// For debugging, write the config out
fs.writeFileSync(
  path.join(buildDir, 'webpack.config-log.json'),
  JSON.stringify(module.exports, null, '  ')
);
