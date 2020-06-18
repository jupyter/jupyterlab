/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { AttachmentsResolver } from '@jupyterlab/attachments';

import { ISessionContext } from '@jupyterlab/apputils';

import { IChangedArgs, ActivityMonitor, URLExt } from '@jupyterlab/coreutils';

import { CodeEditor, CodeEditorWrapper } from '@jupyterlab/codeeditor';

import { DirListing } from '@jupyterlab/filebrowser';

import * as nbformat from '@jupyterlab/nbformat';

import { IObservableMap, IObservableJSON } from '@jupyterlab/observables';

import { OutputArea, SimplifiedOutputArea } from '@jupyterlab/outputarea';

import {
  IRenderMime,
  MimeModel,
  IRenderMimeRegistry,
  imageRendererFactory
} from '@jupyterlab/rendermime';

import { KernelMessage, Kernel } from '@jupyterlab/services';

import {
  JSONValue,
  PromiseDelegate,
  JSONObject,
  UUID,
  PartialJSONValue
} from '@lumino/coreutils';

import { some, filter, toArray } from '@lumino/algorithm';

import { IDragEvent } from '@lumino/dragdrop';

import { Message } from '@lumino/messaging';

import { PanelLayout, Panel, Widget } from '@lumino/widgets';

import { InputCollapser, OutputCollapser } from './collapser';

import { CellHeader, CellFooter } from './headerfooter';

import { InputArea } from './inputarea';

import {
  IAttachmentsCellModel,
  ICellModel,
  ICodeCellModel,
  IMarkdownCellModel,
  IRawCellModel
} from './model';

import { InputPlaceholder, OutputPlaceholder } from './placeholder';

/**
 * The CSS class added to cell widgets.
 */
const CELL_CLASS = 'jp-Cell';

/**
 * The CSS class added to the cell header.
 */
const CELL_HEADER_CLASS = 'jp-Cell-header';

/**
 * The CSS class added to the cell footer.
 */
const CELL_FOOTER_CLASS = 'jp-Cell-footer';

/**
 * The CSS class added to the cell input wrapper.
 */
const CELL_INPUT_WRAPPER_CLASS = 'jp-Cell-inputWrapper';

/**
 * The CSS class added to the cell output wrapper.
 */
const CELL_OUTPUT_WRAPPER_CLASS = 'jp-Cell-outputWrapper';

/**
 * The CSS class added to the cell input area.
 */
const CELL_INPUT_AREA_CLASS = 'jp-Cell-inputArea';

/**
 * The CSS class added to the cell output area.
 */
const CELL_OUTPUT_AREA_CLASS = 'jp-Cell-outputArea';

/**
 * The CSS class added to the cell input collapser.
 */
const CELL_INPUT_COLLAPSER_CLASS = 'jp-Cell-inputCollapser';

/**
 * The CSS class added to the cell output collapser.
 */
const CELL_OUTPUT_COLLAPSER_CLASS = 'jp-Cell-outputCollapser';

/**
 * The class name added to the cell when readonly.
 */
const READONLY_CLASS = 'jp-mod-readOnly';

/**
 * The class name added to code cells.
 */
const CODE_CELL_CLASS = 'jp-CodeCell';

/**
 * The class name added to markdown cells.
 */
const MARKDOWN_CELL_CLASS = 'jp-MarkdownCell';

/**
 * The class name added to rendered markdown output widgets.
 */
const MARKDOWN_OUTPUT_CLASS = 'jp-MarkdownOutput';

/**
 * The class name added to raw cells.
 */
const RAW_CELL_CLASS = 'jp-RawCell';

/**
 * The class name added to a rendered input area.
 */
const RENDERED_CLASS = 'jp-mod-rendered';

const NO_OUTPUTS_CLASS = 'jp-mod-noOutputs';

/**
 * The text applied to an empty markdown cell.
 */
const DEFAULT_MARKDOWN_TEXT = 'Type Markdown and LaTeX: $ α^2 $';

/**
 * The timeout to wait for change activity to have ceased before rendering.
 */
const RENDER_TIMEOUT = 1000;

/**
 * The mime type for a rich contents drag object.
 */
const CONTENTS_MIME_RICH = 'application/x-jupyter-icontentsrich';

/** ****************************************************************************
 * Cell
 ******************************************************************************/

/**
 * A base cell widget.
 */
export class Cell extends Widget {
  /**
   * Construct a new base cell widget.
   */
  constructor(options: Cell.IOptions) {
    super();
    this.addClass(CELL_CLASS);
    const model = (this._model = options.model);
    this.layout = new PanelLayout();

    // Header
    const header = new CellHeader();
    header.addClass(CELL_HEADER_CLASS);
    (this.layout as PanelLayout).addWidget(header);

    // Input
    this._editorFactory =
      options.editorFactory || InputArea.defaultEditorFactory;
    const inputWrapper = (this._inputWrapper = new Panel());
    inputWrapper.addClass(CELL_INPUT_WRAPPER_CLASS);
    const inputCollapser = new InputCollapser();
    inputCollapser.addClass(CELL_INPUT_COLLAPSER_CLASS);
    const input = (this._input = new InputArea({
      model,
      editorFactory: this.editorFactory,
      updateOnShow: options.updateEditorOnShow
    }));
    input.addClass(CELL_INPUT_AREA_CLASS);
    inputWrapper.addWidget(inputCollapser);
    inputWrapper.addWidget(input);
    (this.layout as PanelLayout).addWidget(inputWrapper);

    this._inputPlaceholder = new InputPlaceholder(() => {
      this.inputHidden = !this.inputHidden;
    });

    // Footer
    const footer = new CellFooter();
    footer.addClass(CELL_FOOTER_CLASS);
    (this.layout as PanelLayout).addWidget(footer);

    // Editor settings
    if (options.editorConfig) {
      Object.keys(options.editorConfig).forEach(
        (key: keyof CodeEditor.IConfig) => {
          this.editor.setOption(key, options.editorConfig?.[key] ?? null);
        }
      );
    }

    model.metadata.changed.connect(this.onMetadataChanged, this);
  }

  /**
   * Initialize view state from model.
   *
   * #### Notes
   * Should be called after construction. For convenience, returns this, so it
   * can be chained in the construction, like `new Foo().initializeState();`
   */
  initializeState(): this {
    this.loadCollapseState();
    this.loadEditableState();
    return this;
  }

  /**
   * Get the prompt node used by the cell.
   */
  get promptNode(): HTMLElement {
    if (!this._inputHidden) {
      return this._input.promptNode;
    } else {
      return (this._inputPlaceholder!.node as HTMLElement)
        .firstElementChild as HTMLElement;
    }
  }

  /**
   * The readonly editor factory that create code editors
   */
  get editorFactory(): CodeEditor.Factory {
    return this._editorFactory;
  }

  /**
   * Get the CodeEditorWrapper used by the cell.
   */
  get editorWidget(): CodeEditorWrapper {
    return this._input.editorWidget;
  }

  /**
   * Get the CodeEditor used by the cell.
   */
  get editor(): CodeEditor.IEditor {
    return this._input.editor;
  }

  /**
   * Get the model used by the cell.
   */
  get model(): ICellModel {
    return this._model;
  }

  /**
   * Get the input area for the cell.
   */
  get inputArea(): InputArea {
    return this._input;
  }

  /**
   * The read only state of the cell.
   */
  get readOnly(): boolean {
    return this._readOnly;
  }
  set readOnly(value: boolean) {
    if (value === this._readOnly) {
      return;
    }
    this._readOnly = value;
    if (this.syncEditable) {
      this.saveEditableState();
    }
    this.update();
  }

  /**
   * Save view editable state to model
   */
  saveEditableState() {
    const { metadata } = this.model;
    const current = metadata.get('editable');

    if (
      (this.readOnly && current === false) ||
      (!this.readOnly && current === undefined)
    ) {
      return;
    }

    if (this.readOnly) {
      this.model.metadata.set('editable', false);
    } else {
      this.model.metadata.delete('editable');
    }
  }

  /**
   * Load view editable state from model.
   */
  loadEditableState() {
    this.readOnly = this.model.metadata.get('editable') === false;
  }

  /**
   * A promise that resolves when the widget renders for the first time.
   */
  get ready(): Promise<void> {
    return Promise.resolve(undefined);
  }

  /**
   * Set the prompt for the widget.
   */
  setPrompt(value: string): void {
    this._input.setPrompt(value);
  }

  /**
   * The view state of input being hidden.
   */
  get inputHidden(): boolean {
    return this._inputHidden;
  }
  set inputHidden(value: boolean) {
    if (this._inputHidden === value) {
      return;
    }
    const layout = this._inputWrapper.layout as PanelLayout;
    if (value) {
      this._input.parent = null;
      layout.addWidget(this._inputPlaceholder);
    } else {
      this._inputPlaceholder.parent = null;
      layout.addWidget(this._input);
    }
    this._inputHidden = value;
    if (this.syncCollapse) {
      this.saveCollapseState();
    }
    this.handleInputHidden(value);
  }

  /**
   * Save view collapse state to model
   */
  saveCollapseState() {
    const jupyter = { ...(this.model.metadata.get('jupyter') as any) };

    if (
      (this.inputHidden && jupyter.source_hidden === true) ||
      (!this.inputHidden && jupyter.source_hidden === undefined)
    ) {
      return;
    }

    if (this.inputHidden) {
      jupyter.source_hidden = true;
    } else {
      delete jupyter.source_hidden;
    }
    if (Object.keys(jupyter).length === 0) {
      this.model.metadata.delete('jupyter');
    } else {
      this.model.metadata.set('jupyter', jupyter);
    }
  }

  /**
   * Revert view collapse state from model.
   */
  loadCollapseState() {
    const jupyter = (this.model.metadata.get('jupyter') as any) || {};
    this.inputHidden = !!jupyter.source_hidden;
  }

  /**
   * Handle the input being hidden.
   *
   * #### Notes
   * This is called by the `inputHidden` setter so that subclasses
   * can perform actions upon the input being hidden without accessing
   * private state.
   */
  protected handleInputHidden(value: boolean): void {
    return;
  }

  /**
   * Whether to sync the collapse state to the cell model.
   */
  get syncCollapse(): boolean {
    return this._syncCollapse;
  }
  set syncCollapse(value: boolean) {
    if (this._syncCollapse === value) {
      return;
    }
    this._syncCollapse = value;
    if (value) {
      this.loadCollapseState();
    }
  }

  /**
   * Whether to sync the editable state to the cell model.
   */
  get syncEditable(): boolean {
    return this._syncEditable;
  }
  set syncEditable(value: boolean) {
    if (this._syncEditable === value) {
      return;
    }
    this._syncEditable = value;
    if (value) {
      this.loadEditableState();
    }
  }

  /**
   * Clone the cell, using the same model.
   */
  clone(): Cell {
    const constructor = this.constructor as typeof Cell;
    return new constructor({
      model: this.model,
      editorFactory: this.editorFactory
    });
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    // Do nothing if already disposed.
    if (this.isDisposed) {
      return;
    }
    this._input = null!;
    this._model = null!;
    this._inputWrapper = null!;
    this._inputPlaceholder = null!;
    super.dispose();
  }

  /**
   * Handle `after-attach` messages.
   */
  protected onAfterAttach(msg: Message): void {
    this.update();
  }

  /**
   * Handle `'activate-request'` messages.
   */
  protected onActivateRequest(msg: Message): void {
    this.editor.focus();
  }

  /**
   * Handle `fit-request` messages.
   */
  protected onFitRequest(msg: Message): void {
    // need this for for when a theme changes font size
    this.editor.refresh();
  }

  /**
   * Handle `update-request` messages.
   */
  protected onUpdateRequest(msg: Message): void {
    if (!this._model) {
      return;
    }
    // Handle read only state.
    if (this.editor.getOption('readOnly') !== this._readOnly) {
      this.editor.setOption('readOnly', this._readOnly);
      this.toggleClass(READONLY_CLASS, this._readOnly);
    }
  }

  /**
   * Handle changes in the metadata.
   */
  protected onMetadataChanged(
    model: IObservableJSON,
    args: IObservableMap.IChangedArgs<PartialJSONValue | undefined>
  ): void {
    switch (args.key) {
      case 'jupyter':
        if (this.syncCollapse) {
          this.loadCollapseState();
        }
        break;
      case 'editable':
        if (this.syncEditable) {
          this.loadEditableState();
        }
        break;
      default:
        break;
    }
  }

  private _readOnly = false;
  private _model: ICellModel;
  private _inputHidden = false;
  private _input: InputArea;
  private _inputWrapper: Widget;
  private _inputPlaceholder: InputPlaceholder;
  private _syncCollapse = false;
  private _syncEditable = false;
  private _editorFactory: CodeEditor.Factory;
}

/**
 * The namespace for the `Cell` class statics.
 */
export namespace Cell {
  /**
   * An options object for initializing a cell widget.
   */
  export interface IOptions {
    /**
     * The model used by the cell.
     */
    model: ICellModel;

    editorFactory?: CodeEditor.Factory;

    /**
     * The configuration options for the text editor widget.
     */
    editorConfig?: Partial<CodeEditor.IConfig>;

    /**
     * Whether to send an update request to the editor when it is shown.
     */
    updateEditorOnShow?: boolean;
  }
}

/** ****************************************************************************
 * CodeCell
 ******************************************************************************/

/**
 * A widget for a code cell.
 */
export class CodeCell extends Cell {
  /**
   * Construct a code cell widget.
   */
  constructor(options: CodeCell.IOptions) {
    super(options);
    this.addClass(CODE_CELL_CLASS);

    // Only save options not handled by parent constructor.
    const rendermime = (this._rendermime = options.rendermime);
    const model = this.model;

    // Insert the output before the cell footer.
    const outputWrapper = (this._outputWrapper = new Panel());
    outputWrapper.addClass(CELL_OUTPUT_WRAPPER_CLASS);
    const outputCollapser = new OutputCollapser();
    outputCollapser.addClass(CELL_OUTPUT_COLLAPSER_CLASS);
    const output = (this._output = new OutputArea({
      model: model.outputs,
      rendermime
    }));
    output.addClass(CELL_OUTPUT_AREA_CLASS);
    // Set a CSS if there are no outputs, and connect a signal for future
    // changes to the number of outputs. This is for conditional styling
    // if there are no outputs.
    if (model.outputs.length === 0) {
      this.addClass(NO_OUTPUTS_CLASS);
    }
    output.outputLengthChanged.connect(this._outputLengthHandler, this);
    outputWrapper.addWidget(outputCollapser);
    outputWrapper.addWidget(output);
    (this.layout as PanelLayout).insertWidget(2, outputWrapper);

    this._outputPlaceholder = new OutputPlaceholder(() => {
      this.outputHidden = !this.outputHidden;
    });
    model.stateChanged.connect(this.onStateChanged, this);
  }

  /**
   * The model used by the widget.
   */
  readonly model: ICodeCellModel;

  /**
   * Initialize view state from model.
   *
   * #### Notes
   * Should be called after construction. For convenience, returns this, so it
   * can be chained in the construction, like `new Foo().initializeState();`
   */
  initializeState(): this {
    super.initializeState();
    this.loadScrolledState();

    this.setPrompt(`${this.model.executionCount || ''}`);
    return this;
  }

  /**
   * Get the output area for the cell.
   */
  get outputArea(): OutputArea {
    return this._output;
  }

  /**
   * The view state of output being collapsed.
   */
  get outputHidden(): boolean {
    return this._outputHidden;
  }
  set outputHidden(value: boolean) {
    if (this._outputHidden === value) {
      return;
    }
    const layout = this._outputWrapper.layout as PanelLayout;
    if (value) {
      layout.removeWidget(this._output);
      layout.addWidget(this._outputPlaceholder);
      if (this.inputHidden && !this._outputWrapper.isHidden) {
        this._outputWrapper.hide();
      }
    } else {
      if (this._outputWrapper.isHidden) {
        this._outputWrapper.show();
      }
      layout.removeWidget(this._outputPlaceholder);
      layout.addWidget(this._output);
    }
    this._outputHidden = value;
    if (this.syncCollapse) {
      this.saveCollapseState();
    }
  }

  /**
   * Save view collapse state to model
   */
  saveCollapseState() {
    // Because collapse state for a code cell involves two different pieces of
    // metadata (the `collapsed` and `jupyter` metadata keys), we block reacting
    // to changes in metadata until we have fully committed our changes.
    // Otherwise setting one key can trigger a write to the other key to
    // maintain the synced consistency.
    this._savingMetadata = true;

    try {
      super.saveCollapseState();

      const metadata = this.model.metadata;
      const collapsed = this.model.metadata.get('collapsed');

      if (
        (this.outputHidden && collapsed === true) ||
        (!this.outputHidden && collapsed === undefined)
      ) {
        return;
      }

      // Do not set jupyter.outputs_hidden since it is redundant. See
      // and https://github.com/jupyter/nbformat/issues/137
      if (this.outputHidden) {
        metadata.set('collapsed', true);
      } else {
        metadata.delete('collapsed');
      }
    } finally {
      this._savingMetadata = false;
    }
  }

  /**
   * Revert view collapse state from model.
   *
   * We consider the `collapsed` metadata key as the source of truth for outputs
   * being hidden.
   */
  loadCollapseState() {
    super.loadCollapseState();
    this.outputHidden = !!this.model.metadata.get('collapsed');
  }

  /**
   * Whether the output is in a scrolled state?
   */
  get outputsScrolled(): boolean {
    return this._outputsScrolled;
  }
  set outputsScrolled(value: boolean) {
    this.toggleClass('jp-mod-outputsScrolled', value);
    this._outputsScrolled = value;
    if (this.syncScrolled) {
      this.saveScrolledState();
    }
  }

  /**
   * Save view collapse state to model
   */
  saveScrolledState() {
    const { metadata } = this.model;
    const current = metadata.get('scrolled');

    if (
      (this.outputsScrolled && current === true) ||
      (!this.outputsScrolled && current === undefined)
    ) {
      return;
    }
    if (this.outputsScrolled) {
      metadata.set('scrolled', true);
    } else {
      metadata.delete('scrolled');
    }
  }

  /**
   * Revert view collapse state from model.
   */
  loadScrolledState() {
    const metadata = this.model.metadata;

    // We don't have the notion of 'auto' scrolled, so we make it false.
    if (metadata.get('scrolled') === 'auto') {
      this.outputsScrolled = false;
    } else {
      this.outputsScrolled = !!metadata.get('scrolled');
    }
  }

  /**
   * Whether to sync the scrolled state to the cell model.
   */
  get syncScrolled(): boolean {
    return this._syncScrolled;
  }
  set syncScrolled(value: boolean) {
    if (this._syncScrolled === value) {
      return;
    }
    this._syncScrolled = value;
    if (value) {
      this.loadScrolledState();
    }
  }

  /**
   * Handle the input being hidden.
   *
   * #### Notes
   * This method is called by the case cell implementation and is
   * subclasses here so the code cell can watch to see when input
   * is hidden without accessing private state.
   */
  protected handleInputHidden(value: boolean): void {
    if (!value && this._outputWrapper.isHidden) {
      this._outputWrapper.show();
    } else if (value && !this._outputWrapper.isHidden && this._outputHidden) {
      this._outputWrapper.hide();
    }
  }

  /**
   * Clone the cell, using the same model.
   */
  clone(): CodeCell {
    const constructor = this.constructor as typeof CodeCell;
    return new constructor({
      model: this.model,
      editorFactory: this.editorFactory,
      rendermime: this._rendermime
    });
  }

  /**
   * Clone the OutputArea alone, returning a simplified output area, using the same model.
   */
  cloneOutputArea(): OutputArea {
    return new SimplifiedOutputArea({
      model: this.model.outputs!,
      rendermime: this._rendermime
    });
  }

  /**
   * Dispose of the resources used by the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._output.outputLengthChanged.disconnect(
      this._outputLengthHandler,
      this
    );
    this._rendermime = null!;
    this._output = null!;
    this._outputWrapper = null!;
    this._outputPlaceholder = null!;
    super.dispose();
  }

  /**
   * Handle changes in the model.
   */
  protected onStateChanged(model: ICellModel, args: IChangedArgs<any>): void {
    switch (args.name) {
      case 'executionCount':
        this.setPrompt(`${(model as ICodeCellModel).executionCount || ''}`);
        break;
      default:
        break;
    }
  }

  /**
   * Handle changes in the metadata.
   */
  protected onMetadataChanged(
    model: IObservableJSON,
    args: IObservableMap.IChangedArgs<JSONValue>
  ): void {
    if (this._savingMetadata) {
      // We are in middle of a metadata transaction, so don't react to it.
      return;
    }
    switch (args.key) {
      case 'scrolled':
        if (this.syncScrolled) {
          this.loadScrolledState();
        }
        break;
      case 'collapsed':
        if (this.syncCollapse) {
          this.loadCollapseState();
        }
        break;
      default:
        break;
    }
    super.onMetadataChanged(model, args);
  }

  /**
   * Handle changes in the number of outputs in the output area.
   */
  private _outputLengthHandler(sender: OutputArea, args: number) {
    const force = args === 0 ? true : false;
    this.toggleClass(NO_OUTPUTS_CLASS, force);
  }

  private _rendermime: IRenderMimeRegistry;
  private _outputHidden = false;
  private _outputsScrolled: boolean;
  private _outputWrapper: Widget;
  private _outputPlaceholder: OutputPlaceholder;
  private _output: OutputArea;
  private _syncScrolled = false;
  private _savingMetadata = false;
}

/**
 * The namespace for the `CodeCell` class statics.
 */
export namespace CodeCell {
  /**
   * An options object for initializing a base cell widget.
   */
  export interface IOptions extends Cell.IOptions {
    /**
     * The model used by the cell.
     */
    model: ICodeCellModel;

    /**
     * The mime renderer for the cell widget.
     */
    rendermime: IRenderMimeRegistry;
  }

  /**
   * Execute a cell given a client session.
   */
  export async function execute(
    cell: CodeCell,
    sessionContext: ISessionContext,
    metadata?: JSONObject
  ): Promise<KernelMessage.IExecuteReplyMsg | void> {
    const model = cell.model;
    const code = model.value.text;
    if (!code.trim() || !sessionContext.session?.kernel) {
      model.clearExecution();
      return;
    }
    const cellId = { cellId: model.id };
    metadata = {
      ...model.metadata.toJSON(),
      ...metadata,
      ...cellId
    };
    const { recordTiming } = metadata;
    model.clearExecution();
    cell.outputHidden = false;
    cell.setPrompt('*');
    model.trusted = true;
    let future:
      | Kernel.IFuture<
          KernelMessage.IExecuteRequestMsg,
          KernelMessage.IExecuteReplyMsg
        >
      | undefined;
    try {
      const msgPromise = OutputArea.execute(
        code,
        cell.outputArea,
        sessionContext,
        metadata
      );
      // cell.outputArea.future assigned synchronously in `execute`
      if (recordTiming) {
        const recordTimingHook = (msg: KernelMessage.IIOPubMessage) => {
          let label: string;
          switch (msg.header.msg_type) {
            case 'status':
              label = `status.${
                (msg as KernelMessage.IStatusMsg).content.execution_state
              }`;
              break;
            case 'execute_input':
              label = 'execute_input';
              break;
            default:
              return true;
          }
          const value = msg.header.date;
          if (!value) {
            return true;
          }
          const timingInfo: any = Object.assign(
            {},
            model.metadata.get('execution')
          );
          timingInfo[`iopub.${label}`] = value;
          model.metadata.set('execution', timingInfo);
          return true;
        };
        cell.outputArea.future.registerMessageHook(recordTimingHook);
      } else {
        model.metadata.delete('execution');
      }
      // Save this execution's future so we can compare in the catch below.
      future = cell.outputArea.future;
      const msg = (await msgPromise)!;
      model.executionCount = msg.content.execution_count;
      const started = msg.metadata.started as string;
      if (recordTiming && started) {
        const timingInfo = Object.assign(
          {},
          model.metadata.get('execution') as any
        );
        if (started) {
          timingInfo['shell.execute_reply.started'] = started;
        }
        const date = msg.header.date as string;
        if (date) {
          timingInfo['shell.execute_reply'] = date;
        }
        model.metadata.set('execution', timingInfo);
      }
      return msg;
    } catch (e) {
      // If we started executing, and the cell is still indicating this
      // execution, clear the prompt.
      if (future && !cell.isDisposed && cell.outputArea.future === future) {
        cell.setPrompt('');
      }
      throw e;
    }
  }
}

/**
 * `AttachmentsCell` - A base class for a cell widget that allows
 *  attachments to be drag/drop'd or pasted onto it
 */
export abstract class AttachmentsCell extends Cell {
  /**
   * Handle the DOM events for the widget.
   *
   * @param event - The DOM event sent to the widget.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the notebook panel's node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    switch (event.type) {
      case 'paste':
        this._evtPaste(event as ClipboardEvent);
        break;
      case 'dragenter':
        event.preventDefault();
        break;
      case 'dragover':
        event.preventDefault();
        break;
      case 'drop':
        this._evtNativeDrop(event as DragEvent);
        break;
      case 'lm-dragover':
        this._evtDragOver(event as IDragEvent);
        break;
      case 'lm-drop':
        this._evtDrop(event as IDragEvent);
        break;
      default:
        break;
    }
  }

  /**
   * Modify the cell source to include a reference to the attachment.
   */
  protected abstract updateCellSourceWithAttachment(
    attachmentName: string,
    URI?: string
  ): void;

  /**
   * Handle `after-attach` messages for the widget.
   */
  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    const node = this.node;
    node.addEventListener('lm-dragover', this);
    node.addEventListener('lm-drop', this);
    node.addEventListener('dragenter', this);
    node.addEventListener('dragover', this);
    node.addEventListener('drop', this);
    node.addEventListener('paste', this);
  }

  /**
   * A message handler invoked on a `'before-detach'`
   * message
   */
  protected onBeforeDetach(msg: Message): void {
    const node = this.node;
    node.removeEventListener('drop', this);
    node.removeEventListener('dragover', this);
    node.removeEventListener('dragenter', this);
    node.removeEventListener('paste', this);
    node.removeEventListener('lm-dragover', this);
    node.removeEventListener('lm-drop', this);
  }

  private _evtDragOver(event: IDragEvent) {
    const supportedMimeType = some(imageRendererFactory.mimeTypes, mimeType => {
      if (!event.mimeData.hasData(CONTENTS_MIME_RICH)) {
        return false;
      }
      const data = event.mimeData.getData(
        CONTENTS_MIME_RICH
      ) as DirListing.IContentsThunk;
      return data.model.mimetype === mimeType;
    });
    if (!supportedMimeType) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dropAction = event.proposedAction;
  }

  /**
   * Handle the `paste` event for the widget
   */
  private _evtPaste(event: ClipboardEvent): void {
    if (event.clipboardData) {
      const items = event.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type === 'text/plain') {
          // Skip if this text is the path to a file
          if (i < items.length - 1 && items[i + 1].kind === 'file') {
            continue;
          }
          items[i].getAsString(text => {
            this.editor.replaceSelection?.(text);
          });
        }
        this._attachFiles(event.clipboardData.items);
      }
    }
    event.preventDefault();
  }

  /**
   * Handle the `drop` event for the widget
   */
  private _evtNativeDrop(event: DragEvent): void {
    if (event.dataTransfer) {
      this._attachFiles(event.dataTransfer.items);
    }
    event.preventDefault();
  }

  /**
   * Handle the `'lm-drop'` event for the widget.
   */
  private _evtDrop(event: IDragEvent): void {
    const supportedMimeTypes = toArray(
      filter(event.mimeData.types(), mimeType => {
        if (mimeType === CONTENTS_MIME_RICH) {
          const data = event.mimeData.getData(
            CONTENTS_MIME_RICH
          ) as DirListing.IContentsThunk;
          return (
            imageRendererFactory.mimeTypes.indexOf(data.model.mimetype) !== -1
          );
        }
        return imageRendererFactory.mimeTypes.indexOf(mimeType) !== -1;
      })
    );
    if (supportedMimeTypes.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.proposedAction === 'none') {
      event.dropAction = 'none';
      return;
    }
    event.dropAction = 'copy';

    for (const mimeType of supportedMimeTypes) {
      if (mimeType === CONTENTS_MIME_RICH) {
        const { model, withContent } = event.mimeData.getData(
          CONTENTS_MIME_RICH
        ) as DirListing.IContentsThunk;
        if (model.type === 'file') {
          const URI = this._generateURI(model.name);
          this.updateCellSourceWithAttachment(model.name, URI);
          void withContent().then(fullModel => {
            this.model.attachments.set(URI, {
              [fullModel.mimetype]: fullModel.content
            });
          });
        }
      } else {
        // Pure mimetype, no useful name to infer
        const URI = this._generateURI();
        this.model.attachments.set(URI, {
          [mimeType]: event.mimeData.getData(mimeType)
        });
        this.updateCellSourceWithAttachment(URI, URI);
      }
    }
  }

  /**
   * Attaches all DataTransferItems (obtained from
   * clipboard or native drop events) to the cell
   */
  private _attachFiles(items: DataTransferItemList) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const blob = item.getAsFile();
        if (blob) {
          this._attachFile(blob);
        }
      }
    }
  }

  /**
   * Takes in a file object and adds it to
   * the cell attachments
   */
  private _attachFile(blob: File) {
    const reader = new FileReader();
    reader.onload = evt => {
      const { href, protocol } = URLExt.parse(reader.result as string);
      if (protocol !== 'data:') {
        return;
      }
      const dataURIRegex = /([\w+\/\+]+)?(?:;(charset=[\w\d-]*|base64))?,(.*)/;
      const matches = dataURIRegex.exec(href);
      if (!matches || matches.length !== 4) {
        return;
      }
      const mimeType = matches[1];
      const encodedData = matches[3];
      const bundle: nbformat.IMimeBundle = { [mimeType]: encodedData };
      const URI = this._generateURI(blob.name);

      if (mimeType.startsWith('image/')) {
        this.model.attachments.set(URI, bundle);
        this.updateCellSourceWithAttachment(blob.name, URI);
      }
    };
    reader.onerror = evt => {
      console.error(`Failed to attach ${blob.name}` + evt);
    };
    reader.readAsDataURL(blob);
  }

  /**
   * Generates a unique URI for a file
   * while preserving the file extension.
   */
  private _generateURI(name = ''): string {
    const lastIndex = name.lastIndexOf('.');
    return lastIndex !== -1
      ? UUID.uuid4().concat(name.substring(lastIndex))
      : UUID.uuid4();
  }

  /**
   * The model used by the widget.
   */
  readonly model: IAttachmentsCellModel;
}

/** ****************************************************************************
 * MarkdownCell
 ******************************************************************************/

/**
 * A widget for a Markdown cell.
 *
 * #### Notes
 * Things get complicated if we want the rendered text to update
 * any time the text changes, the text editor model changes,
 * or the input area model changes.  We don't support automatically
 * updating the rendered text in all of these cases.
 */
export class MarkdownCell extends AttachmentsCell {
  /**
   * Construct a Markdown cell widget.
   */
  constructor(options: MarkdownCell.IOptions) {
    super(options);
    this.addClass(MARKDOWN_CELL_CLASS);
    // Ensure we can resolve attachments:
    this._rendermime = options.rendermime.clone({
      resolver: new AttachmentsResolver({
        parent: options.rendermime.resolver ?? undefined,
        model: this.model.attachments
      })
    });

    // Stop codemirror handling paste
    this.editor.setOption('handlePaste', false);

    // Throttle the rendering rate of the widget.
    this._monitor = new ActivityMonitor({
      signal: this.model.contentChanged,
      timeout: RENDER_TIMEOUT
    });
    this._monitor.activityStopped.connect(() => {
      if (this._rendered) {
        this.update();
      }
    }, this);

    void this._updateRenderedInput().then(() => {
      this._ready.resolve(void 0);
    });
    this.renderInput(this._renderer!);
  }

  /**
   * The model used by the widget.
   */
  readonly model: IMarkdownCellModel;

  /**
   * A promise that resolves when the widget renders for the first time.
   */
  get ready(): Promise<void> {
    return this._ready.promise;
  }

  /**
   * Whether the cell is rendered.
   */
  get rendered(): boolean {
    return this._rendered;
  }
  set rendered(value: boolean) {
    if (value === this._rendered) {
      return;
    }
    this._rendered = value;
    this._handleRendered();
    // Refreshing an editor can be really expensive, so we don't call it from
    // _handleRendered, since _handledRendered is also called on every update
    // request.
    if (!this._rendered) {
      this.editor.refresh();
    }
  }

  /**
   * Render an input instead of the text editor.
   */
  protected renderInput(widget: Widget): void {
    this.addClass(RENDERED_CLASS);
    this.inputArea.renderInput(widget);
  }

  /**
   * Show the text editor instead of rendered input.
   */
  protected showEditor(): void {
    this.removeClass(RENDERED_CLASS);
    this.inputArea.showEditor();
  }

  /*
   * Handle `update-request` messages.
   */
  protected onUpdateRequest(msg: Message): void {
    // Make sure we are properly rendered.
    this._handleRendered();
    super.onUpdateRequest(msg);
  }

  /**
   * Modify the cell source to include a reference to the attachment.
   */
  protected updateCellSourceWithAttachment(
    attachmentName: string,
    URI?: string
  ) {
    const textToBeAppended = `![${attachmentName}](attachment:${URI ??
      attachmentName})`;
    this.editor.replaceSelection?.(textToBeAppended);
  }

  /**
   * Handle the rendered state.
   */
  private _handleRendered(): void {
    if (!this._rendered) {
      this.showEditor();
    } else {
      // TODO: It would be nice for the cell to provide a way for
      // its consumers to hook into when the rendering is done.
      void this._updateRenderedInput();
      this.renderInput(this._renderer!);
    }
  }

  /**
   * Update the rendered input.
   */
  private _updateRenderedInput(): Promise<void> {
    const model = this.model;
    const text = (model && model.value.text) || DEFAULT_MARKDOWN_TEXT;
    // Do not re-render if the text has not changed.
    if (text !== this._prevText) {
      const mimeModel = new MimeModel({ data: { 'text/markdown': text } });
      if (!this._renderer) {
        this._renderer = this._rendermime.createRenderer('text/markdown');
        this._renderer.addClass(MARKDOWN_OUTPUT_CLASS);
      }
      this._prevText = text;
      return this._renderer.renderModel(mimeModel);
    }
    return Promise.resolve(void 0);
  }

  /**
   * Clone the cell, using the same model.
   */
  clone(): MarkdownCell {
    const constructor = this.constructor as typeof MarkdownCell;
    return new constructor({
      model: this.model,
      editorFactory: this.editorFactory,
      rendermime: this._rendermime
    });
  }

  private _monitor: ActivityMonitor<ICellModel, void>;
  private _renderer: IRenderMime.IRenderer | null = null;
  private _rendermime: IRenderMimeRegistry;
  private _rendered = true;
  private _prevText = '';
  private _ready = new PromiseDelegate<void>();
}

/**
 * The namespace for the `CodeCell` class statics.
 */
export namespace MarkdownCell {
  /**
   * An options object for initializing a base cell widget.
   */
  export interface IOptions extends Cell.IOptions {
    /**
     * The model used by the cell.
     */
    model: IMarkdownCellModel;

    /**
     * The mime renderer for the cell widget.
     */
    rendermime: IRenderMimeRegistry;
  }
}

/** ****************************************************************************
 * RawCell
 ******************************************************************************/

/**
 * A widget for a raw cell.
 */
export class RawCell extends Cell {
  /**
   * Construct a raw cell widget.
   */
  constructor(options: Cell.IOptions) {
    super(options);
    this.addClass(RAW_CELL_CLASS);
  }

  /**
   * Clone the cell, using the same model.
   */
  clone(): RawCell {
    const constructor = this.constructor as typeof RawCell;
    return new constructor({
      model: this.model,
      editorFactory: this.editorFactory
    });
  }

  /**
   * The model used by the widget.
   */
  readonly model: IRawCellModel;
}

/**
 * The namespace for the `RawCell` class statics.
 */
export namespace RawCell {
  /**
   * An options object for initializing a base cell widget.
   */
  export interface IOptions extends Cell.IOptions {
    /**
     * The model used by the cell.
     */
    model: IRawCellModel;
  }
}
