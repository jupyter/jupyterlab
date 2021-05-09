// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IIterator, iter, every } from '@lumino/algorithm';
import { Poll } from '@lumino/polling';
import { ISignal, Signal } from '@lumino/signaling';

import { ServerConnection } from '..';
import * as Kernel from './kernel';
import { BaseManager } from '../basemanager';
import {
  shutdownKernel,
  startNew,
  listRunning,
  IKernelOptions
} from './restapi';
import { KernelConnection } from './default';

/**
 * An implementation of a kernel manager.
 */
export class KernelManager extends BaseManager implements Kernel.IManager {
  /**
   * Construct a new kernel manager.
   *
   * @param options - The default options for kernel.
   */
  constructor(options: KernelManager.IOptions = {}) {
    super(options);

    // Start model and specs polling with exponential backoff.
    this._pollModels = new Poll({
      auto: false,
      factory: () => this.requestRunning(),
      frequency: {
        interval: 10 * 1000,
        backoff: true,
        max: 300 * 1000
      },
      name: `@jupyterlab/services:KernelManager#models`,
      standby: options.standby ?? 'when-hidden'
    });

    // Initialize internal data.
    this._ready = (async () => {
      await this._pollModels.start();
      await this._pollModels.tick;
      this._isReady = true;
    })();
  }

  /**
   * The server settings for the manager.
   */
  readonly serverSettings: ServerConnection.ISettings;

  /**
   * Test whether the manager is ready.
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * A promise that fulfills when the manager is ready.
   */
  get ready(): Promise<void> {
    return this._ready;
  }

  /**
   * A signal emitted when the running kernels change.
   */
  get runningChanged(): ISignal<this, Kernel.IModel[]> {
    return this._runningChanged;
  }

  /**
   * A signal emitted when there is a connection failure.
   */
  get connectionFailure(): ISignal<this, Error> {
    return this._connectionFailure;
  }

  /**
   * Dispose of the resources used by the manager.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._models.clear();
    this._kernelConnections.forEach(x => x.dispose());
    this._pollModels.dispose();
    super.dispose();
  }

  /**
   * Connect to an existing kernel.
   *
   * @returns The new kernel connection.
   *
   * #### Notes
   * This will use the manager's server settings and ignore any server
   * settings passed in the options.
   */
  connectTo(
    options: Omit<Kernel.IKernelConnection.IOptions, 'serverSettings'>
  ): Kernel.IKernelConnection {
    const { id } = options.model;

    let handleComms = options.handleComms ?? true;
    // By default, handle comms only if no other kernel connection is.
    if (options.handleComms === undefined) {
      for (const kc of this._kernelConnections) {
        if (kc.id === id && kc.handleComms) {
          handleComms = false;
          break;
        }
      }
    }
    const kernelConnection = new KernelConnection({
      handleComms,
      ...options,
      serverSettings: this.serverSettings
    });
    this._onStarted(kernelConnection);
    if (!this._models.has(id)) {
      // We trust the user to connect to an existing kernel, but we verify
      // asynchronously.
      void this.refreshRunning().catch(() => {
        /* no-op */
      });
    }
    return kernelConnection;
  }

  /**
   * Create an iterator over the most recent running kernels.
   *
   * @returns A new iterator over the running kernels.
   */
  running(): IIterator<Kernel.IModel> {
    return iter([...this._models.values()]);
  }

  /**
   * Force a refresh of the running kernels.
   *
   * @returns A promise that resolves when the running list has been refreshed.
   *
   * #### Notes
   * This is not typically meant to be called by the user, since the
   * manager maintains its own internal state.
   */
  async refreshRunning(): Promise<void> {
    await this._pollModels.refresh();
    await this._pollModels.tick;
  }

  /**
   * Start a new kernel.
   *
   * @param createOptions - The kernel creation options
   *
   * @param connectOptions - The kernel connection options
   *
   * @returns A promise that resolves with the kernel connection.
   *
   * #### Notes
   * The manager `serverSettings` will be always be used.
   */
  async startNew(
    createOptions: IKernelOptions = {},
    connectOptions: Omit<
      Kernel.IKernelConnection.IOptions,
      'model' | 'serverSettings'
    > = {}
  ): Promise<Kernel.IKernelConnection> {
    const model = await startNew(createOptions, this.serverSettings);
    return this.connectTo({
      ...connectOptions,
      model
    });
  }

  /**
   * Shut down a kernel by id.
   *
   * @param id - The id of the target kernel.
   *
   * @returns A promise that resolves when the operation is complete.
   */
  async shutdown(id: string): Promise<void> {
    await shutdownKernel(id, this.serverSettings);
    await this.refreshRunning();
  }

  /**
   * Shut down all kernels.
   *
   * @returns A promise that resolves when all of the kernels are shut down.
   */
  async shutdownAll(): Promise<void> {
    // Update the list of models to make sure our list is current.
    await this.refreshRunning();

    // Shut down all models.
    await Promise.all(
      [...this._models.keys()].map(id =>
        shutdownKernel(id, this.serverSettings)
      )
    );

    // Update the list of models to clear out our state.
    await this.refreshRunning();
  }

  /**
   * Find a kernel by id.
   *
   * @param id - The id of the target kernel.
   *
   * @returns A promise that resolves with the kernel's model.
   */
  async findById(id: string): Promise<Kernel.IModel | undefined> {
    if (this._models.has(id)) {
      return this._models.get(id);
    }
    await this.refreshRunning();
    return this._models.get(id);
  }

  /**
   * Execute a request to the server to poll running kernels and update state.
   */
  protected async requestRunning(): Promise<void> {
    let models: Kernel.IModel[];
    try {
      models = await listRunning(this.serverSettings);
    } catch (err) {
      // Check for a network error, or a 503 error, which is returned
      // by a JupyterHub when a server is shut down.
      if (
        err instanceof ServerConnection.NetworkError ||
        err.response?.status === 503
      ) {
        this._connectionFailure.emit(err);
      }
      throw err;
    }

    if (this.isDisposed) {
      return;
    }

    if (
      this._models.size === models.length &&
      every(models, x => {
        const existing = this._models.get(x.id);
        if (!existing) {
          return false;
        }
        return existing.name === x.name;
      })
    ) {
      // Identical models list (presuming models does not contain duplicate
      // ids), so just return
      return;
    }

    this._models = new Map(models.map(x => [x.id, x]));

    // For any kernel connection to a kernel that doesn't exist, notify it of
    // the shutdown.
    this._kernelConnections.forEach(kc => {
      if (!this._models.has(kc.id)) {
        kc.handleShutdown();
      }
    });

    this._runningChanged.emit(models);
  }

  /**
   * Handle a kernel starting.
   */
  private _onStarted(kernelConnection: KernelConnection): void {
    this._kernelConnections.add(kernelConnection);
    kernelConnection.statusChanged.connect(this._onStatusChanged, this);
    kernelConnection.disposed.connect(this._onDisposed, this);
  }

  private _onDisposed(kernelConnection: KernelConnection) {
    this._kernelConnections.delete(kernelConnection);
    // A dispose emission could mean the server session is deleted, or that
    // the kernel JS object is disposed and the kernel still exists on the
    // server, so we refresh from the server to make sure we reflect the
    // server state.

    void this.refreshRunning().catch(() => {
      /* no-op */
    });
  }

  private _onStatusChanged(
    kernelConnection: KernelConnection,
    status: Kernel.Status
  ) {
    if (status === 'dead') {
      // We asynchronously update our list of kernels, which asynchronously
      // will dispose them. We do not want to immediately dispose them because
      // there may be other signal handlers that want to be called.
      void this.refreshRunning().catch(() => {
        /* no-op */
      });
    }
  }

  private _isReady = false;
  private _ready: Promise<void>;
  private _kernelConnections = new Set<KernelConnection>();
  private _models = new Map<string, Kernel.IModel>();
  private _pollModels: Poll;
  private _runningChanged = new Signal<this, Kernel.IModel[]>(this);
  private _connectionFailure = new Signal<this, Error>(this);
}

/**
 * The namespace for `KernelManager` class statics.
 */
export namespace KernelManager {
  /**
   * The options used to initialize a KernelManager.
   */
  export interface IOptions extends BaseManager.IOptions {
    /**
     * When the manager stops polling the API. Defaults to `when-hidden`.
     */
    standby?: Poll.Standby | (() => boolean | Poll.Standby);
  }
}
