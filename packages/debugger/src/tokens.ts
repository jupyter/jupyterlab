// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { CodeEditor, CodeEditorWrapper } from '@jupyterlab/codeeditor';

import { KernelMessage, Session } from '@jupyterlab/services';

import { ReadonlyJSONObject, Token } from '@lumino/coreutils';

import { IObservableDisposable } from '@lumino/disposable';

import { ISignal, Signal } from '@lumino/signaling';

import { Widget } from '@lumino/widgets';

import { DebugProtocol } from 'vscode-debugprotocol';

import {DebuggerHandler} from './handler'

/**
 * An interface describing an application's visual debugger.
 */
export interface IDebugger {
  /**
   * Signal emitted for debug event messages.
   */
  readonly eventMessage: ISignal<IDebugger, IDebugger.ISession.Event>;

  /**
   * Whether the current debugger is started.
   */
  readonly isStarted: boolean;

  /**
   * The debugger service's model.
   */
  readonly model: IDebugger.Model.IService;

  /**
   * The current debugger session.
   */
  session: IDebugger.ISession | null;

  /**
   * Signal emitted upon session changed.
   */
  readonly sessionChanged: ISignal<IDebugger, IDebugger.ISession | null>;

  /**
   * Removes all the breakpoints from the current notebook or console
   */
  clearBreakpoints(): Promise<void>;

  /**
   * Continues the execution of the current thread.
   */
  continue(): Promise<void>;

  /**
   * Evaluate an expression.
   */
  evaluate(
    expression: string
  ): Promise<DebugProtocol.EvaluateResponse['body'] | null>;

  /**
   * Computes an id based on the given code.
   */
  getCodeId(code: string): string;

  /**
   * Retrieve the content of a source file.
   *
   * @param source The source object containing the path to the file.
   */
  getSource(source: DebugProtocol.Source): Promise<IDebugger.Source>;

  /**
   * Whether there exist a thread in stopped state.
   */
  hasStoppedThreads(): boolean;

  /**
   * Request variables for a given variable reference.
   *
   * @param variablesReference The variable reference to request.
   */
  inspectVariable(
    variablesReference: number
  ): Promise<DebugProtocol.Variable[]>;

  /**
   * Request rich representation of a variable.
   *
   * @param variableName The variable name to request
   * @param variablesReference The variable reference to request
   * @returns The mime renderer data model
   */
  inspectRichVariable(
    variableName: string,
    variablesReference?: number
  ): Promise<IDebugger.IRichVariable>;

  /**
   * Requests all the defined variables and display them in the
   * table view.
   */
  displayDefinedVariables(): Promise<void>;

  /**
   * Request whether debugging is available for the given session connection.
   *
   * @param connection The session connection.
   */
  isAvailable(connection: Session.ISessionConnection): Promise<boolean>;

  /**
   * Makes the current thread run again for one step.
   */
  next(): Promise<void>;

  /**
   * Restart the debugger.
   * Precondition: isStarted
   */
  restart(): Promise<void>;

  /**
   * Restore the state of a debug session.
   *
   * @param autoStart - when true, starts the debugger
   * if it has not been started yet.
   */
  restoreState(autoStart: boolean): Promise<void>;

  /**
   * Starts a debugger.
   * Precondition: !isStarted
   */
  start(): Promise<void>;

  /**
   * Makes the current thread step in a function / method if possible.
   */
  stepIn(): Promise<void>;

  /**
   * Makes the current thread step out a function / method if possible.
   */
  stepOut(): Promise<void>;

  /**
   * Stops the debugger.
   * Precondition: isStarted
   */
  stop(): Promise<void>;

  /**
   * Update all breakpoints of a cell at once.
   *
   * @param code - The code in the cell where the breakpoints are set.
   * @param breakpoints - The list of breakpoints to set.
   * @param path - Optional path to the file where to set the breakpoints.
   */
  updateBreakpoints(
    code: string,
    breakpoints: IDebugger.IBreakpoint[],
    path?: string
  ): Promise<void>;
}

/**
 * A namespace for visual debugger types.
 */
export namespace IDebugger {
  /**
   * The type for a source file.
   */
  export type Source = {
    /**
     * The content of the source.
     */
    content: string;

    /**
     * The mimeType of the source.
     */
    mimeType?: string;

    /**
     * The path of the source.
     */
    path: string;
  };

  /**
   * Single breakpoint in an editor.
   */
  export interface IBreakpoint extends DebugProtocol.Breakpoint {}

  /**
   * Debugger file and hashing configuration.
   */
  export interface IConfig {
    /**
     * Returns an id based on the given code.
     *
     * @param code The source code.
     * @param kernel The kernel name from current session.
     */
    getCodeId(code: string, kernel: string): string;

    /**
     * Sets the hash parameters for a kernel.
     *
     * @param params - Hashing parameters for a kernel.
     */
    setHashParams(params: IConfig.HashParams): void;

    /**
     * Sets the parameters used for the temp files (e.g. cells) for a kernel.
     *
     * @param params - Temporary file prefix and suffix for a kernel.
     */
    setTmpFileParams(params: IConfig.FileParams): void;
  }

  /**
   * An interface for debugger handler.
   */
  export interface IHandler extends DebuggerHandler.IHandler {}

  /**
   * An interface for a scope.
   */
  export interface IScope {
    /**
     * The name of the scope.
     */
    name: string;

    /**
     * The list of variables.
     */
    variables: IVariable[];
  }

  /**
   * A visual debugger session.
   */
  export interface ISession extends IObservableDisposable {
    /**
     * The API session connection to connect to a debugger.
     */
    connection: Session.ISessionConnection | null;

    /**
     * Whether the debug session is started
     */
    readonly isStarted: boolean;

    /**
     * Signal emitted for debug event messages.
     */
    readonly eventMessage: ISignal<
      IDebugger.ISession,
      IDebugger.ISession.Event
    >;

    /**
     * Restore the state of a debug session.
     */
    restoreState(): Promise<IDebugger.ISession.Response['debugInfo']>;

    /**
     * Send a debug request to the kernel.
     */
    sendRequest<K extends keyof IDebugger.ISession.Request>(
      command: K,
      args: IDebugger.ISession.Request[K]
    ): Promise<IDebugger.ISession.Response[K]>;

    /**
     * Start a new debug session.
     */
    start(): Promise<void>;

    /**
     * Stop a running debug session.
     */
    stop(): Promise<void>;
  }

  /**
   * A utility to find text editors used by the debugger.
   */
  export interface ISources {
    /**
     * Returns an array of editors for a source matching the current debug
     * session by iterating through all the widgets in each of the supported
     * debugger types (i.e., consoles, files, notebooks).
     *
     * @param params - The editor find parameters.
     */
    find(params: ISources.FindParams): CodeEditor.IEditor[];

    /**
     * Open a read-only editor in the main area.
     *
     * @param params - The editor open parameters.
     */
    open(params: ISources.OpenParams): void;
  }

  /**
   * The type for a stack frame
   */
  export interface IStackFrame extends DebugProtocol.StackFrame {}

  /**
   * A reply to an rich inspection request.
   */
  export interface IRichVariable {
    /**
     * The MIME bundle data returned from an rich inspection request.
     */
    data: ReadonlyJSONObject;

    /**
     * Any metadata that accompanies the MIME bundle returning from a rich inspection request.
     */
    metadata: ReadonlyJSONObject;
  }

  /**
   * An interface for a variable.
   */
  export interface IVariable extends DebugProtocol.Variable {
    /**
     * Whether the variable is expanded.
     */
    expanded?: boolean;
  }

  /**
   * Debugger file and hashing configuration.
   */
  export namespace IConfig {
    /**
     * Temporary file prefix and suffix for a kernel.
     */
    export type FileParams = {
      /**
       * The kernel name.
       */
      kernel: string;

      /**
       * Prefix added to temporary files created by the kernel per cell.
       */
      prefix: string;

      /**
       * Suffix added temporary files created by the kernel per cell.
       */
      suffix: string;
    };

    /**
     * Hashing parameters for a kernel.
     */
    export type HashParams = {
      /**
       * The kernel name.
       */
      kernel: string;

      /**
       * The hashing method.
       */
      method: string;

      /**
       * An optional hashing seed provided by the kernel.
       */
      seed?: any;
    };
  }

  export namespace ISession {
    /**
     * A generic debug event.
     */
    export type Event = DebugProtocol.Event;

    /**
     * Expose all the debug requests types.
     */
    export type Request = {
      attach: DebugProtocol.AttachRequestArguments;
      completions: DebugProtocol.CompletionsArguments;
      configurationDone: DebugProtocol.ConfigurationDoneArguments;
      continue: DebugProtocol.ContinueArguments;
      debugInfo: IDebugInfoArguments;
      disconnect: DebugProtocol.DisconnectArguments;
      dumpCell: IDumpCellArguments;
      evaluate: DebugProtocol.EvaluateArguments;
      exceptionInfo: DebugProtocol.ExceptionInfoArguments;
      goto: DebugProtocol.GotoArguments;
      gotoTargets: DebugProtocol.GotoTargetsArguments;
      initialize: DebugProtocol.InitializeRequestArguments;
      inspectVariables: IInspectVariablesArguments;
      launch: DebugProtocol.LaunchRequestArguments;
      loadedSources: DebugProtocol.LoadedSourcesArguments;
      modules: DebugProtocol.ModulesArguments;
      next: DebugProtocol.NextArguments;
      pause: DebugProtocol.PauseArguments;
      restart: DebugProtocol.RestartArguments;
      restartFrame: DebugProtocol.RestartFrameArguments;
      reverseContinue: DebugProtocol.ReverseContinueArguments;
      richInspectVariables: IRichVariablesArguments;
      scopes: DebugProtocol.ScopesArguments;
      setBreakpoints: DebugProtocol.SetBreakpointsArguments;
      setExceptionBreakpoints: DebugProtocol.SetExceptionBreakpointsArguments;
      setExpression: DebugProtocol.SetExpressionArguments;
      setFunctionBreakpoints: DebugProtocol.SetFunctionBreakpointsArguments;
      setVariable: DebugProtocol.SetVariableArguments;
      source: DebugProtocol.SourceArguments;
      stackTrace: DebugProtocol.StackTraceArguments;
      stepBack: DebugProtocol.StepBackArguments;
      stepIn: DebugProtocol.StepInArguments;
      stepInTargets: DebugProtocol.StepInTargetsArguments;
      stepOut: DebugProtocol.StepOutArguments;
      terminate: DebugProtocol.TerminateArguments;
      terminateThreads: DebugProtocol.TerminateThreadsArguments;
      threads: IThreadsArguments;
      variables: DebugProtocol.VariablesArguments;
    };

    /**
     * Expose all the debug response types.
     */
    export type Response = {
      attach: DebugProtocol.AttachResponse;
      completions: DebugProtocol.CompletionsResponse;
      configurationDone: DebugProtocol.ConfigurationDoneResponse;
      continue: DebugProtocol.ContinueResponse;
      debugInfo: IDebugInfoResponse;
      disconnect: DebugProtocol.DisconnectResponse;
      dumpCell: IDumpCellResponse;
      evaluate: DebugProtocol.EvaluateResponse;
      exceptionInfo: DebugProtocol.ExceptionInfoResponse;
      goto: DebugProtocol.GotoResponse;
      gotoTargets: DebugProtocol.GotoTargetsResponse;
      initialize: DebugProtocol.InitializeResponse;
      inspectVariables: IInspectVariablesResponse;
      launch: DebugProtocol.LaunchResponse;
      loadedSources: DebugProtocol.LoadedSourcesResponse;
      modules: DebugProtocol.ModulesResponse;
      next: DebugProtocol.NextResponse;
      pause: DebugProtocol.PauseResponse;
      restart: DebugProtocol.RestartResponse;
      restartFrame: DebugProtocol.RestartFrameResponse;
      reverseContinue: DebugProtocol.ReverseContinueResponse;
      richInspectVariables: IRichVariablesResponse;
      scopes: DebugProtocol.ScopesResponse;
      setBreakpoints: DebugProtocol.SetBreakpointsResponse;
      setExceptionBreakpoints: DebugProtocol.SetExceptionBreakpointsResponse;
      setExpression: DebugProtocol.SetExpressionResponse;
      setFunctionBreakpoints: DebugProtocol.SetFunctionBreakpointsResponse;
      setVariable: DebugProtocol.SetVariableResponse;
      source: DebugProtocol.SourceResponse;
      stackTrace: DebugProtocol.StackTraceResponse;
      stepBack: DebugProtocol.StepBackResponse;
      stepIn: DebugProtocol.StepInResponse;
      stepInTargets: DebugProtocol.StepInTargetsResponse;
      stepOut: DebugProtocol.StepOutResponse;
      terminate: DebugProtocol.TerminateResponse;
      terminateThreads: DebugProtocol.TerminateThreadsResponse;
      threads: DebugProtocol.ThreadsResponse;
      variables: DebugProtocol.VariablesResponse;
    };

    /**
     * List of breakpoints in a source file.
     */
    export interface IDebugInfoBreakpoints {
      source: string;
      breakpoints: DebugProtocol.SourceBreakpoint[];
    }

    /**
     * Arguments for 'debugInfo' requests.
     */
    export interface IDebugInfoArguments {}

    /**
     * Response to 'debugInfo' request.
     * This is an addition to the Debug Adapter Protocol to be able
     * to retrieve the debugger state when restoring a session.
     */
    export interface IDebugInfoResponse extends DebugProtocol.Response {
      body: {
        breakpoints: IDebugInfoBreakpoints[];
        hashMethod: string;
        hashSeed: number;
        isStarted: boolean;
        /**
         * Whether the kernel supports variable rich rendering or not.
         */
        richRendering?: boolean;
        stoppedThreads: number[];
        tmpFilePrefix: string;
        tmpFileSuffix: string;
      };
    }

    /**
     * Arguments for 'dumpCell' request.
     * This is an addition to the Debug Adapter Protocol to support
     * setting breakpoints for cells.
     */
    export interface IDumpCellArguments {
      code: string;
    }

    /**
     * Response to 'dumpCell' request.
     * This is an addition to the Debug Adapter Protocol to support
     * setting breakpoints for cells.
     */
    export interface IDumpCellResponse extends DebugProtocol.Response {
      body: {
        sourcePath: string;
      };
    }

    /**
     * Arguments for 'inspectVariables' requests.
     */
    export interface IInspectVariablesArguments {}

    export interface IInspectVariablesResponse extends DebugProtocol.Response {
      body: {
        variables: DebugProtocol.Variable[];
      };
    }

    /**
     * Arguments for 'richVariables' request
     *
     * This is an addition to the Debug Adapter Protocol to support
     * render rich variable representation.
     */
    export interface IRichVariablesArguments {
      /**
       * Variable name
       */
      variableName: string;
      /**
       * Frame Id
       */
      frameId?: number;
    }

    /**
     * Arguments for 'richVariables' request
     *
     * This is an addition to the Debug Adapter Protocol to support
     * render rich variable representation.
     */
    export interface IRichVariablesResponse extends DebugProtocol.Response {
      /**
       * Variable mime type data
       */
      body: IRichVariable;
    }

    /**
     * Response to the 'kernel_info_request' request.
     * This interface extends the IInfoReply by adding the `debugger` key
     * that isn't part of the protocol yet.
     * See this pull request for more info: https://github.com/jupyter/jupyter_client/pull/486
     */
    export interface IInfoReply extends KernelMessage.IInfoReply {
      debugger: boolean;
    }

    /**
     * Arguments for 'threads' requests.
     */
    export interface IThreadsArguments {}
  }

  /**
   * Select variable in the variables explorer.
   */
  export interface IVariableSelection
    extends Pick<
      DebugProtocol.Variable,
      'name' | 'type' | 'variablesReference' | 'value'
    > {}

  /**
   * Debugger variables explorer interface.
   */
  export interface IVariablesPanel {
    /**
     * Select variable in the variables explorer.
     */
    latestSelection: IVariableSelection | null;
    /**
     * Variable view mode.
     */
    viewMode: 'tree' | 'table';
  }

  /**
   * Debugger sidebar interface.
   */
  export interface ISidebar extends Widget {
    /**
     * Debugger variables explorer.
     */
    variables: IVariablesPanel;

    /**
     * Add item at the end of the sidebar.
     */
    addItem(widget: Widget): void;

    /**
     * Insert item at a specified index.
     */
    insertItem(index: number, widget: Widget): void;

    /**
     * Return all items that were added to sidebar.
     */
    readonly items: readonly Widget[];
  }

  /**
   * A utility to find text editors used by the debugger.
   */
  export namespace ISources {
    /**
     * Unified parameters for the find method
     */
    export type FindParams = {
      /**
       * Extra flag to focus on the parent widget of the editor.
       */
      focus: boolean;

      /**
       * Name of current kernel.
       */
      kernel: string;

      /**
       * Path of session connection.
       */
      path: string;

      /**
       * Source path
       */
      source: string;
    };

    /**
     * Unified parameters for the open method
     */
    export type OpenParams = {
      /**
       * The caption for the read-only editor.
       */
      caption: string;

      /**
       * The code editor wrapper to add to the main area.
       */
      editorWrapper: CodeEditorWrapper;

      /**
       * The label for the read-only editor.
       */
      label: string;
    };
  }

  /**
   * A namespace for UI model definitions.
   */
  export namespace Model {
    /**
     * The breakpoints UI model.
     */
    export interface IBreakpoints {
      /**
       * Get all the breakpoints.
       */
      readonly breakpoints: Map<string, IDebugger.IBreakpoint[]>;

      /**
       * Signal emitted when the model changes.
       */
      readonly changed: ISignal<this, IDebugger.IBreakpoint[]>;

      /**
       * Signal emitted when a breakpoint is clicked.
       */
      readonly clicked: Signal<this, IDebugger.IBreakpoint>;

      /**
       * Signal emitted when the breakpoints are restored.
       */
      readonly restored: ISignal<this, void>;

      /**
       * Get the breakpoints for a given id (path).
       *
       * @param id The code id (path).
       */
      getBreakpoints(id: string): IBreakpoint[];

      /**
       * Restore a map of breakpoints.
       *
       * @param breakpoints The map of breakpoints
       */
      restoreBreakpoints(breakpoints: Map<string, IBreakpoint[]>): void;

      /**
       * Set the breakpoints for a given id (path).
       *
       * @param id The code id (path).
       * @param breakpoints The list of breakpoints.
       */
      setBreakpoints(id: string, breakpoints: IBreakpoint[]): void;
    }

    /**
     * The callstack UI model.
     */
    export interface ICallstack {
      /**
       * Signal emitted when the current frame has changed.
       */
      readonly currentFrameChanged: ISignal<this, IDebugger.IStackFrame | null>;

      /**
       * The current frame.
       */
      frame: IDebugger.IStackFrame | null;

      /**
       * The frames for the callstack.
       */
      frames: IDebugger.IStackFrame[];

      /**
       * Signal emitted when the frames have changed.
       */
      readonly framesChanged: ISignal<this, IDebugger.IStackFrame[]>;
    }

    /**
     * The data model for the debugger service.
     */
    export interface IService {
      /**
       * The breakpoints UI model.
       */
      readonly breakpoints: IBreakpoints;

      /**
       * The callstack UI model.
       */
      readonly callstack: ICallstack;

      /**
       * Whether the kernel support rich variable rendering based on mime type.
       */
      hasRichVariableRendering: boolean;

      /**
       * The variables UI model.
       */
      readonly variables: IVariables;

      /**
       * The sources UI model.
       */
      readonly sources: ISources;

      /**
       * The set of threads in stopped state.
       */
      stoppedThreads: Set<number>;

      /**
       * The current debugger title.
       */
      title: string;

      /**
       * A signal emitted when the title changes.
       */
      titleChanged: ISignal<this, string>;

      /**
       * Clear the model.
       */
      clear(): void;
    }

    /**
     * The sources UI model.
     */
    export interface ISources {
      /**
       * Signal emitted when the current frame changes.
       */
      readonly currentFrameChanged: ISignal<
        IDebugger.Model.ICallstack,
        IDebugger.IStackFrame | null
      >;

      /**
       * Return the current source.
       */
      currentSource: IDebugger.Source | null;

      /**
       * Signal emitted when the current source changes.
       */
      readonly currentSourceChanged: ISignal<
        IDebugger.Model.ISources,
        IDebugger.Source | null
      >;

      /**
       * Signal emitted when a source should be open in the main area.
       */
      readonly currentSourceOpened: ISignal<
        IDebugger.Model.ISources,
        IDebugger.Source | null
      >;

      /**
       * Open a source in the main area.
       */
      open(): void;
    }

    /**
     * The variables UI model.
     */
    export interface IVariables {
      /**
       * Signal emitted when the current variable has changed.
       */
      readonly changed: ISignal<this, void>;

      /**
       * The variable scopes.
       */
      scopes: IDebugger.IScope[];

      /**
       * Signal emitted when the current variable has been expanded.
       */
      readonly variableExpanded: ISignal<this, IDebugger.IVariable>;

      /**
       * Expand a variable.
       *
       * @param variable The variable to expand.
       */
      expandVariable(variable: IDebugger.IVariable): void;
    }
  }
}

/**
 * The visual debugger token.
 */
export const IDebugger = new Token<IDebugger>('@jupyterlab/debugger:IDebugger');

/**
 * The debugger configuration token.
 */
export const IDebuggerConfig = new Token<IDebugger.IConfig>(
  '@jupyterlab/debugger:IDebuggerConfig'
);

/**
 * The debugger sources utility token.
 */
export const IDebuggerSources = new Token<IDebugger.ISources>(
  '@jupyterlab/debugger:IDebuggerSources'
);

/**
 * The debugger configuration token.
 */
export const IDebuggerSidebar = new Token<IDebugger.ISidebar>(
  '@jupyterlab/debugger:IDebuggerSidebar'
);

/**
 * The debugger handler token.
 */
export const IDebuggerHandler = new Token<IDebugger.IHandler>(
  '@jupyterlab/debugger:IDebuggerHandler'
);
