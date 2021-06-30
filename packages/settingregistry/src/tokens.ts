/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { IDataConnector } from '@jupyterlab/statedb';
import {
  PartialJSONObject,
  PartialJSONValue,
  ReadonlyPartialJSONObject,
  ReadonlyPartialJSONValue,
  Token
} from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { ISignal } from '@lumino/signaling';
import { ISchemaValidator } from './settingregistry';

/* tslint:disable */
/**
 * The setting registry token.
 */
export const ISettingRegistry = new Token<ISettingRegistry>(
  '@jupyterlab/coreutils:ISettingRegistry'
);
/* tslint:enable */

/**
 * The settings registry interface.
 */
export interface ISettingRegistry {
  /**
   * The data connector used by the setting registry.
   */
  readonly connector: IDataConnector<ISettingRegistry.IPlugin, string, string>;

  /**
   * The schema of the setting registry.
   */
  readonly schema: ISettingRegistry.ISchema;

  /**
   * The schema validator used by the setting registry.
   */
  readonly validator: ISchemaValidator;

  /**
   * A signal that emits the name of a plugin when its settings change.
   */
  readonly pluginChanged: ISignal<this, string>;

  /**
   * The collection of setting registry plugins.
   */
  readonly plugins: {
    [name: string]: ISettingRegistry.IPlugin | undefined;
  };

  /**
   * Get an individual setting.
   *
   * @param plugin - The name of the plugin whose settings are being retrieved.
   *
   * @param key - The name of the setting being retrieved.
   *
   * @returns A promise that resolves when the setting is retrieved.
   */
  get(
    plugin: string,
    key: string
  ): Promise<{
    composite: PartialJSONValue | undefined;
    user: PartialJSONValue | undefined;
  }>;

  /**
   * Load a plugin's settings into the setting registry.
   *
   * @param plugin - The name of the plugin whose settings are being loaded.
   *
   * @returns A promise that resolves with a plugin settings object or rejects
   * if the plugin is not found.
   */
  load(plugin: string): Promise<ISettingRegistry.ISettings>;

  /**
   * Reload a plugin's settings into the registry even if they already exist.
   *
   * @param plugin - The name of the plugin whose settings are being reloaded.
   *
   * @returns A promise that resolves with a plugin settings object or rejects
   * with a list of `ISchemaValidator.IError` objects if it fails.
   */
  reload(plugin: string): Promise<ISettingRegistry.ISettings>;

  /**
   * Remove a single setting in the registry.
   *
   * @param plugin - The name of the plugin whose setting is being removed.
   *
   * @param key - The name of the setting being removed.
   *
   * @returns A promise that resolves when the setting is removed.
   */
  remove(plugin: string, key: string): Promise<void>;

  /**
   * Set a single setting in the registry.
   *
   * @param plugin - The name of the plugin whose setting is being set.
   *
   * @param key - The name of the setting being set.
   *
   * @param value - The value of the setting being set.
   *
   * @returns A promise that resolves when the setting has been saved.
   *
   */
  set(plugin: string, key: string, value: PartialJSONValue): Promise<void>;

  /**
   * Register a plugin transform function to act on a specific plugin.
   *
   * @param plugin - The name of the plugin whose settings are transformed.
   *
   * @param transforms - The transform functions applied to the plugin.
   *
   * @returns A disposable that removes the transforms from the registry.
   *
   * #### Notes
   * - `compose` transformations: The registry automatically overwrites a
   * plugin's default values with user overrides, but a plugin may instead wish
   * to merge values. This behavior can be accomplished in a `compose`
   * transformation.
   * - `fetch` transformations: The registry uses the plugin data that is
   * fetched from its connector. If a plugin wants to override, e.g. to update
   * its schema with dynamic defaults, a `fetch` transformation can be applied.
   */
  transform(
    plugin: string,
    transforms: {
      [phase in ISettingRegistry.IPlugin.Phase]?: ISettingRegistry.IPlugin.Transform;
    }
  ): IDisposable;

  /**
   * Upload a plugin's settings.
   *
   * @param plugin - The name of the plugin whose settings are being set.
   *
   * @param raw - The raw plugin settings being uploaded.
   *
   * @returns A promise that resolves when the settings have been saved.
   */
  upload(plugin: string, raw: string): Promise<void>;
}

/**
 * A namespace for setting registry interfaces.
 */
export namespace ISettingRegistry {
  /**
   * The primitive types available in a JSON schema.
   */
  export type Primitive =
    | 'array'
    | 'boolean'
    | 'null'
    | 'number'
    | 'object'
    | 'string';

  /**
   * The menu ids defined by default.
   */
  export type DefaultMenuId =
    | 'jp-menu-file'
    | 'jp-menu-file-new'
    | 'jp-menu-edit'
    | 'jp-menu-help'
    | 'jp-menu-kernel'
    | 'jp-menu-run'
    | 'jp-menu-settings'
    | 'jp-menu-view'
    | 'jp-menu-tabs';

  /**
   * An interface defining a menu.
   */
  export interface IMenu extends PartialJSONObject {
    /**
     * Unique menu identifier
     */
    id: DefaultMenuId | string;

    /**
     * Menu items
     */
    items?: IMenuItem[];

    /**
     * The rank order of the menu among its siblings.
     */
    rank?: number;

    /**
     * Menu title
     *
     * #### Notes
     * Default will be the capitalized id.
     */
    label?: string;

    /**
     * Whether a menu is disabled. `False` by default.
     *
     * #### Notes
     * This allows an user to suppress a menu.
     */
    disabled?: boolean;
  }

  /**
   * An interface describing a menu item.
   */
  export interface IMenuItem extends PartialJSONObject {
    /**
     * The type of the menu item.
     *
     * The default value is `'command'`.
     */
    type?: 'command' | 'submenu' | 'separator';

    /**
     * The command to execute when the item is triggered.
     *
     * The default value is an empty string.
     */
    command?: string;

    /**
     * The arguments for the command.
     *
     * The default value is an empty object.
     */
    args?: PartialJSONObject;

    /**
     * The rank order of the menu item among its siblings.
     */
    rank?: number;

    /**
     * The submenu for a `'submenu'` type item.
     *
     * The default value is `null`.
     */
    submenu?: IMenu | null;

    /**
     * Whether a menu item is disabled. `false` by default.
     *
     * #### Notes
     * This allows an user to suppress menu items.
     */
    disabled?: boolean;
  }

  export interface IContextMenuItem extends IMenuItem {
    /**
     * The CSS selector for the context menu item.
     *
     * The context menu item will only be displayed in the context menu
     * when the selector matches a node on the propagation path of the
     * contextmenu event. This allows the menu item to be restricted to
     * user-defined contexts.
     *
     * The selector must not contain commas.
     */
    selector: string;
  }

  /**
   * The settings for a specific plugin.
   */
  export interface IPlugin extends PartialJSONObject {
    /**
     * The name of the plugin.
     */
    id: string;

    /**
     * The collection of values for a specified plugin.
     */
    data: ISettingBundle;

    /**
     * The raw user settings data as a string containing JSON with comments.
     */
    raw: string;

    /**
     * The JSON schema for the plugin.
     */
    schema: ISchema;

    /**
     * The published version of the NPM package containing the plugin.
     */
    version: string;
  }

  /**
   * A namespace for plugin functionality.
   */
  export namespace IPlugin {
    /**
     * A function that transforms a plugin object before it is consumed by the
     * setting registry.
     */
    export type Transform = (plugin: IPlugin) => IPlugin;

    /**
     * The phases during which a transformation may be applied to a plugin.
     */
    export type Phase = 'compose' | 'fetch';
  }

  /**
   * A minimal subset of the formal JSON Schema that describes a property.
   */
  export interface IProperty extends PartialJSONObject {
    /**
     * The default value, if any.
     */
    default?: PartialJSONValue;

    /**
     * The schema description.
     */
    description?: string;

    /**
     * The schema's child properties.
     */
    properties?: { [property: string]: IProperty };

    /**
     * The title of a property.
     */
    title?: string;

    /**
     * The type or types of the data.
     */
    type?: Primitive | Primitive[];
  }

  /**
   * A schema type that is a minimal subset of the formal JSON Schema along with
   * optional JupyterLab rendering hints.
   */
  export interface ISchema extends IProperty {
    /**
     * The JupyterLab menus that are created by a plugin's schema.
     */
    'jupyter.lab.menus'?: {
      main: IMenu[];
      context: IContextMenuItem[];
    };

    /**
     * Whether the schema is deprecated.
     *
     * #### Notes
     * This flag can be used by functionality that loads this plugin's settings
     * from the registry. For example, the setting editor does not display a
     * plugin's settings if it is set to `true`.
     */
    'jupyter.lab.setting-deprecated'?: boolean;

    /**
     * The JupyterLab icon hint.
     */
    'jupyter.lab.setting-icon'?: string;

    /**
     * The JupyterLab icon class hint.
     */
    'jupyter.lab.setting-icon-class'?: string;

    /**
     * The JupyterLab icon label hint.
     */
    'jupyter.lab.setting-icon-label'?: string;

    /**
     * The JupyterLab toolbars created by a plugin's schema.
     *
     * #### Notes
     * The toolbar items are grouped by document or widget factory name
     * that will contain a toolbar.
     */
    'jupyter.lab.toolbars'?: { [factory: string]: IToolbarItem[] };

    /**
     * A flag that indicates plugin should be transformed before being used by
     * the setting registry.
     *
     * #### Notes
     * If this value is set to `true`, the setting registry will wait until a
     * transformation has been registered (by calling the `transform()` method
     * of the registry) for the plugin ID before resolving `load()` promises.
     * This means that if the attribute is set to `true` but no transformation
     * is registered in time, calls to `load()` a plugin will eventually time
     * out and reject.
     */
    'jupyter.lab.transform'?: boolean;

    /**
     * The JupyterLab shortcuts that are created by a plugin's schema.
     */
    'jupyter.lab.shortcuts'?: IShortcut[];

    /**
     * The root schema is always an object.
     */
    type: 'object';
  }

  /**
   * The setting values for a plugin.
   */
  export interface ISettingBundle extends PartialJSONObject {
    /**
     * A composite of the user setting values and the plugin schema defaults.
     *
     * #### Notes
     * The `composite` values will always be a superset of the `user` values.
     */
    composite: PartialJSONObject;

    /**
     * The user setting values.
     */
    user: PartialJSONObject;
  }

  /**
   * An interface for manipulating the settings of a specific plugin.
   */
  export interface ISettings extends IDisposable {
    /**
     * A signal that emits when the plugin's settings have changed.
     */
    readonly changed: ISignal<this, void>;

    /**
     * The composite of user settings and extension defaults.
     */
    readonly composite: ReadonlyPartialJSONObject;

    /**
     * The plugin's ID.
     */
    readonly id: string;

    /*
     * The underlying plugin.
     */
    readonly plugin: ISettingRegistry.IPlugin;

    /**
     * The plugin settings raw text value.
     */
    readonly raw: string;

    /**
     * The plugin's schema.
     */
    readonly schema: ISettingRegistry.ISchema;

    /**
     * The user settings.
     */
    readonly user: ReadonlyPartialJSONObject;

    /**
     * The published version of the NPM package containing these settings.
     */
    readonly version: string;

    /**
     * Return the defaults in a commented JSON format.
     */
    annotatedDefaults(): string;

    /**
     * Calculate the default value of a setting by iterating through the schema.
     *
     * @param key - The name of the setting whose default value is calculated.
     *
     * @returns A calculated default JSON value for a specific setting.
     */
    default(key: string): PartialJSONValue | undefined;

    /**
     * Get an individual setting.
     *
     * @param key - The name of the setting being retrieved.
     *
     * @returns The setting value.
     */
    get(
      key: string
    ): {
      composite: ReadonlyPartialJSONValue | undefined;
      user: ReadonlyPartialJSONValue | undefined;
    };

    /**
     * Remove a single setting.
     *
     * @param key - The name of the setting being removed.
     *
     * @returns A promise that resolves when the setting is removed.
     *
     * #### Notes
     * This function is asynchronous because it writes to the setting registry.
     */
    remove(key: string): Promise<void>;

    /**
     * Save all of the plugin's user settings at once.
     */
    save(raw: string): Promise<void>;

    /**
     * Set a single setting.
     *
     * @param key - The name of the setting being set.
     *
     * @param value - The value of the setting.
     *
     * @returns A promise that resolves when the setting has been saved.
     *
     * #### Notes
     * This function is asynchronous because it writes to the setting registry.
     */
    set(key: string, value: PartialJSONValue): Promise<void>;

    /**
     * Validates raw settings with comments.
     *
     * @param raw - The JSON with comments string being validated.
     *
     * @returns A list of errors or `null` if valid.
     */
    validate(raw: string): ISchemaValidator.IError[] | null;
  }

  /**
   * An interface describing a JupyterLab keyboard shortcut.
   */
  export interface IShortcut extends PartialJSONObject {
    /**
     * The optional arguments passed into the shortcut's command.
     */
    args?: PartialJSONObject;

    /**
     * The command invoked by the shortcut.
     */
    command: string;

    /**
     * Whether a keyboard shortcut is disabled. `False` by default.
     */
    disabled?: boolean;

    /**
     * The key combination of the shortcut.
     */
    keys: string[];

    /**
     * The CSS selector applicable to the shortcut.
     */
    selector: string;
  }

  /**
   * An interface describing a toolbar item.
   */
  export interface IToolbarItem extends PartialJSONObject {
    /**
     * Unique toolbar item name
     */
    name: string;

    /**
     * The command to execute when the item is triggered.
     *
     * The default value is an empty string.
     */
    command?: string;

    /**
     * The arguments for the command.
     *
     * The default value is an empty object.
     */
    args?: PartialJSONObject;

    /**
     * Whether the toolbar item is disabled. `false` by default.
     *
     * #### Notes
     * This allows an user to suppress toolbar items.
     */
    disabled?: boolean;

    /**
     * Item icon id
     *
     * #### Note
     * The id will be looked for in the LabIcon registry.
     * The command icon will be overridden by this label if defined.
     */
    icon?: string;

    /**
     * Item label
     *
     * #### Note
     * The command label will be overridden by this label if defined.
     */
    label?: string;

    /**
     * The rank order of the toolbar item among its siblings.
     */
    rank?: number;

    /**
     * The type of the toolbar item.
     */
    type?: 'command' | 'spacer';
  }
}
