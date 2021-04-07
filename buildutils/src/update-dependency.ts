#!/usr/bin/env node
/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import * as path from 'path';
import * as utils from './utils';
import packageJson from 'package-json';

import commander from 'commander';
import semver from 'semver';

const versionCache = new Map();

/**
 * Matches a simple semver range, where the version number could be an npm tag.
 */
const SEMVER_RANGE = /^(~|\^|=|<|>|<=|>=)?([\w\-.]*)$/;

/**
 * Get the specifier we should use
 *
 * @param currentSpecifier - The current package version.
 * @param suggestedSpecifier - The package version we would like to use.
 *
 * #### Notes
 * If the suggested specifier is not a valid range, we assume it is of the
 * form ${RANGE}${TAG}, where TAG is an npm tag (such as 'latest') and RANGE
 * is either a semver range indicator (one of `~, ^, >, <, =, >=, <=`), or is
 * not given (in which case the current specifier range prefix is used).
 */
async function getSpecifier(
  currentSpecifier: string,
  suggestedSpecifier: string
) {
  if (semver.validRange(suggestedSpecifier)) {
    return suggestedSpecifier;
  }

  // The suggested specifier is not a valid range, so we assume it
  // references a tag
  let [, suggestedSigil, suggestedTag] =
    suggestedSpecifier.match(SEMVER_RANGE) ?? [];

  if (!suggestedTag) {
    throw Error(`Invalid version specifier: ${suggestedSpecifier}`);
  }

  // A tag with no sigil adopts the sigil from the current specification
  if (!suggestedSigil) {
    const match = currentSpecifier.match(SEMVER_RANGE);
    if (match === null) {
      throw Error(
        `Current version range is not recognized: ${currentSpecifier}`
      );
    }
    const [, currentSigil] = match;
    if (currentSigil) {
      suggestedSigil = currentSigil;
    }
  }
  return `${suggestedSigil}${suggestedTag}`;
}

async function getVersion(pkg: string, specifier: string) {
  const key = JSON.stringify([pkg, specifier]);
  if (versionCache.has(key)) {
    return versionCache.get(key);
  }
  if (semver.validRange(specifier) === null) {
    // We have a tag, with possibly a range specifier, such as ^latest
    const match = specifier.match(SEMVER_RANGE);
    if (match === null) {
      throw Error(`Invalid version specifier: ${specifier}`);
    }

    // Look up the actual version corresponding to the tag
    const { version } = await packageJson(pkg, { version: match[2] });
    specifier = match[1] + version;
  }
  versionCache.set(key, specifier);
  return specifier;
}

/**
 * A very simple subset comparator
 *
 * @returns true if we can determine if range1 is a subset of range2, otherwise false
 *
 * #### Notes
 * This will not be able to determine if range1 is a subset of range2 in many cases.
 */
function subset(range1: string, range2: string): boolean {
  try {
    const [, r1, version1] = range1.match(SEMVER_RANGE) ?? [];
    const [, r2] = range2.match(SEMVER_RANGE) ?? [];
    return (
      ['', '>=', '=', '~', '^'].includes(r1) &&
      r1 === r2 &&
      !!semver.valid(version1) &&
      semver.satisfies(version1, range2)
    );
  } catch (e) {
    return false;
  }
}

async function handleDependency(
  dependencies: { [key: string]: string },
  dep: string,
  suggestedSpecifier: string,
  minimal: boolean
): Promise<{ updated: boolean; log: string[] }> {
  const log = [];
  let updated = false;
  const oldRange = dependencies[dep];
  const specifier = await getSpecifier(oldRange, suggestedSpecifier);
  const newRange = await getVersion(dep, specifier);

  if (minimal && subset(newRange, oldRange)) {
    log.push(`SKIPPING ${dep} ${oldRange} -> ${newRange}`);
  } else {
    log.push(`${dep} ${oldRange} -> ${newRange}`);
    dependencies[dep] = newRange;
    updated = true;
  }
  return { updated, log };
}

/**
 * Handle an individual package on the path - update the dependency.
 */
async function handlePackage(
  name: string | RegExp,
  specifier: string,
  packagePath: string,
  dryRun = false,
  minimal = false
) {
  let fileUpdated = false;
  const fileLog: string[] = [];

  // Read in the package.json.
  packagePath = path.join(packagePath, 'package.json');
  let data: any;
  try {
    data = utils.readJSONFile(packagePath);
  } catch (e) {
    console.debug('Skipping package ' + packagePath);
    return;
  }

  // Update dependencies as appropriate.
  for (const dtype of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = data[dtype] || {};
    if (typeof name === 'string') {
      const dep = name;
      if (dep in deps) {
        const { updated, log } = await handleDependency(
          deps,
          dep,
          specifier,
          minimal
        );
        if (updated) {
          fileUpdated = true;
        }
        fileLog.push(...log);
      }
    } else {
      const keys = Object.keys(deps);
      keys.sort();
      for (const dep of keys) {
        if (dep.match(name)) {
          const { updated, log } = await handleDependency(
            deps,
            dep,
            specifier,
            minimal
          );
          if (updated) {
            fileUpdated = true;
          }
          fileLog.push(...log);
        }
      }
    }
  }

  if (fileLog.length > 0) {
    console.debug(packagePath);
    console.debug(fileLog.join('\n'));
    console.debug();
  }

  // Write the file back to disk.
  if (!dryRun && fileUpdated) {
    utils.writePackageData(packagePath, data);
  }
}

commander
  .description('Update dependency versions')
  .usage('[options] <package> [versionspec], versionspec defaults to ^latest')
  .option('--dry-run', 'Do not perform actions, just print output')
  .option('--regex', 'Package is a regular expression')
  .option('--lerna', 'Update dependencies in all lerna packages')
  .option('--path <path>', 'Path to package or monorepo to update')
  .option('--minimal', 'only update if the change is substantial')
  .arguments('<package> [versionspec]')
  .action(
    async (name: string | RegExp, version: string = '^latest', args: any) => {
      const basePath = path.resolve(args.path || '.');
      const pkg = args.regex ? new RegExp(name) : name;

      if (args.lerna) {
        const paths = utils.getLernaPaths(basePath).sort();

        // We use a loop instead of Promise.all so that the output is in
        // alphabetical order.
        for (const pkgPath of paths) {
          await handlePackage(pkg, version, pkgPath, args.dryRun, args.minimal);
        }
      }
      await handlePackage(pkg, version, basePath, args.dryRun, args.minimal);
    }
  );

commander.on('--help', function () {
  console.debug(`
Examples
--------

  Update the package 'webpack' to a specific version range:

      update-dependency webpack ^4.0.0

  Update all packages to the latest version, with a caret.
  Only update if the update is substantial:

      update-dependency --minimal --regex '.*' ^latest

  Update all packages, that does not start with '@jupyterlab',
  to the latest version and use the same version specifier currently
  being used

      update:dependency --regex '^(?!@jupyterlab).*' latest --dry-run

  Print the log of the above without actually making any changes.

  update-dependency --dry-run --minimal --regex '.*' ^latest

  Update all packages starting with '@jupyterlab/' to the version
  the 'latest' tag currently points to, with a caret range:

      update-dependency --regex '^@jupyterlab/' ^latest

  Update all packages starting with '@jupyterlab/' in all lerna
  workspaces and the root package.json to whatever version the 'next'
  tag for each package currently points to (with a caret tag).
  Update the version range only if the change is substantial.

      update-dependency --lerna --regex --minimal '^@jupyterlab/' ^next
`);
});

commander.parse(process.argv);

// If no arguments supplied
if (!process.argv.slice(2).length) {
  commander.outputHelp();
  process.exit(1);
}
