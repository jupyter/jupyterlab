// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IIterator, iter } from '@lumino/algorithm';

import { Poll } from '@lumino/polling';

import { ISignal, Signal } from '@lumino/signaling';

import { ServerConnection } from '..';

import * as Terminal from './terminal';
import { BaseManager } from '../basemanager';
import {
  isAvailable,
  startNew,
  shutdownTerminal,
  listRunning
} from './restapi';
import { TerminalConnection } from './default';

/**
 * A terminal session manager.
 */
export class TerminalManager extends BaseManager implements Terminal.IManager {
  /**
   * Construct a new terminal manager.
   */
  constructor(options: TerminalManager.IOptions = {}) {
    super(options);

    // Check if terminals are available
    if (!this.isAvailable()) {
      this._ready = Promise.reject('Terminals unavailable');
      this._ready.catch(_ => undefined);
      return;
    }

    // Start polling with exponential backoff.
    this._pollModels = new Poll({
      auto: false,
      factory: () => this.requestRunning(),
      frequency: {
        interval: 10 * 1000,
        backoff: true,
        max: 300 * 1000
      },
      name: `@jupyterlab/services:TerminalManager#models`,
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
   * The server settings of the manager.
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
   * A signal emitted when the running terminals change.
   */
  get runningChanged(): ISignal<this, Terminal.IModel[]> {
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
    this._names.length = 0;
    this._terminalConnections.forEach(x => x.dispose());
    this._pollModels.dispose();
    super.dispose();
  }

  /**
   * Whether the terminal service is available.
   */
  isAvailable(): boolean {
    return isAvailable();
  }

  /*
   * Connect to a running terminal.
   *
   * @param name - The name of the target terminal.
   *
   * @param options - The options used to connect to the terminal.
   *
   * @returns A promise that resolves to the new terminal connection instance.
   *
   * #### Notes
   * The manager `serverSettings` will be used.
   */
  connectTo(
    options: Omit<Terminal.ITerminalConnection.IOptions, 'serverSettings'>
  ): Terminal.ITerminalConnection {
    const terminalConnection = new TerminalConnection({
      ...options,
      serverSettings: this.serverSettings
    });
    this._onStarted(terminalConnection);
    if (!this._names.includes(options.model.name)) {
      // We trust the user to connect to an existing session, but we verify
      // asynchronously.
      void this.refreshRunning().catch(() => {
        /* no-op */
      });
    }
    return terminalConnection;
  }

  /**
   * Create an iterator over the most recent running terminals.
   *
   * @returns A new iterator over the running terminals.
   */
  running(): IIterator<Terminal.IModel> {
    return iter(this._models);
  }

  /**
   * Force a refresh of the running terminals.
   *
   * @returns A promise that with the list of running terminals.
   *
   * #### Notes
   * This is intended to be called only in response to a user action,
   * since the manager maintains its internal state.
   */
  async refreshRunning(): Promise<void> {
    await this._pollModels.refresh();
    await this._pollModels.tick;
  }

  /**
   * Create a new terminal session.
   *
   * @returns A promise that resolves with the terminal instance.
   *
   * #### Notes
   * The manager `serverSettings` will be used unless overridden in the
   * options.
   */
  async startNew(): Promise<Terminal.ITerminalConnection> {
    const model = await startNew(this.serverSettings);
    await this.refreshRunning();
    return this.connectTo({ model });
  }

  /**
   * Shut down a terminal session by name.
   */
  async shutdown(name: string): Promise<void> {
    await shutdownTerminal(name, this.serverSettings);
    await this.refreshRunning();
  }

  /**
   * Shut down all terminal sessions.
   *
   * @returns A promise that resolves when all of the sessions are shut down.
   */
  async shutdownAll(): Promise<void> {
    // Update the list of models to make sure our list is current.
    await this.refreshRunning();

    // Shut down all models.
    await Promise.all(
      this._names.map(name => shutdownTerminal(name, this.serverSettings))
    );

    // Update the list of models to clear out our state.
    await this.refreshRunning();
  }

  /**
   * Execute a request to the server to poll running terminals and update state.
   */
  protected async requestRunning(): Promise<void> {
    let models: Terminal.IModel[];
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

    const names = models.map(({ name }) => name).sort();
    if (names === this._names) {
      // Identical models list, so just return
      return;
    }

    this._names = names;
    this._terminalConnections.forEach(tc => {
      if (!names.includes(tc.name)) {
        tc.dispose();
      }
    });
    this._runningChanged.emit(this._models);
  }

  /**
   * Handle a session starting.
   */
  private _onStarted(terminalConnection: Terminal.ITerminalConnection): void {
    this._terminalConnections.add(terminalConnection);
    terminalConnection.disposed.connect(this._onDisposed, this);
  }

  /**
   * Handle a session terminating.
   */
  private _onDisposed(terminalConnection: Terminal.ITerminalConnection): void {
    this._terminalConnections.delete(terminalConnection);
    // Update the running models to make sure we reflect the server state
    void this.refreshRunning().catch(() => {
      /* no-op */
    });
  }

  private _isReady = false;

  // As an optimization, we unwrap the models to just store the names.
  private _names: string[] = [];
  private get _models(): Terminal.IModel[] {
    return this._names.map(name => {
      return { name };
    });
  }

  private _pollModels: Poll;
  private _terminalConnections = new Set<Terminal.ITerminalConnection>();
  private _ready: Promise<void>;
  private _runningChanged = new Signal<this, Terminal.IModel[]>(this);
  private _connectionFailure = new Signal<this, Error>(this);
}

/**
 * The namespace for TerminalManager statics.
 */
export namespace TerminalManager {
  /**
   * The options used to initialize a terminal manager.
   */
  export interface IOptions extends BaseManager.IOptions {
    /**
     * When the manager stops polling the API. Defaults to `when-hidden`.
     */
    standby?: Poll.Standby | (() => boolean | Poll.Standby);
  }
}
