// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IIterator, iter, every } from '@lumino/algorithm';
import { Poll } from '@lumino/polling';
import { ISignal, Signal } from '@lumino/signaling';

import { ServerConnection } from '../serverconnection';

import * as Session from './session';
import { BaseManager } from '../basemanager';
import { SessionConnection } from './default';
import { startSession, shutdownSession, listRunning } from './restapi';
import { Kernel } from '../kernel';

/**
 * An implementation of a session manager.
 */
export class SessionManager extends BaseManager implements Session.IManager {
  /**
   * Construct a new session manager.
   *
   * @param options - The default options for each session.
   */
  constructor(options: SessionManager.IOptions) {
    super(options);

    this._kernelManager = options.kernelManager;

    // Start model polling with exponential backoff.
    this._pollModels = new Poll({
      auto: false,
      factory: () => this.requestRunning(),
      frequency: {
        interval: 10 * 1000,
        backoff: true,
        max: 300 * 1000
      },
      name: `@jupyterlab/services:SessionManager#models`,
      standby: options.standby ?? 'when-hidden'
    });

    // Initialize internal data.
    this._ready = (async () => {
      await this._pollModels.start();
      await this._pollModels.tick;
      await this._kernelManager.ready;
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
   * A signal emitted when the running sessions change.
   */
  get runningChanged(): ISignal<this, Session.IModel[]> {
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
    this._sessionConnections.forEach(x => x.dispose());
    this._pollModels.dispose();
    super.dispose();
  }

  /*
   * Connect to a running session.  See also [[connectToSession]].
   */
  connectTo(
    options: Omit<
      Session.ISessionConnection.IOptions,
      'connectToKernel' | 'serverSettings'
    >
  ): Session.ISessionConnection {
    const sessionConnection = new SessionConnection({
      ...options,
      connectToKernel: this._connectToKernel,
      serverSettings: this.serverSettings
    });
    this._onStarted(sessionConnection);
    if (!this._models.has(options.model.id)) {
      // We trust the user to connect to an existing session, but we verify
      // asynchronously.
      void this.refreshRunning().catch(() => {
        /* no-op */
      });
    }

    return sessionConnection;
  }

  /**
   * Create an iterator over the most recent running sessions.
   *
   * @returns A new iterator over the running sessions.
   */
  running(): IIterator<Session.IModel> {
    return iter([...this._models.values()]);
  }

  /**
   * Force a refresh of the running sessions.
   *
   * @returns A promise that with the list of running sessions.
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
   * Start a new session.  See also [[startNewSession]].
   *
   * @param createOptions - Options for creating the session
   *
   * @param connectOptions - Options for connecting to the session
   */
  async startNew(
    createOptions: Session.ISessionOptions,
    connectOptions: Omit<
      Session.ISessionConnection.IOptions,
      'model' | 'connectToKernel' | 'serverSettings'
    > = {}
  ): Promise<Session.ISessionConnection> {
    const model = await startSession(createOptions, this.serverSettings);
    await this.refreshRunning();
    return this.connectTo({ ...connectOptions, model });
  }

  /**
   * Shut down a session by id.
   */
  async shutdown(id: string): Promise<void> {
    await shutdownSession(id, this.serverSettings);
    await this.refreshRunning();
  }

  /**
   * Shut down all sessions.
   *
   * @returns A promise that resolves when all of the kernels are shut down.
   */
  async shutdownAll(): Promise<void> {
    // Update the list of models to make sure our list is current.
    await this.refreshRunning();

    // Shut down all models.
    await Promise.all(
      [...this._models.keys()].map(id =>
        shutdownSession(id, this.serverSettings)
      )
    );

    // Update the list of models to clear out our state.
    await this.refreshRunning();
  }

  /**
   * Find a session associated with a path and stop it if it is the only session
   * using that kernel.
   *
   * @param path - The path in question.
   *
   * @returns A promise that resolves when the relevant sessions are stopped.
   */
  async stopIfNeeded(path: string): Promise<void> {
    try {
      const sessions = await listRunning(this.serverSettings);
      const matches = sessions.filter(value => value.path === path);
      if (matches.length === 1) {
        const id = matches[0].id;
        await this.shutdown(id);
      }
    } catch (error) {
      /* Always succeed. */
    }
  }

  /**
   * Find a session by id.
   */
  async findById(id: string): Promise<Session.IModel | undefined> {
    if (this._models.has(id)) {
      return this._models.get(id);
    }
    await this.refreshRunning();
    return this._models.get(id);
  }

  /**
   * Find a session by path.
   */
  async findByPath(path: string): Promise<Session.IModel | undefined> {
    for (const m of this._models.values()) {
      if (m.path === path) {
        return m;
      }
    }
    await this.refreshRunning();
    for (const m of this._models.values()) {
      if (m.path === path) {
        return m;
      }
    }
    return undefined;
  }

  /**
   * Execute a request to the server to poll running kernels and update state.
   */
  protected async requestRunning(): Promise<void> {
    let models: Session.IModel[];
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
        return (
          existing.kernel?.id === x.kernel?.id &&
          existing.kernel?.name === x.kernel?.name &&
          existing.name === x.name &&
          existing.path === x.path &&
          existing.type === x.type
        );
      })
    ) {
      // Identical models list (presuming models does not contain duplicate
      // ids), so just return
      return;
    }

    this._models = new Map(models.map(x => [x.id, x]));

    this._sessionConnections.forEach(sc => {
      if (this._models.has(sc.id)) {
        sc.update(this._models.get(sc.id)!);
      } else {
        sc.dispose();
      }
    });

    this._runningChanged.emit(models);
  }

  /**
   * Handle a session starting.
   */
  private _onStarted(sessionConnection: SessionConnection): void {
    this._sessionConnections.add(sessionConnection);
    sessionConnection.disposed.connect(this._onDisposed, this);
    sessionConnection.propertyChanged.connect(this._onChanged, this);
    sessionConnection.kernelChanged.connect(this._onChanged, this);
  }

  private _onDisposed(sessionConnection: SessionConnection) {
    this._sessionConnections.delete(sessionConnection);
    // A session termination emission could mean the server session is deleted,
    // or that the session JS object is disposed and the session still exists on
    // the server, so we refresh from the server to make sure we reflect the
    // server state.

    void this.refreshRunning().catch(() => {
      /* no-op */
    });
  }

  private _onChanged() {
    void this.refreshRunning().catch(() => {
      /* no-op */
    });
  }

  private _isReady = false;
  private _sessionConnections = new Set<SessionConnection>();
  private _models = new Map<string, Session.IModel>();
  private _pollModels: Poll;
  private _ready: Promise<void>;
  private _runningChanged = new Signal<this, Session.IModel[]>(this);
  private _connectionFailure = new Signal<this, Error>(this);

  // We define these here so they bind `this` correctly
  private readonly _connectToKernel = (
    options: Omit<Kernel.IKernelConnection.IOptions, 'serverSettings'>
  ) => {
    return this._kernelManager.connectTo(options);
  };

  private _kernelManager: Kernel.IManager;
}

/**
 * The namespace for `SessionManager` class statics.
 */
export namespace SessionManager {
  /**
   * The options used to initialize a SessionManager.
   */
  export interface IOptions extends BaseManager.IOptions {
    /**
     * When the manager stops polling the API. Defaults to `when-hidden`.
     */
    standby?: Poll.Standby | (() => boolean | Poll.Standby);

    /**
     * Kernel Manager
     */
    kernelManager: Kernel.IManager;
  }
}
