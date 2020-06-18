// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ISessionContext,
  SessionContext,
  sessionContextDialogs,
  MainAreaWidget
} from '@jupyterlab/apputils';
import { IEditorMimeTypeService } from '@jupyterlab/codeeditor';
import { PathExt, Time } from '@jupyterlab/coreutils';
import {
  IRenderMimeRegistry,
  RenderMimeRegistry
} from '@jupyterlab/rendermime';
import { ServiceManager } from '@jupyterlab/services';
import { consoleIcon } from '@jupyterlab/ui-components';

import { UUID } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { Message } from '@lumino/messaging';
import { Panel } from '@lumino/widgets';

import { CodeConsole } from './widget';

/**
 * The class name added to console panels.
 */
const PANEL_CLASS = 'jp-ConsolePanel';

/**
 * A panel which contains a console and the ability to add other children.
 */
export class ConsolePanel extends MainAreaWidget<Panel> {
  /**
   * Construct a console panel.
   */
  constructor(options: ConsolePanel.IOptions) {
    super({ content: new Panel() });
    this.addClass(PANEL_CLASS);
    let {
      rendermime,
      mimeTypeService,
      path,
      basePath,
      name,
      manager,
      modelFactory,
      sessionContext
    } = options;
    const count = Private.count++;
    if (!path) {
      path = `${basePath || ''}/console-${count}-${UUID.uuid4()}`;
    }

    sessionContext = this._sessionContext =
      sessionContext ||
      new SessionContext({
        sessionManager: manager.sessions,
        specsManager: manager.kernelspecs,
        path,
        name: name || `Console ${count}`,
        type: 'console',
        kernelPreference: options.kernelPreference,
        setBusy: options.setBusy
      });

    const resolver = new RenderMimeRegistry.UrlResolver({
      session: sessionContext,
      contents: manager.contents
    });
    rendermime = rendermime.clone({ resolver });

    this.console = new CodeConsole({
      rendermime,
      sessionContext: sessionContext,
      mimeTypeService,
      modelFactory
    });
    this.content.addWidget(this.console);

    void sessionContext.initialize().then(async value => {
      if (value) {
        await sessionContextDialogs.selectKernel(sessionContext!);
      }
      this._connected = new Date();
      this._updateTitlePanel();
    });

    this.console.executed.connect(this._onExecuted, this);
    this._updateTitlePanel();
    sessionContext.kernelChanged.connect(this._updateTitlePanel, this);
    sessionContext.propertyChanged.connect(this._updateTitlePanel, this);

    this.title.icon = consoleIcon;
    this.title.closable = true;
    this.id = `console-${count}`;
  }

  /**
   * The console widget used by the panel.
   */
  console: CodeConsole;

  /**
   * The session used by the panel.
   */
  get sessionContext(): ISessionContext {
    return this._sessionContext;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose(): void {
    this.sessionContext.dispose();
    this.console.dispose();
    super.dispose();
  }

  /**
   * Handle `'activate-request'` messages.
   */
  protected onActivateRequest(msg: Message): void {
    const prompt = this.console.promptCell;
    if (prompt) {
      prompt.editor.focus();
    }
  }

  /**
   * Handle `'close-request'` messages.
   */
  protected onCloseRequest(msg: Message): void {
    super.onCloseRequest(msg);
    this.dispose();
  }

  /**
   * Handle a console execution.
   */
  private _onExecuted(sender: CodeConsole, args: Date) {
    this._executed = args;
    this._updateTitlePanel();
  }

  /**
   * Update the console panel title.
   */
  private _updateTitlePanel(): void {
    Private.updateTitle(this, this._connected, this._executed);
  }

  private _executed: Date | null = null;
  private _connected: Date | null = null;
  private _sessionContext: ISessionContext;
}

/**
 * A namespace for ConsolePanel statics.
 */
export namespace ConsolePanel {
  /**
   * The initialization options for a console panel.
   */
  export interface IOptions {
    /**
     * The rendermime instance used by the panel.
     */
    rendermime: IRenderMimeRegistry;

    /**
     * The service manager used by the panel.
     */
    manager: ServiceManager.IManager;

    /**
     * The path of an existing console.
     */
    path?: string;

    /**
     * The base path for a new console.
     */
    basePath?: string;

    /**
     * The name of the console.
     */
    name?: string;

    /**
     * A kernel preference.
     */
    kernelPreference?: ISessionContext.IKernelPreference;

    /**
     * An existing session context to use.
     */
    sessionContext?: ISessionContext;

    /**
     * The model factory for the console widget.
     */
    modelFactory?: CodeConsole.IModelFactory;

    /**
     * The service used to look up mime types.
     */
    mimeTypeService: IEditorMimeTypeService;

    /**
     * A function to call when the kernel is busy.
     */
    setBusy?: () => IDisposable;
  }
}

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * The counter for new consoles.
   */
  export let count = 1;

  /**
   * Update the title of a console panel.
   */
  export function updateTitle(
    panel: ConsolePanel,
    connected: Date | null,
    executed: Date | null
  ) {
    const sessionContext = panel.console.sessionContext.session;
    if (sessionContext) {
      let caption =
        `Name: ${sessionContext.name}\n` +
        `Directory: ${PathExt.dirname(sessionContext.path)}\n` +
        `Kernel: ${panel.console.sessionContext.kernelDisplayName}`;
      if (connected) {
        caption += `\nConnected: ${Time.format(connected.toISOString())}`;
      }
      if (executed) {
        caption += `\nLast Execution: ${Time.format(executed.toISOString())}`;
      }
      panel.title.label = sessionContext.name;
      panel.title.caption = caption;
    } else {
      panel.title.label = 'Console';
      panel.title.caption = '';
    }
  }
}
