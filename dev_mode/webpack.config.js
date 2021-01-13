/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

const plib = require('path');
const fs = require('fs-extra');
const Handlebars = require('handlebars');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const merge = require('webpack-merge').default;
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer')
  .BundleAnalyzerPlugin;
const baseConfig = require('@jupyterlab/builder/lib/webpack.config.base');
const { ModuleFederationPlugin } = webpack.container;

const Build = require('@jupyterlab/builder').Build;
const WPPlugin = require('@jupyterlab/builder').WPPlugin;
const package_data = require('./package.json');

// Handle the extensions.
const jlab = package_data.jupyterlab;
const { extensions, mimeExtensions, externalExtensions } = jlab;

// Add external extensions to the extensions/mimeExtensions data as
// appropriate
for (const pkg in externalExtensions) {
  const {
    jupyterlab: { extension, mimeExtension }
  } = require(`${pkg}/package.json`);
  if (extension !== undefined) {
    extensions[pkg] = extension === true ? '' : extension;
  }
  if (mimeExtension !== undefined) {
    mimeExtensions[pkg] = mimeExtension === true ? '' : mimeExtension;
  }
}

// Deduplicated list of extension package names.
const extensionPackages = [
  ...new Set([...Object.keys(extensions), ...Object.keys(mimeExtensions)])
];

// Ensure a clear build directory.
const buildDir = plib.resolve(jlab.buildDir);
if (fs.existsSync(buildDir)) {
  fs.removeSync(buildDir);
}
fs.ensureDirSync(buildDir);

const outputDir = plib.resolve(jlab.outputDir);

// Build the assets
const extraConfig = Build.ensureAssets({
  // Deduplicate the extension package names
  packageNames: extensionPackages,
  output: outputDir
});

// Create the entry point and other assets in build directory.
const source = fs.readFileSync('index.js').toString();
const template = Handlebars.compile(source);
const extData = {
  jupyterlab_extensions: extensions,
  jupyterlab_mime_extensions: mimeExtensions
};
fs.writeFileSync(plib.join(buildDir, 'index.out.js'), template(extData));

// Create the bootstrap file that loads federated extensions and calls the
// initialization logic in index.out.js
const entryPoint = plib.join(buildDir, 'bootstrap.js');
fs.copySync('./bootstrap.js', entryPoint);

fs.copySync('./package.json', plib.join(buildDir, 'package.json'));
if (outputDir !== buildDir) {
  fs.copySync(
    plib.join(outputDir, 'style.js'),
    plib.join(buildDir, 'style.js')
  );
}

// Set up variables for the watch mode ignore plugins
const watched = {};
const ignoreCache = Object.create(null);
let watchNodeModules = false;
Object.keys(jlab.linkedPackages).forEach(function (name) {
  if (name in watched) {
    return;
  }
  const localPkgPath = require.resolve(plib.join(name, 'package.json'));
  watched[name] = plib.dirname(localPkgPath);
  if (localPkgPath.indexOf('node_modules') !== -1) {
    watchNodeModules = true;
  }
});

// Set up source-map-loader to look in watched lib dirs
const sourceMapRes = Object.values(watched).reduce((res, name) => {
  res.push(new RegExp(name + '/lib'));
  return res;
}, []);

/**
 * Sync a local path to a linked package path if they are files and differ.
 * This is used by `jupyter lab --watch` to synchronize linked packages
 * and has no effect in `jupyter lab --dev-mode --watch`.
 */
function maybeSync(localPath, name, rest) {
  const stats = fs.statSync(localPath);
  if (!stats.isFile(localPath)) {
    return;
  }
  const source = fs.realpathSync(plib.join(jlab.linkedPackages[name], rest));
  if (source === fs.realpathSync(localPath)) {
    return;
  }
  fs.watchFile(source, { interval: 500 }, function (curr) {
    if (!curr || curr.nlink === 0) {
      return;
    }
    try {
      fs.copySync(source, localPath);
    } catch (err) {
      console.error(err);
    }
  });
}

/**
 * A filter function set up to exclude all files that are not
 * in a package contained by the Jupyterlab repo. Used to ignore
 * files during a `--watch` build.
 */
function ignored(path) {
  path = plib.resolve(path);
  if (path in ignoreCache) {
    // Bail if already found.
    return ignoreCache[path];
  }

  // Limit the watched files to those in our local linked package dirs.
  let ignore = true;
  Object.keys(watched).some(name => {
    const rootPath = watched[name];
    const contained = path.indexOf(rootPath + plib.sep) !== -1;
    if (path !== rootPath && !contained) {
      return false;
    }
    const rest = path.slice(rootPath.length);
    if (rest.indexOf('node_modules') === -1) {
      ignore = false;
      maybeSync(path, name, rest);
    }
    return true;
  });
  ignoreCache[path] = ignore;
  return ignore;
}

// Set up module federation sharing config
const shared = {};

// Make sure any resolutions are shared
for (let [pkg, requiredVersion] of Object.entries(package_data.resolutions)) {
  shared[pkg] = { requiredVersion, strictVersion: true };
}

// Add any extension packages that are not in resolutions (i.e., installed from npm)
for (let pkg of extensionPackages) {
  if (!shared[pkg]) {
    shared[pkg] = {
      requiredVersion: require(`${pkg}/package.json`).version,
      strictVersion: true
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
      pkgShared[dep] = { requiredVersion, strictVersion: true };
    }
  }

  // Overwrite automatic dependency sharing with custom sharing config
  for (let [dep, config] of Object.entries(sharedPackages)) {
    if (config === false) {
      delete pkgShared[dep];
    } else {
      if ('bundled' in config) {
        if (config.bundled === false) {
          config.import = false;
        }
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
for (let pkg of jlab.singletonPackages) {
  shared[pkg].singleton = true;
}

const plugins = [
  new WPPlugin.NowatchDuplicatePackageCheckerPlugin({
    verbose: true,
    exclude(instance) {
      // ignore known duplicates
      return ['domelementtype', 'hash-base', 'inherits'].includes(
        instance.name
      );
    }
  }),
  new HtmlWebpackPlugin({
    chunksSortMode: 'none',
    template: plib.join(__dirname, 'templates', 'template.html'),
    title: jlab.name || 'JupyterLab'
  }),
  // custom plugin for ignoring files during a `--watch` build
  new WPPlugin.FilterWatchIgnorePlugin(ignored),
  // custom plugin that copies the assets to the static directory
  new WPPlugin.FrontEndPlugin(buildDir, jlab.staticDir),
  new ModuleFederationPlugin({
    library: {
      type: 'var',
      name: ['_JUPYTERLAB', 'CORE_LIBRARY_FEDERATION']
    },
    name: 'CORE_FEDERATION',
    shared
  })
];

if (process.argv.includes('--analyze')) {
  plugins.push(new BundleAnalyzerPlugin());
}

module.exports = [
  merge(baseConfig, {
    mode: 'development',
    entry: {
      main: ['./publicpath', 'whatwg-fetch', entryPoint]
    },
    output: {
      path: plib.resolve(buildDir),
      publicPath: '{{page_config.fullStaticUrl}}/',
      filename: '[name].[contenthash].js'
    },
    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          jlab_core: {
            test: /[\\/]node_modules[\\/]@(jupyterlab|lumino)[\\/]/,
            name: 'jlab_core'
          }
        }
      }
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          include: sourceMapRes,
          use: ['source-map-loader'],
          enforce: 'pre'
        }
      ]
    },
    devtool: 'inline-source-map',
    externals: ['node-fetch', 'ws'],
    plugins
  })
].concat(extraConfig);

// Needed to watch changes in linked extensions in node_modules
// (jupyter lab --watch)
// See https://github.com/webpack/webpack/issues/11612
if (watchNodeModules) {
  module.exports[0].snapshot = { managedPaths: [] };
}

const logPath = plib.join(buildDir, 'build_log.json');
fs.writeFileSync(logPath, JSON.stringify(module.exports, null, '  '));
