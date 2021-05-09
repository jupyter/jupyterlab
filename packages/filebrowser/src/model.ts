// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { showDialog, Dialog } from '@jupyterlab/apputils';

import { IChangedArgs, PathExt, PageConfig } from '@jupyterlab/coreutils';

import { IDocumentManager, shouldOverwrite } from '@jupyterlab/docmanager';

import { Contents, KernelSpec, Session } from '@jupyterlab/services';

import { IStateDB } from '@jupyterlab/statedb';

import {
  ArrayIterator,
  each,
  find,
  IIterator,
  IterableOrArrayLike,
  ArrayExt,
  filter
} from '@lumino/algorithm';

import { PromiseDelegate, ReadonlyJSONObject } from '@lumino/coreutils';

import { IDisposable } from '@lumino/disposable';

import { Poll } from '@lumino/polling';

import { ISignal, Signal } from '@lumino/signaling';
import {
  nullTranslator,
  TranslationBundle,
  ITranslator
} from '@jupyterlab/translation';

/**
 * The default duration of the auto-refresh in ms
 */
const DEFAULT_REFRESH_INTERVAL = 10000;

/**
 * The maximum upload size (in bytes) for notebook version < 5.1.0
 */
export const LARGE_FILE_SIZE = 15 * 1024 * 1024;

/**
 * The size (in bytes) of the biggest chunk we should upload at once.
 */
export const CHUNK_SIZE = 1024 * 1024;

/**
 * An upload progress event for a file at `path`.
 */
export interface IUploadModel {
  path: string;
  /**
   * % uploaded [0, 1)
   */
  progress: number;
}

/**
 * An implementation of a file browser model.
 *
 * #### Notes
 * All paths parameters without a leading `'/'` are interpreted as relative to
 * the current directory.  Supports `'../'` syntax.
 */
export class FileBrowserModel implements IDisposable {
  /**
   * Construct a new file browser model.
   */
  constructor(options: FileBrowserModel.IOptions) {
    this.manager = options.manager;
    this.translator = options.translator || nullTranslator;
    this._trans = this.translator.load('jupyterlab');
    this._driveName = options.driveName || '';
    const rootPath = this._driveName ? this._driveName + ':' : '';
    this._model = {
      path: rootPath,
      name: PathExt.basename(rootPath),
      type: 'directory',
      content: undefined,
      writable: false,
      created: 'unknown',
      last_modified: 'unknown',
      mimetype: 'text/plain',
      format: 'text'
    };
    this._state = options.state || null;
    const refreshInterval = options.refreshInterval || DEFAULT_REFRESH_INTERVAL;

    const { services } = options.manager;
    services.contents.fileChanged.connect(this._onFileChanged, this);
    services.sessions.runningChanged.connect(this._onRunningChanged, this);

    this._unloadEventListener = (e: Event) => {
      if (this._uploads.length > 0) {
        const confirmationMessage = this._trans.__('Files still uploading');

        (e as any).returnValue = confirmationMessage;
        return confirmationMessage;
      }
    };
    window.addEventListener('beforeunload', this._unloadEventListener);
    this._poll = new Poll({
      auto: options.auto ?? true,
      name: '@jupyterlab/filebrowser:Model',
      factory: () => this.cd('.'),
      frequency: {
        interval: refreshInterval,
        backoff: true,
        max: 300 * 1000
      },
      standby: options.refreshStandby || 'when-hidden'
    });
  }

  /**
   * The document manager instance used by the file browser model.
   */
  readonly manager: IDocumentManager;

  /**
   * A signal emitted when the file browser model loses connection.
   */
  get connectionFailure(): ISignal<this, Error> {
    return this._connectionFailure;
  }

  /**
   * The drive name that gets prepended to the path.
   */
  get driveName(): string {
    return this._driveName;
  }

  /**
   * A promise that resolves when the model is first restored.
   */
  get restored(): Promise<void> {
    return this._restored.promise;
  }

  /**
   * Get the file path changed signal.
   */
  get fileChanged(): ISignal<this, Contents.IChangedArgs> {
    return this._fileChanged;
  }

  /**
   * Get the current path.
   */
  get path(): string {
    return this._model ? this._model.path : '';
  }

  /**
   * A signal emitted when the path changes.
   */
  get pathChanged(): ISignal<this, IChangedArgs<string>> {
    return this._pathChanged;
  }

  /**
   * A signal emitted when the directory listing is refreshed.
   */
  get refreshed(): ISignal<this, void> {
    return this._refreshed;
  }

  /**
   * Get the kernel spec models.
   */
  get specs(): KernelSpec.ISpecModels | null {
    return this.manager.services.kernelspecs.specs;
  }

  /**
   * Get whether the model is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * A signal emitted when an upload progresses.
   */
  get uploadChanged(): ISignal<this, IChangedArgs<IUploadModel | null>> {
    return this._uploadChanged;
  }

  /**
   * Create an iterator over the status of all in progress uploads.
   */
  uploads(): IIterator<IUploadModel> {
    return new ArrayIterator(this._uploads);
  }

  /**
   * Dispose of the resources held by the model.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    window.removeEventListener('beforeunload', this._unloadEventListener);
    this._isDisposed = true;
    this._poll.dispose();
    this._sessions.length = 0;
    this._items.length = 0;
    Signal.clearData(this);
  }

  /**
   * Create an iterator over the model's items.
   *
   * @returns A new iterator over the model's items.
   */
  items(): IIterator<Contents.IModel> {
    return new ArrayIterator(this._items);
  }

  /**
   * Create an iterator over the active sessions in the directory.
   *
   * @returns A new iterator over the model's active sessions.
   */
  sessions(): IIterator<Session.IModel> {
    return new ArrayIterator(this._sessions);
  }

  /**
   * Force a refresh of the directory contents.
   */
  async refresh(): Promise<void> {
    await this._poll.refresh();
    await this._poll.tick;
    this._refreshed.emit(void 0);
  }

  /**
   * Change directory.
   *
   * @param path - The path to the file or directory.
   *
   * @returns A promise with the contents of the directory.
   */
  async cd(newValue = '.'): Promise<void> {
    if (newValue !== '.') {
      newValue = this.manager.services.contents.resolvePath(
        this._model.path,
        newValue
      );
    } else {
      newValue = this._pendingPath || this._model.path;
    }
    if (this._pending) {
      // Collapse requests to the same directory.
      if (newValue === this._pendingPath) {
        return this._pending;
      }
      // Otherwise wait for the pending request to complete before continuing.
      await this._pending;
    }
    const oldValue = this.path;
    const options: Contents.IFetchOptions = { content: true };
    this._pendingPath = newValue;
    if (oldValue !== newValue) {
      this._sessions.length = 0;
    }
    const services = this.manager.services;
    this._pending = services.contents
      .get(newValue, options)
      .then(contents => {
        if (this.isDisposed) {
          return;
        }
        this._handleContents(contents);
        this._pendingPath = null;
        this._pending = null;
        if (oldValue !== newValue) {
          // If there is a state database and a unique key, save the new path.
          // We don't need to wait on the save to continue.
          if (this._state && this._key) {
            void this._state.save(this._key, { path: newValue });
          }

          this._pathChanged.emit({
            name: 'path',
            oldValue,
            newValue
          });
        }
        this._onRunningChanged(services.sessions, services.sessions.running());
        this._refreshed.emit(void 0);
      })
      .catch(error => {
        this._pendingPath = null;
        this._pending = null;
        if (error.response && error.response.status === 404) {
          error.message = this._trans.__(
            'Directory not found: "%1"',
            this._model.path
          );
          console.error(error);
          this._connectionFailure.emit(error);
          return this.cd('/');
        } else {
          this._connectionFailure.emit(error);
        }
      });
    return this._pending;
  }

  /**
   * Download a file.
   *
   * @param path - The path of the file to be downloaded.
   *
   * @returns A promise which resolves when the file has begun
   *   downloading.
   */
  async download(path: string): Promise<void> {
    const url = await this.manager.services.contents.getDownloadUrl(path);
    const element = document.createElement('a');
    element.href = url;
    element.download = '';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    return void 0;
  }

  /**
   * Restore the state of the file browser.
   *
   * @param id - The unique ID that is used to construct a state database key.
   *
   * @param populate - If `false`, the restoration ID will be set but the file
   * browser state will not be fetched from the state database.
   *
   * @returns A promise when restoration is complete.
   *
   * #### Notes
   * This function will only restore the model *once*. If it is called multiple
   * times, all subsequent invocations are no-ops.
   */
  async restore(id: string, populate = true): Promise<void> {
    const { manager } = this;
    const key = `file-browser-${id}:cwd`;
    const state = this._state;
    const restored = !!this._key;

    if (restored) {
      return;
    }

    // Set the file browser key for state database fetch/save.
    this._key = key;

    if (!populate || !state) {
      this._restored.resolve(undefined);
      return;
    }

    await manager.services.ready;

    try {
      const value = await state.fetch(key);

      if (!value) {
        this._restored.resolve(undefined);
        return;
      }

      const path = (value as ReadonlyJSONObject)['path'] as string;
      const localPath = manager.services.contents.localPath(path);

      await manager.services.contents.get(path);
      await this.cd(localPath);
    } catch (error) {
      await state.remove(key);
    }

    this._restored.resolve(undefined);
  }

  /**
   * Upload a `File` object.
   *
   * @param file - The `File` object to upload.
   *
   * @returns A promise containing the new file contents model.
   *
   * #### Notes
   * On Notebook version < 5.1.0, this will fail to upload files that are too
   * big to be sent in one request to the server. On newer versions, or on
   * Jupyter Server, it will ask for confirmation then upload the file in 1 MB
   * chunks.
   */
  async upload(file: File): Promise<Contents.IModel> {
    // We do not support Jupyter Notebook version less than 4, and Jupyter
    // Server advertises itself as version 1 and supports chunked
    // uploading. We assume any version less than 4.0.0 to be Jupyter Server
    // instead of Jupyter Notebook.
    const serverVersion = PageConfig.getNotebookVersion();
    const supportsChunked =
      serverVersion < [4, 0, 0] /* Jupyter Server */ ||
      serverVersion >= [5, 1, 0]; /* Jupyter Notebook >= 5.1.0 */
    const largeFile = file.size > LARGE_FILE_SIZE;

    if (largeFile && !supportsChunked) {
      const msg = this._trans.__(
        'Cannot upload file (>%1 MB). %2',
        LARGE_FILE_SIZE / (1024 * 1024),
        file.name
      );
      console.warn(msg);
      throw msg;
    }

    const err = 'File not uploaded';
    if (largeFile && !(await this._shouldUploadLarge(file))) {
      throw 'Cancelled large file upload';
    }
    await this._uploadCheckDisposed();
    await this.refresh();
    await this._uploadCheckDisposed();
    if (
      find(this._items, i => i.name === file.name) &&
      !(await shouldOverwrite(file.name))
    ) {
      throw err;
    }
    await this._uploadCheckDisposed();
    const chunkedUpload = supportsChunked && file.size > CHUNK_SIZE;
    return await this._upload(file, chunkedUpload);
  }

  private async _shouldUploadLarge(file: File): Promise<boolean> {
    const { button } = await showDialog({
      title: this._trans.__('Large file size warning'),
      body: this._trans.__(
        'The file size is %1 MB. Do you still want to upload it?',
        Math.round(file.size / (1024 * 1024))
      ),
      buttons: [
        Dialog.cancelButton({ label: this._trans.__('Cancel') }),
        Dialog.warnButton({ label: this._trans.__('Upload') })
      ]
    });
    return button.accept;
  }

  /**
   * Perform the actual upload.
   */
  private async _upload(
    file: File,
    chunked: boolean
  ): Promise<Contents.IModel> {
    // Gather the file model parameters.
    let path = this._model.path;
    path = path ? path + '/' + file.name : file.name;
    const name = file.name;
    const type: Contents.ContentType = 'file';
    const format: Contents.FileFormat = 'base64';

    const uploadInner = async (
      blob: Blob,
      chunk?: number
    ): Promise<Contents.IModel> => {
      await this._uploadCheckDisposed();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      await new Promise((resolve, reject) => {
        reader.onload = resolve;
        reader.onerror = event =>
          reject(`Failed to upload "${file.name}":` + event);
      });
      await this._uploadCheckDisposed();

      // remove header https://stackoverflow.com/a/24289420/907060
      const content = (reader.result as string).split(',')[1];

      const model: Partial<Contents.IModel> = {
        type,
        format,
        name,
        chunk,
        content
      };
      return await this.manager.services.contents.save(path, model);
    };

    if (!chunked) {
      try {
        return await uploadInner(file);
      } catch (err) {
        ArrayExt.removeFirstWhere(this._uploads, uploadIndex => {
          return file.name === uploadIndex.path;
        });
        throw err;
      }
    }

    let finalModel: Contents.IModel | undefined;

    let upload = { path, progress: 0 };
    this._uploadChanged.emit({
      name: 'start',
      newValue: upload,
      oldValue: null
    });

    for (let start = 0; !finalModel; start += CHUNK_SIZE) {
      const end = start + CHUNK_SIZE;
      const lastChunk = end >= file.size;
      const chunk = lastChunk ? -1 : end / CHUNK_SIZE;

      const newUpload = { path, progress: start / file.size };
      this._uploads.splice(this._uploads.indexOf(upload));
      this._uploads.push(newUpload);
      this._uploadChanged.emit({
        name: 'update',
        newValue: newUpload,
        oldValue: upload
      });
      upload = newUpload;

      let currentModel: Contents.IModel;
      try {
        currentModel = await uploadInner(file.slice(start, end), chunk);
      } catch (err) {
        ArrayExt.removeFirstWhere(this._uploads, uploadIndex => {
          return file.name === uploadIndex.path;
        });

        this._uploadChanged.emit({
          name: 'failure',
          newValue: upload,
          oldValue: null
        });

        throw err;
      }

      if (lastChunk) {
        finalModel = currentModel;
      }
    }

    this._uploads.splice(this._uploads.indexOf(upload));
    this._uploadChanged.emit({
      name: 'finish',
      newValue: null,
      oldValue: upload
    });

    return finalModel;
  }

  private _uploadCheckDisposed(): Promise<void> {
    if (this.isDisposed) {
      return Promise.reject('Filemanager disposed. File upload canceled');
    }
    return Promise.resolve();
  }

  /**
   * Handle an updated contents model.
   */
  private _handleContents(contents: Contents.IModel): void {
    // Update our internal data.
    this._model = {
      name: contents.name,
      path: contents.path,
      type: contents.type,
      content: undefined,
      writable: contents.writable,
      created: contents.created,
      last_modified: contents.last_modified,
      mimetype: contents.mimetype,
      format: contents.format
    };
    this._items = contents.content;
    this._paths.clear();
    contents.content.forEach((model: Contents.IModel) => {
      this._paths.add(model.path);
    });
  }

  /**
   * Handle a change to the running sessions.
   */
  private _onRunningChanged(
    sender: Session.IManager,
    models: IterableOrArrayLike<Session.IModel>
  ): void {
    this._populateSessions(models);
    this._refreshed.emit(void 0);
  }

  /**
   * Handle a change on the contents manager.
   */
  private _onFileChanged(
    sender: Contents.IManager,
    change: Contents.IChangedArgs
  ): void {
    const path = this._model.path;
    const { sessions } = this.manager.services;
    const { oldValue, newValue } = change;
    const value =
      oldValue && oldValue.path && PathExt.dirname(oldValue.path) === path
        ? oldValue
        : newValue && newValue.path && PathExt.dirname(newValue.path) === path
        ? newValue
        : undefined;

    // If either the old value or the new value is in the current path, update.
    if (value) {
      void this._poll.refresh();
      this._populateSessions(sessions.running());
      this._fileChanged.emit(change);
      return;
    }
  }

  /**
   * Populate the model's sessions collection.
   */
  private _populateSessions(models: IterableOrArrayLike<Session.IModel>): void {
    this._sessions.length = 0;
    each(models, model => {
      if (this._paths.has(model.path)) {
        this._sessions.push(model);
      }
    });
  }

  protected translator: ITranslator;
  private _trans: TranslationBundle;
  private _connectionFailure = new Signal<this, Error>(this);
  private _fileChanged = new Signal<this, Contents.IChangedArgs>(this);
  private _items: Contents.IModel[] = [];
  private _key: string = '';
  private _model: Contents.IModel;
  private _pathChanged = new Signal<this, IChangedArgs<string>>(this);
  private _paths = new Set<string>();
  private _pending: Promise<void> | null = null;
  private _pendingPath: string | null = null;
  private _refreshed = new Signal<this, void>(this);
  private _sessions: Session.IModel[] = [];
  private _state: IStateDB | null = null;
  private _driveName: string;
  private _isDisposed = false;
  private _restored = new PromiseDelegate<void>();
  private _uploads: IUploadModel[] = [];
  private _uploadChanged = new Signal<this, IChangedArgs<IUploadModel | null>>(
    this
  );
  private _unloadEventListener: (e: Event) => string | undefined;
  private _poll: Poll;
}

/**
 * The namespace for the `FileBrowserModel` class statics.
 */
export namespace FileBrowserModel {
  /**
   * An options object for initializing a file browser.
   */
  export interface IOptions {
    /**
     * Whether a file browser automatically loads its initial path.
     * The default is `true`.
     */
    auto?: boolean;

    /**
     * An optional `Contents.IDrive` name for the model.
     * If given, the model will prepend `driveName:` to
     * all paths used in file operations.
     */
    driveName?: string;

    /**
     * A document manager instance.
     */
    manager: IDocumentManager;

    /**
     * The time interval for browser refreshing, in ms.
     */
    refreshInterval?: number;

    /**
     * When the model stops polling the API. Defaults to `when-hidden`.
     */
    refreshStandby?: Poll.Standby | (() => boolean | Poll.Standby);

    /**
     * An optional state database. If provided, the model will restore which
     * folder was last opened when it is restored.
     */
    state?: IStateDB;

    /**
     * The application language translator.
     */
    translator?: ITranslator;
  }
}

/**
 * File browser model with optional filter on element.
 */
export class FilterFileBrowserModel extends FileBrowserModel {
  constructor(options: FilterFileBrowserModel.IOptions) {
    super(options);
    this.translator = options.translator || nullTranslator;
    this._filter = options.filter ? options.filter : model => true;
  }

  /**
   * Create an iterator over the filtered model's items.
   *
   * @returns A new iterator over the model's items.
   */
  items(): IIterator<Contents.IModel> {
    return filter(super.items(), (value, index) => {
      if (value.type === 'directory') {
        return true;
      } else {
        return this._filter(value);
      }
    });
  }

  setFilter(filter: (value: Contents.IModel) => boolean) {
    this._filter = filter;
    void this.refresh();
  }

  private _filter: (value: Contents.IModel) => boolean;
}

/**
 * Namespace for the filtered file browser model
 */
export namespace FilterFileBrowserModel {
  /**
   * Constructor options
   */
  export interface IOptions extends FileBrowserModel.IOptions {
    /**
     * Filter function on file browser item model
     */
    filter?: (value: Contents.IModel) => boolean;
  }
}
