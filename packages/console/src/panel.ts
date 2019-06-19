// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ClientSession, IClientSession } from '@jupyterlab/apputils';

import { IEditorMimeTypeService } from '@jupyterlab/codeeditor';

import { PathExt, Time } from '@jupyterlab/coreutils';

import { UUID } from '@phosphor/coreutils';

import {
  IRenderMimeRegistry,
  RenderMimeRegistry
} from '@jupyterlab/rendermime';

import { ServiceManager } from '@jupyterlab/services';

import { Token } from '@phosphor/coreutils';

import { Message } from '@phosphor/messaging';

import { Panel } from '@phosphor/widgets';

import { CodeConsole } from './widget';
import { IDisposable } from '@phosphor/disposable';

/**
 * The class name added to console panels.
 */
const PANEL_CLASS = 'jp-ConsolePanel';

const CONSOLE_ICON_CLASS = 'jp-CodeConsoleIcon';

/**
 * A panel which contains a console and the ability to add other children.
 */
export class ConsolePanel extends Panel {
  /**
   * Construct a console panel.
   */
  constructor(options: ConsolePanel.IOptions) {
    super();
    this.addClass(PANEL_CLASS);
    let {
      rendermime,
      mimeTypeService,
      path,
      basePath,
      name,
      manager,
      modelFactory
    } = options;
    let contentFactory = (this.contentFactory =
      options.contentFactory || ConsolePanel.defaultContentFactory);
    let count = Private.count++;
    if (!path) {
      path = `${basePath || ''}/console-${count}-${UUID.uuid4()}`;
    }

    let session = (this._session = new ClientSession({
      manager: manager.sessions,
      path,
      name: name || `Console ${count}`,
      type: 'console',
      kernelPreference: options.kernelPreference,
      setBusy: options.setBusy
    }));

    let resolver = new RenderMimeRegistry.UrlResolver({
      session,
      contents: manager.contents
    });
    rendermime = rendermime.clone({ resolver });

    this.console = contentFactory.createConsole({
      rendermime,
      session,
      mimeTypeService,
      contentFactory,
      modelFactory
    });
    this.addWidget(this.console);

    void session.initialize().then(() => {
      this._connected = new Date();
      this._updateTitle();
    });

    this.console.executed.connect(this._onExecuted, this);
    this._updateTitle();
    session.kernelChanged.connect(this._updateTitle, this);
    session.propertyChanged.connect(this._updateTitle, this);

    this.title.icon = CONSOLE_ICON_CLASS;
    this.title.closable = true;
    this.id = `console-${count}`;
  }

  /**
   * The content factory used by the console panel.
   */
  readonly contentFactory: ConsolePanel.IContentFactory;

  /**
   * The console widget used by the panel.
   */
  readonly console: CodeConsole;

  /**
   * The session used by the panel.
   */
  get session(): IClientSession {
    return this._session;
  }

  setConfig(config: ConsolePanel.IConsoleConfig): void {
    this.console.node.dataset.jpInteractionMode = config.interactionMode;
    let shutdownOnClose = config.kernelShutdown;
    // Dirty fix to turn off kernel shutdown for console open on a notebook
    if (PathExt.extname(this.session.path) === '.ipynb') {
      shutdownOnClose = false;
    }
    const kernelPreference = this.session.kernelPreference;
    this.session.kernelPreference = {
      ...kernelPreference,
      shutdownOnClose
    };
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose(): void {
    this.session.dispose();
    this.console.dispose();
    super.dispose();
  }

  /**
   * Handle `'activate-request'` messages.
   */
  protected onActivateRequest(msg: Message): void {
    let prompt = this.console.promptCell;
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
    this._updateTitle();
  }

  /**
   * Update the console panel title.
   */
  private _updateTitle(): void {
    Private.updateTitle(this, this._connected, this._executed);
  }

  private _executed: Date | null = null;
  private _connected: Date | null = null;
  private _session: ClientSession;
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
     * The content factory for the panel.
     */
    contentFactory: IContentFactory;

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
    kernelPreference?: IClientSession.IKernelPreference;

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

  /**
   * A config object for the console
   */
  export interface IConsoleConfig {
    /**
     * User preferred interaction mode
     */
    interactionMode: 'notebook' | 'terminal';
    /**
     * Whether shut down the kernel when the widget is closed or not
     */
    kernelShutdown: boolean;
  }

  /**
   * The default configuration options for a console
   */
  export const defaultConfig: IConsoleConfig = {
    interactionMode: 'notebook',
    kernelShutdown: false
  };

  /**
   * The console panel renderer.
   */
  export interface IContentFactory extends CodeConsole.IContentFactory {
    /**
     * Create a new console panel.
     */
    createConsole(options: CodeConsole.IOptions): CodeConsole;
  }

  /**
   * Default implementation of `IContentFactory`.
   */
  export class ContentFactory extends CodeConsole.ContentFactory
    implements IContentFactory {
    /**
     * Create a new console panel.
     */
    createConsole(options: CodeConsole.IOptions): CodeConsole {
      return new CodeConsole(options);
    }
  }

  /**
   * A namespace for the console panel content factory.
   */
  export namespace ContentFactory {
    /**
     * Options for the code console content factory.
     */
    export interface IOptions extends CodeConsole.ContentFactory.IOptions {}
  }

  /**
   * A default code console content factory.
   */
  export const defaultContentFactory: IContentFactory = new ContentFactory();

  /* tslint:disable */
  /**
   * The console renderer token.
   */
  export const IContentFactory = new Token<IContentFactory>(
    '@jupyterlab/console:IContentFactory'
  );
  /* tslint:enable */
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
    let session = panel.console.session;
    let caption =
      `Name: ${session.name}\n` +
      `Directory: ${PathExt.dirname(session.path)}\n` +
      `Kernel: ${session.kernelDisplayName}`;
    if (connected) {
      caption += `\nConnected: ${Time.format(connected.toISOString())}`;
    }
    if (executed) {
      caption += `\nLast Execution: ${Time.format(executed.toISOString())}`;
    }
    panel.title.label = session.name || 'Console';
    panel.title.caption = caption;
  }
}
