// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Kernel, KernelMessage
} from '@jupyterlab/services';

import {
  Message
} from '@phosphor/messaging';

import {
  Panel, PanelLayout
} from '@phosphor/widgets';

import {
  Widget
} from '@phosphor/widgets';

import {
  IClientSession
} from '@jupyterlab/apputils';

import {
  nbformat
} from '@jupyterlab/coreutils';

import {
  IOutputModel, RenderMime
} from '@jupyterlab/rendermime';

import {
  IOutputAreaModel
} from './model';


/**
 * The class name added to an output area widget.
 */
const OUTPUT_AREA_CLASS = 'jp-OutputArea';

/**
 * The class name added to the direction children of OutputArea
 */
const OUTPUT_AREA_ITEM_CLASS = 'jp-OutputArea-item';

/**
 * The class name added to actual outputs
 */
const OUTPUT_AREA_OUTPUT_CLASS = 'jp-OutputArea-output';

/**
 * The class name added to prompt children of OutputArea.
 */
const OUTPUT_AREA_PROMPT_CLASS = 'jp-OutputArea-prompt';

/**
 * The class name added to OutputPrompt.
 */
const OUTPUT_PROMPT_CLASS = 'jp-OutputPrompt';

/**
 * The class name added to an execution result.
 */
const EXECUTE_CLASS = 'jp-OutputArea-executeResult';

/**
 * The class name added stdin items of OutputArea
 */
const OUTPUT_AREA_STDIN_ITEM_CLASS = 'jp-OutputArea-stdin-item';

/**
 * The class name added to stdin widgets.
 */
const STDIN_CLASS = 'jp-Stdin';

/**
 * The class name added to stdin data prompt nodes.
 */
const STDIN_PROMPT_CLASS = 'jp-Stdin-prompt';

/**
 * The class name added to stdin data input nodes.
 */
const STDIN_INPUT_CLASS = 'jp-Stdin-input';

/**
 * The class name added to stdin rendered text nodes.
 */
const STDIN_RENDERED_CLASS = 'jp-Stdin-rendered';


/******************************************************************************
 * OutputArea
 ******************************************************************************/


/**
 * An output area widget.
 *
 * #### Notes
 * The widget model must be set separately and can be changed
 * at any time.  Consumers of the widget must account for a
 * `null` model, and may want to listen to the `modelChanged`
 * signal.
 */
export
class OutputArea extends Widget {
  /**
   * Construct an output area widget.
   */
  constructor(options: OutputArea.IOptions) {
    super();
    let model = this.model = options.model;
    this.addClass(OUTPUT_AREA_CLASS);
    this.rendermime = options.rendermime;
    this.contentFactory = (
      options.contentFactory || OutputArea.defaultContentFactory
    );
    this.layout = new PanelLayout();
    for (let i = 0; i < model.length; i++) {
      let output = model.get(i);
      this._insertOutput(i, output);
    }
    model.changed.connect(this.onModelChanged, this);
  }

  /**
   * The model used by the widget.
   */
  readonly model: IOutputAreaModel;

  /**
   * Te rendermime instance used by the widget.
   */
  readonly rendermime: RenderMime;

  /**
   * The content factory used by the widget.
   */
  readonly contentFactory: OutputArea.IContentFactory;

  /**
   * A read-only sequence of the widgets in the output area.
   */
  get widgets(): ReadonlyArray<Widget> {
    return (this.layout as PanelLayout).widgets;
  }

  /**
   * Execute code on a client session and handle response messages.
   */
  execute(code: string, session: IClientSession): Promise<KernelMessage.IExecuteReplyMsg> {
    // Bail if the model is disposed.
    if (this.model.isDisposed) {
      return Promise.reject('Model is disposed');
    }

    // Bail if there is no kernel.
    let kernel = session.kernel;
    if (!kernel) {
      return Promise.reject('No kernel exists on the session');
    }

    // Override the default for `stop_on_error`.
    let content: KernelMessage.IExecuteRequest = {
      code,
      stop_on_error: true
    };
    this.model.clear();

    // Make sure there were no input widgets.
    if (this.widgets.length) {
      this._clear();
    }

    return new Promise<KernelMessage.IExecuteReplyMsg>((resolve, reject) => {
      let future = kernel.requestExecute(content);
      // Handle published messages.
      future.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
        this._onIOPub(msg);
      };
      // Handle the execute reply.
      future.onReply = (msg: KernelMessage.IExecuteReplyMsg) => {
        this._onExecuteReply(msg);
        resolve(msg);
      };
      // Handle stdin.
      future.onStdin = (msg: KernelMessage.IStdinMessage) => {
        if (KernelMessage.isInputRequestMsg(msg)) {
          this._onInputRequest(msg, session);
        }
      };
    });
  }

  /**
   * Follow changes on the model state.
   */
  protected onModelChanged(sender: IOutputAreaModel, args: IOutputAreaModel.ChangedArgs): void {
    switch (args.type) {
    case 'add':
      this._insertOutput(args.newIndex, args.newValues[0]);
      break;
    case 'remove':
      // Only clear is supported by the model.
      if (this.widgets.length) {
        this._clear();
      }
      break;
    case 'set':
      this._setOutput(args.newIndex, args.newValues[0]);
      break;
    default:
      break;
    }
  }

  /**
   * Clear the widget inputs and outputs.
   */
  private _clear(): void {
    // Bail if there is no work to do.
    if (!this.widgets.length) {
      return;
    }

    // Remove all of our widgets.
    let length = this.widgets.length;
    for (let i = 0; i < length; i++) {
      let widget = this.widgets[0];
      widget.parent = null;
      widget.dispose();
    }

    // When an output area is cleared and then quickly replaced with new
    // content (as happens with @interact in widgets, for example), the
    // quickly changing height can make the page jitter.
    // We introduce a small delay in the minimum height
    // to prevent this jitter.
    let rect = this.node.getBoundingClientRect();
    this.node.style.minHeight = `${rect.height}px`;
    if (this._minHeightTimeout) {
      clearTimeout(this._minHeightTimeout);
    }
    this._minHeightTimeout = window.setTimeout(() => {
      if (this.isDisposed) {
        return;
      }
      this.node.style.minHeight = '';
    }, 50);
  }

  /**
   * Handle an iopub message.
   */
  private _onIOPub(msg: KernelMessage.IIOPubMessage): void {
    let model = this.model;
    let msgType = msg.header.msg_type;
    switch (msgType) {
    case 'execute_result':
    case 'display_data':
    case 'stream':
    case 'error':
      let output = msg.content as nbformat.IOutput;
      output.output_type = msgType as nbformat.OutputType;
      model.add(output);
      break;
    case 'clear_output':
      let wait = (msg as KernelMessage.IClearOutputMsg).content.wait;
      model.clear(wait);
      break;
    default:
      break;
    }
  }

  /**
   * Handle an execute reply message.
   */
  private _onExecuteReply(msg: KernelMessage.IExecuteReplyMsg): void {
    // API responses that contain a pager are special cased and their type
    // is overriden from 'execute_reply' to 'display_data' in order to
    // render output.
    let model = this.model;
    let content = msg.content as KernelMessage.IExecuteOkReply;
    let payload = content && content.payload;
    if (!payload || !payload.length) {
      return;
    }
    let pages = payload.filter((i: any) => (i as any).source === 'page');
    if (!pages.length) {
      return;
    }
    let page = JSON.parse(JSON.stringify(pages[0]));
    let output: nbformat.IOutput = {
      output_type: 'display_data',
      data: (page as any).data as nbformat.IMimeBundle,
      metadata: {}
    };
    model.add(output);
  }

  /**
   * Handle an input request from a kernel.
   */
  private _onInputRequest(msg: KernelMessage.IInputRequestMsg, session: IClientSession): void {
    // Add an output widget to the end.
    let factory = this.contentFactory;
    let stdinPrompt = msg.content.prompt;
    let password = msg.content.password;

    let panel = new Panel();
    panel.addClass(OUTPUT_AREA_ITEM_CLASS);
    panel.addClass(OUTPUT_AREA_STDIN_ITEM_CLASS);

    let prompt = factory.createOutputPrompt();
    prompt.addClass(OUTPUT_AREA_PROMPT_CLASS);
    panel.addWidget(prompt);

    let kernel = session.kernel;
    let input = factory.createStdin({ prompt: stdinPrompt, password, kernel });
    input.addClass(OUTPUT_AREA_OUTPUT_CLASS);
    panel.addWidget(input);

    let layout = this.layout as PanelLayout;
    layout.addWidget(panel);
  }

  /**
   * Update an output in place.
   */
  private _setOutput(index: number, model: IOutputModel): void {
    let layout = this.layout as PanelLayout;
    let widgets = this.widgets;
    // Skip any stdin widgets to find the correct index.
    for (let i = 0; i < index; i++) {
      if (widgets[i].hasClass(OUTPUT_AREA_STDIN_ITEM_CLASS)) {
        index++;
      }
    }
    layout.widgets[index].dispose();
    this._insertOutput(index, model);
  }

  /**
   * Render and insert a single output into the layout.
   */
  private _insertOutput(index: number, model: IOutputModel): void {
    let output = this._createOutputItem(model);
    output.toggleClass(EXECUTE_CLASS, model.executionCount !== null);
    let layout = this.layout as PanelLayout;
    layout.insertWidget(index, output);
  }

  /**
   * Create an output item with a prompt and actual output
   */
  private _createOutputItem(model: IOutputModel): Widget {
    let panel = new Panel();
    panel.addClass(OUTPUT_AREA_ITEM_CLASS);

    let prompt = this.contentFactory.createOutputPrompt();
    prompt.executionCount = model.executionCount;
    prompt.addClass(OUTPUT_AREA_PROMPT_CLASS);
    panel.addWidget(prompt);

    let output = this.rendermime.render(model);
    output.addClass(OUTPUT_AREA_OUTPUT_CLASS);
    panel.addWidget(output);

    return panel;
  }

  private _minHeightTimeout: number = null;
}


/**
 * A namespace for OutputArea statics.
 */
export
namespace OutputArea {
  /**
   * The options to pass to an `OutputArea`.
   */
  export
  interface IOptions {
    /**
     * The rendermime instance used by the widget.
     */
    rendermime: RenderMime;

    /**
     * The model used by the widget.
     */
    model: IOutputAreaModel;

    /**
     * The output widget content factory.
     *
     * Defaults to a shared `IContentFactory` instance.
     */
    contentFactory?: IContentFactory;
  }

  /**
   * An output widget content factory.
   */
  export
  interface IContentFactory {
    /**
     * Create an output prompt.
     *
     */
    createOutputPrompt(): IOutputPrompt;

    /**
     * Create an stdin widget.
     */
    createStdin(options: Stdin.IOptions): Widget;
  }

  /**
   * The default implementation of `IContentFactory`.
   */
  export
  class ContentFactory implements IContentFactory {
    /**
     * Create the output prompt for the widget.
     */
    createOutputPrompt(): IOutputPrompt {
      return new OutputPrompt();
    }

    /**
     * Create an stdin widget.
     */
    createStdin(options: Stdin.IOptions): IStdin {
      return new Stdin(options);
    }
  }

  /**
   * The default `ContentFactory` instance.
   */
  export
  const defaultContentFactory = new ContentFactory();
}


/******************************************************************************
 * OutputPrompt
 ******************************************************************************/


/**
 * The interface for an output prompt.
 */
export
interface IOutputPrompt extends Widget {
  /**
   * The execution count for the widget.
   */
  executionCount: nbformat.ExecutionCount;
}

/**
 * The default output prompt implementation
 */
export
class OutputPrompt extends Widget implements IOutputPrompt {
  /*
    * Create an output prompt widget.
    */
  constructor() {
    super();
    this.addClass(OUTPUT_PROMPT_CLASS);
  }

  /**
   * The execution count for the widget.
   */
  get executionCount(): nbformat.ExecutionCount {
    return this._executionCount;
  }
  set executionCount(value: nbformat.ExecutionCount) {
    this._executionCount = value;
    if (value === null) {
      this.node.textContent = '';
    } else {
        this.node.textContent = `Out[${value}]:`;
    }
  }

  private _executionCount: nbformat.ExecutionCount = null;
}


/******************************************************************************
 * Stdin
 ******************************************************************************/


/**
 * The stdin interface
 */
export
interface IStdin extends Widget {}

/**
 * The default stdin widget.
 */
export
class Stdin extends Widget implements IStdin {
  /**
   * Construct a new input widget.
   */
  constructor(options: Stdin.IOptions) {
    super({ node: Private.createInputWidgetNode() });
    this.addClass(STDIN_CLASS);
    let text = this.node.firstChild as HTMLElement;
    text.textContent = options.prompt;
    this._input = this.node.lastChild as HTMLInputElement;
    if (options.password) {
      this._input.type = 'password';
    }
    this._kernel = options.kernel;
  }

  /**
   * Handle the DOM events for the widget.
   *
   * @param event - The DOM event sent to the widget.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the dock panel's node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    let input = this._input;
    if (event.type === 'keydown') {
      if ((event as KeyboardEvent).keyCode === 13) {  // Enter
        this._kernel.sendInputReply({
          value: input.value
        });
        let rendered = document.createElement('span');
        rendered.className = STDIN_RENDERED_CLASS;
        if (input.type === 'password') {
          rendered.textContent = Array(input.value.length + 1).join('·');
        } else {
          rendered.textContent = input.value;
        }
        this.node.replaceChild(rendered, input);
      }
    }
  }

  /**
   * Handle `after-attach` messages sent to the widget.
   */
  protected onAfterAttach(msg: Message): void {
    this._input.addEventListener('keydown', this);
    this.update();
  }

  /**
   * Handle `update-request` messages sent to the widget.
   */
  protected onUpdateRequest(msg: Message): void {
    this._input.focus();
  }

  /**
   * Handle `before-detach` messages sent to the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    this._input.removeEventListener('keydown', this);
  }

  private _kernel: Kernel.IKernelConnection = null;
  private _input: HTMLInputElement = null;
}

export
namespace Stdin {
  /**
   * The options to create a stdin widget.
   */
  export
  interface IOptions {
    /**
     * The prompt text.
     */
    prompt: string;

    /**
     * Whether the input is a password.
     */
    password: boolean;

    /**
     * The kernel associated with the request.
     */
    kernel: Kernel.IKernelConnection;
  }
}


/******************************************************************************
 * Private namespace
 ******************************************************************************/


/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * Create the node for an InputWidget.
   */
  export
  function createInputWidgetNode(): HTMLElement {
    let node = document.createElement('div');
    let prompt = document.createElement('span');
    prompt.className = STDIN_PROMPT_CLASS;
    let input = document.createElement('input');
    input.className = STDIN_INPUT_CLASS;
    node.appendChild(prompt);
    node.appendChild(input);
    return node;
  }
}
