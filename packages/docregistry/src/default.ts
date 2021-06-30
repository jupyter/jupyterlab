// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { MainAreaWidget } from '@jupyterlab/apputils';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { Mode } from '@jupyterlab/codemirror';
import { IChangedArgs, PathExt } from '@jupyterlab/coreutils';
import { IModelDB } from '@jupyterlab/observables';
import { Contents } from '@jupyterlab/services';
import * as models from '@jupyterlab/shared-models';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { PartialJSONValue } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import { Title, Widget } from '@lumino/widgets';
import { DocumentRegistry, IDocumentWidget } from './index';

/**
 * The default implementation of a document model.
 */
export class DocumentModel
  extends CodeEditor.Model
  implements DocumentRegistry.ICodeModel {
  /**
   * Construct a new document model.
   */
  constructor(languagePreference?: string, modelDB?: IModelDB) {
    super({ modelDB });
    this._defaultLang = languagePreference || '';
    const filemodel = new models.YFile() as models.ISharedFile;
    this.switchSharedModel(filemodel, true);
    this.value.changed.connect(this.triggerContentChange, this);
  }

  /**
   * A signal emitted when the document content changes.
   */
  get contentChanged(): ISignal<this, void> {
    return this._contentChanged;
  }

  /**
   * A signal emitted when the document state changes.
   */
  get stateChanged(): ISignal<this, IChangedArgs<any>> {
    return this._stateChanged;
  }

  /**
   * The dirty state of the document.
   */
  get dirty(): boolean {
    return this._dirty;
  }
  set dirty(newValue: boolean) {
    if (newValue === this._dirty) {
      return;
    }
    const oldValue = this._dirty;
    this._dirty = newValue;
    this.triggerStateChange({ name: 'dirty', oldValue, newValue });
  }

  /**
   * The read only state of the document.
   */
  get readOnly(): boolean {
    return this._readOnly;
  }
  set readOnly(newValue: boolean) {
    if (newValue === this._readOnly) {
      return;
    }
    const oldValue = this._readOnly;
    this._readOnly = newValue;
    this.triggerStateChange({ name: 'readOnly', oldValue, newValue });
  }

  /**
   * The default kernel name of the document.
   *
   * #### Notes
   * This is a read-only property.
   */
  get defaultKernelName(): string {
    return '';
  }

  /**
   * The default kernel language of the document.
   *
   * #### Notes
   * This is a read-only property.
   */
  get defaultKernelLanguage(): string {
    return this._defaultLang;
  }

  /**
   * Serialize the model to a string.
   */
  toString(): string {
    return this.value.text;
  }

  /**
   * Deserialize the model from a string.
   *
   * #### Notes
   * Should emit a [contentChanged] signal.
   */
  fromString(value: string): void {
    this.value.text = value;
  }

  /**
   * Serialize the model to JSON.
   */
  toJSON(): PartialJSONValue {
    return JSON.parse(this.value.text || 'null');
  }

  /**
   * Deserialize the model from JSON.
   *
   * #### Notes
   * Should emit a [contentChanged] signal.
   */
  fromJSON(value: PartialJSONValue): void {
    this.fromString(JSON.stringify(value));
  }

  /**
   * Initialize the model with its current state.
   */
  initialize(): void {
    return;
  }

  /**
   * Trigger a state change signal.
   */
  protected triggerStateChange(args: IChangedArgs<any>): void {
    this._stateChanged.emit(args);
  }

  /**
   * Trigger a content changed signal.
   */
  protected triggerContentChange(): void {
    this._contentChanged.emit(void 0);
    this.dirty = true;
  }

  /**
   * The shared notebook model.
   */
  readonly sharedModel: models.ISharedFile;
  private _defaultLang = '';
  private _dirty = false;
  private _readOnly = false;
  private _contentChanged = new Signal<this, void>(this);
  private _stateChanged = new Signal<this, IChangedArgs<any>>(this);
}

/**
 * An implementation of a model factory for text files.
 */
export class TextModelFactory implements DocumentRegistry.CodeModelFactory {
  /**
   * The name of the model type.
   *
   * #### Notes
   * This is a read-only property.
   */
  get name(): string {
    return 'text';
  }

  /**
   * The type of the file.
   *
   * #### Notes
   * This is a read-only property.
   */
  get contentType(): Contents.ContentType {
    return 'file';
  }

  /**
   * The format of the file.
   *
   * This is a read-only property.
   */
  get fileFormat(): Contents.FileFormat {
    return 'text';
  }

  /**
   * Get whether the model factory has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the model factory.
   */
  dispose(): void {
    this._isDisposed = true;
  }

  /**
   * Create a new model.
   *
   * @param languagePreference - An optional kernel language preference.
   * @param modelDB - An optional modelDB.
   * @param isInitialized - An optional flag to check if the model is initialized.
   *
   * @returns A new document model.
   */
  createNew(
    languagePreference?: string,
    modelDB?: IModelDB,
    isInitialized?: boolean
  ): DocumentRegistry.ICodeModel {
    return new DocumentModel(languagePreference, modelDB);
  }

  /**
   * Get the preferred kernel language given a file path.
   */
  preferredLanguage(path: string): string {
    const mode = Mode.findByFileName(path);
    return mode && mode.mode;
  }

  private _isDisposed = false;
}

/**
 * An implementation of a model factory for base64 files.
 */
export class Base64ModelFactory extends TextModelFactory {
  /**
   * The name of the model type.
   *
   * #### Notes
   * This is a read-only property.
   */
  get name(): string {
    return 'base64';
  }

  /**
   * The type of the file.
   *
   * #### Notes
   * This is a read-only property.
   */
  get contentType(): Contents.ContentType {
    return 'file';
  }

  /**
   * The format of the file.
   *
   * This is a read-only property.
   */
  get fileFormat(): Contents.FileFormat {
    return 'base64';
  }
}

/**
 * The default implementation of a widget factory.
 */
export abstract class ABCWidgetFactory<
  T extends IDocumentWidget,
  U extends DocumentRegistry.IModel = DocumentRegistry.IModel
> implements DocumentRegistry.IWidgetFactory<T, U> {
  /**
   * Construct a new `ABCWidgetFactory`.
   */
  constructor(options: DocumentRegistry.IWidgetFactoryOptions<T>) {
    this._translator = options.translator || nullTranslator;
    this._name = options.name;
    this._readOnly = options.readOnly === undefined ? false : options.readOnly;
    this._defaultFor = options.defaultFor ? options.defaultFor.slice() : [];
    this._defaultRendered = (options.defaultRendered || []).slice();
    this._fileTypes = options.fileTypes.slice();
    this._modelName = options.modelName || 'text';
    this._preferKernel = !!options.preferKernel;
    this._canStartKernel = !!options.canStartKernel;
    this._shutdownOnClose = !!options.shutdownOnClose;
    this._toolbarFactory = options.toolbarFactory;
  }

  /**
   * A signal emitted when a widget is created.
   */
  get widgetCreated(): ISignal<DocumentRegistry.IWidgetFactory<T, U>, T> {
    return this._widgetCreated;
  }

  /**
   * Get whether the model factory has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources used by the document manager.
   */

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
  }

  /**
   * Whether the widget factory is read only.
   */
  get readOnly(): boolean {
    return this._readOnly;
  }

  /**
   * The name of the widget to display in dialogs.
   */
  get name(): string {
    return this._name;
  }

  /**
   * The file types the widget can view.
   */
  get fileTypes(): string[] {
    return this._fileTypes.slice();
  }

  /**
   * The registered name of the model type used to create the widgets.
   */
  get modelName(): string {
    return this._modelName;
  }

  /**
   * The file types for which the factory should be the default.
   */
  get defaultFor(): string[] {
    return this._defaultFor.slice();
  }

  /**
   * The file types for which the factory should be the default for
   * rendering a document model, if different from editing.
   */
  get defaultRendered(): string[] {
    return this._defaultRendered.slice();
  }

  /**
   * Whether the widgets prefer having a kernel started.
   */
  get preferKernel(): boolean {
    return this._preferKernel;
  }

  /**
   * Whether the widgets can start a kernel when opened.
   */
  get canStartKernel(): boolean {
    return this._canStartKernel;
  }

  /**
   * The application language translator.
   */
  get translator(): ITranslator {
    return this._translator;
  }

  /**
   * Whether the kernel should be shutdown when the widget is closed.
   */
  get shutdownOnClose(): boolean {
    return this._shutdownOnClose;
  }
  set shutdownOnClose(value: boolean) {
    this._shutdownOnClose = value;
  }

  /**
   * Create a new widget given a document model and a context.
   *
   * #### Notes
   * It should emit the [widgetCreated] signal with the new widget.
   */
  createNew(context: DocumentRegistry.IContext<U>, source?: T): T {
    // Create the new widget
    const widget = this.createNewWidget(context, source);

    // Add toolbar items
    let items: DocumentRegistry.IToolbarItem[];
    if (this._toolbarFactory) {
      items = this._toolbarFactory(widget);
    } else {
      items = this.defaultToolbarFactory(widget);
    }
    items.forEach(({ name, widget: item }) => {
      widget.toolbar.addItem(name, item);
    });

    // Emit widget created signal
    this._widgetCreated.emit(widget);

    return widget;
  }

  /**
   * Create a widget for a context.
   */
  protected abstract createNewWidget(
    context: DocumentRegistry.IContext<U>,
    source?: T
  ): T;

  /**
   * Default factory for toolbar items to be added after the widget is created.
   */
  protected defaultToolbarFactory(widget: T): DocumentRegistry.IToolbarItem[] {
    return [];
  }

  private _toolbarFactory:
    | ((widget: T) => DocumentRegistry.IToolbarItem[])
    | undefined;
  private _isDisposed = false;
  private _translator: ITranslator;
  private _name: string;
  private _readOnly: boolean;
  private _canStartKernel: boolean;
  private _shutdownOnClose: boolean;
  private _preferKernel: boolean;
  private _modelName: string;
  private _fileTypes: string[];
  private _defaultFor: string[];
  private _defaultRendered: string[];
  private _widgetCreated = new Signal<DocumentRegistry.IWidgetFactory<T, U>, T>(
    this
  );
}

/**
 * The class name added to a dirty widget.
 */
const DIRTY_CLASS = 'jp-mod-dirty';

/**
 * A document widget implementation.
 */
export class DocumentWidget<
    T extends Widget = Widget,
    U extends DocumentRegistry.IModel = DocumentRegistry.IModel
  >
  extends MainAreaWidget<T>
  implements IDocumentWidget<T, U> {
  constructor(options: DocumentWidget.IOptions<T, U>) {
    // Include the context ready promise in the widget reveal promise
    options.reveal = Promise.all([options.reveal, options.context.ready]);
    super(options);

    this.context = options.context;

    // Handle context path changes
    this.context.pathChanged.connect(this._onPathChanged, this);
    this._onPathChanged(this.context, this.context.path);

    // Listen for changes in the dirty state.
    this.context.model.stateChanged.connect(this._onModelStateChanged, this);
    void this.context.ready.then(() => {
      this._handleDirtyState();
    });

    // listen for changes to the title object
    this.title.changed.connect(this._onTitleChanged, this);
  }

  /**
   * Set URI fragment identifier.
   */
  setFragment(fragment: string): void {
    /* no-op */
  }

  /**
   * Handle a title change.
   */
  private async _onTitleChanged(_sender: Title<this>) {
    const validNameExp = /[\/\\:]/;
    const name = this.title.label;
    const filename = this.context.path.split('/').pop()!;

    if (name === filename) {
      return;
    }
    if (name.length > 0 && !validNameExp.test(name)) {
      const oldPath = this.context.path;
      await this.context.rename(name);
      if (this.context.path !== oldPath) {
        // Rename succeeded
        return;
      }
    }
    // Reset title if name is invalid or rename fails
    this.title.label = filename;
  }

  /**
   * Handle a path change.
   */
  private _onPathChanged(
    sender: DocumentRegistry.IContext<U>,
    path: string
  ): void {
    this.title.label = PathExt.basename(sender.localPath);
  }

  /**
   * Handle a change to the context model state.
   */
  private _onModelStateChanged(
    sender: DocumentRegistry.IModel,
    args: IChangedArgs<any>
  ): void {
    if (args.name === 'dirty') {
      this._handleDirtyState();
    }
  }

  /**
   * Handle the dirty state of the context model.
   */
  private _handleDirtyState(): void {
    if (this.context.model.dirty) {
      this.title.className += ` ${DIRTY_CLASS}`;
    } else {
      this.title.className = this.title.className.replace(DIRTY_CLASS, '');
    }
  }

  readonly context: DocumentRegistry.IContext<U>;
}

export namespace DocumentWidget {
  export interface IOptions<
    T extends Widget = Widget,
    U extends DocumentRegistry.IModel = DocumentRegistry.IModel
  > extends MainAreaWidget.IOptions<T> {
    context: DocumentRegistry.IContext<U>;
  }

  export interface IOptionsOptionalContent<
    T extends Widget = Widget,
    U extends DocumentRegistry.IModel = DocumentRegistry.IModel
  > extends MainAreaWidget.IOptionsOptionalContent<T> {
    context: DocumentRegistry.IContext<U>;
    translator?: ITranslator;
  }
}
