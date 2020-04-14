// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Contents,
  ServiceManager,
  ServerConnection
} from '@jupyterlab/services';

import { PromiseDelegate, PartialJSONValue } from '@lumino/coreutils';

import { IDisposable, DisposableDelegate } from '@lumino/disposable';

import { ISignal, Signal } from '@lumino/signaling';

import { Widget } from '@lumino/widgets';

import {
  showDialog,
  SessionContext,
  Dialog,
  ISessionContext,
  showErrorMessage,
  sessionContextDialogs
} from '@jupyterlab/apputils';

import { PathExt } from '@jupyterlab/coreutils';

import { IModelDB, ModelDB } from '@jupyterlab/observables';

import { RenderMimeRegistry } from '@jupyterlab/rendermime';

import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

import { DocumentRegistry } from './registry';

/**
 * An implementation of a document context.
 *
 * This class is typically instantiated by the document manager.
 */
export class Context<T extends DocumentRegistry.IModel>
  implements DocumentRegistry.IContext<T> {
  /**
   * Construct a new document context.
   */
  constructor(options: Context.IOptions<T>) {
    let manager = (this._manager = options.manager);
    this._factory = options.factory;
    this._dialogs = options.sessionDialogs || sessionContextDialogs;
    this._opener = options.opener || Private.noOp;
    this._path = this._manager.contents.normalize(options.path);
    const localPath = this._manager.contents.localPath(this._path);
    let lang = this._factory.preferredLanguage(PathExt.basename(localPath));
    this.lastModifiedCheckMargin = options.lastModifiedCheckMargin;
    let dbFactory = options.modelDBFactory;
    if (dbFactory) {
      const localPath = manager.contents.localPath(this._path);
      this._modelDB = dbFactory.createNew(localPath);
      this._model = this._factory.createNew(lang, this._modelDB);
    } else {
      this._model = this._factory.createNew(lang);
    }

    this._readyPromise = manager.ready.then(() => {
      return this._populatedPromise.promise;
    });

    let ext = PathExt.extname(this._path);
    this.sessionContext = new SessionContext({
      sessionManager: manager.sessions,
      specsManager: manager.kernelspecs,
      path: this._path,
      type: ext === '.ipynb' ? 'notebook' : 'file',
      name: PathExt.basename(localPath),
      kernelPreference: options.kernelPreference || { shouldStart: false },
      setBusy: options.setBusy
    });
    this.sessionContext.propertyChanged.connect(this._onSessionChanged, this);
    manager.contents.fileChanged.connect(this._onFileChanged, this);

    const urlResolver = (this.urlResolver = new RenderMimeRegistry.UrlResolver({
      path: this._path,
      contents: manager.contents
    }));
    this.pathChanged.connect((sender, newPath) => {
      urlResolver.path = newPath;
    });
  }

  /**
   * A signal emitted when the path changes.
   */
  get pathChanged(): ISignal<this, string> {
    return this._pathChanged;
  }

  /**
   * A signal emitted when the model is saved or reverted.
   */
  get fileChanged(): ISignal<this, Contents.IModel> {
    return this._fileChanged;
  }

  /**
   * A signal emitted on the start and end of a saving operation.
   */
  get saveState(): ISignal<this, DocumentRegistry.SaveState> {
    return this._saveState;
  }

  /**
   * A signal emitted when the context is disposed.
   */
  get disposed(): ISignal<this, void> {
    return this._disposed;
  }

  /**
   * Get the model associated with the document.
   */
  get model(): T {
    return this._model;
  }

  /**
   * The client session object associated with the context.
   */
  readonly sessionContext: SessionContext;

  /**
   * The current path associated with the document.
   */
  get path(): string {
    return this._path;
  }

  /**
   * The current local path associated with the document.
   * If the document is in the default notebook file browser,
   * this is the same as the path.
   */
  get localPath(): string {
    return this._manager.contents.localPath(this._path);
  }

  /**
   * The current contents model associated with the document.
   *
   * #### Notes
   * The contents model will be null until the context is populated.
   * It will have an  empty `contents` field.
   */
  get contentsModel(): Contents.IModel | null {
    return this._contentsModel;
  }

  /**
   * Get the model factory name.
   *
   * #### Notes
   * This is not part of the `IContext` API.
   */
  get factoryName(): string {
    return this.isDisposed ? '' : this._factory.name;
  }

  /**
   * Test whether the context is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the context.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    this.sessionContext.dispose();
    if (this._modelDB) {
      this._modelDB.dispose();
    }
    this._model.dispose();
    this._disposed.emit(void 0);
    Signal.clearData(this);
  }

  /**
   * Whether the context is ready.
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * A promise that is fulfilled when the context is ready.
   */
  get ready(): Promise<void> {
    return this._readyPromise;
  }

  /**
   * The url resolver for the context.
   */
  readonly urlResolver: IRenderMime.IResolver;

  /**
   * Initialize the context.
   *
   * @param isNew - Whether it is a new file.
   *
   * @returns a promise that resolves upon initialization.
   */
  initialize(isNew: boolean): Promise<void> {
    if (isNew) {
      this._model.initialize();
      return this._save();
    }
    if (this._modelDB) {
      return this._modelDB.connected.then(() => {
        if (this._modelDB.isPrepopulated) {
          this._model.initialize();
          void this._save();
          return void 0;
        } else {
          return this._revert(true);
        }
      });
    } else {
      return this._revert(true);
    }
  }

  /**
   * Save the document contents to disk.
   */
  save(): Promise<void> {
    return this.ready.then(() => {
      return this._save();
    });
  }

  /**
   * Save the document to a different path chosen by the user.
   */
  saveAs(): Promise<void> {
    return this.ready
      .then(() => {
        return Private.getSavePath(this._path);
      })
      .then(newPath => {
        if (this.isDisposed || !newPath) {
          return;
        }
        if (newPath === this._path) {
          return this.save();
        }
        // Make sure the path does not exist.
        return this._manager.ready
          .then(() => {
            return this._manager.contents.get(newPath);
          })
          .then(() => {
            return this._maybeOverWrite(newPath);
          })
          .catch(err => {
            if (!err.response || err.response.status !== 404) {
              throw err;
            }
            return this._finishSaveAs(newPath);
          });
      });
  }

  /**
   * Download a file.
   *
   * @param path - The path of the file to be downloaded.
   *
   * @returns A promise which resolves when the file has begun
   *   downloading.
   */
  async download(): Promise<void> {
    const url = await this._manager.contents.getDownloadUrl(this._path);
    let element = document.createElement('a');
    element.href = url;
    element.download = '';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    return void 0;
  }

  /**
   * Revert the document contents to disk contents.
   */
  revert(): Promise<void> {
    return this.ready.then(() => {
      return this._revert();
    });
  }

  /**
   * Create a checkpoint for the file.
   */
  createCheckpoint(): Promise<Contents.ICheckpointModel> {
    let contents = this._manager.contents;
    return this._manager.ready.then(() => {
      return contents.createCheckpoint(this._path);
    });
  }

  /**
   * Delete a checkpoint for the file.
   */
  deleteCheckpoint(checkpointId: string): Promise<void> {
    let contents = this._manager.contents;
    return this._manager.ready.then(() => {
      return contents.deleteCheckpoint(this._path, checkpointId);
    });
  }

  /**
   * Restore the file to a known checkpoint state.
   */
  restoreCheckpoint(checkpointId?: string): Promise<void> {
    let contents = this._manager.contents;
    let path = this._path;
    return this._manager.ready.then(() => {
      if (checkpointId) {
        return contents.restoreCheckpoint(path, checkpointId);
      }
      return this.listCheckpoints().then(checkpoints => {
        if (this.isDisposed || !checkpoints.length) {
          return;
        }
        checkpointId = checkpoints[checkpoints.length - 1].id;
        return contents.restoreCheckpoint(path, checkpointId);
      });
    });
  }

  /**
   * List available checkpoints for a file.
   */
  listCheckpoints(): Promise<Contents.ICheckpointModel[]> {
    let contents = this._manager.contents;
    return this._manager.ready.then(() => {
      return contents.listCheckpoints(this._path);
    });
  }

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
  addSibling(
    widget: Widget,
    options: DocumentRegistry.IOpenOptions = {}
  ): IDisposable {
    let opener = this._opener;
    if (opener) {
      opener(widget, options);
    }
    return new DisposableDelegate(() => {
      widget.close();
    });
  }

  /**
   * Handle a change on the contents manager.
   */
  private _onFileChanged(
    sender: Contents.IManager,
    change: Contents.IChangedArgs
  ): void {
    if (change.type !== 'rename') {
      return;
    }
    let oldPath = change.oldValue && change.oldValue.path;
    let newPath = change.newValue && change.newValue.path;

    if (newPath && this._path.indexOf(oldPath || '') === 0) {
      let changeModel = change.newValue;
      // When folder name changed, `oldPath` is `foo`, `newPath` is `bar` and `this._path` is `foo/test`,
      // we should update `foo/test` to `bar/test` as well

      if (oldPath !== this._path) {
        newPath = this._path.replace(new RegExp(`^${oldPath}/`), `${newPath}/`);
        oldPath = this._path;

        // Update client file model from folder change
        changeModel = {
          last_modified: change.newValue?.created,
          path: newPath
        };
      }
      this._path = newPath;
      void this.sessionContext.session?.setPath(newPath);
      const updateModel = {
        ...this._contentsModel,
        ...changeModel
      };
      const localPath = this._manager.contents.localPath(newPath);
      void this.sessionContext.session?.setName(PathExt.basename(localPath));
      this._updateContentsModel(updateModel as Contents.IModel);
      this._pathChanged.emit(this._path);
    }
  }

  /**
   * Handle a change to a session property.
   */
  private _onSessionChanged(sender: ISessionContext, type: string): void {
    if (type !== 'path') {
      return;
    }
    let path = this.sessionContext.session!.path;
    if (path !== this._path) {
      this._path = path;
      this._pathChanged.emit(path);
    }
  }

  /**
   * Update our contents model, without the content.
   */
  private _updateContentsModel(model: Contents.IModel): void {
    let newModel: Contents.IModel = {
      path: model.path,
      name: model.name,
      type: model.type,
      content: undefined,
      writable: model.writable,
      created: model.created,
      last_modified: model.last_modified,
      mimetype: model.mimetype,
      format: model.format
    };
    let mod = this._contentsModel ? this._contentsModel.last_modified : null;
    this._contentsModel = newModel;
    if (!mod || newModel.last_modified !== mod) {
      this._fileChanged.emit(newModel);
    }
  }

  /**
   * Handle an initial population.
   */
  private _populate(): Promise<void> {
    this._isPopulated = true;
    this._isReady = true;
    this._populatedPromise.resolve(void 0);

    // Add a checkpoint if none exists and the file is writable.
    return this._maybeCheckpoint(false).then(() => {
      if (this.isDisposed) {
        return;
      }
      // Update the kernel preference.
      let name =
        this._model.defaultKernelName ||
        this.sessionContext.kernelPreference.name;
      this.sessionContext.kernelPreference = {
        ...this.sessionContext.kernelPreference,
        name,
        language: this._model.defaultKernelLanguage
      };
      // Note: we don't wait on the session to initialize
      // so that the user can be shown the content before
      // any kernel has started.
      void this.sessionContext.initialize().then(shouldSelect => {
        if (shouldSelect) {
          void this._dialogs.selectKernel(this.sessionContext);
        }
      });
    });
  }

  /**
   * Save the document contents to disk.
   */
  private _save(): Promise<void> {
    this._saveState.emit('started');
    let model = this._model;
    let content: PartialJSONValue;
    if (this._factory.fileFormat === 'json') {
      content = model.toJSON();
    } else {
      content = model.toString();
      if (this._useCRLF) {
        content = content.replace(/\n/g, '\r\n');
      }
    }

    let options = {
      type: this._factory.contentType,
      format: this._factory.fileFormat,
      content
    };

    return this._manager.ready
      .then(() => {
        if (!model.modelDB.isCollaborative) {
          return this._maybeSave(options);
        }
        return this._manager.contents.save(this._path, options);
      })
      .then(value => {
        if (this.isDisposed) {
          return;
        }

        model.dirty = false;
        this._updateContentsModel(value);

        if (!this._isPopulated) {
          return this._populate();
        }
      })
      .catch(err => {
        // If the save has been canceled by the user,
        // throw the error so that whoever called save()
        // can decide what to do.
        if (err.message === 'Cancel') {
          throw err;
        }

        // Otherwise show an error message and throw the error.
        const localPath = this._manager.contents.localPath(this._path);
        const name = PathExt.basename(localPath);
        void this._handleError(err, `File Save Error for ${name}`);
        throw err;
      })
      .then(
        value => {
          // Capture all success paths and emit completion.
          this._saveState.emit('completed');
          return value;
        },
        err => {
          // Capture all error paths and emit failure.
          this._saveState.emit('failed');
          throw err;
        }
      )
      .catch(() => {
        /* no-op */
      });
  }

  /**
   * Revert the document contents to disk contents.
   *
   * @param initializeModel - call the model's initialization function after
   * deserializing the content.
   */
  private _revert(initializeModel: boolean = false): Promise<void> {
    let opts: Contents.IFetchOptions = {
      format: this._factory.fileFormat,
      type: this._factory.contentType,
      content: true
    };
    let path = this._path;
    let model = this._model;
    return this._manager.ready
      .then(() => {
        return this._manager.contents.get(path, opts);
      })
      .then(contents => {
        if (this.isDisposed) {
          return;
        }
        let dirty = false;
        if (contents.format === 'json') {
          model.fromJSON(contents.content);
          if (initializeModel) {
            model.initialize();
          }
        } else {
          let content = contents.content;
          // Convert line endings if necessary, marking the file
          // as dirty.
          if (content.indexOf('\r') !== -1) {
            this._useCRLF = true;
            content = content.replace(/\r\n/g, '\n');
          } else {
            this._useCRLF = false;
          }
          model.fromString(content);
          if (initializeModel) {
            model.initialize();
          }
        }
        this._updateContentsModel(contents);
        model.dirty = dirty;
        if (!this._isPopulated) {
          return this._populate();
        }
      })
      .catch(async err => {
        const localPath = this._manager.contents.localPath(this._path);
        const name = PathExt.basename(localPath);
        const response = await err.response.json();
        if (err.message === 'Invalid response: 400 bad format') {
          err = new Error(response.message);
        }
        void this._handleError(err, `File Load Error for ${name}`);
        throw err;
      });
  }

  /**
   * Save a file, dealing with conflicts.
   */
  private _maybeSave(
    options: Partial<Contents.IModel>
  ): Promise<Contents.IModel> {
    let path = this._path;
    // Make sure the file has not changed on disk.
    let promise = this._manager.contents.get(path, { content: false });
    return promise.then(
      model => {
        if (this.isDisposed) {
          return Promise.reject(new Error('Disposed'));
        }
        // We want to check last_modified (disk) > last_modified (client)
        // (our last save)
        // In some cases the filesystem reports an inconsistent time,
        // so we allow 0.5 seconds difference before complaining.
        let modified = this.contentsModel?.last_modified;
        let tClient = modified ? new Date(modified) : new Date();
        let tDisk = new Date(model.last_modified);
        if (
          modified &&
          tDisk.getTime() - tClient.getTime() > this.lastModifiedCheckMargin
        ) {
          // 500 ms
          return this._timeConflict(tClient, model, options);
        }

        return this._manager.contents.save(path, options);
      },
      err => {
        if (err.response && err.response.status === 404) {
          return this._manager.contents.save(path, options);
        }
        throw err;
      }
    );
  }

  /**
   * Handle a save/load error with a dialog.
   */
  private async _handleError(
    err: Error | ServerConnection.ResponseError,
    title: string
  ): Promise<void> {
    // Check for a more specific error message.
    let error = { message: '' };
    if (err instanceof ServerConnection.ResponseError) {
      const text = await err.response.text();
      let body = '';
      try {
        body = JSON.parse(text).message;
      } catch (e) {
        body = text;
      }
      error.message = body || err.message;
    } else {
      error.message = err.message;
    }
    await showErrorMessage(title, error);
    return;
  }

  /**
   * Add a checkpoint the file is writable.
   */
  private _maybeCheckpoint(force: boolean): Promise<void> {
    let writable = this._contentsModel && this._contentsModel.writable;
    let promise = Promise.resolve(void 0);
    if (!writable) {
      return promise;
    }
    if (force) {
      promise = this.createCheckpoint().then(/* no-op */);
    } else {
      promise = this.listCheckpoints().then(checkpoints => {
        writable = this._contentsModel && this._contentsModel.writable;
        if (!this.isDisposed && !checkpoints.length && writable) {
          return this.createCheckpoint().then(/* no-op */);
        }
      });
    }
    return promise.catch(err => {
      // Handle a read-only folder.
      if (!err.response || err.response.status !== 403) {
        throw err;
      }
    });
  }

  /**
   * Handle a time conflict.
   */
  private _timeConflict(
    tClient: Date,
    model: Contents.IModel,
    options: Partial<Contents.IModel>
  ): Promise<Contents.IModel> {
    let tDisk = new Date(model.last_modified);
    console.warn(
      `Last saving performed ${tClient} ` +
        `while the current file seems to have been saved ` +
        `${tDisk}`
    );
    let body =
      `"${this.path}" has changed on disk since the last time it ` +
      `was opened or saved. ` +
      `Do you want to overwrite the file on disk with the version ` +
      ` open here, or load the version on disk (revert)?`;
    let revertBtn = Dialog.okButton({ label: 'Revert' });
    let overwriteBtn = Dialog.warnButton({ label: 'Overwrite' });
    return showDialog({
      title: 'File Changed',
      body,
      buttons: [Dialog.cancelButton(), revertBtn, overwriteBtn]
    }).then(result => {
      if (this.isDisposed) {
        return Promise.reject(new Error('Disposed'));
      }
      if (result.button.label === 'Overwrite') {
        return this._manager.contents.save(this._path, options);
      }
      if (result.button.label === 'Revert') {
        return this.revert().then(() => {
          return model;
        });
      }
      return Promise.reject(new Error('Cancel')); // Otherwise cancel the save.
    });
  }

  /**
   * Handle a time conflict.
   */
  private _maybeOverWrite(path: string): Promise<void> {
    let body = `"${path}" already exists. Do you want to replace it?`;
    let overwriteBtn = Dialog.warnButton({ label: 'Overwrite' });
    return showDialog({
      title: 'File Overwrite?',
      body,
      buttons: [Dialog.cancelButton(), overwriteBtn]
    }).then(result => {
      if (this.isDisposed) {
        return Promise.reject(new Error('Disposed'));
      }
      if (result.button.label === 'Overwrite') {
        return this._manager.contents.delete(path).then(() => {
          return this._finishSaveAs(path);
        });
      }
    });
  }

  /**
   * Finish a saveAs operation given a new path.
   */
  private async _finishSaveAs(newPath: string): Promise<void> {
    this._path = newPath;
    return this.sessionContext.session
      ?.setPath(newPath)
      .then(() => {
        void this.sessionContext.session?.setName(newPath.split('/').pop()!);
        return this.save();
      })
      .then(() => {
        this._pathChanged.emit(this._path);
        return this._maybeCheckpoint(true);
      });
  }

  private _manager: ServiceManager.IManager;
  private _opener: (
    widget: Widget,
    options?: DocumentRegistry.IOpenOptions
  ) => void;
  private _model: T;
  private _modelDB: IModelDB;
  private _path = '';
  private _useCRLF = false;
  private _factory: DocumentRegistry.IModelFactory<T>;
  private _contentsModel: Contents.IModel | null = null;
  private _readyPromise: Promise<void>;
  private _populatedPromise = new PromiseDelegate<void>();
  private _isPopulated = false;
  private _isReady = false;
  private _isDisposed = false;
  private _pathChanged = new Signal<this, string>(this);
  private _fileChanged = new Signal<this, Contents.IModel>(this);
  private _saveState = new Signal<this, DocumentRegistry.SaveState>(this);
  private _disposed = new Signal<this, void>(this);
  private _dialogs: ISessionContext.IDialogs;
  private lastModifiedCheckMargin: number;
}

/**
 * A namespace for `Context` statics.
 */
export namespace Context {
  /**
   * The options used to initialize a context.
   */
  export interface IOptions<T extends DocumentRegistry.IModel> {
    /**
     * A service manager instance.
     */
    manager: ServiceManager.IManager;

    /**
     * The model factory used to create the model.
     */
    factory: DocumentRegistry.IModelFactory<T>;

    /**
     * The initial path of the file.
     */
    path: string;

    /**
     * The kernel preference associated with the context.
     */
    kernelPreference?: ISessionContext.IKernelPreference;

    /**
     * An IModelDB factory method which may be used for the document.
     */
    modelDBFactory?: ModelDB.IFactory;

    /**
     * An optional callback for opening sibling widgets.
     */
    opener?: (widget: Widget) => void;

    /**
     * A function to call when the kernel is busy.
     */
    setBusy?: () => IDisposable;

    /**
     * The dialogs used for the session context.
     */
    sessionDialogs?: ISessionContext.IDialogs;

    lastModifiedCheckMargin: number;
  }
}

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * Get a new file path from the user.
   */
  export function getSavePath(path: string): Promise<string | undefined> {
    let saveBtn = Dialog.okButton({ label: 'Save' });
    return showDialog({
      title: 'Save File As..',
      body: new SaveWidget(path),
      buttons: [Dialog.cancelButton(), saveBtn]
    }).then(result => {
      if (result.button.label === 'Save') {
        return result.value ?? undefined;
      }
      return;
    });
  }

  /**
   * A no-op function.
   */
  export function noOp() {
    /* no-op */
  }

  /*
   * A widget that gets a file path from a user.
   */
  class SaveWidget extends Widget {
    /**
     * Construct a new save widget.
     */
    constructor(path: string) {
      super({ node: createSaveNode(path) });
    }

    /**
     * Get the value for the widget.
     */
    getValue(): string {
      return (this.node as HTMLInputElement).value;
    }
  }

  /**
   * Create the node for a save widget.
   */
  function createSaveNode(path: string): HTMLElement {
    let input = document.createElement('input');
    input.value = path;
    return input;
  }
}
