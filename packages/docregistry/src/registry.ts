// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ArrayExt,
  ArrayIterator,
  IIterator,
  each,
  empty,
  find,
  map
} from '@lumino/algorithm';

import { JSONValue } from '@lumino/coreutils';

import { IDisposable, DisposableDelegate } from '@lumino/disposable';

import { ISignal, Signal } from '@lumino/signaling';

import { DockLayout, Widget } from '@lumino/widgets';

import { IClientSession, SideBarWidget, Toolbar } from '@jupyterlab/apputils';

import { CodeEditor } from '@jupyterlab/codeeditor';

import {
  IChangedArgs as IChangedArgsGeneric,
  PathExt
} from '@jupyterlab/coreutils';

import { IModelDB } from '@jupyterlab/observables';

import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

import { Contents, Kernel } from '@jupyterlab/services';

import { TextModelFactory } from './default';

/**
 * The document registry.
 */
export class DocumentRegistry implements IDisposable {
  /**
   * Construct a new document registry.
   */
  constructor(options: DocumentRegistry.IOptions = {}) {
    let factory = options.textModelFactory;
    if (factory && factory.name !== 'text') {
      throw new Error('Text model factory must have the name `text`');
    }
    this._modelFactories['text'] = factory || new TextModelFactory();

    let fts = options.initialFileTypes || DocumentRegistry.defaultFileTypes;
    fts.forEach(ft => {
      let value: DocumentRegistry.IFileType = {
        ...DocumentRegistry.fileTypeDefaults,
        ...ft
      };
      this._fileTypes.push(value);
    });
  }

  /**
   * A signal emitted when the registry has changed.
   */
  get changed(): ISignal<this, DocumentRegistry.IChangedArgs> {
    return this._changed;
  }

  /**
   * Get whether the document registry has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the document registery.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    for (let modelName in this._modelFactories) {
      this._modelFactories[modelName].dispose();
    }
    for (let widgetName in this._widgetFactories) {
      this._widgetFactories[widgetName].dispose();
    }
    for (let widgetName in this._extenders) {
      this._extenders[widgetName].length = 0;
    }

    this._fileTypes.length = 0;
    Signal.clearData(this);
  }

  /**
   * Add a widget factory to the registry.
   *
   * @param factory - The factory instance to register.
   *
   * @returns A disposable which will unregister the factory.
   *
   * #### Notes
   * If a factory with the given `'name'` is already registered,
   * a warning will be logged, and this will be a no-op.
   * If `'*'` is given as a default extension, the factory will be registered
   * as the global default.
   * If an extension or global default is already registered, this factory
   * will override the existing default.
   * The factory cannot be named an empty string or the string `'default'`.
   */
  addWidgetFactory(factory: DocumentRegistry.WidgetFactory): IDisposable {
    let name = factory.name.toLowerCase();
    if (!name || name === 'default') {
      throw Error('Invalid factory name');
    }
    if (this._widgetFactories[name]) {
      console.warn(`Duplicate registered factory ${name}`);
      return new DisposableDelegate(Private.noOp);
    }
    this._widgetFactories[name] = factory;
    for (let ft of factory.defaultFor || []) {
      if (factory.fileTypes.indexOf(ft) === -1) {
        continue;
      }
      if (ft === '*') {
        this._defaultWidgetFactory = name;
      } else {
        this._defaultWidgetFactories[ft] = name;
      }
    }
    for (let ft of factory.defaultRendered || []) {
      if (factory.fileTypes.indexOf(ft) === -1) {
        continue;
      }
      this._defaultRenderedWidgetFactories[ft] = name;
    }
    // For convenience, store a mapping of file type name -> name
    for (let ft of factory.fileTypes) {
      if (!this._widgetFactoriesForFileType[ft]) {
        this._widgetFactoriesForFileType[ft] = [];
      }
      this._widgetFactoriesForFileType[ft].push(name);
    }
    this._changed.emit({
      type: 'widgetFactory',
      name,
      change: 'added'
    });
    return new DisposableDelegate(() => {
      delete this._widgetFactories[name];
      if (this._defaultWidgetFactory === name) {
        this._defaultWidgetFactory = '';
      }
      for (let ext of Object.keys(this._defaultWidgetFactories)) {
        if (this._defaultWidgetFactories[ext] === name) {
          delete this._defaultWidgetFactories[ext];
        }
      }
      for (let ext of Object.keys(this._defaultRenderedWidgetFactories)) {
        if (this._defaultRenderedWidgetFactories[ext] === name) {
          delete this._defaultRenderedWidgetFactories[ext];
        }
      }
      for (let ext of Object.keys(this._widgetFactoriesForFileType)) {
        ArrayExt.removeFirstOf(this._widgetFactoriesForFileType[ext], name);
        if (this._widgetFactoriesForFileType[ext].length === 0) {
          delete this._widgetFactoriesForFileType[ext];
        }
      }
      for (let ext of Object.keys(this._defaultWidgetFactoryOverrides)) {
        if (this._defaultWidgetFactoryOverrides[ext] === name) {
          delete this._defaultWidgetFactoryOverrides[ext];
        }
      }
      this._changed.emit({
        type: 'widgetFactory',
        name,
        change: 'removed'
      });
    });
  }

  /**
   * Add a model factory to the registry.
   *
   * @param factory - The factory instance.
   *
   * @returns A disposable which will unregister the factory.
   *
   * #### Notes
   * If a factory with the given `name` is already registered, or
   * the given factory is already registered, a warning will be logged
   * and this will be a no-op.
   */
  addModelFactory(factory: DocumentRegistry.ModelFactory): IDisposable {
    let name = factory.name.toLowerCase();
    if (this._modelFactories[name]) {
      console.warn(`Duplicate registered factory ${name}`);
      return new DisposableDelegate(Private.noOp);
    }
    this._modelFactories[name] = factory;
    this._changed.emit({
      type: 'modelFactory',
      name,
      change: 'added'
    });
    return new DisposableDelegate(() => {
      delete this._modelFactories[name];
      this._changed.emit({
        type: 'modelFactory',
        name,
        change: 'removed'
      });
    });
  }

  /**
   * Add a widget extension to the registry.
   *
   * @param widgetName - The name of the widget factory.
   *
   * @param extension - A widget extension.
   *
   * @returns A disposable which will unregister the extension.
   *
   * #### Notes
   * If the extension is already registered for the given
   * widget name, a warning will be logged and this will be a no-op.
   */
  addWidgetExtension(
    widgetName: string,
    extension: DocumentRegistry.WidgetExtension
  ): IDisposable {
    widgetName = widgetName.toLowerCase();
    if (!(widgetName in this._extenders)) {
      this._extenders[widgetName] = [];
    }
    let extenders = this._extenders[widgetName];
    let index = ArrayExt.firstIndexOf(extenders, extension);
    if (index !== -1) {
      console.warn(`Duplicate registered extension for ${widgetName}`);
      return new DisposableDelegate(Private.noOp);
    }
    this._extenders[widgetName].push(extension);
    this._changed.emit({
      type: 'widgetExtension',
      name: widgetName,
      change: 'added'
    });
    return new DisposableDelegate(() => {
      ArrayExt.removeFirstOf(this._extenders[widgetName], extension);
      this._changed.emit({
        type: 'widgetExtension',
        name: widgetName,
        change: 'removed'
      });
    });
  }

  /**
   * Add a file type to the document registry.
   *
   * @params fileType - The file type object to register.
   *
   * @returns A disposable which will unregister the command.
   *
   * #### Notes
   * These are used to populate the "Create New" dialog.
   */
  addFileType(fileType: Partial<DocumentRegistry.IFileType>): IDisposable {
    let value: DocumentRegistry.IFileType = {
      ...DocumentRegistry.fileTypeDefaults,
      ...fileType
    };
    this._fileTypes.push(value);

    this._changed.emit({
      type: 'fileType',
      name: value.name,
      change: 'added'
    });
    return new DisposableDelegate(() => {
      ArrayExt.removeFirstOf(this._fileTypes, value);
      this._changed.emit({
        type: 'fileType',
        name: fileType.name,
        change: 'removed'
      });
    });
  }

  /**
   * Get a list of the preferred widget factories.
   *
   * @param path - The file path to filter the results.
   *
   * @returns A new array of widget factories.
   *
   * #### Notes
   * Only the widget factories whose associated model factory have
   * been registered will be returned.
   * The first item is considered the default. The returned array
   * has widget factories in the following order:
   * - path-specific default factory
   * - path-specific default rendered factory
   * - global default factory
   * - all other path-specific factories
   * - all other global factories
   */
  preferredWidgetFactories(path: string): DocumentRegistry.WidgetFactory[] {
    let factories = new Set<string>();

    // Get the ordered matching file types.
    let fts = this.getFileTypesForPath(PathExt.basename(path));

    // Start with any user overrides for the defaults.
    fts.forEach(ft => {
      if (ft.name in this._defaultWidgetFactoryOverrides) {
        factories.add(this._defaultWidgetFactoryOverrides[ft.name]);
      }
    });

    // Next add the file type default factories.
    fts.forEach(ft => {
      if (ft.name in this._defaultWidgetFactories) {
        factories.add(this._defaultWidgetFactories[ft.name]);
      }
    });

    // Add the file type default rendered factories.
    fts.forEach(ft => {
      if (ft.name in this._defaultRenderedWidgetFactories) {
        factories.add(this._defaultRenderedWidgetFactories[ft.name]);
      }
    });

    // Add the global default factory.
    if (this._defaultWidgetFactory) {
      factories.add(this._defaultWidgetFactory);
    }

    // Add the file type factories in registration order.
    fts.forEach(ft => {
      if (ft.name in this._widgetFactoriesForFileType) {
        each(this._widgetFactoriesForFileType[ft.name], n => {
          factories.add(n);
        });
      }
    });

    // Add the rest of the global factories, in registration order.
    if ('*' in this._widgetFactoriesForFileType) {
      each(this._widgetFactoriesForFileType['*'], n => {
        factories.add(n);
      });
    }

    // Construct the return list, checking to make sure the corresponding
    // model factories are registered.
    let factoryList: DocumentRegistry.WidgetFactory[] = [];
    factories.forEach(name => {
      let factory = this._widgetFactories[name];
      if (!factory) {
        return;
      }
      let modelName = factory.modelName || 'text';
      if (modelName in this._modelFactories) {
        factoryList.push(factory);
      }
    });

    return factoryList;
  }

  /**
   * Get the default rendered widget factory for a path.
   *
   * @param path - The path to for which to find a widget factory.
   *
   * @returns The default rendered widget factory for the path.
   *
   * ### Notes
   * If the widget factory has registered a separate set of `defaultRendered`
   * file types and there is a match in that set, this returns that.
   * Otherwise, this returns the same widget factory as
   * [[defaultWidgetFactory]].
   */
  defaultRenderedWidgetFactory(path: string): DocumentRegistry.WidgetFactory {
    // Get the matching file types.
    let fts = this.getFileTypesForPath(PathExt.basename(path));

    let factory: DocumentRegistry.WidgetFactory = undefined;
    // Find if a there is a default rendered factory for this type.
    for (let ft of fts) {
      if (ft.name in this._defaultRenderedWidgetFactories) {
        factory = this._widgetFactories[
          this._defaultRenderedWidgetFactories[ft.name]
        ];
        break;
      }
    }
    return factory || this.defaultWidgetFactory(path);
  }

  /**
   * Get the default widget factory for a path.
   *
   * @param path - An optional file path to filter the results.
   *
   * @returns The default widget factory for an path.
   *
   * #### Notes
   * This is equivalent to the first value in [[preferredWidgetFactories]].
   */
  defaultWidgetFactory(path?: string): DocumentRegistry.WidgetFactory {
    if (!path) {
      return this._widgetFactories[this._defaultWidgetFactory];
    }
    return this.preferredWidgetFactories(path)[0];
  }

  /**
   * Set overrides for the default widget factory for a file type.
   *
   * Normally, a widget factory informs the document registry which file types
   * it should be the default for using the `defaultFor` option in the
   * IWidgetFactoryOptions. This function can be used to override that after
   * the fact.
   *
   * @param fileType: The name of the file type.
   *
   * @param factory: The name of the factory.
   *
   * #### Notes
   * If `factory` is undefined, then any override will be unset, and the
   * default factory will revert to the original value.
   *
   * If `factory` or `fileType` are not known to the docregistry, or
   * if `factory` cannot open files of type `fileType`, this will throw
   * an error.
   */
  setDefaultWidgetFactory(fileType: string, factory: string | undefined): void {
    fileType = fileType.toLowerCase();
    if (!this.getFileType(fileType)) {
      throw Error(`Cannot find file type ${fileType}`);
    }
    if (!factory) {
      if (this._defaultWidgetFactoryOverrides[fileType]) {
        delete this._defaultWidgetFactoryOverrides[fileType];
      }
      return;
    }
    if (!this.getWidgetFactory(factory)) {
      throw Error(`Cannot find widget factory ${factory}`);
    }
    factory = factory.toLowerCase();
    const factories = this._widgetFactoriesForFileType[fileType];
    if (
      factory !== this._defaultWidgetFactory &&
      !(factories && factories.includes(factory))
    ) {
      throw Error(`Factory ${factory} cannot view file type ${fileType}`);
    }
    this._defaultWidgetFactoryOverrides[fileType] = factory;
  }

  /**
   * Create an iterator over the widget factories that have been registered.
   *
   * @returns A new iterator of widget factories.
   */
  widgetFactories(): IIterator<DocumentRegistry.WidgetFactory> {
    return map(Object.keys(this._widgetFactories), name => {
      return this._widgetFactories[name];
    });
  }

  /**
   * Create an iterator over the model factories that have been registered.
   *
   * @returns A new iterator of model factories.
   */
  modelFactories(): IIterator<DocumentRegistry.ModelFactory> {
    return map(Object.keys(this._modelFactories), name => {
      return this._modelFactories[name];
    });
  }

  /**
   * Create an iterator over the registered extensions for a given widget.
   *
   * @param widgetName - The name of the widget factory.
   *
   * @returns A new iterator over the widget extensions.
   */
  widgetExtensions(
    widgetName: string
  ): IIterator<DocumentRegistry.WidgetExtension> {
    widgetName = widgetName.toLowerCase();
    if (!(widgetName in this._extenders)) {
      return empty<DocumentRegistry.WidgetExtension>();
    }
    return new ArrayIterator(this._extenders[widgetName]);
  }

  /**
   * Create an iterator over the file types that have been registered.
   *
   * @returns A new iterator of file types.
   */
  fileTypes(): IIterator<DocumentRegistry.IFileType> {
    return new ArrayIterator(this._fileTypes);
  }

  /**
   * Get a widget factory by name.
   *
   * @param widgetName - The name of the widget factory.
   *
   * @returns A widget factory instance.
   */
  getWidgetFactory(
    widgetName: string
  ): DocumentRegistry.WidgetFactory | undefined {
    return this._widgetFactories[widgetName.toLowerCase()];
  }

  /**
   * Get a model factory by name.
   *
   * @param name - The name of the model factory.
   *
   * @returns A model factory instance.
   */
  getModelFactory(name: string): DocumentRegistry.ModelFactory | undefined {
    return this._modelFactories[name.toLowerCase()];
  }

  /**
   * Get a file type by name.
   */
  getFileType(name: string): DocumentRegistry.IFileType | undefined {
    name = name.toLowerCase();
    return find(this._fileTypes, fileType => {
      return fileType.name.toLowerCase() === name;
    });
  }

  /**
   * Get a kernel preference.
   *
   * @param path - The file path.
   *
   * @param widgetName - The name of the widget factory.
   *
   * @param kernel - An optional existing kernel model.
   *
   * @returns A kernel preference.
   */
  getKernelPreference(
    path: string,
    widgetName: string,
    kernel?: Partial<Kernel.IModel>
  ): IClientSession.IKernelPreference | undefined {
    widgetName = widgetName.toLowerCase();
    let widgetFactory = this._widgetFactories[widgetName];
    if (!widgetFactory) {
      return void 0;
    }
    let modelFactory = this.getModelFactory(widgetFactory.modelName || 'text');
    if (!modelFactory) {
      return void 0;
    }
    let language = modelFactory.preferredLanguage(PathExt.basename(path));
    let name = kernel && kernel.name;
    let id = kernel && kernel.id;
    return {
      id,
      name,
      language,
      shouldStart: widgetFactory.preferKernel,
      canStart: widgetFactory.canStartKernel,
      shutdownOnClose: widgetFactory.shutdownOnClose
    };
  }

  /**
   * Get the best file type given a contents model.
   *
   * @param model - The contents model of interest.
   *
   * @returns The best matching file type.
   */
  getFileTypeForModel(
    model: Partial<Contents.IModel>
  ): DocumentRegistry.IFileType {
    switch (model.type) {
      case 'directory':
        return (
          find(this._fileTypes, ft => ft.contentType === 'directory') ||
          DocumentRegistry.defaultDirectoryFileType
        );
      case 'notebook':
        return (
          find(this._fileTypes, ft => ft.contentType === 'notebook') ||
          DocumentRegistry.defaultNotebookFileType
        );
      default:
        // Find the best matching extension.
        if (model.name || model.path) {
          let name = model.name || PathExt.basename(model.path);
          let fts = this.getFileTypesForPath(name);
          if (fts.length > 0) {
            return fts[0];
          }
        }
        return this.getFileType('text') || DocumentRegistry.defaultTextFileType;
    }
  }

  /**
   * Get the file types that match a file name.
   *
   * @param path - The path of the file.
   *
   * @returns An ordered list of matching file types.
   */
  getFileTypesForPath(path: string): DocumentRegistry.IFileType[] {
    let fts: DocumentRegistry.IFileType[] = [];
    let name = PathExt.basename(path);

    // Look for a pattern match first.
    let ft = find(this._fileTypes, ft => {
      return ft.pattern && ft.pattern.match(name) !== null;
    });
    if (ft) {
      fts.push(ft);
    }

    // Then look by extension name, starting with the longest
    let ext = Private.extname(name);
    while (ext.length > 1) {
      ft = find(this._fileTypes, ft => ft.extensions.indexOf(ext) !== -1);
      if (ft) {
        fts.push(ft);
      }
      ext =
        '.' +
        ext
          .split('.')
          .slice(2)
          .join('.');
    }
    return fts;
  }

  private _modelFactories: {
    [key: string]: DocumentRegistry.ModelFactory;
  } = Object.create(null);
  private _widgetFactories: {
    [key: string]: DocumentRegistry.WidgetFactory;
  } = Object.create(null);
  private _defaultWidgetFactory = '';
  private _defaultWidgetFactoryOverrides: {
    [key: string]: string;
  } = Object.create(null);
  private _defaultWidgetFactories: { [key: string]: string } = Object.create(
    null
  );
  private _defaultRenderedWidgetFactories: {
    [key: string]: string;
  } = Object.create(null);
  private _widgetFactoriesForFileType: {
    [key: string]: string[];
  } = Object.create(null);
  private _fileTypes: DocumentRegistry.IFileType[] = [];
  private _extenders: {
    [key: string]: DocumentRegistry.WidgetExtension[];
  } = Object.create(null);
  private _changed = new Signal<this, DocumentRegistry.IChangedArgs>(this);
  private _isDisposed = false;
}

/**
 * The namespace for the `DocumentRegistry` class statics.
 */
export namespace DocumentRegistry {
  /**
   * The item to be added to document toolbar.
   */
  export interface IToolbarItem {
    name: string;
    widget: Widget;
  }
  /**
   * The options used to create a document registry.
   */
  export interface IOptions {
    /**
     * The text model factory for the registry.  A default instance will
     * be used if not given.
     */
    textModelFactory?: ModelFactory;

    /**
     * The initial file types for the registry.
     * The [[DocumentRegistry.defaultFileTypes]] will be used if not given.
     */
    initialFileTypes?: DocumentRegistry.IFileType[];
  }

  /**
   * The interface for a document model.
   */
  export interface IModel extends IDisposable {
    /**
     * A signal emitted when the document content changes.
     */
    contentChanged: ISignal<this, void>;

    /**
     * A signal emitted when the model state changes.
     */
    stateChanged: ISignal<this, IChangedArgsGeneric<any>>;

    /**
     * The dirty state of the model.
     *
     * #### Notes
     * This should be cleared when the document is loaded from
     * or saved to disk.
     */
    dirty: boolean;

    /**
     * The read-only state of the model.
     */
    readOnly: boolean;

    /**
     * The default kernel name of the document.
     */
    readonly defaultKernelName: string;

    /**
     * The default kernel language of the document.
     */
    readonly defaultKernelLanguage: string;

    /**
     * The underlying `IModelDB` instance in which model
     * data is stored.
     *
     * ### Notes
     * Making direct edits to the values stored in the`IModelDB`
     * is not recommended, and may produce unpredictable results.
     */
    readonly modelDB: IModelDB;

    /**
     * Serialize the model to a string.
     */
    toString(): string;

    /**
     * Deserialize the model from a string.
     *
     * #### Notes
     * Should emit a [contentChanged] signal.
     */
    fromString(value: string): void;

    /**
     * Serialize the model to JSON.
     */
    toJSON(): JSONValue;

    /**
     * Deserialize the model from JSON.
     *
     * #### Notes
     * Should emit a [contentChanged] signal.
     */
    fromJSON(value: any): void;

    /**
     * Initialize model state after initial data load.
     *
     * #### Notes
     * This function must be called after the initial data is loaded to set up
     * initial model state, such as an initial undo stack, etc.
     */
    initialize(): void;
  }

  /**
   * The interface for a document model that represents code.
   */
  export interface ICodeModel extends IModel, CodeEditor.IModel {}

  /**
   * The document context object.
   */
  export interface IContext<T extends IModel> extends IDisposable {
    /**
     * A signal emitted when the path changes.
     */
    pathChanged: ISignal<this, string>;

    /**
     * A signal emitted when the contentsModel changes.
     */
    fileChanged: ISignal<this, Contents.IModel>;

    /**
     * A signal emitted on the start and end of a saving operation.
     */
    saveState: ISignal<this, SaveState>;

    /**
     * A signal emitted when the context is disposed.
     */
    disposed: ISignal<this, void>;

    /**
     * The data model for the document.
     */
    readonly model: T;

    /**
     * The client session object associated with the context.
     */
    readonly session: IClientSession;

    /**
     * The current path associated with the document.
     */
    readonly path: string;

    /**
     * The current local path associated with the document.
     * If the document is in the default notebook file browser,
     * this is the same as the path.
     */
    readonly localPath: string;

    /**
     * The document metadata, stored as a services contents model.
     *
     * #### Notes
     * This will be null until the context is 'ready'. Since we only store
     * metadata here, the `.contents` attribute will always be empty.
     */
    readonly contentsModel: Contents.IModel | null;

    /**
     * The url resolver for the context.
     */
    readonly urlResolver: IRenderMime.IResolver;

    /**
     * Whether the context is ready.
     */
    readonly isReady: boolean;

    /**
     * A promise that is fulfilled when the context is ready.
     */
    readonly ready: Promise<void>;

    /**
     * Save the document contents to disk.
     */
    save(): Promise<void>;

    /**
     * Save the document to a different path chosen by the user.
     */
    saveAs(): Promise<void>;

    /**
     * Save the document to a different path chosen by the user.
     */
    download(): Promise<void>;

    /**
     * Revert the document contents to disk contents.
     */
    revert(): Promise<void>;

    /**
     * Create a checkpoint for the file.
     *
     * @returns A promise which resolves with the new checkpoint model when the
     *   checkpoint is created.
     */
    createCheckpoint(): Promise<Contents.ICheckpointModel>;

    /**
     * Delete a checkpoint for the file.
     *
     * @param checkpointID - The id of the checkpoint to delete.
     *
     * @returns A promise which resolves when the checkpoint is deleted.
     */
    deleteCheckpoint(checkpointID: string): Promise<void>;

    /**
     * Restore the file to a known checkpoint state.
     *
     * @param checkpointID - The optional id of the checkpoint to restore,
     *   defaults to the most recent checkpoint.
     *
     * @returns A promise which resolves when the checkpoint is restored.
     */
    restoreCheckpoint(checkpointID?: string): Promise<void>;

    /**
     * List available checkpoints for the file.
     *
     * @returns A promise which resolves with a list of checkpoint models for
     *    the file.
     */
    listCheckpoints(): Promise<Contents.ICheckpointModel[]>;

    /**
     * Add a sibling widget to the document manager.
     *
     * @param widget - The widget to add to the document manager.
     *
     * @param options - The desired options for adding the sibling.
     *
     * @returns A disposable used to remove the sibling if desired.
     *
     * #### Notes
     * It is assumed that the widget has the same model and context
     * as the original widget.
     */
    addSibling(widget: Widget, options?: IOpenOptions): IDisposable;
  }

  export type SaveState = 'started' | 'completed' | 'failed';

  /**
   * A type alias for a context.
   */
  export type Context = IContext<IModel>;

  /**
   * A type alias for a code context.
   */
  export type CodeContext = IContext<ICodeModel>;

  /**
   * The options used to initialize a widget factory.
   */
  export interface IWidgetFactoryOptions<T extends Widget = Widget> {
    /**
     * The name of the widget to display in dialogs.
     */
    readonly name: string;

    /**
     * The file types the widget can view.
     */
    readonly fileTypes: ReadonlyArray<string>;

    /**
     * The file types for which the factory should be the default.
     */
    readonly defaultFor?: ReadonlyArray<string>;

    /**
     * The file types for which the factory should be the default for rendering,
     * if that is different than the default factory (which may be for editing).
     * If undefined, then it will fall back on the default file type.
     */
    readonly defaultRendered?: ReadonlyArray<string>;

    /**
     * Whether the widget factory is read only.
     */
    readonly readOnly?: boolean;

    /**
     * The registered name of the model type used to create the widgets.
     */
    readonly modelName?: string;

    /**
     * Whether the widgets prefer having a kernel started.
     */
    readonly preferKernel?: boolean;

    /**
     * Whether the widgets can start a kernel when opened.
     */
    readonly canStartKernel?: boolean;

    /**
     * Whether the kernel should be shutdown when the widget is closed.
     */
    readonly shutdownOnClose?: boolean;

    /**
     * A function producing toolbar widgets, overriding the default toolbar widgets.
     */
    readonly toolbarFactory?: (widget: T) => DocumentRegistry.IToolbarItem[];
  }

  /**
   * The options used to open a widget.
   */
  export interface IOpenOptions {
    /**
     * The reference widget id for the insert location.
     *
     * The default is `null`.
     */
    ref?: string | null;

    /**
     * The supported insertion modes.
     *
     * An insert mode is used to specify how a widget should be added
     * to the main area relative to a reference widget.
     */
    mode?: DockLayout.InsertMode;

    /**
     * Whether to activate the widget.  Defaults to `true`.
     */
    activate?: boolean;

    /**
     * The rank order of the widget among its siblings.
     *
     * #### Notes
     * This field may be used or ignored depending on shell implementation.
     */
    rank?: number;
  }

  /**
   * The interface for a widget factory.
   */
  export interface IWidgetFactory<T extends IDocumentWidget, U extends IModel>
    extends IDisposable,
      IWidgetFactoryOptions {
    /**
     * A signal emitted when a new widget is created.
     */
    widgetCreated: ISignal<IWidgetFactory<T, U>, T>;

    /**
     * Create a new widget given a context.
     *
     * @param source - A widget to clone
     *
     * #### Notes
     * It should emit the [widgetCreated] signal with the new widget.
     */
    createNew(context: IContext<U>, source?: T): T;
  }

  /**
   * A type alias for a standard widget factory.
   */
  export type WidgetFactory = IWidgetFactory<IDocumentWidget, IModel>;

  /**
   * An interface for a widget extension.
   */
  export interface IWidgetExtension<T extends Widget, U extends IModel> {
    /**
     * Create a new extension for a given widget.
     */
    createNew(widget: T, context: IContext<U>): IDisposable;
  }

  /**
   * A type alias for a standard widget extension.
   */
  export type WidgetExtension = IWidgetExtension<Widget, IModel>;

  /**
   * The interface for a model factory.
   */
  export interface IModelFactory<T extends IModel> extends IDisposable {
    /**
     * The name of the model.
     */
    readonly name: string;

    /**
     * The content type of the file (defaults to `"file"`).
     */
    readonly contentType: Contents.ContentType;

    /**
     * The format of the file (defaults to `"text"`).
     */
    readonly fileFormat: Contents.FileFormat;

    /**
     * Create a new model for a given path.
     *
     * @param languagePreference - An optional kernel language preference.
     *
     * @returns A new document model.
     */
    createNew(languagePreference?: string, modelDB?: IModelDB): T;

    /**
     * Get the preferred kernel language given a file path.
     */
    preferredLanguage(path: string): string;
  }

  /**
   * A type alias for a standard model factory.
   */
  export type ModelFactory = IModelFactory<IModel>;

  /**
   * A type alias for a code model factory.
   */
  export type CodeModelFactory = IModelFactory<ICodeModel>;

  /**
   * An interface for a file type.
   */
  export interface IFileType {
    /**
     * The name of the file type.
     */
    readonly name: string;

    /**
     * The mime types associated the file type.
     */
    readonly mimeTypes: ReadonlyArray<string>;

    /**
     * The extensions of the file type (e.g. `".txt"`).  Can be a compound
     * extension (e.g. `".table.json`).
     */
    readonly extensions: ReadonlyArray<string>;

    /**
     * An optional display name for the file type.
     */
    readonly displayName?: string;

    /**
     * An optional pattern for a file name (e.g. `^Dockerfile$`).
     */
    readonly pattern?: string;

    /**
     * The icon class name for the file type.
     */
    readonly iconClass?: string;

    /**
     * The icon label for the file type.
     */
    readonly iconLabel?: string;

    /**
     * If content type is 'dirlike', this is the browser associated with this
     * file type.  If undefined, the default browser is assumed.
     */
    readonly browser?: SideBarWidget;

    /**
     * The content type of the new file.
     */
    readonly contentType: Contents.ContentType | 'dirlike';

    /**
     * The format of the new file.
     */
    readonly fileFormat: Contents.FileFormat;
  }

  /**
   * The defaults used for a file type.
   */
  export const fileTypeDefaults: IFileType = {
    name: 'default',
    extensions: [],
    mimeTypes: [],
    iconClass: 'jp-MaterialIcon jp-FileIcon',
    iconLabel: '',
    contentType: 'file',
    fileFormat: 'text'
  };

  /**
   * An arguments object for the `changed` signal.
   */
  export interface IChangedArgs {
    /**
     * The type of the changed item.
     */
    readonly type:
      | 'widgetFactory'
      | 'modelFactory'
      | 'widgetExtension'
      | 'fileType';

    /**
     * The name of the item or the widget factory being extended.
     */
    readonly name: string;

    /**
     * Whether the item was added or removed.
     */
    readonly change: 'added' | 'removed';
  }

  /**
   * The default text file type used by the document registry.
   */
  export const defaultTextFileType: IFileType = {
    ...fileTypeDefaults,
    name: 'text',
    mimeTypes: ['text/plain'],
    extensions: ['.txt']
  };

  /**
   * The default notebook file type used by the document registry.
   */
  export const defaultNotebookFileType: IFileType = {
    ...fileTypeDefaults,
    name: 'notebook',
    displayName: 'Notebook',
    mimeTypes: ['application/x-ipynb+json'],
    extensions: ['.ipynb'],
    contentType: 'notebook',
    fileFormat: 'json',
    iconClass: 'jp-MaterialIcon jp-NotebookIcon'
  };

  /**
   * The default directory file type used by the document registry.
   */
  export const defaultDirectoryFileType: IFileType = {
    ...fileTypeDefaults,
    name: 'directory',
    extensions: [],
    mimeTypes: ['text/directory'],
    contentType: 'directory',
    iconClass: 'jp-MaterialIcon jp-FolderIcon'
  };

  /**
   * The default file types used by the document registry.
   */
  export const defaultFileTypes: ReadonlyArray<Partial<IFileType>> = [
    defaultTextFileType,
    defaultNotebookFileType,
    defaultDirectoryFileType,
    {
      name: 'markdown',
      displayName: 'Markdown File',
      extensions: ['.md'],
      mimeTypes: ['text/markdown'],
      iconClass: 'jp-MaterialIcon jp-MarkdownIcon'
    },
    {
      name: 'python',
      displayName: 'Python File',
      extensions: ['.py'],
      mimeTypes: ['text/x-python'],
      iconClass: 'jp-MaterialIcon jp-PythonIcon'
    },
    {
      name: 'json',
      displayName: 'JSON File',
      extensions: ['.json'],
      mimeTypes: ['application/json'],
      iconClass: 'jp-MaterialIcon jp-JsonIcon'
    },
    {
      name: 'csv',
      displayName: 'CSV File',
      extensions: ['.csv'],
      mimeTypes: ['text/csv'],
      iconClass: 'jp-MaterialIcon jp-SpreadsheetIcon'
    },
    {
      name: 'tsv',
      displayName: 'TSV File',
      extensions: ['.tsv'],
      mimeTypes: ['text/csv'],
      iconClass: 'jp-MaterialIcon jp-SpreadsheetIcon'
    },
    {
      name: 'r',
      displayName: 'R File',
      mimeTypes: ['text/x-rsrc'],
      extensions: ['.r'],
      iconClass: 'jp-MaterialIcon jp-RKernelIcon'
    },
    {
      name: 'yaml',
      displayName: 'YAML File',
      mimeTypes: ['text/x-yaml', 'text/yaml'],
      extensions: ['.yaml', '.yml'],
      iconClass: 'jp-MaterialIcon jp-YamlIcon'
    },
    {
      name: 'svg',
      displayName: 'Image',
      mimeTypes: ['image/svg+xml'],
      extensions: ['.svg'],
      iconClass: 'jp-MaterialIcon jp-ImageIcon',
      fileFormat: 'base64'
    },
    {
      name: 'tiff',
      displayName: 'Image',
      mimeTypes: ['image/tiff'],
      extensions: ['.tif', '.tiff'],
      iconClass: 'jp-MaterialIcon jp-ImageIcon',
      fileFormat: 'base64'
    },
    {
      name: 'jpeg',
      displayName: 'Image',
      mimeTypes: ['image/jpeg'],
      extensions: ['.jpg', '.jpeg'],
      iconClass: 'jp-MaterialIcon jp-ImageIcon',
      fileFormat: 'base64'
    },
    {
      name: 'gif',
      displayName: 'Image',
      mimeTypes: ['image/gif'],
      extensions: ['.gif'],
      iconClass: 'jp-MaterialIcon jp-ImageIcon',
      fileFormat: 'base64'
    },
    {
      name: 'png',
      displayName: 'Image',
      mimeTypes: ['image/png'],
      extensions: ['.png'],
      iconClass: 'jp-MaterialIcon jp-ImageIcon',
      fileFormat: 'base64'
    },
    {
      name: 'bmp',
      displayName: 'Image',
      mimeTypes: ['image/bmp'],
      extensions: ['.bmp'],
      iconClass: 'jp-MaterialIcon jp-ImageIcon',
      fileFormat: 'base64'
    }
  ];
}

/**
 * An interface for a document widget.
 */
export interface IDocumentWidget<
  T extends Widget = Widget,
  U extends DocumentRegistry.IModel = DocumentRegistry.IModel
> extends Widget {
  /**
   * The content widget.
   */
  readonly content: T;

  /**
   * A promise resolving after the content widget is revealed.
   */
  readonly revealed: Promise<void>;

  /**
   * The context associated with the document.
   */
  readonly context: DocumentRegistry.IContext<U>;

  /**
   * The toolbar for the widget.
   */
  readonly toolbar: Toolbar<Widget>;

  /**
   * Set URI fragment identifier.
   */
  setFragment(fragment: string): void;
}

/**
 * A private namespace for DocumentRegistry data.
 */
namespace Private {
  /**
   * Get the extension name of a path.
   *
   * @param file - string.
   *
   * #### Notes
   * Dotted filenames (e.g. `".table.json"` are allowed).
   */
  export function extname(path: string): string {
    let parts = PathExt.basename(path).split('.');
    parts.shift();
    let ext = '.' + parts.join('.');
    return ext.toLowerCase();
  }
  /**
   * A no-op function.
   */
  export function noOp() {
    /* no-op */
  }
}
