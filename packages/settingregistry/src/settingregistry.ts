// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IDataConnector } from '@jupyterlab/statedb';
import { CommandRegistry } from '@lumino/commands';
import {
  JSONExt,
  JSONObject,
  JSONValue,
  PartialJSONObject,
  PartialJSONValue,
  ReadonlyJSONObject,
  ReadonlyPartialJSONObject,
  ReadonlyPartialJSONValue
} from '@lumino/coreutils';
import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { ISignal, Signal } from '@lumino/signaling';
import Ajv from 'ajv';
import * as json5 from 'json5';
import SCHEMA from './plugin-schema.json';
import { ISettingRegistry } from './tokens';

/**
 * An alias for the JSON deep copy function.
 */
const copy = JSONExt.deepCopy;

/**
 * The default number of milliseconds before a `load()` call to the registry
 * will wait before timing out if it requires a transformation that has not been
 * registered.
 */
const DEFAULT_TRANSFORM_TIMEOUT = 1000;

/**
 * The ASCII record separator character.
 */
const RECORD_SEPARATOR = String.fromCharCode(30);

/**
 * An implementation of a schema validator.
 */
export interface ISchemaValidator {
  /**
   * Validate a plugin's schema and user data; populate the `composite` data.
   *
   * @param plugin - The plugin being validated. Its `composite` data will be
   * populated by reference.
   *
   * @param populate - Whether plugin data should be populated, defaults to
   * `true`.
   *
   * @return A list of errors if either the schema or data fail to validate or
   * `null` if there are no errors.
   */
  validateData(
    plugin: ISettingRegistry.IPlugin,
    populate?: boolean
  ): ISchemaValidator.IError[] | null;
}

/**
 * A namespace for schema validator interfaces.
 */
export namespace ISchemaValidator {
  /**
   * A schema validation error definition.
   */
  export interface IError {
    /**
     * The path in the data where the error occurred.
     */
    dataPath: string;

    /**
     * The keyword whose validation failed.
     */
    keyword: string;

    /**
     * The error message.
     */
    message: string;

    /**
     * Optional parameter metadata that might be included in an error.
     */
    params?: ReadonlyJSONObject;

    /**
     * The path in the schema where the error occurred.
     */
    schemaPath: string;
  }
}

/**
 * The default implementation of a schema validator.
 */
export class DefaultSchemaValidator implements ISchemaValidator {
  /**
   * Instantiate a schema validator.
   */
  constructor() {
    this._composer.addSchema(SCHEMA, 'jupyterlab-plugin-schema');
    this._validator.addSchema(SCHEMA, 'jupyterlab-plugin-schema');
  }

  /**
   * Validate a plugin's schema and user data; populate the `composite` data.
   *
   * @param plugin - The plugin being validated. Its `composite` data will be
   * populated by reference.
   *
   * @param populate - Whether plugin data should be populated, defaults to
   * `true`.
   *
   * @return A list of errors if either the schema or data fail to validate or
   * `null` if there are no errors.
   */
  validateData(
    plugin: ISettingRegistry.IPlugin,
    populate = true
  ): ISchemaValidator.IError[] | null {
    const validate = this._validator.getSchema(plugin.id);
    const compose = this._composer.getSchema(plugin.id);

    // If the schemas do not exist, add them to the validator and continue.
    if (!validate || !compose) {
      if (plugin.schema.type !== 'object') {
        const keyword = 'schema';
        const message =
          `Setting registry schemas' root-level type must be ` +
          `'object', rejecting type: ${plugin.schema.type}`;

        return [{ dataPath: 'type', keyword, schemaPath: '', message }];
      }

      const errors = this._addSchema(plugin.id, plugin.schema);

      return errors || this.validateData(plugin);
    }

    // Parse the raw commented JSON into a user map.
    let user: JSONObject;
    try {
      user = json5.parse(plugin.raw) as JSONObject;
    } catch (error) {
      if (error instanceof SyntaxError) {
        return [
          {
            dataPath: '',
            keyword: 'syntax',
            schemaPath: '',
            message: error.message
          }
        ];
      }

      const { column, description } = error;
      const line = error.lineNumber;

      return [
        {
          dataPath: '',
          keyword: 'parse',
          schemaPath: '',
          message: `${description} (line ${line} column ${column})`
        }
      ];
    }

    if (!validate(user)) {
      return validate.errors as ISchemaValidator.IError[];
    }

    // Copy the user data before merging defaults into composite map.
    const composite = copy(user);

    if (!compose(composite)) {
      return compose.errors as ISchemaValidator.IError[];
    }

    if (populate) {
      plugin.data = { composite, user };
    }

    return null;
  }

  /**
   * Add a schema to the validator.
   *
   * @param plugin - The plugin ID.
   *
   * @param schema - The schema being added.
   *
   * @return A list of errors if the schema fails to validate or `null` if there
   * are no errors.
   *
   * #### Notes
   * It is safe to call this function multiple times with the same plugin name.
   */
  private _addSchema(
    plugin: string,
    schema: ISettingRegistry.ISchema
  ): ISchemaValidator.IError[] | null {
    const composer = this._composer;
    const validator = this._validator;
    const validate = validator.getSchema('jupyterlab-plugin-schema')!;

    // Validate against the main schema.
    if (!(validate!(schema) as boolean)) {
      return validate!.errors as ISchemaValidator.IError[];
    }

    // Validate against the JSON schema meta-schema.
    if (!(validator.validateSchema(schema) as boolean)) {
      return validator.errors as ISchemaValidator.IError[];
    }

    // Remove if schema already exists.
    composer.removeSchema(plugin);
    validator.removeSchema(plugin);

    // Add schema to the validator and composer.
    composer.addSchema(schema, plugin);
    validator.addSchema(schema, plugin);

    return null;
  }

  private _composer = new Ajv({ useDefaults: true });
  private _validator = new Ajv();
}

/**
 * The default concrete implementation of a setting registry.
 */
export class SettingRegistry implements ISettingRegistry {
  /**
   * Create a new setting registry.
   */
  constructor(options: SettingRegistry.IOptions) {
    this.connector = options.connector;
    this.validator = options.validator || new DefaultSchemaValidator();
    this._timeout = options.timeout || DEFAULT_TRANSFORM_TIMEOUT;

    // Preload with any available data at instantiation-time.
    if (options.plugins) {
      this._ready = this._preload(options.plugins);
    }
  }

  /**
   * The data connector used by the setting registry.
   */
  readonly connector: IDataConnector<ISettingRegistry.IPlugin, string, string>;

  /**
   * The schema of the setting registry.
   */
  readonly schema = SCHEMA as ISettingRegistry.ISchema;

  /**
   * The schema validator used by the setting registry.
   */
  readonly validator: ISchemaValidator;

  /**
   * A signal that emits the name of a plugin when its settings change.
   */
  get pluginChanged(): ISignal<this, string> {
    return this._pluginChanged;
  }

  /**
   * The collection of setting registry plugins.
   */
  readonly plugins: {
    [name: string]: ISettingRegistry.IPlugin;
  } = Object.create(null);

  /**
   * Get an individual setting.
   *
   * @param plugin - The name of the plugin whose settings are being retrieved.
   *
   * @param key - The name of the setting being retrieved.
   *
   * @returns A promise that resolves when the setting is retrieved.
   */
  async get(
    plugin: string,
    key: string
  ): Promise<{
    composite: PartialJSONValue | undefined;
    user: PartialJSONValue | undefined;
  }> {
    // Wait for data preload before allowing normal operation.
    await this._ready;

    const plugins = this.plugins;

    if (plugin in plugins) {
      const { composite, user } = plugins[plugin].data;

      return {
        composite:
          composite[key] !== undefined ? copy(composite[key]!) : undefined,
        user: user[key] !== undefined ? copy(user[key]!) : undefined
      };
    }

    return this.load(plugin).then(() => this.get(plugin, key));
  }

  /**
   * Load a plugin's settings into the setting registry.
   *
   * @param plugin - The name of the plugin whose settings are being loaded.
   *
   * @returns A promise that resolves with a plugin settings object or rejects
   * if the plugin is not found.
   */
  async load(plugin: string): Promise<ISettingRegistry.ISettings> {
    // Wait for data preload before allowing normal operation.
    await this._ready;

    const plugins = this.plugins;
    const registry = this; // eslint-disable-line

    // If the plugin exists, resolve.
    if (plugin in plugins) {
      return new Settings({ plugin: plugins[plugin], registry });
    }

    // If the plugin needs to be loaded from the data connector, fetch.
    return this.reload(plugin);
  }

  /**
   * Reload a plugin's settings into the registry even if they already exist.
   *
   * @param plugin - The name of the plugin whose settings are being reloaded.
   *
   * @returns A promise that resolves with a plugin settings object or rejects
   * with a list of `ISchemaValidator.IError` objects if it fails.
   */
  async reload(plugin: string): Promise<ISettingRegistry.ISettings> {
    // Wait for data preload before allowing normal operation.
    await this._ready;

    const fetched = await this.connector.fetch(plugin);
    const plugins = this.plugins; // eslint-disable-line
    const registry = this; // eslint-disable-line

    if (fetched === undefined) {
      throw [
        {
          dataPath: '',
          keyword: 'id',
          message: `Could not fetch settings for ${plugin}.`,
          schemaPath: ''
        } as ISchemaValidator.IError
      ];
    }
    await this._load(await this._transform('fetch', fetched));
    this._pluginChanged.emit(plugin);

    return new Settings({ plugin: plugins[plugin], registry });
  }

  /**
   * Remove a single setting in the registry.
   *
   * @param plugin - The name of the plugin whose setting is being removed.
   *
   * @param key - The name of the setting being removed.
   *
   * @returns A promise that resolves when the setting is removed.
   */
  async remove(plugin: string, key: string): Promise<void> {
    // Wait for data preload before allowing normal operation.
    await this._ready;

    const plugins = this.plugins;

    if (!(plugin in plugins)) {
      return;
    }

    const raw = json5.parse(plugins[plugin].raw);

    // Delete both the value and any associated comment.
    delete raw[key];
    delete raw[`// ${key}`];
    plugins[plugin].raw = Private.annotatedPlugin(plugins[plugin], raw);

    return this._save(plugin);
  }

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
  async set(plugin: string, key: string, value: JSONValue): Promise<void> {
    // Wait for data preload before allowing normal operation.
    await this._ready;

    const plugins = this.plugins;

    if (!(plugin in plugins)) {
      return this.load(plugin).then(() => this.set(plugin, key, value));
    }

    // Parse the raw JSON string removing all comments and return an object.
    const raw = json5.parse(plugins[plugin].raw);

    plugins[plugin].raw = Private.annotatedPlugin(plugins[plugin], {
      ...raw,
      [key]: value
    });

    return this._save(plugin);
  }

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
  ): IDisposable {
    const transformers = this._transformers;

    if (plugin in transformers) {
      throw new Error(`${plugin} already has a transformer.`);
    }

    transformers[plugin] = {
      fetch: transforms.fetch || (plugin => plugin),
      compose: transforms.compose || (plugin => plugin)
    };

    return new DisposableDelegate(() => {
      delete transformers[plugin];
    });
  }

  /**
   * Upload a plugin's settings.
   *
   * @param plugin - The name of the plugin whose settings are being set.
   *
   * @param raw - The raw plugin settings being uploaded.
   *
   * @returns A promise that resolves when the settings have been saved.
   */
  async upload(plugin: string, raw: string): Promise<void> {
    // Wait for data preload before allowing normal operation.
    await this._ready;

    const plugins = this.plugins;

    if (!(plugin in plugins)) {
      return this.load(plugin).then(() => this.upload(plugin, raw));
    }

    // Set the local copy.
    plugins[plugin].raw = raw;

    return this._save(plugin);
  }

  /**
   * Load a plugin into the registry.
   */
  private async _load(data: ISettingRegistry.IPlugin): Promise<void> {
    const plugin = data.id;

    // Validate and preload the item.
    try {
      await this._validate(data);
    } catch (errors) {
      const output = [`Validating ${plugin} failed:`];

      (errors as ISchemaValidator.IError[]).forEach((error, index) => {
        const { dataPath, schemaPath, keyword, message } = error;

        if (dataPath || schemaPath) {
          output.push(`${index} - schema @ ${schemaPath}, data @ ${dataPath}`);
        }
        output.push(`{${keyword}} ${message}`);
      });
      console.warn(output.join('\n'));

      throw errors;
    }
  }

  /**
   * Preload a list of plugins and fail gracefully.
   */
  private async _preload(plugins: ISettingRegistry.IPlugin[]): Promise<void> {
    await Promise.all(
      plugins.map(async plugin => {
        try {
          // Apply a transformation to the plugin if necessary.
          await this._load(await this._transform('fetch', plugin));
        } catch (errors) {
          /* Ignore preload timeout errors silently. */
          if (errors[0]?.keyword !== 'timeout') {
            console.warn('Ignored setting registry preload errors.', errors);
          }
        }
      })
    );
  }

  /**
   * Save a plugin in the registry.
   */
  private async _save(plugin: string): Promise<void> {
    const plugins = this.plugins;

    if (!(plugin in plugins)) {
      throw new Error(`${plugin} does not exist in setting registry.`);
    }

    try {
      await this._validate(plugins[plugin]);
    } catch (errors) {
      console.warn(`${plugin} validation errors:`, errors);
      throw new Error(`${plugin} failed to validate; check console.`);
    }
    await this.connector.save(plugin, plugins[plugin].raw);

    // Fetch and reload the data to guarantee server and client are in sync.
    const fetched = await this.connector.fetch(plugin);
    if (fetched === undefined) {
      throw [
        {
          dataPath: '',
          keyword: 'id',
          message: `Could not fetch settings for ${plugin}.`,
          schemaPath: ''
        } as ISchemaValidator.IError
      ];
    }
    await this._load(await this._transform('fetch', fetched));
    this._pluginChanged.emit(plugin);
  }

  /**
   * Transform the plugin if necessary.
   */
  private async _transform(
    phase: ISettingRegistry.IPlugin.Phase,
    plugin: ISettingRegistry.IPlugin,
    started = new Date().getTime()
  ): Promise<ISettingRegistry.IPlugin> {
    const elapsed = new Date().getTime() - started;
    const id = plugin.id;
    const transformers = this._transformers;
    const timeout = this._timeout;

    if (!plugin.schema['jupyter.lab.transform']) {
      return plugin;
    }

    if (id in transformers) {
      const transformed = transformers[id][phase].call(null, plugin);

      if (transformed.id !== id) {
        throw [
          {
            dataPath: '',
            keyword: 'id',
            message: 'Plugin transformations cannot change plugin IDs.',
            schemaPath: ''
          } as ISchemaValidator.IError
        ];
      }

      return transformed;
    }

    // If the timeout has not been exceeded, stall and try again in 250ms.
    if (elapsed < timeout) {
      await new Promise<void>(resolve => {
        setTimeout(() => {
          resolve();
        }, 250);
      });
      return this._transform(phase, plugin, started);
    }

    throw [
      {
        dataPath: '',
        keyword: 'timeout',
        message: `Transforming ${plugin.id} timed out.`,
        schemaPath: ''
      } as ISchemaValidator.IError
    ];
  }

  /**
   * Validate and preload a plugin, compose the `composite` data.
   */
  private async _validate(plugin: ISettingRegistry.IPlugin): Promise<void> {
    // Validate the user data and create the composite data.
    const errors = this.validator.validateData(plugin);

    if (errors) {
      throw errors;
    }

    // Apply a transformation if necessary and set the local copy.
    this.plugins[plugin.id] = await this._transform('compose', plugin);
  }

  private _pluginChanged = new Signal<this, string>(this);
  private _ready = Promise.resolve();
  private _timeout: number;
  private _transformers: {
    [plugin: string]: {
      [phase in ISettingRegistry.IPlugin.Phase]: ISettingRegistry.IPlugin.Transform;
    };
  } = Object.create(null);
}

/**
 * A manager for a specific plugin's settings.
 */
export class Settings implements ISettingRegistry.ISettings {
  /**
   * Instantiate a new plugin settings manager.
   */
  constructor(options: Settings.IOptions) {
    this.id = options.plugin.id;
    this.registry = options.registry;
    this.registry.pluginChanged.connect(this._onPluginChanged, this);
  }

  /**
   * The plugin name.
   */
  readonly id: string;

  /**
   * The setting registry instance used as a back-end for these settings.
   */
  readonly registry: ISettingRegistry;

  /**
   * A signal that emits when the plugin's settings have changed.
   */
  get changed(): ISignal<this, void> {
    return this._changed;
  }

  /**
   * The composite of user settings and extension defaults.
   */
  get composite(): ReadonlyPartialJSONObject {
    return this.plugin.data.composite;
  }

  /**
   * Test whether the plugin settings manager disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get plugin(): ISettingRegistry.IPlugin {
    return this.registry.plugins[this.id]!;
  }

  /**
   * The plugin's schema.
   */
  get schema(): ISettingRegistry.ISchema {
    return this.plugin.schema;
  }

  /**
   * The plugin settings raw text value.
   */
  get raw(): string {
    return this.plugin.raw;
  }

  /**
   * The user settings.
   */
  get user(): ReadonlyPartialJSONObject {
    return this.plugin.data.user;
  }

  /**
   * The published version of the NPM package containing these settings.
   */
  get version(): string {
    return this.plugin.version;
  }

  /**
   * Return the defaults in a commented JSON format.
   */
  annotatedDefaults(): string {
    return Private.annotatedDefaults(this.schema, this.id);
  }

  /**
   * Calculate the default value of a setting by iterating through the schema.
   *
   * @param key - The name of the setting whose default value is calculated.
   *
   * @returns A calculated default JSON value for a specific setting.
   */
  default(key: string): PartialJSONValue | undefined {
    return Private.reifyDefault(this.schema, key);
  }

  /**
   * Dispose of the plugin settings resources.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;
    Signal.clearData(this);
  }

  /**
   * Get an individual setting.
   *
   * @param key - The name of the setting being retrieved.
   *
   * @returns The setting value.
   *
   * #### Notes
   * This method returns synchronously because it uses a cached copy of the
   * plugin settings that is synchronized with the registry.
   */
  get(
    key: string
  ): {
    composite: ReadonlyPartialJSONValue | undefined;
    user: ReadonlyPartialJSONValue | undefined;
  } {
    const { composite, user } = this;

    return {
      composite:
        composite[key] !== undefined ? copy(composite[key]!) : undefined,
      user: user[key] !== undefined ? copy(user[key]!) : undefined
    };
  }

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
  remove(key: string): Promise<void> {
    return this.registry.remove(this.plugin.id, key);
  }

  /**
   * Save all of the plugin's user settings at once.
   */
  save(raw: string): Promise<void> {
    return this.registry.upload(this.plugin.id, raw);
  }

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
  set(key: string, value: JSONValue): Promise<void> {
    return this.registry.set(this.plugin.id, key, value);
  }

  /**
   * Validates raw settings with comments.
   *
   * @param raw - The JSON with comments string being validated.
   *
   * @returns A list of errors or `null` if valid.
   */
  validate(raw: string): ISchemaValidator.IError[] | null {
    const data = { composite: {}, user: {} };
    const { id, schema } = this.plugin;
    const validator = this.registry.validator;
    const version = this.version;

    return validator.validateData({ data, id, raw, schema, version }, false);
  }

  /**
   * Handle plugin changes in the setting registry.
   */
  private _onPluginChanged(sender: any, plugin: string): void {
    if (plugin === this.plugin.id) {
      this._changed.emit(undefined);
    }
  }

  private _changed = new Signal<this, void>(this);
  private _isDisposed = false;
}

/**
 * A namespace for `SettingRegistry` statics.
 */
export namespace SettingRegistry {
  /**
   * The instantiation options for a setting registry
   */
  export interface IOptions {
    /**
     * The data connector used by the setting registry.
     */
    connector: IDataConnector<ISettingRegistry.IPlugin, string>;

    /**
     * Preloaded plugin data to populate the setting registry.
     */
    plugins?: ISettingRegistry.IPlugin[];

    /**
     * The number of milliseconds before a `load()` call to the registry waits
     * before timing out if it requires a transformation that has not been
     * registered.
     *
     * #### Notes
     * The default value is 7000.
     */
    timeout?: number;

    /**
     * The validator used to enforce the settings JSON schema.
     */
    validator?: ISchemaValidator;
  }

  /**
   * Reconcile the menus.
   *
   * @param reference The reference list of menus.
   * @param addition The list of menus to add.
   * @param warn Warn if the command items are duplicated within the same menu.
   * @returns The reconciled list of menus.
   */
  export function reconcileMenus(
    reference: ISettingRegistry.IMenu[] | null,
    addition: ISettingRegistry.IMenu[] | null,
    warn: boolean = false,
    addNewItems: boolean = true
  ): ISettingRegistry.IMenu[] {
    if (!reference) {
      return addition && addNewItems ? JSONExt.deepCopy(addition) : [];
    }
    if (!addition) {
      return JSONExt.deepCopy(reference);
    }

    const merged = JSONExt.deepCopy(reference);

    addition.forEach(menu => {
      const refIndex = merged.findIndex(ref => ref.id === menu.id);
      if (refIndex >= 0) {
        merged[refIndex] = {
          ...merged[refIndex],
          ...menu,
          items: reconcileItems(
            merged[refIndex].items,
            menu.items,
            warn,
            addNewItems
          )
        };
      } else {
        if (addNewItems) {
          merged.push(menu);
        }
      }
    });

    return merged;
  }

  /**
   * Merge two set of menu items.
   *
   * @param reference Reference set of menu items
   * @param addition New items to add
   * @param warn Whether to warn if item is duplicated; default to false
   * @returns The merged set of items
   */
  export function reconcileItems<T extends ISettingRegistry.IMenuItem>(
    reference?: T[],
    addition?: T[],
    warn: boolean = false,
    addNewItems: boolean = true
  ): T[] | undefined {
    if (!reference) {
      return addition ? JSONExt.deepCopy(addition) : undefined;
    }
    if (!addition) {
      return JSONExt.deepCopy(reference);
    }

    const items = JSONExt.deepCopy(reference);

    // Merge array element depending on the type
    addition.forEach(item => {
      switch (item.type ?? 'command') {
        case 'separator':
          if (addNewItems) {
            items.push({ ...item });
          }
          break;
        case 'submenu':
          if (item.submenu) {
            const refIndex = items.findIndex(
              ref =>
                ref.type === 'submenu' && ref.submenu?.id === item.submenu?.id
            );
            if (refIndex < 0) {
              if (addNewItems) {
                items.push(JSONExt.deepCopy(item));
              }
            } else {
              items[refIndex] = {
                ...items[refIndex],
                ...item,
                submenu: reconcileMenus(
                  items[refIndex].submenu
                    ? [items[refIndex].submenu as any]
                    : null,
                  [item.submenu],
                  warn,
                  addNewItems
                )[0]
              };
            }
          }
          break;
        case 'command':
          if (item.command) {
            const refIndex = items.findIndex(
              ref =>
                ref.command === item.command &&
                ref.selector === item.selector &&
                JSONExt.deepEqual(ref.args ?? {}, item.args ?? {})
            );
            if (refIndex < 0) {
              if (addNewItems) {
                items.push({ ...item });
              }
            } else {
              if (warn) {
                console.warn(
                  `Menu entry for command '${item.command}' is duplicated.`
                );
              }
              items[refIndex] = { ...items[refIndex], ...item };
            }
          }
      }
    });

    return items;
  }

  /**
   * Remove disabled entries from menu items
   *
   * @param items Menu items
   * @returns Filtered menu items
   */
  export function filterDisabledItems<T extends ISettingRegistry.IMenuItem>(
    items: T[]
  ): T[] {
    return items.reduce<T[]>((final, value) => {
      const copy = { ...value };
      if (!copy.disabled) {
        if (copy.type === 'submenu') {
          const { submenu } = copy;
          if (submenu && !submenu.disabled) {
            copy.submenu = {
              ...submenu,
              items: filterDisabledItems(submenu.items ?? [])
            };
          }
        }
        final.push(copy);
      }

      return final;
    }, []);
  }

  /**
   * Reconcile default and user shortcuts and return the composite list.
   *
   * @param defaults - The list of default shortcuts.
   *
   * @param user - The list of user shortcut overrides and additions.
   *
   * @returns A loadable list of shortcuts (omitting disabled and overridden).
   */
  export function reconcileShortcuts(
    defaults: ISettingRegistry.IShortcut[],
    user: ISettingRegistry.IShortcut[]
  ): ISettingRegistry.IShortcut[] {
    const memo: {
      [keys: string]: {
        [selector: string]: boolean; // If `true`, should warn if a default shortcut conflicts.
      };
    } = {};

    // If a user shortcut collides with another user shortcut warn and filter.
    user = user.filter(shortcut => {
      const keys = CommandRegistry.normalizeKeys(shortcut).join(
        RECORD_SEPARATOR
      );
      if (!keys) {
        console.warn(
          'Skipping this shortcut because there are no actionable keys on this platform',
          shortcut
        );
        return false;
      }
      if (!(keys in memo)) {
        memo[keys] = {};
      }

      const { selector } = shortcut;
      if (!(selector in memo[keys])) {
        memo[keys][selector] = false; // Do not warn if a default shortcut conflicts.
        return true;
      }

      console.warn(
        'Skipping this shortcut because it collides with another shortcut.',
        shortcut
      );
      return false;
    });

    // If a default shortcut collides with another default, warn and filter,
    // unless one of the shortcuts is a disabling shortcut (so look through
    // disabled shortcuts first). If a shortcut has already been added by the
    // user preferences, filter it out too (this includes shortcuts that are
    // disabled by user preferences).
    defaults = [
      ...defaults.filter(s => !!s.disabled),
      ...defaults.filter(s => !s.disabled)
    ].filter(shortcut => {
      const keys = CommandRegistry.normalizeKeys(shortcut).join(
        RECORD_SEPARATOR
      );

      if (!keys) {
        return false;
      }
      if (!(keys in memo)) {
        memo[keys] = {};
      }

      const { disabled, selector } = shortcut;
      if (!(selector in memo[keys])) {
        // Warn of future conflicts if the default shortcut is not disabled.
        memo[keys][selector] = !disabled;
        return true;
      }

      // We have a conflict now. Warn the user if we need to do so.
      if (memo[keys][selector]) {
        console.warn(
          'Skipping this default shortcut because it collides with another default shortcut.',
          shortcut
        );
      }

      return false;
    });

    // Return all the shortcuts that should be registered
    return user.concat(defaults).filter(shortcut => !shortcut.disabled);
  }

  /**
   * Merge two set of toolbar items.
   *
   * @param reference Reference set of toolbar items
   * @param addition New items to add
   * @param warn Whether to warn if item is duplicated; default to false
   * @returns The merged set of items
   */
  export function reconcileToolbarItems(
    reference?: ISettingRegistry.IToolbarItem[],
    addition?: ISettingRegistry.IToolbarItem[],
    warn: boolean = false
  ): ISettingRegistry.IToolbarItem[] | undefined {
    if (!reference) {
      return addition ? JSONExt.deepCopy(addition) : undefined;
    }
    if (!addition) {
      return JSONExt.deepCopy(reference);
    }

    const items = JSONExt.deepCopy(reference);

    // Merge array element depending on the type
    addition.forEach(item => {
      switch (item.type) {
        case 'command':
          if (item.command) {
            const refIndex = items.findIndex(
              ref =>
                ref.name === item.name &&
                ref.command === item.command &&
                JSONExt.deepEqual(ref.args ?? {}, item.args ?? {})
            );
            if (refIndex < 0) {
              items.push({ ...item });
            } else {
              if (warn) {
                console.warn(
                  `Toolbar item for command '${item.command}' is duplicated.`
                );
              }
              items[refIndex] = { ...items[refIndex], ...item };
            }
          }
          break;
        case 'spacer':
        default: {
          const refIndex = items.findIndex(ref => ref.name === item.name);
          if (refIndex < 0) {
            items.push({ ...item });
          } else {
            if (warn) {
              console.warn(`Toolbar item '${item.name}' is duplicated.`);
            }
            items[refIndex] = { ...items[refIndex], ...item };
          }
        }
      }
    });

    return items;
  }
}

/**
 * A namespace for `Settings` statics.
 */
export namespace Settings {
  /**
   * The instantiation options for a `Settings` object.
   */
  export interface IOptions {
    /**
     * The setting values for a plugin.
     */
    plugin: ISettingRegistry.IPlugin;

    /**
     * The system registry instance used by the settings manager.
     */
    registry: ISettingRegistry;
  }
}

/**
 * A namespace for private module data.
 */
namespace Private {
  /**
   * The default indentation level, uses spaces instead of tabs.
   */
  const indent = '    ';

  /**
   * Replacement text for schema properties missing a `description` field.
   */
  const nondescript = '[missing schema description]';

  /**
   * Replacement text for schema properties missing a `title` field.
   */
  const untitled = '[missing schema title]';

  /**
   * Returns an annotated (JSON with comments) version of a schema's defaults.
   */
  export function annotatedDefaults(
    schema: ISettingRegistry.ISchema,
    plugin: string
  ): string {
    const { description, properties, title } = schema;
    const keys = properties
      ? Object.keys(properties).sort((a, b) => a.localeCompare(b))
      : [];
    const length = Math.max((description || nondescript).length, plugin.length);

    return [
      '{',
      prefix(`${title || untitled}`),
      prefix(plugin),
      prefix(description || nondescript),
      prefix('*'.repeat(length)),
      '',
      join(keys.map(key => defaultDocumentedValue(schema, key))),
      '}'
    ].join('\n');
  }

  /**
   * Returns an annotated (JSON with comments) version of a plugin's
   * setting data.
   */
  export function annotatedPlugin(
    plugin: ISettingRegistry.IPlugin,
    data: JSONObject
  ): string {
    const { description, title } = plugin.schema;
    const keys = Object.keys(data).sort((a, b) => a.localeCompare(b));
    const length = Math.max(
      (description || nondescript).length,
      plugin.id.length
    );

    return [
      '{',
      prefix(`${title || untitled}`),
      prefix(plugin.id),
      prefix(description || nondescript),
      prefix('*'.repeat(length)),
      '',
      join(keys.map(key => documentedValue(plugin.schema, key, data[key]))),
      '}'
    ].join('\n');
  }

  /**
   * Returns the default value-with-documentation-string for a
   * specific schema property.
   */
  function defaultDocumentedValue(
    schema: ISettingRegistry.ISchema,
    key: string
  ): string {
    const props = (schema.properties && schema.properties[key]) || {};
    const type = props['type'];
    const description = props['description'] || nondescript;
    const title = props['title'] || '';
    const reified = reifyDefault(schema, key);
    const spaces = indent.length;
    const defaults =
      reified !== undefined
        ? prefix(`"${key}": ${JSON.stringify(reified, null, spaces)}`, indent)
        : prefix(`"${key}": ${type}`);

    return [prefix(title), prefix(description), defaults]
      .filter(str => str.length)
      .join('\n');
  }

  /**
   * Returns a value-with-documentation-string for a specific schema property.
   */
  function documentedValue(
    schema: ISettingRegistry.ISchema,
    key: string,
    value: JSONValue
  ): string {
    const props = schema.properties && schema.properties[key];
    const description = (props && props['description']) || nondescript;
    const title = (props && props['title']) || untitled;
    const spaces = indent.length;
    const attribute = prefix(
      `"${key}": ${JSON.stringify(value, null, spaces)}`,
      indent
    );

    return [prefix(title), prefix(description), attribute].join('\n');
  }

  /**
   * Returns a joined string with line breaks and commas where appropriate.
   */
  function join(body: string[]): string {
    return body.reduce((acc, val, idx) => {
      const rows = val.split('\n');
      const last = rows[rows.length - 1];
      const comment = last.trim().indexOf('//') === 0;
      const comma = comment || idx === body.length - 1 ? '' : ',';
      const separator = idx === body.length - 1 ? '' : '\n\n';

      return acc + val + comma + separator;
    }, '');
  }

  /**
   * Returns a documentation string with a comment prefix added on every line.
   */
  function prefix(source: string, pre = `${indent}// `): string {
    return pre + source.split('\n').join(`\n${pre}`);
  }

  /**
   * Create a fully extrapolated default value for a root key in a schema.
   */
  export function reifyDefault(
    schema: ISettingRegistry.IProperty,
    root?: string
  ): PartialJSONValue | undefined {
    // If the property is at the root level, traverse its schema.
    schema = (root ? schema.properties?.[root] : schema) || {};

    // If the property has no default or is a primitive, return.
    if (!('default' in schema) || schema.type !== 'object') {
      return schema.default;
    }

    // Make a copy of the default value to populate.
    const result = JSONExt.deepCopy(schema.default as PartialJSONObject);

    // Iterate through and populate each child property.
    const props = schema.properties || {};
    for (const property in props) {
      result[property] = reifyDefault(props[property]);
    }

    return result;
  }
}
