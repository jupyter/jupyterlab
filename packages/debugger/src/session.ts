// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { KernelMessage, Session } from '@jupyterlab/services';

import { ITranslator, nullTranslator } from '@jupyterlab/translation';

import { PromiseDelegate } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

import { IDebugger } from './tokens';

/**
 * A concrete implementation of IDebugger.ISession.
 */
export class DebuggerSession implements IDebugger.ISession {
  /**
   * Instantiate a new debug session
   *
   * @param options - The debug session instantiation options.
   */
  constructor(options: DebuggerSession.IOptions) {
    this.connection = options.connection;
    this.translator = options.translator || nullTranslator;
  }

  /**
   * Whether the debug session is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * A signal emitted when the debug session is disposed.
   */
  get disposed(): ISignal<this, void> {
    return this._disposed;
  }

  /**
   * Returns the API session connection to connect to a debugger.
   */
  get connection(): Session.ISessionConnection | null {
    return this._connection;
  }

  /**
   * Sets the API session connection to connect to a debugger to
   * the given parameter.
   *
   * @param connection - The new API session connection.
   */
  set connection(connection: Session.ISessionConnection | null) {
    if (this._connection) {
      this._connection.iopubMessage.disconnect(this._handleEvent, this);
    }
    this._connection = connection;

    if (!this._connection) {
      this._isStarted = false;
      return;
    }

    this._connection.iopubMessage.connect(this._handleEvent, this);

    this._ready = new PromiseDelegate<void>();
    const future = this.connection?.kernel?.requestDebug({
      type: 'request',
      seq: 0,
      command: 'debugInfo'
    });
    if (future) {
      future.onReply = (msg: KernelMessage.IDebugReplyMsg): void => {
        this._ready.resolve();
        future.dispose();
      };
    }
  }

  /**
   * Whether the debug session is started.
   */
  get isStarted(): boolean {
    return this._isStarted;
  }

  /**
   * Whether the debug session is started
   */
  get pausingOnExceptions(): boolean {
    return this._pausingOnExceptions;
  }

  /**
   * Whether the debug session is started
   */
  set pausingOnExceptions(value : boolean) {
      this._pausingOnExceptions = value;
  }

  /**
   * Exception paths defined by the debugger
   */
  get exceptionPaths(): string[] {
      return this._exceptionPaths;
  }

  /**
   * Exception paths defined by the debugger
   */
  get exceptionBreakpointFilters(): any {
    return this._exceptionBreakpointFilters;
  }

  /**
   * Signal emitted for debug event messages.
   */
  get eventMessage(): ISignal<IDebugger.ISession, IDebugger.ISession.Event> {
    return this._eventMessage;
  }

  /**
   * Dispose the debug session.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._disposed.emit();
    Signal.clearData(this);
  }

  /**
   * Start a new debug session
   */
  async start(): Promise<void> {
    const reply = await this.sendRequest('initialize', {
      clientID: 'jupyterlab',
      clientName: 'JupyterLab',
      adapterID: this.connection?.kernel?.name ?? '',
      pathFormat: 'path',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: true,
      locale: document.documentElement.lang
    });

    if (!reply.success) {
      throw new Error(`Could not start the debugger: ${reply.message}`);
    }
    console.log("REPLY", reply);
    this._isStarted = true;
    this._pausingOnExceptions = false;
    this._exceptionBreakpointFilters = reply.body?.exceptionBreakpointFilters;
    await this.sendRequest('attach', {});
  }

  /**
   * Stop the running debug session.
   */
  async stop(): Promise<void> {
    await this.sendRequest('disconnect', {
      restart: false,
      terminateDebuggee: false
    });
    this._isStarted = false;
  }

  /**
   * Restore the state of a debug session.
   */
  async restoreState(): Promise<IDebugger.ISession.Response['debugInfo']> {
    const message = await this.sendRequest('debugInfo', {});
    console.log("DEBUG INFO", message)
    this._isStarted = message.body.isStarted;
    this._exceptionPaths = message.body.exceptionPaths;
    return message;
  }

  /**
   * Send a custom debug request to the kernel.
   *
   * @param command debug command.
   * @param args arguments for the debug command.
   */
  async sendRequest<K extends keyof IDebugger.ISession.Request>(
    command: K,
    args: IDebugger.ISession.Request[K]
  ): Promise<IDebugger.ISession.Response[K]> {
    await this._ready.promise;
    const message = await this._sendDebugMessage({
      type: 'request',
      seq: this._seq++,
      command,
      arguments: args
    });
    return message.content as IDebugger.ISession.Response[K];
  }

  /**
   * Handle debug events sent on the 'iopub' channel.
   *
   * @param sender - the emitter of the event.
   * @param message - the event message.
   */
  private _handleEvent(
    sender: Session.ISessionConnection,
    message: KernelMessage.IIOPubMessage
  ): void {
    const msgType = message.header.msg_type;
    if (msgType !== 'debug_event') {
      return;
    }
    const event = message.content as IDebugger.ISession.Event;
    this._eventMessage.emit(event);
  }

  /**
   * Send a debug request message to the kernel.
   *
   * @param msg debug request message to send to the kernel.
   */
  private async _sendDebugMessage(
    msg: KernelMessage.IDebugRequestMsg['content']
  ): Promise<KernelMessage.IDebugReplyMsg> {
    const kernel = this.connection?.kernel;
    if (!kernel) {
      return Promise.reject(
        new Error('A kernel is required to send debug messages.')
      );
    }
    const reply = new PromiseDelegate<KernelMessage.IDebugReplyMsg>();
    const future = kernel.requestDebug(msg);
    future.onReply = (msg: KernelMessage.IDebugReplyMsg): void => {
      reply.resolve(msg);
    };
    await future.done;
    return reply.promise;
  }

  protected translator: ITranslator;
  private _seq = 0;
  private _ready = new PromiseDelegate<void>();
  private _connection: Session.ISessionConnection | null;
  private _isDisposed = false;
  private _isStarted = false;
  private _exceptionPaths: string[] = [];
  private _pausingOnExceptions = false;
  // private _exceptionBreakpointFilters: DebugProtocol.ExceptionBreakpointsFilter = [];
  private _exceptionBreakpointFilters: any = [];
  private _disposed = new Signal<this, void>(this);
  private _eventMessage = new Signal<
    IDebugger.ISession,
    IDebugger.ISession.Event
  >(this);
}

/**
 * A namespace for `DebuggerSession` statics.
 */
export namespace DebuggerSession {
  /**
   * Instantiation options for a `DebuggerSession`.
   */
  export interface IOptions {
    /**
     * The session connection used by the debug session.
     */
    connection: Session.ISessionConnection;

    /**
     * The application language translator.
     */
    translator?: ITranslator;
  }
}
