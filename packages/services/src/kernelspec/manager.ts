// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JSONExt } from '@lumino/coreutils';
import { Poll } from '@lumino/polling';
import { ISignal, Signal } from '@lumino/signaling';

import { ServerConnection } from '../serverconnection';
import * as KernelSpec from './kernelspec';
import * as restapi from './restapi';
import { BaseManager } from '../basemanager';
/**
 * An implementation of a kernel spec manager.
 */
export class KernelSpecManager
  extends BaseManager
  implements KernelSpec.IManager {
  /**
   * Construct a new kernel spec manager.
   *
   * @param options - The default options for kernel.
   */
  constructor(options: KernelSpecManager.IOptions = {}) {
    super(options);

    // Initialize internal data.
    this._ready = Promise.all([this.requestSpecs()])
      .then(_ => undefined)
      .catch(_ => undefined)
      .then(() => {
        if (this.isDisposed) {
          return;
        }
        this._isReady = true;
      });

    this._pollSpecs = new Poll({
      auto: false,
      factory: () => this.requestSpecs(),
      frequency: {
        interval: 61 * 1000,
        backoff: true,
        max: 300 * 1000
      },
      name: `@jupyterlab/services:KernelSpecManager#specs`,
      standby: options.standby ?? 'when-hidden'
    });
    void this.ready.then(() => {
      void this._pollSpecs.start();
    });
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
   * Get the most recently fetched kernel specs.
   */
  get specs(): restapi.ISpecModels | null {
    return this._specs;
  }

  /**
   * A signal emitted when the specs change.
   */
  get specsChanged(): ISignal<this, restapi.ISpecModels> {
    return this._specsChanged;
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
    this._pollSpecs.dispose();
    super.dispose();
  }

  /**
   * Force a refresh of the specs from the server.
   *
   * @returns A promise that resolves when the specs are fetched.
   *
   * #### Notes
   * This is intended to be called only in response to a user action,
   * since the manager maintains its internal state.
   */
  async refreshSpecs(): Promise<void> {
    await this._pollSpecs.refresh();
    await this._pollSpecs.tick;
  }

  /**
   * Execute a request to the server to poll specs and update state.
   */
  protected async requestSpecs(): Promise<void> {
    const specs = await restapi.getSpecs(this.serverSettings);
    if (this.isDisposed) {
      return;
    }
    if (!JSONExt.deepEqual(specs, this._specs)) {
      this._specs = specs;
      this._specsChanged.emit(specs);
    }
  }

  private _isReady = false;
  private _connectionFailure = new Signal<this, Error>(this);

  private _pollSpecs: Poll;
  private _ready: Promise<void>;

  private _specs: restapi.ISpecModels | null = null;
  private _specsChanged = new Signal<this, restapi.ISpecModels>(this);
}

/**
 * The namespace for `KernelManager` class statics.
 */
export namespace KernelSpecManager {
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
