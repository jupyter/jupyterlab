// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { codeIcon, runIcon, stopIcon } from '@jupyterlab/ui-components';

import { EditorHandler as DebuggerEditorHandler } from './handlers/editor';

import { DebuggerConfig } from './config';

import { DebuggerEvaluateDialog } from './dialogs/evaluate';

import { ReadOnlyEditorFactory as EditorFactory } from './factory';

import { DebuggerHandler } from './handler';

import {
  closeAllIcon as closeAll,
  stepIntoIcon as stepInto,
  stepOutIcon as stepOut,
  stepOverIcon as stepOver,
  variableIcon as variable,
  viewBreakpointIcon as viewBreakpoint
} from './icons';

import { DebuggerModel } from './model';

import { VariablesBodyGrid } from './panels/variables/grid';

import { DebuggerService } from './service';

import { DebuggerSession } from './session';

import { DebuggerSidebar } from './sidebar';

import { DebuggerSources } from './sources';

/**
 * A namespace for `Debugger` statics.
 */
export namespace Debugger {
  /**
   * Debugger configuration for all kernels.
   */
  export class Config extends DebuggerConfig {}

  /**
   * A handler for a CodeEditor.IEditor.
   */
  export class EditorHandler extends DebuggerEditorHandler {}

  /**
   * A handler for debugging a widget.
   */
  export class Handler extends DebuggerHandler {}

  /**
   * A model for a debugger.
   */
  export class Model extends DebuggerModel {}

  /**
   * A widget factory for read only editors.
   */
  export class ReadOnlyEditorFactory extends EditorFactory {}

  /**
   * The main IDebugger implementation.
   */
  export class Service extends DebuggerService {}

  /**
   * A concrete implementation of IDebugger.ISession.
   */
  export class Session extends DebuggerSession {}

  /**
   * The debugger sidebar UI.
   */
  export class Sidebar extends DebuggerSidebar {}

  /**
   * The source and editor manager for a debugger instance.
   */
  export class Sources extends DebuggerSources {}

  /**
   * A data grid that displays variables in a debugger session.
   */
  export class VariablesGrid extends VariablesBodyGrid {}

  /**
   * The command IDs used by the debugger plugin.
   */
  export namespace CommandIDs {
    export const debugContinue = 'debugger:continue';

    export const terminate = 'debugger:terminate';

    export const next = 'debugger:next';

    export const stepIn = 'debugger:stepIn';

    export const stepOut = 'debugger:stepOut';

    export const inspectVariable = 'debugger:inspect-variable';

    export const evaluate = 'debugger:evaluate';

    export const restartDebug = 'debugger:restart-debug';
  }

  /**
   * The debugger user interface icons.
   */
  export namespace Icons {
    export const closeAllIcon = closeAll;
    export const evaluateIcon = codeIcon;
    export const continueIcon = runIcon;
    export const stepIntoIcon = stepInto;
    export const stepOutIcon = stepOut;
    export const stepOverIcon = stepOver;
    export const terminateIcon = stopIcon;
    export const variableIcon = variable;
    export const viewBreakpointIcon = viewBreakpoint;
  }

  /**
   * The debugger dialog helpers.
   */
  export namespace Dialogs {
    /**
     * Open a code prompt in a dialog.
     */
    export const getCode = DebuggerEvaluateDialog.getCode;
  }
}
