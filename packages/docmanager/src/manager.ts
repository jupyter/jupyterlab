// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IClientSession } from '@jupyterlab/apputils';

import { PathExt } from '@jupyterlab/coreutils';

import { UUID } from '@phosphor/coreutils';

import {
  DocumentRegistry,
  Context,
  IDocumentWidget
} from '@jupyterlab/docregistry';

import { Contents, Kernel, ServiceManager } from '@jupyterlab/services';

import { ArrayExt, find } from '@phosphor/algorithm';

import { IDisposable } from '@phosphor/disposable';

import { AttachedProperty } from '@phosphor/properties';

import { ISignal, Signal } from '@phosphor/signaling';

import { Widget } from '@phosphor/widgets';

import { SaveHandler } from './savehandler';

import { IDocumentManager } from './tokens';

import { DocumentWidgetManager } from './widgetmanager';

/**
 * The document manager.
 *
 * #### Notes
 * The document manager is used to register model and widget creators,
 * and the file browser uses the document manager to create widgets. The
 * document manager maintains a context for each path and model type that is
 * open, and a list of widgets for each context. The document manager is in
 * control of the proper closing and disposal of the widgets and contexts.
 */
export class DocumentManager implements IDocumentManager {
  /**
   * Construct a new document manager.
   */
  constructor(options: DocumentManager.IOptions) {
    this.registry = options.registry;
    this.services = options.manager;

    this._opener = options.opener;
    this._when = options.when || options.manager.ready;

    let widgetManager = new DocumentWidgetManager({ registry: this.registry });
    widgetManager.activateRequested.connect(this._onActivateRequested, this);
    this._widgetManager = widgetManager;
    this._setBusy = options.setBusy;
  }

  /**
   * The registry used by the manager.
   */
  readonly registry: DocumentRegistry;

  /**
   * The service manager used by the manager.
   */
  readonly services: ServiceManager.IManager;

  /**
   * A signal emitted when one of the documents is activated.
   */
  get activateRequested(): ISignal<this, string> {
    return this._activateRequested;
  }

  /**
   * Whether to autosave documents.
   */
  get autosave(): boolean {
    return this._autosave;
  }

  set autosave(value: boolean) {
    this._autosave = value;

    // For each existing context, start/stop the autosave handler as needed.
    this._contexts.forEach(context => {
      const handler = Private.saveHandlerProperty.get(context);
      if (value === true && !handler.isActive) {
        handler.start();
      } else if (value === false && handler.isActive) {
        handler.stop();
      }
    });
  }

  /**
   * Determines the time interval for autosave in seconds.
   */
  get autosaveInterval(): number {
    return this._autosaveInterval;
  }

  set autosaveInterval(value: number) {
    this._autosaveInterval = value;

    // For each existing context, set the save interval as needed.
    this._contexts.forEach(context => {
      const handler = Private.saveHandlerProperty.get(context);
      handler.saveInterval = value || 120;
    });
  }

  /**
   * Get whether the document manager has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the document manager.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;

    // Clear any listeners for our signals.
    Signal.clearData(this);

    // Close all the widgets for our contexts and dispose the widget manager.
    this._contexts.forEach(context => {
      return this._widgetManager.closeWidgets(context);
    });
    this._widgetManager.dispose();

    // Clear the context list.
    this._contexts.length = 0;
  }

  /**
   * Clone a widget.
   *
   * @param widget - The source IDocumentWidget.
   *
   * @returns A new widget or `undefined`.
   *
   * #### Notes
   *  Uses the same widget factory and context as the source, or returns
   *  `undefined` if the source widget is not managed by this manager.
   */
  cloneWidget(widget: IDocumentWidget): IDocumentWidget | undefined {
    return this._widgetManager.cloneWidget(widget);
  }

  /**
   * Close all of the open documents.
   *
   * @returns A promise resolving when the widgets are closed.
   */
  closeAll(): Promise<void> {
    return Promise.all(
      this._contexts.map(context => this._widgetManager.closeWidgets(context))
    ).then(() => undefined);
  }

  /**
   * Close the widgets associated with a given path.
   *
   * @param path - The target path.
   *
   * @returns A promise resolving when the widgets are closed.
   */
  closeFile(path: string): Promise<void> {
    const close = this._contextsForPath(path).map(c =>
      this._widgetManager.closeWidgets(c)
    );
    return Promise.all(close).then(x => undefined);
  }

  /**
   * Get the document context for a widget.
   *
   * @param widget - The widget of interest.
   *
   * @returns The context associated with the widget, or `undefined` if no such
   * context exists.
   */
  contextForWidget(widget: Widget): DocumentRegistry.Context | undefined {
    return this._widgetManager.contextForWidget(widget);
  }

  /**
   * Copy a file.
   *
   * @param fromFile - The full path of the original file.
   *
   * @param toDir - The full path to the target directory.
   *
   * @returns A promise which resolves to the contents of the file.
   */
  copy(fromFile: string, toDir: string): Promise<Contents.IModel> {
    return this.services.contents.copy(fromFile, toDir);
  }

  /**
   * Create a new file and return the widget used to view it.
   *
   * @param path - The file path to create.
   *
   * @param widgetName - The name of the widget factory to use. 'default' will use the default widget.
   *
   * @param kernel - An optional kernel name/id to override the default.
   *
   * @returns The created widget, or `undefined`.
   *
   * #### Notes
   * This function will return `undefined` if a valid widget factory
   * cannot be found.
   */
  createNew(
    path: string,
    widgetName = 'default',
    kernel?: Partial<Kernel.IModel>
  ): Widget {
    return this._createOrOpenDocument('create', path, widgetName, kernel);
  }

  /**
   * Delete a file.
   *
   * @param path - The full path to the file to be deleted.
   *
   * @returns A promise which resolves when the file is deleted.
   *
   * #### Notes
   * If there is a running session associated with the file and no other
   * sessions are using the kernel, the session will be shut down.
   */
  deleteFile(path: string): Promise<void> {
    return this.services.sessions
      .stopIfNeeded(path)
      .then(() => {
        return this.services.contents.delete(path);
      })
      .then(() => {
        this._contextsForPath(path).forEach(context =>
          this._widgetManager.deleteWidgets(context)
        );
        return Promise.resolve(void 0);
      });
  }

  /**
   * Return widgets that already exist for the given path and widget name.
   *
   * @param path - The file path to use.
   *
   * @param widgetName - The name of the widget factory to use. 'default' will use the default widget.
   *
   * @returns The list of found widgets, or `undefined`.
   *
   * #### Notes
   * This can be used to find an existing widget instead of opening
   * a new widget.
   */
  findWidgets(
    path: string,
    widgetName: string | null = 'default'
  ): IDocumentWidget[] {
    let newPath = PathExt.normalize(path);
    let widgetNames = [widgetName];
    if (widgetName === 'default') {
      let factory = this.registry.defaultWidgetFactory(newPath);
      if (!factory) {
        return [];
      }
      widgetNames = [factory.name];
    } else if (widgetName === null) {
      widgetNames = this.registry
        .preferredWidgetFactories(newPath)
        .map(f => f.name);
    }

    const widgets: IDocumentWidget[] = [];
    for (let context of this._contextsForPath(newPath)) {
      for (const widgetName of widgetNames) {
        widgets.push(...this._widgetManager.findWidgets(context, widgetName));
      }
    }
    return widgets;
  }

  /**
   * Create a new untitled file.
   *
   * @param options - The file content creation options.
   */
  newUntitled(options: Contents.ICreateOptions): Promise<Contents.IModel> {
    if (options.type === 'file') {
      options.ext = options.ext || '.txt';
    }
    return this.services.contents.newUntitled(options);
  }

  /**
   * Open a file and return the widget used to view it.
   *
   * @param path - The file path to open.
   *
   * @param widgetName - The name of the widget factory to use. 'default' will use the default widget.
   *
   * @param kernel - An optional kernel name/id to override the default.
   *
   * @returns The created widget, or `undefined`.
   *
   * #### Notes
   * This function will return `undefined` if a valid widget factory
   * cannot be found.
   */
  open(
    path: string,
    widgetName = 'default',
    kernel?: Partial<Kernel.IModel>,
    options?: DocumentRegistry.IOpenOptions
  ): IDocumentWidget | undefined {
    return this._createOrOpenDocument(
      'open',
      path,
      widgetName,
      kernel,
      options
    );
  }

  /**
   * Open a file and return the widget used to view it.
   * Reveals an already existing editor.
   *
   * @param path - The file path to open.
   *
   * @param widgetName - The name of the widget factory to use. 'default' will use the default widget.
   *
   * @param kernel - An optional kernel name/id to override the default.
   *
   * @returns The created widget, or `undefined`.
   *
   * #### Notes
   * This function will return `undefined` if a valid widget factory
   * cannot be found.
   */
  openOrReveal(
    path: string,
    widgetName = 'default',
    kernel?: Partial<Kernel.IModel>,
    options?: DocumentRegistry.IOpenOptions
  ): IDocumentWidget | undefined {
    let widgets = this.findWidgets(path, widgetName);
    if (widgets.length) {
      this._opener.open(widgets[0], options || {});
      return widgets[0];
    }
    return this.open(path, widgetName, kernel, options || {});
  }

  /**
   * Overwrite a file.
   *
   * @param oldPath - The full path to the original file.
   *
   * @param newPath - The full path to the new file.
   *
   * @returns A promise containing the new file contents model.
   */
  overwrite(oldPath: string, newPath: string): Promise<Contents.IModel> {
    // Cleanly overwrite the file by moving it, making sure the original does
    // not exist, and then renaming to the new path.
    const tempPath = `${newPath}.${UUID.uuid4()}`;
    const cb = () => this.rename(tempPath, newPath);
    return this.rename(oldPath, tempPath)
      .then(() => {
        return this.deleteFile(newPath);
      })
      .then(cb, cb);
  }

  /**
   * Rename a file or directory.
   *
   * @param oldPath - The full path to the original file.
   *
   * @param newPath - The full path to the new file.
   *
   * @returns A promise containing the new file contents model.  The promise
   * will reject if the newPath already exists.  Use [[overwrite]] to overwrite
   * a file.
   */
  rename(oldPath: string, newPath: string): Promise<Contents.IModel> {
    return this.services.contents.rename(oldPath, newPath);
  }

  /**
   * Find a context for a given path and factory name.
   */
  private _findContext(
    path: string,
    factoryName: string
  ): Private.IContext | undefined {
    return find(this._contexts, context => {
      return context.path === path && context.factoryName === factoryName;
    });
  }

  /**
   * Get the contexts for a given path.
   *
   * #### Notes
   * There may be more than one context for a given path if the path is open
   * with multiple model factories (for example, a notebook can be open with a
   * notebook model factory and a text model factory).
   */
  private _contextsForPath(path: string): Private.IContext[] {
    return this._contexts.filter(context => context.path === path);
  }

  /**
   * Create a context from a path and a model factory.
   */
  private _createContext(
    path: string,
    factory: DocumentRegistry.ModelFactory,
    kernelPreference: IClientSession.IKernelPreference
  ): Private.IContext {
    // TODO: Make it impossible to open two different contexts for the same
    // path. Or at least prompt the closing of all widgets associated with the
    // old context before opening the new context. This will make things much
    // more consistent for the users, at the cost of some confusion about what
    // models are and why sometimes they cannot open the same file in different
    // widgets that have different models.

    // Allow options to be passed when adding a sibling.
    let adopter = (
      widget: IDocumentWidget,
      options?: DocumentRegistry.IOpenOptions
    ) => {
      this._widgetManager.adoptWidget(context, widget);
      this._opener.open(widget, options);
    };
    let modelDBFactory =
      this.services.contents.getModelDBFactory(path) || undefined;
    let context = new Context({
      opener: adopter,
      manager: this.services,
      factory,
      path,
      kernelPreference,
      modelDBFactory,
      setBusy: this._setBusy
    });
    let handler = new SaveHandler({
      context,
      saveInterval: this.autosaveInterval
    });
    Private.saveHandlerProperty.set(context, handler);
    void context.ready.then(() => {
      if (this.autosave) {
        handler.start();
      }
    });
    context.disposed.connect(this._onContextDisposed, this);
    this._contexts.push(context);
    return context;
  }

  /**
   * Handle a context disposal.
   */
  private _onContextDisposed(context: Private.IContext): void {
    ArrayExt.removeFirstOf(this._contexts, context);
  }

  /**
   * Get the widget factory for a given widget name.
   */
  private _widgetFactoryFor(
    path: string,
    widgetName: string
  ): DocumentRegistry.WidgetFactory | undefined {
    let { registry } = this;
    if (widgetName === 'default') {
      let factory = registry.defaultWidgetFactory(path);
      if (!factory) {
        return undefined;
      }
      widgetName = factory.name;
    }
    return registry.getWidgetFactory(widgetName);
  }

  /**
   * Creates a new document, or loads one from disk, depending on the `which` argument.
   * If `which==='create'`, then it creates a new document. If `which==='open'`,
   * then it loads the document from disk.
   *
   * The two cases differ in how the document context is handled, but the creation
   * of the widget and launching of the kernel are identical.
   */
  private _createOrOpenDocument(
    which: 'open' | 'create',
    path: string,
    widgetName = 'default',
    kernel?: Partial<Kernel.IModel>,
    options?: DocumentRegistry.IOpenOptions
  ): IDocumentWidget | undefined {
    let widgetFactory = this._widgetFactoryFor(path, widgetName);
    if (!widgetFactory) {
      return undefined;
    }
    let modelName = widgetFactory.modelName || 'text';
    let factory = this.registry.getModelFactory(modelName);
    if (!factory) {
      return undefined;
    }

    // Handle the kernel pereference.
    let preference = this.registry.getKernelPreference(
      path,
      widgetFactory.name,
      kernel
    );

    let context: Private.IContext | null = null;
    let ready: Promise<void> = Promise.resolve(undefined);

    // Handle the load-from-disk case
    if (which === 'open') {
      // Use an existing context if available.
      context = this._findContext(path, factory.name) || null;
      if (!context) {
        context = this._createContext(path, factory, preference);
        // Populate the model, either from disk or a
        // model backend.
        ready = this._when.then(() => context.initialize(false));
      }
    } else if (which === 'create') {
      context = this._createContext(path, factory, preference);
      // Immediately save the contents to disk.
      ready = this._when.then(() => context.initialize(true));
    }

    let widget = this._widgetManager.createWidget(widgetFactory, context!);
    this._opener.open(widget, options || {});

    // If the initial opening of the context fails, dispose of the widget.
    ready.catch(err => {
      widget.close();
    });

    return widget;
  }

  /**
   * Handle an activateRequested signal from the widget manager.
   */
  private _onActivateRequested(
    sender: DocumentWidgetManager,
    args: string
  ): void {
    this._activateRequested.emit(args);
  }

  private _activateRequested = new Signal<this, string>(this);
  private _contexts: Private.IContext[] = [];
  private _opener: DocumentManager.IWidgetOpener;
  private _widgetManager: DocumentWidgetManager;
  private _isDisposed = false;
  private _autosave = true;
  private _autosaveInterval = 120;
  private _when: Promise<void>;
  private _setBusy: () => IDisposable;
}

/**
 * A namespace for document manager statics.
 */
export namespace DocumentManager {
  /**
   * The options used to initialize a document manager.
   */
  export interface IOptions {
    /**
     * A document registry instance.
     */
    registry: DocumentRegistry;

    /**
     * A service manager instance.
     */
    manager: ServiceManager.IManager;

    /**
     * A widget opener for sibling widgets.
     */
    opener: IWidgetOpener;

    /**
     * A promise for when to start using the manager.
     */
    when?: Promise<void>;

    /**
     * A function called when a kernel is busy.
     */
    setBusy?: () => IDisposable;
  }

  /**
   * An interface for a widget opener.
   */
  export interface IWidgetOpener {
    /**
     * Open the given widget.
     */
    open(
      widget: IDocumentWidget,
      options?: DocumentRegistry.IOpenOptions
    ): void;
  }
}

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * An attached property for a context save handler.
   */
  export const saveHandlerProperty = new AttachedProperty<
    DocumentRegistry.Context,
    SaveHandler | undefined
  >({
    name: 'saveHandler',
    create: () => undefined
  });

  /**
   * A type alias for a standard context.
   *
   * #### Notes
   * We define this as an interface of a specific implementation so that we can
   * use the implementation-specific functions.
   */
  export interface IContext extends Context<DocumentRegistry.IModel> {
    /* no op */
  }
}
