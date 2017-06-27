// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Application, IPlugin
} from '@phosphor/application';

import {
  ApplicationShell
} from './shell';

export { ApplicationShell } from './shell';
export { ILayoutRestorer, LayoutRestorer } from './layoutrestorer';

/**
 * The type for all JupyterLab plugins.
 */
export
type JupyterLabPlugin<T> = IPlugin<JupyterLab, T>;


/**
 * JupyterLab is the main application class. It is instantiated once and shared.
 */
export
class JupyterLab extends Application<ApplicationShell> {
  /**
   * Construct a new JupyterLab object.
   */
  constructor(options: JupyterLab.IOptions = {}) {
    super({ shell: new ApplicationShell() });
    this._info = {
      name: options.name || 'JupyterLab',
      namespace: options.namespace || 'jupyterlab',
      version:  options.version || 'unknown',
      devMode: options.devMode || false,
      settingsDir: options.settingsDir || '',
      assetsDir: options.assetsDir || ''
    };
    if (options.devMode) {
      this.shell.addClass('jp-mod-devMode');
    }
  }

  /**
   * The information about the application.
   */
  get info(): JupyterLab.IInfo {
    return this._info;
  }

  /**
   * Promise that resolves when state is first restored, returning layout description.
   *
   * #### Notes
   * This is just a reference to `shell.restored`.
   */
  get restored(): Promise<ApplicationShell.ILayout> {
    return this.shell.restored;
  }

  /**
   * Register plugins from a plugin module.
   *
   * @param mod - The plugin module to register.
   */
  registerPluginModule(mod: JupyterLab.IPluginModule): void {
    let data = mod.default;
    // Handle commonjs exports.
    if (!mod.hasOwnProperty('__esModule')) {
      data = mod as any;
    }
    if (!Array.isArray(data)) {
      data = [data];
    }
    data.forEach(item => { this.registerPlugin(item); });
  }

  /**
   * Register the plugins from multiple plugin modules.
   *
   * @param mods - The plugin modules to register.
   */
  registerPluginModules(mods: JupyterLab.IPluginModule[]): void {
    mods.forEach(mod => { this.registerPluginModule(mod); });
  }

  private _info: JupyterLab.IInfo;
}


/**
 * The namespace for `JupyterLab` class statics.
 */
export
namespace JupyterLab {
  /**
   * The options used to initialize a JupyterLab object.
   */
  export
  interface IOptions {
    /**
     * The name of the JupyterLab application.
     */
    name?: string;

    /**
     * The namespace/prefix plugins may use to denote their origin.
     *
     * #### Notes
     * This field may be used by persistent storage mechanisms such as state
     * databases, cookies, session storage, etc.
     *
     * If unspecified, the default value is `'jupyterlab'`.
     */
    namespace?: string;

    /**
     * The version of the JupyterLab application.
     */
    version?: string;

    /**
     * Whether the application is in dev mode.
     */
    devMode?: boolean;

    /**
     * The settings directory of the app on the server.
     */
    settingsDir?: string;

    /**
     * The assets directory of the app on the server.
     */
    assetsDir?: string;
  }

  /**
   * The information about a JupyterLab application.
   */
  export
  interface IInfo {
    /**
     * The name of the JupyterLab application.
     */
    readonly name: string;

    /**
     * The namespace/prefix plugins may use to denote their origin.
     */
    readonly namespace: string;

    /**
     * The version of the JupyterLab application.
     */
    readonly version: string;

    /**
     * Whether the application is in dev mode.
     */
    readonly devMode: boolean;

    /**
     * The settings directory of the app on the server.
     */
    readonly settingsDir: string;

    /**
     * The assets directory of the app on the server.
     */
    readonly assetsDir: string;
  }

  /**
   * The interface for a module that exports a plugin or plugins as
   * the default value.
   */
  export
  interface IPluginModule {
    /**
     * The default export.
     */
    default: JupyterLabPlugin<any> | JupyterLabPlugin<any>[];
  }
}
