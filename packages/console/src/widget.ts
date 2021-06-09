// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ISessionContext } from '@jupyterlab/apputils';

import {
  Cell,
  CellDragUtils,
  CellModel,
  CodeCell,
  CodeCellModel,
  ICodeCellModel,
  isCodeCellModel,
  IRawCellModel,
  RawCell,
  RawCellModel
} from '@jupyterlab/cells';

import { IEditorMimeTypeService, CodeEditor } from '@jupyterlab/codeeditor';

import * as nbformat from '@jupyterlab/nbformat';

import { IObservableList, ObservableList } from '@jupyterlab/observables';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { KernelMessage } from '@jupyterlab/services';

import { each } from '@lumino/algorithm';

import { MimeData, JSONObject } from '@lumino/coreutils';

import { Drag } from '@lumino/dragdrop';

import { Message } from '@lumino/messaging';

import { ISignal, Signal } from '@lumino/signaling';

import { Panel, PanelLayout, Widget } from '@lumino/widgets';

import { ConsoleHistory, IConsoleHistory } from './history';

/**
 * The data attribute added to a widget that has an active kernel.
 */
const KERNEL_USER = 'jpKernelUser';

/**
 * The data attribute added to a widget can run code.
 */
const CODE_RUNNER = 'jpCodeRunner';

/**
 * The class name added to console widgets.
 */
const CONSOLE_CLASS = 'jp-CodeConsole';

/**
 * The class added to console cells
 */
const CONSOLE_CELL_CLASS = 'jp-Console-cell';

/**
 * The class name added to the console banner.
 */
const BANNER_CLASS = 'jp-CodeConsole-banner';

/**
 * The class name of the active prompt cell.
 */
const PROMPT_CLASS = 'jp-CodeConsole-promptCell';

/**
 * The class name of the panel that holds cell content.
 */
const CONTENT_CLASS = 'jp-CodeConsole-content';

/**
 * The class name of the panel that holds prompts.
 */
const INPUT_CLASS = 'jp-CodeConsole-input';

/**
 * The timeout in ms for execution requests to the kernel.
 */
const EXECUTION_TIMEOUT = 250;

/**
 * The mimetype used for Jupyter cell data.
 */
const JUPYTER_CELL_MIME = 'application/vnd.jupyter.cells';

/**
 * A widget containing a Jupyter console.
 *
 * #### Notes
 * The CodeConsole class is intended to be used within a ConsolePanel
 * instance. Under most circumstances, it is not instantiated by user code.
 */
export class CodeConsole extends Widget {
  /**
   * Construct a console widget.
   */
  constructor(options: CodeConsole.IOptions) {
    super();
    this.addClass(CONSOLE_CLASS);
    this.node.dataset[KERNEL_USER] = 'true';
    this.node.dataset[CODE_RUNNER] = 'true';
    this.node.tabIndex = -1; // Allow the widget to take focus.

    // Create the panels that hold the content and input.
    const layout = (this.layout = new PanelLayout());
    this._cells = new ObservableList<Cell>();
    this._content = new Panel();
    this._input = new Panel();

    this.contentFactory =
      options.contentFactory || CodeConsole.defaultContentFactory;
    this.modelFactory = options.modelFactory || CodeConsole.defaultModelFactory;
    this.rendermime = options.rendermime;
    this.sessionContext = options.sessionContext;
    this._mimeTypeService = options.mimeTypeService;

    // Add top-level CSS classes.
    this._content.addClass(CONTENT_CLASS);
    this._input.addClass(INPUT_CLASS);

    // Insert the content and input panes into the widget.
    layout.addWidget(this._content);
    layout.addWidget(this._input);

    this._history = new ConsoleHistory({
      sessionContext: this.sessionContext
    });

    void this._onKernelChanged();

    this.sessionContext.kernelChanged.connect(this._onKernelChanged, this);
    this.sessionContext.statusChanged.connect(
      this._onKernelStatusChanged,
      this
    );
  }

  /**
   * A signal emitted when the console finished executing its prompt cell.
   */
  get executed(): ISignal<this, Date> {
    return this._executed;
  }

  /**
   * A signal emitted when a new prompt cell is created.
   */
  get promptCellCreated(): ISignal<this, CodeCell> {
    return this._promptCellCreated;
  }

  /**
   * The content factory used by the console.
   */
  readonly contentFactory: CodeConsole.IContentFactory;

  /**
   * The model factory for the console widget.
   */
  readonly modelFactory: CodeConsole.IModelFactory;

  /**
   * The rendermime instance used by the console.
   */
  readonly rendermime: IRenderMimeRegistry;

  /**
   * The client session used by the console.
   */
  readonly sessionContext: ISessionContext;

  /**
   * The list of content cells in the console.
   *
   * #### Notes
   * This list does not include the current banner or the prompt for a console.
   * It may include previous banners as raw cells.
   */
  get cells(): IObservableList<Cell> {
    return this._cells;
  }

  /*
   * The console input prompt cell.
   */
  get promptCell(): CodeCell | null {
    const inputLayout = this._input.layout as PanelLayout;
    return (inputLayout.widgets[0] as CodeCell) || null;
  }

  /**
   * Add a new cell to the content panel.
   *
   * @param cell - The code cell widget being added to the content panel.
   *
   * @param msgId - The optional execution message id for the cell.
   *
   * #### Notes
   * This method is meant for use by outside classes that want to add cells to a
   * console. It is distinct from the `inject` method in that it requires
   * rendered code cell widgets and does not execute them (though it can store
   * the execution message id).
   */
  addCell(cell: CodeCell, msgId?: string) {
    cell.addClass(CONSOLE_CELL_CLASS);
    this._content.addWidget(cell);
    this._cells.push(cell);
    if (msgId) {
      this._msgIds.set(msgId, cell);
      this._msgIdCells.set(cell, msgId);
    }
    cell.disposed.connect(this._onCellDisposed, this);
    this.update();
  }

  /**
   * Add a banner cell.
   */
  addBanner() {
    if (this._banner) {
      // An old banner just becomes a normal cell now.
      const cell = this._banner;
      this._cells.push(this._banner);
      cell.disposed.connect(this._onCellDisposed, this);
    }
    // Create the banner.
    const model = this.modelFactory.createRawCell({});
    model.value.text = '...';
    const banner = (this._banner = new RawCell({
      model,
      contentFactory: this.contentFactory,
      inputPlaceholder: false,
      outputPlaceholder: false
    })).initializeState();
    banner.addClass(BANNER_CLASS);
    banner.readOnly = true;
    this._content.addWidget(banner);
  }

  /**
   * Clear the code cells.
   */
  clear(): void {
    // Dispose all the content cells
    const cells = this._cells;
    while (cells.length > 0) {
      cells.get(0).dispose();
    }
  }

  /**
   * Create a new cell with the built-in factory.
   */
  createCodeCell(): CodeCell {
    const factory = this.contentFactory;
    const options = this._createCodeCellOptions();
    const cell = factory.createCodeCell(options);
    cell.readOnly = true;
    cell.model.mimeType = this._mimetype;
    return cell;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    // Do nothing if already disposed.
    if (this.isDisposed) {
      return;
    }
    this._cells.clear();
    this._msgIdCells = null!;
    this._msgIds = null!;
    this._history.dispose();

    super.dispose();
  }

  /**
   * Execute the current prompt.
   *
   * @param force - Whether to force execution without checking code
   * completeness.
   *
   * @param timeout - The length of time, in milliseconds, that the execution
   * should wait for the API to determine whether code being submitted is
   * incomplete before attempting submission anyway. The default value is `250`.
   */
  async execute(force = false, timeout = EXECUTION_TIMEOUT): Promise<void> {
    if (this.sessionContext.session?.kernel?.status === 'dead') {
      return;
    }

    const promptCell = this.promptCell;
    if (!promptCell) {
      throw new Error('Cannot execute without a prompt cell');
    }
    promptCell.model.trusted = true;

    if (force) {
      // Create a new prompt cell before kernel execution to allow typeahead.
      this.newPromptCell();
      await this._execute(promptCell);
      return;
    }

    // Check whether we should execute.
    const shouldExecute = await this._shouldExecute(timeout);
    if (this.isDisposed) {
      return;
    }
    if (shouldExecute) {
      // Create a new prompt cell before kernel execution to allow typeahead.
      this.newPromptCell();
      this.promptCell!.editor.focus();
      await this._execute(promptCell);
    } else {
      // add a newline if we shouldn't execute
      promptCell.editor.newIndentedLine();
    }
  }

  /**
   * Get a cell given a message id.
   *
   * @param msgId - The message id.
   */
  getCell(msgId: string): CodeCell | undefined {
    return this._msgIds.get(msgId);
  }

  /**
   * Inject arbitrary code for the console to execute immediately.
   *
   * @param code - The code contents of the cell being injected.
   *
   * @returns A promise that indicates when the injected cell's execution ends.
   */
  inject(code: string, metadata: JSONObject = {}): Promise<void> {
    const cell = this.createCodeCell();
    cell.model.value.text = code;
    for (const key of Object.keys(metadata)) {
      cell.model.metadata.set(key, metadata[key]);
    }
    this.addCell(cell);
    return this._execute(cell);
  }

  /**
   * Insert a line break in the prompt cell.
   */
  insertLinebreak(): void {
    const promptCell = this.promptCell;
    if (!promptCell) {
      return;
    }
    promptCell.editor.newIndentedLine();
  }

  /**
   * Replaces the selected text in the prompt cell.
   *
   * @param text - The text to replace the selection.
   */
  replaceSelection(text: string): void {
    const promptCell = this.promptCell;
    if (!promptCell) {
      return;
    }
    promptCell.editor.replaceSelection?.(text);
  }

  /**
   * Serialize the output.
   *
   * #### Notes
   * This only serializes the code cells and the prompt cell if it exists, and
   * skips any old banner cells.
   */
  serialize(): nbformat.ICodeCell[] {
    const cells: nbformat.ICodeCell[] = [];
    each(this._cells, cell => {
      const model = cell.model;
      if (isCodeCellModel(model)) {
        cells.push(model.toJSON());
      }
    });

    if (this.promptCell) {
      cells.push(this.promptCell.model.toJSON());
    }
    return cells;
  }

  /**
   * Handle `mousedown` events for the widget.
   */
  private _evtMouseDown(event: MouseEvent): void {
    const { button, shiftKey } = event;

    // We only handle main or secondary button actions.
    if (
      !(button === 0 || button === 2) ||
      // Shift right-click gives the browser default behavior.
      (shiftKey && button === 2)
    ) {
      return;
    }

    let target = event.target as HTMLElement;
    const cellFilter = (node: HTMLElement) =>
      node.classList.contains(CONSOLE_CELL_CLASS);
    let cellIndex = CellDragUtils.findCell(target, this._cells, cellFilter);

    if (cellIndex === -1) {
      // `event.target` sometimes gives an orphaned node in
      // Firefox 57, which can have `null` anywhere in its parent line. If we fail
      // to find a cell using `event.target`, try again using a target
      // reconstructed from the position of the click event.
      target = document.elementFromPoint(
        event.clientX,
        event.clientY
      ) as HTMLElement;
      cellIndex = CellDragUtils.findCell(target, this._cells, cellFilter);
    }

    if (cellIndex === -1) {
      return;
    }

    const cell = this._cells.get(cellIndex);

    const targetArea: CellDragUtils.ICellTargetArea = CellDragUtils.detectTargetArea(
      cell,
      event.target as HTMLElement
    );

    if (targetArea === 'prompt') {
      this._dragData = {
        pressX: event.clientX,
        pressY: event.clientY,
        index: cellIndex
      };

      this._focusedCell = cell;

      document.addEventListener('mouseup', this, true);
      document.addEventListener('mousemove', this, true);
      event.preventDefault();
    }
  }

  /**
   * Handle `mousemove` event of widget
   */
  private _evtMouseMove(event: MouseEvent) {
    const data = this._dragData;
    if (
      data &&
      CellDragUtils.shouldStartDrag(
        data.pressX,
        data.pressY,
        event.clientX,
        event.clientY
      )
    ) {
      void this._startDrag(data.index, event.clientX, event.clientY);
    }
  }

  /**
   * Start a drag event
   */
  private _startDrag(
    index: number,
    clientX: number,
    clientY: number
  ): Promise<void> {
    const cellModel = this._focusedCell!.model as ICodeCellModel;
    const selected: nbformat.ICell[] = [cellModel.toJSON()];

    const dragImage = CellDragUtils.createCellDragImage(
      this._focusedCell!,
      selected
    );

    this._drag = new Drag({
      mimeData: new MimeData(),
      dragImage,
      proposedAction: 'copy',
      supportedActions: 'copy',
      source: this
    });

    this._drag.mimeData.setData(JUPYTER_CELL_MIME, selected);
    const textContent = cellModel.value.text;
    this._drag.mimeData.setData('text/plain', textContent);

    this._focusedCell = null;

    document.removeEventListener('mousemove', this, true);
    document.removeEventListener('mouseup', this, true);
    return this._drag.start(clientX, clientY).then(() => {
      if (this.isDisposed) {
        return;
      }
      this._drag = null;
      this._dragData = null;
    });
  }

  /**
   * Handle the DOM events for the widget.
   *
   * @param event -The DOM event sent to the widget.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the notebook panel's node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    switch (event.type) {
      case 'keydown':
        this._evtKeyDown(event as KeyboardEvent);
        break;
      case 'mousedown':
        this._evtMouseDown(event as MouseEvent);
        break;
      case 'mousemove':
        this._evtMouseMove(event as MouseEvent);
        break;
      case 'mouseup':
        this._evtMouseUp(event as MouseEvent);
        break;
      default:
        break;
    }
  }

  /**
   * Handle `after_attach` messages for the widget.
   */
  protected onAfterAttach(msg: Message): void {
    const node = this.node;
    node.addEventListener('keydown', this, true);
    node.addEventListener('click', this);
    node.addEventListener('mousedown', this);
    // Create a prompt if necessary.
    if (!this.promptCell) {
      this.newPromptCell();
    } else {
      this.promptCell.editor.focus();
      this.update();
    }
  }

  /**
   * Handle `before-detach` messages for the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    const node = this.node;
    node.removeEventListener('keydown', this, true);
    node.removeEventListener('click', this);
  }

  /**
   * Handle `'activate-request'` messages.
   */
  protected onActivateRequest(msg: Message): void {
    const editor = this.promptCell && this.promptCell.editor;
    if (editor) {
      editor.focus();
    }
    this.update();
  }

  /**
   * Make a new prompt cell.
   */
  protected newPromptCell(): void {
    let promptCell = this.promptCell;
    const input = this._input;

    // Make the last prompt read-only, clear its signals, and move to content.
    if (promptCell) {
      promptCell.readOnly = true;
      promptCell.removeClass(PROMPT_CLASS);
      Signal.clearData(promptCell.editor);
      const child = input.widgets[0];
      child.parent = null;
      this.addCell(promptCell);
    }

    // Create the new prompt cell.
    const factory = this.contentFactory;
    const options = this._createCodeCellOptions();
    promptCell = factory.createCodeCell(options);
    promptCell.model.mimeType = this._mimetype;
    promptCell.addClass(PROMPT_CLASS);

    // Add the prompt cell to the DOM, making `this.promptCell` valid again.
    this._input.addWidget(promptCell);

    // Suppress the default "Enter" key handling.
    const editor = promptCell.editor;
    editor.addKeydownHandler(this._onEditorKeydown);

    this._history.editor = editor;
    this._promptCellCreated.emit(promptCell);
  }

  /**
   * Handle `update-request` messages.
   */
  protected onUpdateRequest(msg: Message): void {
    Private.scrollToBottom(this._content.node);
  }

  /**
   * Handle the `'keydown'` event for the widget.
   */
  private _evtKeyDown(event: KeyboardEvent): void {
    const editor = this.promptCell && this.promptCell.editor;
    if (!editor) {
      return;
    }
    if (event.keyCode === 13 && !editor.hasFocus()) {
      event.preventDefault();
      editor.focus();
    } else if (event.keyCode === 27 && editor.hasFocus()) {
      // Set to command mode
      event.preventDefault();
      event.stopPropagation();
      this.node.focus();
    }
  }

  /**
   * Handle the `'mouseup'` event for the widget.
   */
  private _evtMouseUp(event: MouseEvent): void {
    if (
      this.promptCell &&
      this.promptCell.node.contains(event.target as HTMLElement)
    ) {
      this.promptCell.editor.focus();
    }
  }

  /**
   * Execute the code in the current prompt cell.
   */
  private _execute(cell: CodeCell): Promise<void> {
    const source = cell.model.value.text;
    this._history.push(source);
    // If the source of the console is just "clear", clear the console as we
    // do in IPython or QtConsole.
    if (source === 'clear' || source === '%clear') {
      this.clear();
      return Promise.resolve(void 0);
    }
    cell.model.contentChanged.connect(this.update, this);
    const onSuccess = (value: KernelMessage.IExecuteReplyMsg) => {
      if (this.isDisposed) {
        return;
      }
      if (value && value.content.status === 'ok') {
        const content = value.content;
        // Use deprecated payloads for backwards compatibility.
        if (content.payload && content.payload.length) {
          const setNextInput = content.payload.filter(i => {
            return (i as any).source === 'set_next_input';
          })[0];
          if (setNextInput) {
            const text = (setNextInput as any).text;
            // Ignore the `replace` value and always set the next cell.
            cell.model.value.text = text;
          }
        }
      } else if (value && value.content.status === 'error') {
        each(this._cells, (cell: CodeCell) => {
          if (cell.model.executionCount === null) {
            cell.setPrompt('');
          }
        });
      }
      cell.model.contentChanged.disconnect(this.update, this);
      this.update();
      this._executed.emit(new Date());
    };
    const onFailure = () => {
      if (this.isDisposed) {
        return;
      }
      cell.model.contentChanged.disconnect(this.update, this);
      this.update();
    };
    return CodeCell.execute(cell, this.sessionContext).then(
      onSuccess,
      onFailure
    );
  }

  /**
   * Update the console based on the kernel info.
   */
  private _handleInfo(info: KernelMessage.IInfoReplyMsg['content']): void {
    if (info.status !== 'ok') {
      this._banner!.model.value.text = 'Error in getting kernel banner';
      return;
    }
    this._banner!.model.value.text = info.banner;
    const lang = info.language_info as nbformat.ILanguageInfoMetadata;
    this._mimetype = this._mimeTypeService.getMimeTypeByLanguage(lang);
    if (this.promptCell) {
      this.promptCell.model.mimeType = this._mimetype;
    }
  }

  /**
   * Create the options used to initialize a code cell widget.
   */
  private _createCodeCellOptions(): CodeCell.IOptions {
    const contentFactory = this.contentFactory;
    const modelFactory = this.modelFactory;
    const model = modelFactory.createCodeCell({});
    const rendermime = this.rendermime;
    return {
      model,
      rendermime,
      contentFactory,
      inputPlaceholder: false,
      outputPlaceholder: false
    };
  }

  /**
   * Handle cell disposed signals.
   */
  private _onCellDisposed(sender: Cell, args: void): void {
    if (!this.isDisposed) {
      this._cells.removeValue(sender);
      const msgId = this._msgIdCells.get(sender as CodeCell);
      if (msgId) {
        this._msgIdCells.delete(sender as CodeCell);
        this._msgIds.delete(msgId);
      }
    }
  }

  /**
   * Test whether we should execute the prompt cell.
   */
  private _shouldExecute(timeout: number): Promise<boolean> {
    const promptCell = this.promptCell;
    if (!promptCell) {
      return Promise.resolve(false);
    }
    const model = promptCell.model;
    const code = model.value.text;
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve(true);
      }, timeout);
      const kernel = this.sessionContext.session?.kernel;
      if (!kernel) {
        resolve(false);
        return;
      }
      kernel
        .requestIsComplete({ code })
        .then(isComplete => {
          clearTimeout(timer);
          if (this.isDisposed) {
            resolve(false);
          }
          if (isComplete.content.status !== 'incomplete') {
            resolve(true);
            return;
          }
          resolve(false);
        })
        .catch(() => {
          resolve(true);
        });
    });
  }

  /**
   * Handle a keydown event on an editor.
   */
  private _onEditorKeydown(editor: CodeEditor.IEditor, event: KeyboardEvent) {
    // Suppress "Enter" events.
    return event.keyCode === 13;
  }

  /**
   * Handle a change to the kernel.
   */
  private async _onKernelChanged(): Promise<void> {
    this.clear();
    if (this._banner) {
      this._banner.dispose();
      this._banner = null;
    }
    this.addBanner();
    if (this.sessionContext.session?.kernel) {
      this._handleInfo(await this.sessionContext.session.kernel.info);
    }
  }

  /**
   * Handle a change to the kernel status.
   */
  private async _onKernelStatusChanged(): Promise<void> {
    const kernel = this.sessionContext.session?.kernel;
    if (kernel?.status === 'restarting') {
      this.addBanner();
      this._handleInfo(await kernel?.info);
    }
  }

  private _banner: RawCell | null = null;
  private _cells: IObservableList<Cell>;
  private _content: Panel;
  private _executed = new Signal<this, Date>(this);
  private _history: IConsoleHistory;
  private _input: Panel;
  private _mimetype = 'text/x-ipython';
  private _mimeTypeService: IEditorMimeTypeService;
  private _msgIds = new Map<string, CodeCell>();
  private _msgIdCells = new Map<CodeCell, string>();
  private _promptCellCreated = new Signal<this, CodeCell>(this);
  private _dragData: {
    pressX: number;
    pressY: number;
    index: number;
  } | null = null;
  private _drag: Drag | null = null;
  private _focusedCell: Cell | null = null;
}

/**
 * A namespace for CodeConsole statics.
 */
export namespace CodeConsole {
  /**
   * The initialization options for a console widget.
   */
  export interface IOptions {
    /**
     * The content factory for the console widget.
     */
    contentFactory: IContentFactory;

    /**
     * The model factory for the console widget.
     */
    modelFactory?: IModelFactory;

    /**
     * The mime renderer for the console widget.
     */
    rendermime: IRenderMimeRegistry;

    /**
     * The client session for the console widget.
     */
    sessionContext: ISessionContext;

    /**
     * The service used to look up mime types.
     */
    mimeTypeService: IEditorMimeTypeService;
  }

  /**
   * A content factory for console children.
   */
  export interface IContentFactory extends Cell.IContentFactory {
    /**
     * Create a new code cell widget.
     */
    createCodeCell(options: CodeCell.IOptions): CodeCell;

    /**
     * Create a new raw cell widget.
     */
    createRawCell(options: RawCell.IOptions): RawCell;
  }

  /**
   * Default implementation of `IContentFactory`.
   */
  export class ContentFactory extends Cell.ContentFactory
    implements IContentFactory {
    /**
     * Create a new code cell widget.
     *
     * #### Notes
     * If no cell content factory is passed in with the options, the one on the
     * notebook content factory is used.
     */
    createCodeCell(options: CodeCell.IOptions): CodeCell {
      if (!options.contentFactory) {
        options.contentFactory = this;
      }
      return new CodeCell(options).initializeState();
    }

    /**
     * Create a new raw cell widget.
     *
     * #### Notes
     * If no cell content factory is passed in with the options, the one on the
     * notebook content factory is used.
     */
    createRawCell(options: RawCell.IOptions): RawCell {
      if (!options.contentFactory) {
        options.contentFactory = this;
      }
      return new RawCell(options).initializeState();
    }
  }

  /**
   * A namespace for the code console content factory.
   */
  export namespace ContentFactory {
    /**
     * An initialize options for `ContentFactory`.
     */
    export interface IOptions extends Cell.IContentFactory {}
  }

  /**
   * A default content factory for the code console.
   */
  export const defaultContentFactory: IContentFactory = new ContentFactory();

  /**
   * A model factory for a console widget.
   */
  export interface IModelFactory {
    /**
     * The factory for code cell content.
     */
    readonly codeCellContentFactory: CodeCellModel.IContentFactory;

    /**
     * Create a new code cell.
     *
     * @param options - The options used to create the cell.
     *
     * @returns A new code cell. If a source cell is provided, the
     *   new cell will be initialized with the data from the source.
     */
    createCodeCell(options: CodeCellModel.IOptions): ICodeCellModel;

    /**
     * Create a new raw cell.
     *
     * @param options - The options used to create the cell.
     *
     * @returns A new raw cell. If a source cell is provided, the
     *   new cell will be initialized with the data from the source.
     */
    createRawCell(options: CellModel.IOptions): IRawCellModel;
  }

  /**
   * The default implementation of an `IModelFactory`.
   */
  export class ModelFactory {
    /**
     * Create a new cell model factory.
     */
    constructor(options: IModelFactoryOptions = {}) {
      this.codeCellContentFactory =
        options.codeCellContentFactory || CodeCellModel.defaultContentFactory;
    }

    /**
     * The factory for output area models.
     */
    readonly codeCellContentFactory: CodeCellModel.IContentFactory;

    /**
     * Create a new code cell.
     *
     * @param source - The data to use for the original source data.
     *
     * @returns A new code cell. If a source cell is provided, the
     *   new cell will be initialized with the data from the source.
     *   If the contentFactory is not provided, the instance
     *   `codeCellContentFactory` will be used.
     */
    createCodeCell(options: CodeCellModel.IOptions): ICodeCellModel {
      if (!options.contentFactory) {
        options.contentFactory = this.codeCellContentFactory;
      }
      return new CodeCellModel(options);
    }

    /**
     * Create a new raw cell.
     *
     * @param source - The data to use for the original source data.
     *
     * @returns A new raw cell. If a source cell is provided, the
     *   new cell will be initialized with the data from the source.
     */
    createRawCell(options: CellModel.IOptions): IRawCellModel {
      return new RawCellModel(options);
    }
  }

  /**
   * The options used to initialize a `ModelFactory`.
   */
  export interface IModelFactoryOptions {
    /**
     * The factory for output area models.
     */
    codeCellContentFactory?: CodeCellModel.IContentFactory;
  }

  /**
   * The default `ModelFactory` instance.
   */
  export const defaultModelFactory = new ModelFactory({});
}

/**
 * A namespace for console widget private data.
 */
namespace Private {
  /**
   * Jump to the bottom of a node.
   *
   * @param node - The scrollable element.
   */
  export function scrollToBottom(node: HTMLElement): void {
    node.scrollTop = node.scrollHeight - node.clientHeight;
  }
}
