// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { PathExt, IChangedArgs } from '@jupyterlab/coreutils';

import { UUID } from '@lumino/coreutils';

import {
  Kernel,
  KernelMessage,
  KernelSpec,
  ServerConnection,
  Session
} from '@jupyterlab/services';

import { IterableOrArrayLike, each, find } from '@lumino/algorithm';

import { PromiseDelegate } from '@lumino/coreutils';

import { IDisposable, IObservableDisposable } from '@lumino/disposable';

import { ISignal, Signal } from '@lumino/signaling';

import { Widget } from '@lumino/widgets';

import * as React from 'react';

import { showDialog, Dialog } from './dialog';

/**
 * A context object to manage a widget's kernel session connection.
 *
 * #### Notes
 * The current session connection is `.session`, the current session's kernel
 * connection is `.session.kernel`. For convenience, we proxy several kernel
 * connection and and session connection signals up to the session context so
 * that you do not have to manage slots as sessions and kernels change. For
 * example, to act on whatever the current kernel's iopubMessage signal is
 * producing, connect to the session context `.iopubMessage` signal.
 *
 */
export interface ISessionContext extends IObservableDisposable {
  /**
   * The current session connection.
   */
  session: Session.ISessionConnection | null;

  /**
   * Initialize the session context.
   *
   * @returns A promise that resolves with whether to ask the user to select a kernel.
   *
   * #### Notes
   * This includes starting up an initial kernel if needed.
   */
  initialize(): Promise<boolean>;

  /**
   * Whether the session context is ready.
   */
  readonly isReady: boolean;

  /**
   * Whether the session context is terminating.
   */
  readonly isTerminating: boolean;

  /**
   * Whether the session context is restarting.
   */
  readonly isRestarting: boolean;

  /**
   * A promise that is fulfilled when the session context is ready.
   */
  readonly ready: Promise<void>;

  /**
   * A signal emitted when the session connection changes.
   */
  readonly sessionChanged: ISignal<
    this,
    IChangedArgs<
      Session.ISessionConnection | null,
      Session.ISessionConnection | null,
      'session'
    >
  >;

  // Signals proxied from the session connection for convenience.

  /**
   * A signal emitted when the kernel changes, proxied from the session connection.
   */
  readonly kernelChanged: ISignal<
    this,
    IChangedArgs<
      Kernel.IKernelConnection | null,
      Kernel.IKernelConnection | null,
      'kernel'
    >
  >;

  /**
   * A signal emitted when the kernel status changes, proxied from the session connection.
   */
  readonly statusChanged: ISignal<this, Kernel.Status>;

  /**
   * A signal emitted when the kernel connection status changes, proxied from the session connection.
   */
  readonly connectionStatusChanged: ISignal<this, Kernel.ConnectionStatus>;

  /**
   * A signal emitted for a kernel messages, proxied from the session connection.
   */
  readonly iopubMessage: ISignal<this, KernelMessage.IMessage>;

  /**
   * A signal emitted for an unhandled kernel message, proxied from the session connection.
   */
  readonly unhandledMessage: ISignal<this, KernelMessage.IMessage>;

  /**
   * A signal emitted when a session property changes, proxied from the session connection.
   */
  readonly propertyChanged: ISignal<this, 'path' | 'name' | 'type'>;

  /**
   * The kernel preference for starting new kernels.
   */
  kernelPreference: ISessionContext.IKernelPreference;

  /**
   * The sensible display name for the kernel, or Private.NO_KERNEL
   *
   * #### Notes
   * This is at this level since the underlying kernel connection does not
   * have access to the kernel spec manager.
   */
  readonly kernelDisplayName: string;

  /**
   * A sensible status to display
   *
   * #### Notes
   * This combines the status and connection status into a single status for the user.
   */
  readonly kernelDisplayStatus: ISessionContext.KernelDisplayStatus;

  /**
   * The session path.
   *
   * #### Notes
   * Typically `.session.path` should be used. This attribute is useful if
   * there is no current session.
   */
  readonly path: string;

  /**
   * The session type.
   *
   * #### Notes
   * Typically `.session.type` should be used. This attribute is useful if
   * there is no current session.
   */
  readonly type: string;

  /**
   * The session name.
   *
   * #### Notes
   * Typically `.session.name` should be used. This attribute is useful if
   * there is no current session.
   */
  readonly name: string;

  /**
   * The previous kernel name.
   */
  readonly prevKernelName: string;

  /**
   * The session manager used by the session.
   */
  readonly sessionManager: Session.IManager;

  /**
   * The kernel spec manager
   */
  readonly specsManager: KernelSpec.IManager;

  /**
   * Restart the current Kernel.
   *
   * @returns A promise that resolves when the kernel is restarted.
   */
  restartKernel(): Promise<void>;

  /**
   * Kill the kernel and shutdown the session.
   *
   * @returns A promise that resolves when the session is shut down.
   */
  shutdown(): Promise<void>;

  /**
   * Change the kernel associated with the session.
   *
   * @param options The optional kernel model parameters to use for the new kernel.
   *
   * @returns A promise that resolves with the new kernel connection.
   */
  changeKernel(
    options?: Partial<Kernel.IModel>
  ): Promise<Kernel.IKernelConnection | null>;
}

/**
 * The namespace for session context related interfaces.
 */
export namespace ISessionContext {
  /**
   * A kernel preference.
   *
   * #### Notes
   * Preferences for a kernel are considered in the order `id`, `name`,
   * `language`. If no matching kernels can be found and `autoStartDefault` is
   * `true`, then the default kernel for the server is preferred.
   */
  export interface IKernelPreference {
    /**
     * The name of the kernel.
     */
    readonly name?: string;

    /**
     * The preferred kernel language.
     */
    readonly language?: string;

    /**
     * The id of an existing kernel.
     */
    readonly id?: string;

    /**
     * A kernel should be started automatically (default `true`).
     */
    readonly shouldStart?: boolean;

    /**
     * A kernel can be started (default `true`).
     */
    readonly canStart?: boolean;

    /**
     * Shut down the session when session context is disposed (default `false`).
     */
    readonly shutdownOnDispose?: boolean;

    /**
     * Automatically start the default kernel if no other matching kernel is
     * found (default `true`).
     */
    readonly autoStartDefault?: boolean;
  }

  export type KernelDisplayStatus =
    | Kernel.Status
    | Kernel.ConnectionStatus
    | 'initializing'
    | '';

  /**
   * An interface for a session context dialog provider.
   */
  export interface IDialogs {
    /**
     * Select a kernel for the session context.
     */
    selectKernel(session: ISessionContext): Promise<void>;

    /**
     * Restart the session context.
     *
     * @returns A promise that resolves with whether the kernel has restarted.
     *
     * #### Notes
     * If there is a running kernel, present a dialog.
     * If there is no kernel, we start a kernel with the last run
     * kernel name and resolves with `true`. If no kernel has been started,
     * this is a no-op, and resolves with `false`.
     */
    restart(session: ISessionContext): Promise<boolean>;

    /**
     * Show the kernel info for the session context.
     */
    kernelInfo(session: ISessionContext): Promise<void>;
  }
}

/**
 * The default implementation for a session context object.
 */
export class SessionContext implements ISessionContext {
  /**
   * Construct a new session context.
   */
  constructor(options: SessionContext.IOptions) {
    this.sessionManager = options.sessionManager;
    this.specsManager = options.specsManager;
    this._path = options.path ?? UUID.uuid4();
    this._type = options.type ?? '';
    this._name = options.name ?? '';
    this._setBusy = options.setBusy;
    this._kernelPreference = options.kernelPreference ?? {};
  }

  /**
   * The current session connection.
   */
  get session(): Session.ISessionConnection | null {
    return this._session ?? null;
  }

  /**
   * The session path.
   *
   * #### Notes
   * Typically `.session.path` should be used. This attribute is useful if
   * there is no current session.
   */
  get path(): string {
    return this._path;
  }

  /**
   * The session type.
   *
   * #### Notes
   * Typically `.session.type` should be used. This attribute is useful if
   * there is no current session.
   */
  get type(): string {
    return this._type;
  }

  /**
   * The session name.
   *
   * #### Notes
   * Typically `.session.name` should be used. This attribute is useful if
   * there is no current session.
   */
  get name(): string {
    return this._name;
  }

  /**
   * A signal emitted when the kernel connection changes, proxied from the session connection.
   */
  get kernelChanged(): ISignal<
    this,
    Session.ISessionConnection.IKernelChangedArgs
  > {
    return this._kernelChanged;
  }

  /**
   * A signal emitted when the session connection changes.
   */
  get sessionChanged(): ISignal<
    this,
    IChangedArgs<
      Session.ISessionConnection | null,
      Session.ISessionConnection | null,
      'session'
    >
  > {
    return this._sessionChanged;
  }

  /**
   * A signal emitted when the kernel status changes, proxied from the kernel.
   */
  get statusChanged(): ISignal<this, Kernel.Status> {
    return this._statusChanged;
  }

  /**
   * A signal emitted when the kernel status changes, proxied from the kernel.
   */
  get connectionStatusChanged(): ISignal<this, Kernel.ConnectionStatus> {
    return this._connectionStatusChanged;
  }

  /**
   * A signal emitted for iopub kernel messages, proxied from the kernel.
   */
  get iopubMessage(): ISignal<this, KernelMessage.IIOPubMessage> {
    return this._iopubMessage;
  }

  /**
   * A signal emitted for an unhandled kernel message, proxied from the kernel.
   */
  get unhandledMessage(): ISignal<this, KernelMessage.IMessage> {
    return this._unhandledMessage;
  }

  /**
   * A signal emitted when a session property changes, proxied from the current session.
   */
  get propertyChanged(): ISignal<this, 'path' | 'name' | 'type'> {
    return this._propertyChanged;
  }

  /**
   * The kernel preference of this client session.
   *
   * This is used when selecting a new kernel, and should reflect the sort of
   * kernel the activity prefers.
   */
  get kernelPreference(): ISessionContext.IKernelPreference {
    return this._kernelPreference;
  }
  set kernelPreference(value: ISessionContext.IKernelPreference) {
    this._kernelPreference = value;
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
    return this._ready.promise;
  }

  /**
   * Whether the context is terminating.
   */
  get isTerminating(): boolean {
    return this._isTerminating;
  }

  /**
   * Whether the context is restarting.
   */
  get isRestarting(): boolean {
    return this._isRestarting;
  }

  /**
   * The session manager used by the session.
   */
  readonly sessionManager: Session.IManager;

  /**
   * The kernel spec manager
   */
  readonly specsManager: KernelSpec.IManager;

  /**
   * The display name of the current kernel, or a sensible alternative.
   *
   * #### Notes
   * This is a convenience function to have a consistent sensible name for the
   * kernel.
   */
  get kernelDisplayName(): string {
    const kernel = this.session?.kernel;
    if (this._pendingKernelName === Private.NO_KERNEL) {
      return Private.NO_KERNEL;
    }
    if (
      !kernel &&
      !this.isReady &&
      this.kernelPreference.canStart !== false &&
      this.kernelPreference.shouldStart !== false
    ) {
      let name =
        this._pendingKernelName ||
        SessionContext.getDefaultKernel({
          specs: this.specsManager.specs,
          sessions: this.sessionManager.running(),
          preference: this.kernelPreference
        }) ||
        '';
      if (name) {
        name = this.specsManager.specs?.kernelspecs[name]?.display_name ?? name;
        return name;
      }
      return Private.NO_KERNEL;
    }
    if (this._pendingKernelName) {
      return (
        this.specsManager.specs?.kernelspecs[this._pendingKernelName]
          ?.display_name ?? this._pendingKernelName
      );
    }
    if (!kernel) {
      return Private.NO_KERNEL;
    }
    return (
      this.specsManager.specs?.kernelspecs[kernel.name]?.display_name ??
      kernel.name
    );
  }

  /**
   * A sensible status to display
   *
   * #### Notes
   * This combines the status and connection status into a single status for
   * the user.
   */
  get kernelDisplayStatus(): ISessionContext.KernelDisplayStatus {
    const kernel = this.session?.kernel;

    if (this._isTerminating) {
      return 'terminating';
    }

    if (this._isRestarting) {
      return 'restarting';
    }

    if (this._pendingKernelName === Private.NO_KERNEL) {
      return 'idle';
    }

    if (!kernel && this._pendingKernelName) {
      return 'initializing';
    }

    if (
      !kernel &&
      !this.isReady &&
      this.kernelPreference.canStart !== false &&
      this.kernelPreference.shouldStart !== false
    ) {
      return 'initializing';
    }

    return (
      (kernel?.connectionStatus === 'connected'
        ? kernel?.status
        : kernel?.connectionStatus) ?? 'unknown'
    );
  }

  /**
   * The name of the previously started kernel.
   */
  get prevKernelName(): string {
    return this._prevKernelName;
  }

  /**
   * Test whether the context is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * A signal emitted when the poll is disposed.
   */
  get disposed(): ISignal<this, void> {
    return this._disposed;
  }

  /**
   * Dispose of the resources held by the context.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._disposed.emit();

    if (this._session) {
      if (this.kernelPreference.shutdownOnDispose) {
        // Fire and forget the session shutdown request
        this.sessionManager.shutdown(this._session.id).catch(reason => {
          console.error(`Kernel not shut down ${reason}`);
        });
      }

      // Dispose the session connection
      this._session.dispose();
      this._session = null;
    }
    if (this._dialog) {
      this._dialog.dispose();
    }
    if (this._busyDisposable) {
      this._busyDisposable.dispose();
      this._busyDisposable = null;
    }
    Signal.clearData(this);
  }

  /**
   * Restart the current Kernel.
   *
   * @returns A promise that resolves when the kernel is restarted.
   */
  async restartKernel(): Promise<void> {
    const kernel = this.session?.kernel || null;
    this._isRestarting = true;
    this._isReady = false;
    this._statusChanged.emit('restarting');
    await this.session?.kernel?.restart();
    this._isRestarting = false;
    this._isReady = true;
    this._statusChanged.emit(this.session?.kernel?.status || 'unknown');
    this._kernelChanged.emit({
      name: 'kernel',
      oldValue: kernel,
      newValue: this.session?.kernel || null
    });
  }

  /**
   * Change the current kernel associated with the session.
   */
  async changeKernel(
    options: Partial<Kernel.IModel> = {}
  ): Promise<Kernel.IKernelConnection | null> {
    if (this.isDisposed) {
      throw new Error('Disposed');
    }
    // Wait for the initialization method to try
    // and start its kernel first to ensure consistent
    // ordering.
    await this._initStarted.promise;
    return this._changeKernel(options);
  }

  /**
   * Kill the kernel and shutdown the session.
   *
   * @returns A promise that resolves when the session is shut down.
   */
  async shutdown(): Promise<void> {
    if (this.isDisposed || !this._initializing) {
      return;
    }
    await this._initStarted.promise;
    this._pendingSessionRequest = '';
    this._pendingKernelName = Private.NO_KERNEL;
    return this._shutdownSession();
  }

  /**
   * Initialize the session context
   *
   * @returns A promise that resolves with whether to ask the user to select a kernel.
   *
   * #### Notes
   * If a server session exists on the current path, we will connect to it.
   * If preferences include disabling `canStart` or `shouldStart`, no
   * server session will be started.
   * If a kernel id is given, we attempt to start a session with that id.
   * If a default kernel is available, we connect to it.
   * Otherwise we ask the user to select a kernel.
   */
  async initialize(): Promise<boolean> {
    if (this._initializing) {
      return this._initPromise.promise;
    }
    this._initializing = true;
    const needsSelection = await this._initialize();
    if (!needsSelection) {
      this._isReady = true;
      this._ready.resolve(undefined);
    }
    if (!this._pendingSessionRequest) {
      this._initStarted.resolve(void 0);
    }
    this._initPromise.resolve(needsSelection);
    return needsSelection;
  }

  /**
   * Inner initialize function that doesn't handle promises.
   * This makes it easier to consolidate promise handling logic.
   */
  async _initialize(): Promise<boolean> {
    const manager = this.sessionManager;
    await manager.ready;
    await manager.refreshRunning();
    const model = find(manager.running(), item => {
      return item.path === this._path;
    });
    if (model) {
      try {
        const session = manager.connectTo({ model });
        this._handleNewSession(session);
      } catch (err) {
        void this._handleSessionError(err);
        return Promise.reject(err);
      }
    }

    return await this._startIfNecessary();
  }

  /**
   * Shut down the current session.
   */
  private async _shutdownSession(): Promise<void> {
    const session = this._session;
    this._isTerminating = true;
    this._isReady = false;
    this._statusChanged.emit('terminating');
    await session?.shutdown();
    this._isTerminating = false;
    session?.dispose();
    this._session = null;
    const kernel = session?.kernel || null;
    this._statusChanged.emit('unknown');
    this._kernelChanged.emit({
      name: 'kernel',
      oldValue: kernel,
      newValue: null
    });
    this._sessionChanged.emit({
      name: 'session',
      oldValue: session,
      newValue: null
    });
  }

  /**
   * Start the session if necessary.
   *
   * @returns Whether to ask the user to pick a kernel.
   */
  private async _startIfNecessary(): Promise<boolean> {
    const preference = this.kernelPreference;
    if (
      this.isDisposed ||
      this.session?.kernel ||
      preference.shouldStart === false ||
      preference.canStart === false
    ) {
      // Not necessary to start a kernel
      return false;
    }

    let options: Partial<Kernel.IModel> | undefined;
    if (preference.id) {
      options = { id: preference.id };
    } else {
      const name = SessionContext.getDefaultKernel({
        specs: this.specsManager.specs,
        sessions: this.sessionManager.running(),
        preference
      });
      if (name) {
        options = { name };
      }
    }

    if (options) {
      try {
        await this._changeKernel(options);
        return false;
      } catch (err) {
        /* no-op */
      }
    }

    // Always fall back to selecting a kernel
    return true;
  }

  /**
   * Change the kernel.
   */
  private async _changeKernel(
    model: Partial<Kernel.IModel> = {},
    isInit = false
  ): Promise<Kernel.IKernelConnection | null> {
    if (model.name) {
      this._pendingKernelName = model.name;
    }

    if (this._session) {
      await this._shutdownSession();
    } else {
      this._kernelChanged.emit({
        name: 'kernel',
        oldValue: null,
        newValue: null
      });
    }

    // Guarantee that the initialized kernel
    // will be started first.
    if (!this._pendingSessionRequest) {
      this._initStarted.resolve(void 0);
    }

    // Use a UUID for the path to overcome a race condition on the server
    // where it will re-use a session for a given path but only after
    // the kernel finishes starting.
    // We later switch to the real path below.
    // Use the correct directory so the kernel will be started in that directory.
    const dirName = PathExt.dirname(this._path);
    const requestId = (this._pendingSessionRequest = PathExt.join(
      dirName,
      UUID.uuid4()
    ));
    try {
      this._statusChanged.emit('starting');
      const session = await this.sessionManager.startNew({
        path: requestId,
        type: this._type,
        name: this._name,
        kernel: model
      });
      // Handle a preempt.
      if (this._pendingSessionRequest !== session.path) {
        await session.shutdown();
        session.dispose();
        return null;
      }
      // Change to the real path.
      await session.setPath(this._path);

      // Update the name in case it has changed since we launched the session.
      await session.setName(this._name);

      if (this._session) {
        await this._shutdownSession();
      }
      return this._handleNewSession(session);
    } catch (err) {
      void this._handleSessionError(err);
      throw err;
    }
  }

  /**
   * Handle a new session object.
   */
  private _handleNewSession(
    session: Session.ISessionConnection | null
  ): Kernel.IKernelConnection | null {
    if (this.isDisposed) {
      throw Error('Disposed');
    }
    if (!this._isReady) {
      this._isReady = true;
      this._ready.resolve(undefined);
    }
    if (this._session) {
      this._session.dispose();
    }
    this._session = session;
    this._pendingKernelName = '';

    if (session) {
      this._prevKernelName = session.kernel?.name ?? '';

      session.disposed.connect(this._onSessionDisposed, this);
      session.propertyChanged.connect(this._onPropertyChanged, this);
      session.kernelChanged.connect(this._onKernelChanged, this);
      session.statusChanged.connect(this._onStatusChanged, this);
      session.connectionStatusChanged.connect(
        this._onConnectionStatusChanged,
        this
      );
      session.iopubMessage.connect(this._onIopubMessage, this);
      session.unhandledMessage.connect(this._onUnhandledMessage, this);

      if (session.path !== this._path) {
        this._onPropertyChanged(session, 'path');
      }
      if (session.name !== this._name) {
        this._onPropertyChanged(session, 'name');
      }
      if (session.type !== this._type) {
        this._onPropertyChanged(session, 'type');
      }
    }

    // Any existing session/kernel connection was disposed above when the session was
    // disposed, so the oldValue should be null.
    this._sessionChanged.emit({
      name: 'session',
      oldValue: null,
      newValue: session
    });
    this._kernelChanged.emit({
      oldValue: null,
      newValue: session?.kernel || null,
      name: 'kernel'
    });
    this._statusChanged.emit(session?.kernel?.status || 'unknown');

    return session?.kernel || null;
  }

  /**
   * Handle an error in session startup.
   */
  private async _handleSessionError(
    err: ServerConnection.ResponseError
  ): Promise<void> {
    this._handleNewSession(null);
    let traceback = '';
    let message = '';
    try {
      traceback = err.traceback;
      message = err.message;
    } catch (err) {
      // no-op
    }
    const body = (
      <div>
        <pre>{err.message}</pre>
        {message && <pre>{message}</pre>}
        {traceback && (
          <details className="jp-mod-wide">
            <pre>{traceback}</pre>
          </details>
        )}
      </div>
    );

    const dialog = (this._dialog = new Dialog({
      title: 'Error Starting Kernel',
      body,
      buttons: [Dialog.okButton()]
    }));
    await dialog.launch();
    this._dialog = null;
  }

  /**
   * Handle a session termination.
   */
  private _onSessionDisposed(): void {
    if (this._session) {
      const oldValue = this._session;
      this._session = null;
      const newValue = this._session;
      this._sessionChanged.emit({ name: 'session', oldValue, newValue });
    }
  }

  /**
   * Handle a change to a session property.
   */
  private _onPropertyChanged(
    sender: Session.ISessionConnection,
    property: 'path' | 'name' | 'type'
  ) {
    switch (property) {
      case 'path':
        this._path = sender.path;
        break;
      case 'name':
        this._name = sender.name;
        break;
      case 'type':
        this._type = sender.type;
        break;
      default:
        throw new Error(`unrecognized property ${property}`);
    }
    this._propertyChanged.emit(property);
  }

  /**
   * Handle a change to the kernel.
   */
  private _onKernelChanged(
    sender: Session.ISessionConnection,
    args: Session.ISessionConnection.IKernelChangedArgs
  ): void {
    this._kernelChanged.emit(args);
  }

  /**
   * Handle a change to the session status.
   */
  private _onStatusChanged(
    sender: Session.ISessionConnection,
    status: Kernel.Status
  ): void {
    // Set that this kernel is busy, if we haven't already
    // If we have already, and now we aren't busy, dispose
    // of the busy disposable.
    if (this._setBusy) {
      if (status === 'busy') {
        if (!this._busyDisposable) {
          this._busyDisposable = this._setBusy();
        }
      } else {
        if (this._busyDisposable) {
          this._busyDisposable.dispose();
          this._busyDisposable = null;
        }
      }
    }

    // Proxy the signal
    this._statusChanged.emit(status);
  }

  /**
   * Handle a change to the session status.
   */
  private _onConnectionStatusChanged(
    sender: Session.ISessionConnection,
    status: Kernel.ConnectionStatus
  ): void {
    // Proxy the signal
    this._connectionStatusChanged.emit(status);
  }

  /**
   * Handle an iopub message.
   */
  private _onIopubMessage(
    sender: Session.ISessionConnection,
    message: KernelMessage.IIOPubMessage
  ): void {
    this._iopubMessage.emit(message);
  }

  /**
   * Handle an unhandled message.
   */
  private _onUnhandledMessage(
    sender: Session.ISessionConnection,
    message: KernelMessage.IMessage
  ): void {
    this._unhandledMessage.emit(message);
  }

  private _path = '';
  private _name = '';
  private _type = '';
  private _prevKernelName: string = '';
  private _kernelPreference: ISessionContext.IKernelPreference;
  private _isDisposed = false;
  private _disposed = new Signal<this, void>(this);
  private _session: Session.ISessionConnection | null = null;
  private _ready = new PromiseDelegate<void>();
  private _initializing = false;
  private _initStarted = new PromiseDelegate<void>();
  private _initPromise = new PromiseDelegate<boolean>();
  private _isReady = false;
  private _isTerminating = false;
  private _isRestarting = false;
  private _kernelChanged = new Signal<
    this,
    Session.ISessionConnection.IKernelChangedArgs
  >(this);
  private _sessionChanged = new Signal<
    this,
    IChangedArgs<
      Session.ISessionConnection | null,
      Session.ISessionConnection | null,
      'session'
    >
  >(this);
  private _statusChanged = new Signal<this, Kernel.Status>(this);
  private _connectionStatusChanged = new Signal<this, Kernel.ConnectionStatus>(
    this
  );

  private _iopubMessage = new Signal<this, KernelMessage.IIOPubMessage>(this);
  private _unhandledMessage = new Signal<this, KernelMessage.IMessage>(this);
  private _propertyChanged = new Signal<this, 'path' | 'name' | 'type'>(this);
  private _dialog: Dialog<any> | null = null;
  private _setBusy: (() => IDisposable) | undefined;
  private _busyDisposable: IDisposable | null = null;
  private _pendingKernelName = '';
  private _pendingSessionRequest = '';
}

/**
 * A namespace for `SessionContext` statics.
 */
export namespace SessionContext {
  /**
   * The options used to initialize a context.
   */
  export interface IOptions {
    /**
     * A session manager instance.
     */
    sessionManager: Session.IManager;

    /**
     * A kernel spec manager instance.
     */
    specsManager: KernelSpec.IManager;

    /**
     * The initial path of the file.
     */
    path?: string;

    /**
     * The name of the session.
     */
    name?: string;

    /**
     * The type of the session.
     */
    type?: string;

    /**
     * A kernel preference.
     */
    kernelPreference?: ISessionContext.IKernelPreference;

    /**
     * A function to call when the session becomes busy.
     */
    setBusy?: () => IDisposable;
  }

  /**
   * An interface for populating a kernel selector.
   */
  export interface IKernelSearch {
    /**
     * The Kernel specs.
     */
    specs: KernelSpec.ISpecModels | null;

    /**
     * The kernel preference.
     */
    preference: ISessionContext.IKernelPreference;

    /**
     * The current running sessions.
     */
    sessions?: IterableOrArrayLike<Session.IModel>;
  }

  /**
   * Get the default kernel name given select options.
   */
  export function getDefaultKernel(options: IKernelSearch): string | null {
    return Private.getDefaultKernel(options);
  }
}

/**
 * The default implementation of the client sesison dialog provider.
 */
export const sessionContextDialogs: ISessionContext.IDialogs = {
  /**
   * Select a kernel for the session.
   */
  async selectKernel(sessionContext: ISessionContext): Promise<void> {
    if (sessionContext.isDisposed) {
      return Promise.resolve();
    }

    // If there is no existing kernel, offer the option
    // to keep no kernel.
    let label = 'Cancel';
    if (sessionContext.kernelDisplayName === Private.NO_KERNEL) {
      label = Private.NO_KERNEL;
    }
    const buttons = [
      Dialog.cancelButton({ label }),
      Dialog.okButton({ label: 'Select' })
    ];

    const dialog = new Dialog({
      title: 'Select Kernel',
      body: new Private.KernelSelector(sessionContext),
      buttons
    });

    const result = await dialog.launch();
    if (sessionContext.isDisposed || !result.button.accept) {
      return;
    }
    const model = result.value;
    if (
      model === null &&
      sessionContext.kernelDisplayName !== Private.NO_KERNEL
    ) {
      return sessionContext.shutdown();
    }
    if (model) {
      await sessionContext.changeKernel(model);
    }
  },

  /**
   * Restart the session.
   *
   * @returns A promise that resolves with whether the kernel has restarted.
   *
   * #### Notes
   * If there is a running kernel, present a dialog.
   * If there is no kernel, we start a kernel with the last run
   * kernel name and resolves with `true`.
   */
  async restart(sessionContext: ISessionContext): Promise<boolean> {
    await sessionContext.initialize();
    if (sessionContext.isDisposed) {
      throw new Error('session already disposed');
    }
    const kernel = sessionContext.session?.kernel;
    if (!kernel && sessionContext.prevKernelName) {
      await sessionContext.changeKernel({
        name: sessionContext.prevKernelName
      });
      return true;
    }
    // Bail if there is no previous kernel to start.
    if (!kernel) {
      throw new Error('No kernel to restart');
    }

    const restartBtn = Dialog.warnButton({ label: 'Restart' });
    const result = await showDialog({
      title: 'Restart Kernel?',
      body:
        'Do you want to restart the current kernel? All variables will be lost.',
      buttons: [Dialog.cancelButton(), restartBtn]
    });

    if (kernel.isDisposed) {
      return false;
    }
    if (result.button.accept) {
      await sessionContext.restartKernel();
      return true;
    }
    return false;
  },

  /**
   * Show the kernel info for the session context.
   */
  async kernelInfo(sessionContext: ISessionContext): Promise<void> {
    const info = await sessionContext.session?.kernel?.info;
    if (!info) {
      return;
    }
    const body = <pre>{info.banner}</pre>;

    void showDialog({
      body,
      buttons: [
        Dialog.createButton({
          label: 'Dismiss',
          className: 'jp-mod-accept jp-mod-styled'
        })
      ]
    });
  }
};

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The text to show for no kernel.
   */
  export const NO_KERNEL = 'No Kernel';

  /**
   * A widget that provides a kernel selection.
   */
  export class KernelSelector extends Widget {
    /**
     * Create a new kernel selector widget.
     */
    constructor(sessionContext: ISessionContext) {
      super({ node: createSelectorNode(sessionContext) });
    }

    /**
     * Get the value of the kernel selector widget.
     */
    getValue(): Kernel.IModel {
      const selector = this.node.querySelector('select') as HTMLSelectElement;
      return JSON.parse(selector.value) as Kernel.IModel;
    }
  }

  /**
   * Create a node for a kernel selector widget.
   */
  function createSelectorNode(sessionContext: ISessionContext) {
    // Create the dialog body.
    const body = document.createElement('div');
    const text = document.createElement('label');
    text.textContent = `Select kernel for: "${sessionContext.name}"`;
    body.appendChild(text);

    const options = getKernelSearch(sessionContext);
    const selector = document.createElement('select');
    populateKernelSelect(selector, options);
    body.appendChild(selector);
    return body;
  }

  /**
   * Get the default kernel name given select options.
   */
  export function getDefaultKernel(
    options: SessionContext.IKernelSearch
  ): string | null {
    const { specs, preference } = options;
    const {
      name,
      language,
      shouldStart,
      canStart,
      autoStartDefault
    } = preference;

    if (!specs || shouldStart === false || canStart === false) {
      return null;
    }

    const defaultName = autoStartDefault ? specs.default : null;

    if (!name && !language) {
      return defaultName;
    }

    // Look for an exact match of a spec name.
    for (const specName in specs.kernelspecs) {
      if (specName === name) {
        return name;
      }
    }

    // Bail if there is no language.
    if (!language) {
      return defaultName;
    }

    // Check for a single kernel matching the language.
    const matches: string[] = [];
    for (const specName in specs.kernelspecs) {
      const kernelLanguage = specs.kernelspecs[specName]?.language;
      if (language === kernelLanguage) {
        matches.push(specName);
      }
    }

    if (matches.length === 1) {
      const specName = matches[0];
      console.warn(
        'No exact match found for ' +
          specName +
          ', using kernel ' +
          specName +
          ' that matches ' +
          'language=' +
          language
      );
      return specName;
    }

    // No matches found.
    return defaultName;
  }

  /**
   * Populate a kernel select node for the session.
   */
  export function populateKernelSelect(
    node: HTMLSelectElement,
    options: SessionContext.IKernelSearch
  ): void {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }

    const { preference, sessions, specs } = options;
    const { name, id, language, canStart, shouldStart } = preference;

    if (!specs || canStart === false) {
      node.appendChild(optionForNone());
      node.value = 'null';
      node.disabled = true;
      return;
    }

    node.disabled = false;

    // Create mappings of display names and languages for kernel name.
    const displayNames: { [key: string]: string } = Object.create(null);
    const languages: { [key: string]: string } = Object.create(null);
    for (const name in specs.kernelspecs) {
      const spec = specs.kernelspecs[name]!;
      displayNames[name] = spec.display_name;
      languages[name] = spec.language;
    }

    // Handle a kernel by name.
    const names: string[] = [];
    if (name && name in specs.kernelspecs) {
      names.push(name);
    }

    // Then look by language.
    if (language) {
      for (const specName in specs.kernelspecs) {
        if (name !== specName && languages[specName] === language) {
          names.push(specName);
        }
      }
    }

    // Use the default kernel if no kernels were found.
    if (!names.length) {
      names.push(specs.default);
    }

    // Handle a preferred kernels in order of display name.
    const preferred = document.createElement('optgroup');
    preferred.label = 'Start Preferred Kernel';

    names.sort((a, b) => displayNames[a].localeCompare(displayNames[b]));
    for (const name of names) {
      preferred.appendChild(optionForName(name, displayNames[name]));
    }

    if (preferred.firstChild) {
      node.appendChild(preferred);
    }

    // Add an option for no kernel
    node.appendChild(optionForNone());

    const other = document.createElement('optgroup');
    other.label = 'Start Other Kernel';

    // Add the rest of the kernel names in alphabetical order.
    const otherNames: string[] = [];
    for (const specName in specs.kernelspecs) {
      if (names.indexOf(specName) !== -1) {
        continue;
      }
      otherNames.push(specName);
    }
    otherNames.sort((a, b) => displayNames[a].localeCompare(displayNames[b]));
    for (const otherName of otherNames) {
      other.appendChild(optionForName(otherName, displayNames[otherName]));
    }
    // Add a separator option if there were any other names.
    if (otherNames.length) {
      node.appendChild(other);
    }

    // Handle the default value.
    if (shouldStart === false) {
      node.value = 'null';
    } else {
      node.selectedIndex = 0;
    }

    // Bail if there are no sessions.
    if (!sessions) {
      return;
    }

    // Add the sessions using the preferred language first.
    const matchingSessions: Session.IModel[] = [];
    const otherSessions: Session.IModel[] = [];

    each(sessions, session => {
      if (
        language &&
        session.kernel &&
        languages[session.kernel.name] === language &&
        session.kernel.id !== id
      ) {
        matchingSessions.push(session);
      } else if (session.kernel?.id !== id) {
        otherSessions.push(session);
      }
    });

    const matching = document.createElement('optgroup');
    matching.label = 'Use Kernel from Preferred Session';
    node.appendChild(matching);

    if (matchingSessions.length) {
      matchingSessions.sort((a, b) => {
        return a.path.localeCompare(b.path);
      });

      each(matchingSessions, session => {
        const name = session.kernel ? displayNames[session.kernel.name] : '';
        matching.appendChild(optionForSession(session, name));
      });
    }

    const otherSessionsNode = document.createElement('optgroup');
    otherSessionsNode.label = 'Use Kernel from Other Session';
    node.appendChild(otherSessionsNode);

    if (otherSessions.length) {
      otherSessions.sort((a, b) => {
        return a.path.localeCompare(b.path);
      });

      each(otherSessions, session => {
        const name = session.kernel
          ? displayNames[session.kernel.name] || session.kernel.name
          : '';
        otherSessionsNode.appendChild(optionForSession(session, name));
      });
    }
  }

  /**
   * Get the kernel search options given a session context and session manager.
   */
  function getKernelSearch(
    sessionContext: ISessionContext
  ): SessionContext.IKernelSearch {
    return {
      specs: sessionContext.specsManager.specs,
      sessions: sessionContext.sessionManager.running(),
      preference: sessionContext.kernelPreference
    };
  }

  /**
   * Create an option element for a kernel name.
   */
  function optionForName(name: string, displayName: string): HTMLOptionElement {
    const option = document.createElement('option');
    option.text = displayName;
    option.value = JSON.stringify({ name });
    return option;
  }

  /**
   * Create an option for no kernel.
   */
  function optionForNone(): HTMLOptGroupElement {
    const group = document.createElement('optgroup');
    group.label = 'Use No Kernel';
    const option = document.createElement('option');
    option.text = Private.NO_KERNEL;
    option.value = 'null';
    group.appendChild(option);
    return group;
  }

  /**
   * Create an option element for a session.
   */
  function optionForSession(
    session: Session.IModel,
    displayName: string
  ): HTMLOptionElement {
    const option = document.createElement('option');
    const sessionName = session.name || PathExt.basename(session.path);
    option.text = sessionName;
    option.value = JSON.stringify({ id: session.kernel?.id });
    option.title =
      `Path: ${session.path}\n` +
      `Name: ${sessionName}\n` +
      `Kernel Name: ${displayName}\n` +
      `Kernel Id: ${session.kernel?.id}`;
    return option;
  }
}
