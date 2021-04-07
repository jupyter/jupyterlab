// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as webpack from 'webpack';
import { Build } from './build';
import { LicenseWebpackPlugin } from 'license-webpack-plugin';
import { merge } from 'webpack-merge';
import * as fs from 'fs-extra';
import * as glob from 'glob';
import Ajv from 'ajv';
import { readJSONFile, writeJSONFile } from '@jupyterlab/buildutils';

const baseConfig = require('./webpack.config.base');
const { ModuleFederationPlugin } = webpack.container;

export interface IOptions {
  packagePath?: string;
  corePath?: string;
  staticUrl?: string;
  mode?: 'development' | 'production';
  devtool?: string;
  watchMode?: boolean;
}

function generateConfig({
  packagePath = '',
  corePath = '',
  staticUrl = '',
  mode = 'production',
  devtool = mode === 'development' ? 'source-map' : undefined,
  watchMode = false
}: IOptions = {}): webpack.Configuration[] {
  const data = require(path.join(packagePath, 'package.json'));

  const ajv = new Ajv({ useDefaults: true });
  const validate = ajv.compile(require('../metadata_schema.json'));
  let valid = validate(data.jupyterlab ?? {});
  if (!valid) {
    console.error(validate.errors);
    process.exit(1);
  }

  const outputPath = path.join(packagePath, data.jupyterlab['outputDir']);
  const staticPath = path.join(outputPath, 'static');

  // Handle the extension entry point and the lib entry point, if different
  const index = require.resolve(packagePath);
  const exposes: { [id: string]: string } = {
    './index': index
  };

  const extension = data.jupyterlab.extension;
  if (extension === true) {
    exposes['./extension'] = index;
  } else if (typeof extension === 'string') {
    exposes['./extension'] = path.join(packagePath, extension);
  }

  const mimeExtension = data.jupyterlab.mimeExtension;
  if (mimeExtension === true) {
    exposes['./mimeExtension'] = index;
  } else if (typeof mimeExtension === 'string') {
    exposes['./mimeExtension'] = path.join(packagePath, mimeExtension);
  }

  if (typeof data.styleModule === 'string') {
    exposes['./style'] = path.join(packagePath, data.styleModule);
  } else if (typeof data.style === 'string') {
    exposes['./style'] = path.join(packagePath, data.style);
  }

  const coreData = require(path.join(corePath, 'package.json'));

  let shared: any = {};

  // Start with core package versions.
  const coreDeps: any = {
    ...coreData.dependencies,
    ...(coreData.resolutions ?? {})
  };

  // Alow extensions to match a wider range than the core dependency
  // To ensure forward compatibility.
  Object.keys(coreDeps).forEach(element => {
    shared[element] = {
      requiredVersion: coreDeps[element].replace('~', '^'),
      import: false
    };
  });

  // Add package dependencies and peerDependencies
  const dependencies = {
    ...data.dependencies,
    ...(data.peerDependencies ?? {})
  };
  Object.keys(dependencies).forEach(element => {
    // TODO: make sure that the core dependency semver range is a subset of our
    // data.depencies version range for any packages in the core deps.
    if (!shared[element]) {
      shared[element] = {};
    }
  });

  // Set core packages as singletons that are not bundled.
  coreData.jupyterlab.singletonPackages.forEach((element: string) => {
    if (!shared[element]) {
      shared[element] = {};
    }
    shared[element].import = false;
    shared[element].singleton = true;
  });

  // Now we merge in the sharedPackages configuration provided by the extension.

  const sharedPackages = data.jupyterlab.sharedPackages ?? {};

  // Delete any modules that are explicitly not shared
  Object.keys(sharedPackages).forEach(pkg => {
    if (sharedPackages[pkg] === false) {
      delete shared[pkg];
      delete sharedPackages[pkg];
    }
  });

  // Transform the sharedPackages information into valid webpack config
  Object.keys(sharedPackages).forEach(pkg => {
    // Convert `bundled` to `import`
    if (sharedPackages[pkg].bundled === false) {
      sharedPackages[pkg].import = false;
    } else if (
      sharedPackages[pkg].bundled === true &&
      shared[pkg]?.import === false
    ) {
      // We can't delete a key in the merge, so we have to delete it in the source
      delete shared[pkg].import;
    }
    delete sharedPackages[pkg].bundled;
  });

  shared = merge(shared, sharedPackages);

  // add the root module itself to shared
  if (shared[data.name]) {
    console.error(
      `The root package itself '${data.name}' may not specified as a shared dependency.`
    );
  }
  shared[data.name] = {
    version: data.version,
    singleton: true,
    import: index
  };

  // Ensure a clean output directory - remove files but not the directory
  // in case it is a symlink
  fs.emptyDirSync(outputPath);

  const extras = Build.ensureAssets({
    packageNames: [],
    packagePaths: [packagePath],
    output: staticPath,
    schemaOutput: outputPath,
    themeOutput: outputPath
  });

  fs.copyFileSync(
    path.join(packagePath, 'package.json'),
    path.join(outputPath, 'package.json')
  );

  class CleanupPlugin {
    apply(compiler: any) {
      compiler.hooks.done.tap('Cleanup', (stats: any) => {
        const newlyCreatedAssets = stats.compilation.assets;

        // Clear out any remoteEntry files that are stale
        // https://stackoverflow.com/a/40370750
        const files = glob.sync(path.join(staticPath, 'remoteEntry.*.js'));
        let newEntry = '';
        const unlinked: string[] = [];
        files.forEach(file => {
          const fileName = path.basename(file);
          if (!newlyCreatedAssets[fileName]) {
            fs.unlinkSync(path.resolve(file));
            unlinked.push(fileName);
          } else {
            newEntry = fileName;
          }
        });
        if (unlinked.length > 0) {
          console.log('Removed old assets: ', unlinked);
        }

        // Find the remoteEntry file and add it to the package.json metadata
        const data = readJSONFile(path.join(outputPath, 'package.json'));
        const _build: any = {
          load: path.join('static', newEntry)
        };
        if (exposes['./extension'] !== undefined) {
          _build.extension = './extension';
        }
        if (exposes['./mimeExtension'] !== undefined) {
          _build.mimeExtension = './mimeExtension';
        }
        if (exposes['./style'] !== undefined) {
          _build.style = './style';
        }
        data.jupyterlab._build = _build;
        writeJSONFile(path.join(outputPath, 'package.json'), data);
      });
    }
  }

  // Allow custom webpack config
  let webpackConfigPath = data.jupyterlab['webpackConfig'];
  let webpackConfig = {};

  // Use the custom webpack config only if the path to the config
  // is specified in package.json (opt-in)
  if (webpackConfigPath) {
    webpackConfigPath = path.join(packagePath, webpackConfigPath);
    if (fs.existsSync(webpackConfigPath)) {
      webpackConfig = require(webpackConfigPath);
    }
  }

  let plugins = [
    new ModuleFederationPlugin({
      name: data.name,
      library: {
        type: 'var',
        name: ['_JUPYTERLAB', data.name]
      },
      filename: 'remoteEntry.[contenthash].js',
      exposes,
      shared
    }),
    new CleanupPlugin()
  ];

  if (mode === 'production') {
    plugins.push(
      new LicenseWebpackPlugin({
        perChunkOutput: false,
        outputFilename: 'third-party-licenses.txt',
        excludedPackageTest: packageName => packageName === data.name
      })
    );
  }

  // Add version argument when in production so the Jupyter server
  // allows caching of files (i.e., does not set the CacheControl header to no-cache to prevent caching static files)
  let filename = '[name].[contenthash].js';
  if (mode === 'production') {
    filename += '?v=[contenthash]';
  }

  const config = [
    merge(
      baseConfig,
      {
        mode,
        devtool,
        entry: {},
        output: {
          filename,
          path: staticPath,
          publicPath: staticUrl || 'auto'
        },
        module: {
          rules: [{ test: /\.html$/, use: 'file-loader' }]
        },
        plugins
      },
      webpackConfig
    )
  ].concat(extras);

  if (mode === 'development') {
    const logPath = path.join(outputPath, 'build_log.json');
    fs.writeFileSync(logPath, JSON.stringify(config, null, '  '));
  }
  return config;
}

export default generateConfig;
