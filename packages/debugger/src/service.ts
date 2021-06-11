// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { KernelSpec, Session } from '@jupyterlab/services';

import { IDisposable } from '@lumino/disposable';

import { ISignal, Signal } from '@lumino/signaling';

import { DebugProtocol } from 'vscode-debugprotocol';

import { Debugger } from './debugger';

import { VariablesModel } from './panels/variables/model';

import { IDebugger } from './tokens';

/**
 * A concrete implementation of the IDebugger interface.
 */
export class DebuggerService implements IDebugger, IDisposable {
  /**
   * Instantiate a new DebuggerService.
   *
   * @param options The instantiation options for a DebuggerService.
   */
  constructor(options: DebuggerService.IOptions) {
    this._config = options.config;
    // Avoids setting session with invalid client
    // session should be set only when a notebook or
    // a console get the focus.
    // TODO: also checks that the notebook or console
    // runs a kernel with debugging ability
    this._session = null;
    this._specsManager = options.specsManager ?? null;
    this._model = new Debugger.Model();
    this._debuggerSources = options.debuggerSources ?? null;
  }

  /**
   * Signal emitted for debug event messages.
   */
  get eventMessage(): ISignal<IDebugger, IDebugger.ISession.Event> {
    return this._eventMessage;
  }

  /**
   * Whether the debug service is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Whether the current debugger is started.
   */
  get isStarted(): boolean {
    return this._session?.isStarted ?? false;
  }

  /**
   * Returns the debugger service's model.
   */
  get model(): IDebugger.Model.IService {
    return this._model;
  }

  /**
   * Returns the current debug session.
   */
  get session(): IDebugger.ISession | null {
    return this._session;
  }

  /**
   * Sets the current debug session to the given parameter.
   *
   * @param session - the new debugger session.
   */
  set session(session: IDebugger.ISession | null) {
    if (this._session === session) {
      return;
    }
    if (this._session) {
      this._session.dispose();
    }
    this._session = session;

    this._session?.eventMessage.connect((_, event) => {
      if (event.event === 'stopped') {
        this._model.stoppedThreads.add(event.body.threadId);
        void this._getAllFrames();
      } else if (event.event === 'continued') {
        this._model.stoppedThreads.delete(event.body.threadId);
        this._clearModel();
        this._clearSignals();
      }
      this._eventMessage.emit(event);
    });
    this._sessionChanged.emit(session);
  }

  /**
   * Signal emitted upon session changed.
   */
  get sessionChanged(): ISignal<IDebugger, IDebugger.ISession | null> {
    return this._sessionChanged;
  }

  /**
   * Dispose the debug service.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
  }

  /**
   * Computes an id based on the given code.
   *
   * @param code The source code.
   */
  getCodeId(code: string): string {
    try {
      return this._config.getCodeId(
        code,
        this.session?.connection?.kernel?.name ?? ''
      );
    } catch {
      return '';
    }
  }

  /**
   * Whether there exists a thread in stopped state.
   */
  hasStoppedThreads(): boolean {
    return this._model?.stoppedThreads.size > 0 ?? false;
  }

  /**
   * Request whether debugging is available for the session connection.
   *
   * @param connection The session connection.
   */
  async isAvailable(connection: Session.ISessionConnection): Promise<boolean> {
    if (!this._specsManager) {
      return true;
    }
    await this._specsManager.ready;
    const kernel = connection?.kernel;
    if (!kernel) {
      return false;
    }
    const name = kernel.name;
    if (!this._specsManager.specs?.kernelspecs[name]) {
      return true;
    }
    return !!(
      this._specsManager.specs.kernelspecs[name]?.metadata?.['debugger'] ??
      false
    );
  }

  /**
   * Clear all the breakpoints for the current session.
   */
  async clearBreakpoints(): Promise<void> {
    if (this.session?.isStarted !== true) {
      return;
    }

    this._model.breakpoints.breakpoints.forEach((_, path, map) => {
      void this._setBreakpoints([], path);
    });

    let bpMap = new Map<string, IDebugger.IBreakpoint[]>();
    this._model.breakpoints.restoreBreakpoints(bpMap);
  }

  /**
   * Continues the execution of the current thread.
   */
  async continue(): Promise<void> {
    try {
      if (!this.session) {
        throw new Error('No active debugger session');
      }
      await this.session.sendRequest('continue', {
        threadId: this._currentThread()
      });
      this._model.stoppedThreads.delete(this._currentThread());
      this._clearModel();
      this._clearSignals();
    } catch (err) {
      console.error('Error:', err.message);
    }
  }

  /**
   * Retrieve the content of a source file.
   *
   * @param source The source object containing the path to the file.
   */
  async getSource(source: DebugProtocol.Source): Promise<IDebugger.Source> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    const reply = await this.session.sendRequest('source', {
      source,
      sourceReference: source.sourceReference ?? 0
    });
    return { ...reply.body, path: source.path ?? '' };
  }

  /**
   * Evaluate an expression.
   *
   * @param expression The expression to evaluate as a string.
   */
  async evaluate(
    expression: string
  ): Promise<DebugProtocol.EvaluateResponse['body'] | null> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    const frameId = this.model.callstack.frame?.id;
    const reply = await this.session.sendRequest('evaluate', {
      context: 'repl',
      expression,
      frameId
    });
    if (!reply.success) {
      return null;
    }
    // get the frames to retrieve the latest state of the variables
    this._clearModel();
    await this._getAllFrames();

    return reply.body;
  }

  /**
   * Makes the current thread run again for one step.
   */
  async next(): Promise<void> {
    try {
      if (!this.session) {
        throw new Error('No active debugger session');
      }
      await this.session.sendRequest('next', {
        threadId: this._currentThread()
      });
    } catch (err) {
      console.error('Error:', err.message);
    }
  }

  /**
   * Request rich representation of a variable.
   *
   * @param variableName The variable name to request
   * @param variablesReference The variable reference to request
   * @returns The mime renderer data model
   */
  async inspectRichVariable(
    variableName: string,
    variablesReference?: number
  ): Promise<IDebugger.IRichVariable> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    const reply = await this.session.sendRequest('richInspectVariables', {
      variableName,
      variablesReference
    });
    if (reply.success) {
      return reply.body;
    } else {
      throw new Error(reply.message);
    }
  }

  /**
   * Request variables for a given variable reference.
   *
   * @param variablesReference The variable reference to request.
   */
  async inspectVariable(
    variablesReference: number
  ): Promise<DebugProtocol.Variable[]> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    const reply = await this.session.sendRequest('variables', {
      variablesReference
    });
    if (reply.success) {
      return reply.body.variables;
    } else {
      throw new Error(reply.message);
    }
  }

  /**
   * Requests all the defined variables and display them in the
   * table view.
   */
  async displayDefinedVariables(): Promise<void> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    const inspectReply = await this.session.sendRequest('inspectVariables', {});
    const variables = inspectReply.body.variables;

    const variableScopes = [
      {
        name: 'Globals',
        variables: variables
      }
    ];
    this._model.variables.scopes = variableScopes;
  }

  /**
   * Restart the debugger.
   */
  async restart(): Promise<void> {
    const { breakpoints } = this._model.breakpoints;
    await this.stop();
    await this.start();

    // Re-send the breakpoints to the kernel and update the model.
    for (const [source, points] of breakpoints) {
      await this._setBreakpoints(
        points
          .filter(({ line }) => typeof line === 'number')
          .map(({ line }) => ({ line: line! })),
        source
      );
    }
    this._model.breakpoints.restoreBreakpoints(breakpoints);
  }

  /**
   * Restore the state of a debug session.
   *
   * @param autoStart - If true, starts the debugger if it has not been started.
   */
  async restoreState(autoStart: boolean): Promise<void> {
    if (!this.model || !this.session) {
      return;
    }

    const reply = await this.session.restoreState();
    const { body } = reply;
    const breakpoints = this._mapBreakpoints(body.breakpoints);
    const stoppedThreads = new Set(body.stoppedThreads);

    this._model.hasRichVariableRendering = body.richRendering === true;
    this._config.setHashParams({
      kernel: this.session?.connection?.kernel?.name ?? '',
      method: body.hashMethod,
      seed: body.hashSeed
    });
    this._config.setTmpFileParams({
      kernel: this.session?.connection?.kernel?.name ?? '',
      prefix: body.tmpFilePrefix,
      suffix: body.tmpFileSuffix
    });

    this._model.stoppedThreads = stoppedThreads;

    if (!this.isStarted && (autoStart || stoppedThreads.size !== 0)) {
      await this.start();
    }

    if (this.isStarted || autoStart) {
      this._model.title = this.isStarted
        ? this.session?.connection?.name || '-'
        : '-';
    }

    if (this._debuggerSources) {
      const filtered = this._filterBreakpoints(breakpoints);
      this._model.breakpoints.restoreBreakpoints(filtered);
    } else {
      this._model.breakpoints.restoreBreakpoints(breakpoints);
    }

    if (stoppedThreads.size !== 0) {
      await this._getAllFrames();
    } else if (this.isStarted) {
      this._clearModel();
      this._clearSignals();
    }
  }

  /**
   * Starts a debugger.
   * Precondition: !isStarted
   */
  start(): Promise<void> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    return this.session.start();
  }

  /**
   * Makes the current thread step in a function / method if possible.
   */
  async stepIn(): Promise<void> {
    try {
      if (!this.session) {
        throw new Error('No active debugger session');
      }
      await this.session.sendRequest('stepIn', {
        threadId: this._currentThread()
      });
    } catch (err) {
      console.error('Error:', err.message);
    }
  }

  /**
   * Makes the current thread step out a function / method if possible.
   */
  async stepOut(): Promise<void> {
    try {
      if (!this.session) {
        throw new Error('No active debugger session');
      }
      await this.session.sendRequest('stepOut', {
        threadId: this._currentThread()
      });
    } catch (err) {
      console.error('Error:', err.message);
    }
  }

  /**
   * Stops the debugger.
   * Precondition: isStarted
   */
  async stop(): Promise<void> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    await this.session.stop();
    if (this._model) {
      this._model.clear();
    }
  }

  /**
   * Update all breakpoints at once.
   *
   * @param code - The code in the cell where the breakpoints are set.
   * @param breakpoints - The list of breakpoints to set.
   * @param path - Optional path to the file where to set the breakpoints.
   */
  async updateBreakpoints(
    code: string,
    breakpoints: IDebugger.IBreakpoint[],
    path?: string
  ): Promise<void> {
    if (!this.session?.isStarted) {
      return;
    }

    if (!path) {
      path = (await this._dumpCell(code)).body.sourcePath;
    }

    const state = await this.session.restoreState();
    const localBreakpoints = breakpoints
      .filter(({ line }) => typeof line === 'number')
      .map(({ line }) => ({ line: line! }));
    const remoteBreakpoints = this._mapBreakpoints(state.body.breakpoints);

    // Set the local copy of breakpoints to reflect only editors that exist.
    if (this._debuggerSources) {
      const filtered = this._filterBreakpoints(remoteBreakpoints);
      this._model.breakpoints.restoreBreakpoints(filtered);
    } else {
      this._model.breakpoints.restoreBreakpoints(remoteBreakpoints);
    }

    // Set the kernel's breakpoints for this path.
    const reply = await this._setBreakpoints(localBreakpoints, path);
    const updatedBreakpoints = reply.body.breakpoints.filter(
      (val, _, arr) => arr.findIndex(el => el.line === val.line) > -1
    );

    // Update the local model and finish kernel configuration.
    this._model.breakpoints.setBreakpoints(path, updatedBreakpoints);
    await this.session.sendRequest('configurationDone', {});
  }

  /**
   * Clear the current model.
   */
  private _clearModel(): void {
    this._model.callstack.frames = [];
    this._model.variables.scopes = [];
  }

  /**
   * Clear the signals set on the model.
   */
  private _clearSignals(): void {
    this._model.callstack.currentFrameChanged.disconnect(
      this._onCurrentFrameChanged,
      this
    );
    this._model.variables.variableExpanded.disconnect(
      this._onVariableExpanded,
      this
    );
  }

  /**
   * Map a list of scopes to a list of variables.
   *
   * @param scopes The list of scopes.
   * @param variables The list of variables.
   */
  private _convertScopes(
    scopes: DebugProtocol.Scope[],
    variables: DebugProtocol.Variable[][]
  ): IDebugger.IScope[] {
    if (!variables || !scopes) {
      return [];
    }
    return scopes.map((scope, i) => {
      return {
        name: scope.name,
        variables: variables[i].map(variable => {
          return { ...variable };
        })
      };
    });
  }

  /**
   * Get the current thread from the model.
   */
  private _currentThread(): number {
    // TODO: ask the model for the current thread ID
    return 1;
  }

  /**
   * Dump the content of a cell.
   *
   * @param code The source code to dump.
   */
  private async _dumpCell(
    code: string
  ): Promise<IDebugger.ISession.IDumpCellResponse> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    return this.session.sendRequest('dumpCell', { code });
  }

  /**
   * Filter breakpoints and only return those associated with a known editor.
   *
   * @param breakpoints - Map of breakpoints.
   *
   */
  private _filterBreakpoints(
    breakpoints: Map<string, IDebugger.IBreakpoint[]>
  ): Map<string, IDebugger.IBreakpoint[]> {
    if (!this._debuggerSources) {
      return breakpoints;
    }
    let bpMapForRestore = new Map<string, IDebugger.IBreakpoint[]>();
    for (const collection of breakpoints) {
      const [id, list] = collection;
      list.forEach(() => {
        this._debuggerSources!.find({
          focus: false,
          kernel: this.session?.connection?.kernel?.name ?? '',
          path: this._session?.connection?.path ?? '',
          source: id
        }).forEach(() => {
          if (list.length > 0) {
            bpMapForRestore.set(id, list);
          }
        });
      });
    }
    return bpMapForRestore;
  }

  /**
   * Get all the frames from the kernel.
   */
  private async _getAllFrames(): Promise<void> {
    this._model.callstack.currentFrameChanged.connect(
      this._onCurrentFrameChanged,
      this
    );
    this._model.variables.variableExpanded.connect(
      this._onVariableExpanded,
      this
    );

    const stackFrames = await this._getFrames(this._currentThread());
    this._model.callstack.frames = stackFrames;
  }

  /**
   * Get all the frames for the given thread id.
   *
   * @param threadId The thread id.
   */
  private async _getFrames(
    threadId: number
  ): Promise<DebugProtocol.StackFrame[]> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    const reply = await this.session.sendRequest('stackTrace', {
      threadId
    });
    const stackFrames = reply.body.stackFrames;
    return stackFrames;
  }

  /**
   * Get all the scopes for the given frame.
   *
   * @param frame The frame.
   */
  private async _getScopes(
    frame: DebugProtocol.StackFrame
  ): Promise<DebugProtocol.Scope[]> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    if (!frame) {
      return [];
    }
    const reply = await this.session.sendRequest('scopes', {
      frameId: frame.id
    });
    return reply.body.scopes;
  }

  /**
   * Get the variables for a given scope.
   *
   * @param scope The scope to get variables for.
   */
  private async _getVariables(
    scope: DebugProtocol.Scope
  ): Promise<DebugProtocol.Variable[]> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    if (!scope) {
      return [];
    }
    const reply = await this.session.sendRequest('variables', {
      variablesReference: scope.variablesReference
    });
    return reply.body.variables;
  }

  /**
   * Process the list of breakpoints from the server and return as a map.
   *
   * @param breakpoints - The list of breakpoints from the kernel.
   *
   */
  private _mapBreakpoints(
    breakpoints: IDebugger.ISession.IDebugInfoBreakpoints[]
  ): Map<string, IDebugger.IBreakpoint[]> {
    if (!breakpoints.length) {
      return new Map<string, IDebugger.IBreakpoint[]>();
    }
    return breakpoints.reduce(
      (
        map: Map<string, IDebugger.IBreakpoint[]>,
        val: IDebugger.ISession.IDebugInfoBreakpoints
      ) => {
        const { breakpoints, source } = val;
        map.set(
          source,
          breakpoints.map(point => ({
            ...point,
            source: { path: source },
            verified: true
          }))
        );
        return map;
      },
      new Map<string, IDebugger.IBreakpoint[]>()
    );
  }

  /**
   * Handle a change of the current active frame.
   *
   * @param _ The callstack model
   * @param frame The frame.
   */
  private async _onCurrentFrameChanged(
    _: IDebugger.Model.ICallstack,
    frame: IDebugger.IStackFrame
  ): Promise<void> {
    if (!frame) {
      return;
    }
    const scopes = await this._getScopes(frame);
    const variables = await Promise.all(
      scopes.map(scope => this._getVariables(scope))
    );
    const variableScopes = this._convertScopes(scopes, variables);
    this._model.variables.scopes = variableScopes;
  }

  /**
   * Handle a variable expanded event and request variables from the kernel.
   *
   * @param _ The variables model.
   * @param variable The expanded variable.
   */
  private async _onVariableExpanded(
    _: VariablesModel,
    variable: DebugProtocol.Variable
  ): Promise<DebugProtocol.Variable[]> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    const reply = await this.session.sendRequest('variables', {
      variablesReference: variable.variablesReference
    });
    let newVariable = { ...variable, expanded: true };

    reply.body.variables.forEach((variable: DebugProtocol.Variable) => {
      newVariable = { [variable.name]: variable, ...newVariable };
    });
    const newScopes = this._model.variables.scopes.map(scope => {
      const findIndex = scope.variables.findIndex(
        ele => ele.variablesReference === variable.variablesReference
      );
      scope.variables[findIndex] = newVariable;
      return { ...scope };
    });

    this._model.variables.scopes = [...newScopes];
    return reply.body.variables;
  }

  /**
   * Set the breakpoints for a given file.
   *
   * @param breakpoints The list of breakpoints to set.
   * @param path The path to where to set the breakpoints.
   */
  private async _setBreakpoints(
    breakpoints: DebugProtocol.SourceBreakpoint[],
    path: string
  ): Promise<DebugProtocol.SetBreakpointsResponse> {
    if (!this.session) {
      throw new Error('No active debugger session');
    }
    return await this.session.sendRequest('setBreakpoints', {
      breakpoints: breakpoints,
      source: { path },
      sourceModified: false
    });
  }

  private _config: IDebugger.IConfig;
  private _debuggerSources: IDebugger.ISources | null;
  private _eventMessage = new Signal<IDebugger, IDebugger.ISession.Event>(this);
  private _isDisposed = false;
  private _model: IDebugger.Model.IService;
  private _session: IDebugger.ISession | null;
  private _sessionChanged = new Signal<IDebugger, IDebugger.ISession | null>(
    this
  );
  private _specsManager: KernelSpec.IManager | null;
}

/**
 * A namespace for `DebuggerService` statics.
 */
export namespace DebuggerService {
  /**
   * Instantiation options for a `DebuggerService`.
   */
  export interface IOptions {
    /**
     * The configuration instance with hash method.
     */
    config: IDebugger.IConfig;

    /**
     * The optional debugger sources instance.
     */
    debuggerSources?: IDebugger.ISources | null;

    /**
     * The optional kernel specs manager.
     */
    specsManager?: KernelSpec.IManager | null;
  }
}
