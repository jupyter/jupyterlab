// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ArrayExt, each } from '@lumino/algorithm';

import { ReadonlyPartialJSONValue } from '@lumino/coreutils';

import { Message } from '@lumino/messaging';

import { MimeData } from '@lumino/coreutils';

import { AttachedProperty } from '@lumino/properties';

import { ISignal, Signal } from '@lumino/signaling';

import { Drag, IDragEvent } from '@lumino/dragdrop';

import { PanelLayout, Widget } from '@lumino/widgets';

import { h, VirtualDOM } from '@lumino/virtualdom';

import {
  ICellModel,
  Cell,
  IMarkdownCellModel,
  CodeCell,
  MarkdownCell,
  ICodeCellModel,
  RawCell,
  IRawCellModel
} from '@jupyterlab/cells';

import { IEditorMimeTypeService, CodeEditor } from '@jupyterlab/codeeditor';

import { IChangedArgs } from '@jupyterlab/coreutils';

import * as nbformat from '@jupyterlab/nbformat';

import { IObservableMap, IObservableList } from '@jupyterlab/observables';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { INotebookModel } from './model';

/**
 * The data attribute added to a widget that has an active kernel.
 */
const KERNEL_USER = 'jpKernelUser';

/**
 * The data attribute added to a widget that can run code.
 */
const CODE_RUNNER = 'jpCodeRunner';

/**
 * The data attribute added to a widget that can undo.
 */
const UNDOER = 'jpUndoer';

/**
 * The class name added to notebook widgets.
 */
const NB_CLASS = 'jp-Notebook';

/**
 * The class name added to notebook widget cells.
 */
const NB_CELL_CLASS = 'jp-Notebook-cell';

/**
 * The class name added to a notebook in edit mode.
 */
const EDIT_CLASS = 'jp-mod-editMode';

/**
 * The class name added to a notebook in command mode.
 */
const COMMAND_CLASS = 'jp-mod-commandMode';

/**
 * The class name added to the active cell.
 */
const ACTIVE_CLASS = 'jp-mod-active';

/**
 * The class name added to selected cells.
 */
const SELECTED_CLASS = 'jp-mod-selected';

/**
 * The class name added to an active cell when there are other selected cells.
 */
const OTHER_SELECTED_CLASS = 'jp-mod-multiSelected';

/**
 * The class name added to unconfined images.
 */
const UNCONFINED_CLASS = 'jp-mod-unconfined';

/**
 * The class name added to a drop target.
 */
const DROP_TARGET_CLASS = 'jp-mod-dropTarget';

/**
 * The class name added to a drop source.
 */
const DROP_SOURCE_CLASS = 'jp-mod-dropSource';

/**
 * The class name added to drag images.
 */
const DRAG_IMAGE_CLASS = 'jp-dragImage';

/**
 * The class name added to singular drag images
 */
const SINGLE_DRAG_IMAGE_CLASS = 'jp-dragImage-singlePrompt';

/**
 * The class name added to the drag image cell content.
 */
const CELL_DRAG_CONTENT_CLASS = 'jp-dragImage-content';

/**
 * The class name added to the drag image cell content.
 */
const CELL_DRAG_PROMPT_CLASS = 'jp-dragImage-prompt';

/**
 * The class name added to the drag image cell content.
 */
const CELL_DRAG_MULTIPLE_BACK = 'jp-dragImage-multipleBack';

/**
 * The mimetype used for Jupyter cell data.
 */
const JUPYTER_CELL_MIME = 'application/vnd.jupyter.cells';

/**
 * The threshold in pixels to start a drag event.
 */
const DRAG_THRESHOLD = 5;

/**
 * The interactivity modes for the notebook.
 */
export type NotebookMode = 'command' | 'edit';

/**
 * A widget which renders static non-interactive notebooks.
 *
 * #### Notes
 * The widget model must be set separately and can be changed
 * at any time.  Consumers of the widget must account for a
 * `null` model, and may want to listen to the `modelChanged`
 * signal.
 */
export class StaticNotebook extends Widget {
  /**
   * Construct a notebook widget.
   */
  constructor(options: StaticNotebook.IOptions) {
    super();
    this.addClass(NB_CLASS);
    this.node.setAttribute('role', 'grid');
    this.node.dataset[KERNEL_USER] = 'true';
    this.node.dataset[UNDOER] = 'true';
    this.rendermime = options.rendermime;
    this.layout = new Private.NotebookPanelLayout();
    this.contentFactory =
      options.contentFactory || StaticNotebook.defaultContentFactory;
    this.editorConfig =
      options.editorConfig || StaticNotebook.defaultEditorConfig;
    this.notebookConfig =
      options.notebookConfig || StaticNotebook.defaultNotebookConfig;
    this._mimetypeService = options.mimeTypeService;
  }

  /**
   * A signal emitted when the model of the notebook changes.
   */
  get modelChanged(): ISignal<this, void> {
    return this._modelChanged;
  }

  /**
   * A signal emitted when the model content changes.
   *
   * #### Notes
   * This is a convenience signal that follows the current model.
   */
  get modelContentChanged(): ISignal<this, void> {
    return this._modelContentChanged;
  }

  /**
   * The cell factory used by the widget.
   */
  readonly contentFactory: StaticNotebook.IContentFactory;

  /**
   * The Rendermime instance used by the widget.
   */
  readonly rendermime: IRenderMimeRegistry;

  /**
   * The model for the widget.
   */
  get model(): INotebookModel | null {
    return this._model;
  }
  set model(newValue: INotebookModel | null) {
    newValue = newValue || null;
    if (this._model === newValue) {
      return;
    }
    let oldValue = this._model;
    this._model = newValue;

    if (oldValue && oldValue.modelDB.isCollaborative) {
      void oldValue.modelDB.connected.then(() => {
        oldValue!.modelDB.collaborators!.changed.disconnect(
          this._onCollaboratorsChanged,
          this
        );
      });
    }
    if (newValue && newValue.modelDB.isCollaborative) {
      void newValue.modelDB.connected.then(() => {
        newValue!.modelDB.collaborators!.changed.connect(
          this._onCollaboratorsChanged,
          this
        );
      });
    }

    // Trigger private, protected, and public changes.
    this._onModelChanged(oldValue, newValue);
    this.onModelChanged(oldValue, newValue);
    this._modelChanged.emit(void 0);
  }

  /**
   * Get the mimetype for code cells.
   */
  get codeMimetype(): string {
    return this._mimetype;
  }

  /**
   * A read-only sequence of the widgets in the notebook.
   */
  get widgets(): ReadonlyArray<Cell> {
    return (this.layout as PanelLayout).widgets as ReadonlyArray<Cell>;
  }

  /**
   * A configuration object for cell editor settings.
   */
  get editorConfig(): StaticNotebook.IEditorConfig {
    return this._editorConfig;
  }
  set editorConfig(value: StaticNotebook.IEditorConfig) {
    this._editorConfig = value;
    this._updateEditorConfig();
  }

  /**
   * A configuration object for notebook settings.
   */
  get notebookConfig(): StaticNotebook.INotebookConfig {
    return this._notebookConfig;
  }
  set notebookConfig(value: StaticNotebook.INotebookConfig) {
    this._notebookConfig = value;
    this._updateNotebookConfig();
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    // Do nothing if already disposed.
    if (this.isDisposed) {
      return;
    }
    this._model = null;
    super.dispose();
  }

  /**
   * Handle a new model.
   *
   * #### Notes
   * This method is called after the model change has been handled
   * internally and before the `modelChanged` signal is emitted.
   * The default implementation is a no-op.
   */
  protected onModelChanged(
    oldValue: INotebookModel | null,
    newValue: INotebookModel | null
  ): void {
    // No-op.
  }

  /**
   * Handle changes to the notebook model content.
   *
   * #### Notes
   * The default implementation emits the `modelContentChanged` signal.
   */
  protected onModelContentChanged(model: INotebookModel, args: void): void {
    this._modelContentChanged.emit(void 0);
  }

  /**
   * Handle changes to the notebook model metadata.
   *
   * #### Notes
   * The default implementation updates the mimetypes of the code cells
   * when the `language_info` metadata changes.
   */
  protected onMetadataChanged(
    sender: IObservableMap<ReadonlyPartialJSONValue | undefined>,
    args: IObservableMap.IChangedArgs<ReadonlyPartialJSONValue>
  ): void {
    switch (args.key) {
      case 'language_info':
        this._updateMimetype();
        break;
      default:
        break;
    }
  }

  /**
   * Handle a cell being inserted.
   *
   * The default implementation is a no-op
   */
  protected onCellInserted(index: number, cell: Cell): void {
    // This is a no-op.
  }

  /**
   * Handle a cell being moved.
   *
   * The default implementation is a no-op
   */
  protected onCellMoved(fromIndex: number, toIndex: number): void {
    // This is a no-op.
  }

  /**
   * Handle a cell being removed.
   *
   * The default implementation is a no-op
   */
  protected onCellRemoved(index: number, cell: Cell): void {
    // This is a no-op.
  }

  /**
   * Handle a new model on the widget.
   */
  private _onModelChanged(
    oldValue: INotebookModel | null,
    newValue: INotebookModel | null
  ): void {
    let layout = this.layout as PanelLayout;
    if (oldValue) {
      oldValue.cells.changed.disconnect(this._onCellsChanged, this);
      oldValue.metadata.changed.disconnect(this.onMetadataChanged, this);
      oldValue.contentChanged.disconnect(this.onModelContentChanged, this);
      // TODO: reuse existing cell widgets if possible. Remember to initially
      // clear the history of each cell if we do this.
      while (layout.widgets.length) {
        this._removeCell(0);
      }
    }
    if (!newValue) {
      this._mimetype = 'text/plain';
      return;
    }
    this._updateMimetype();
    let cells = newValue.cells;
    if (!cells.length) {
      cells.push(
        newValue.contentFactory.createCell(this.notebookConfig.defaultCell, {})
      );
    }
    each(cells, (cell: ICellModel, i: number) => {
      this._insertCell(i, cell);
    });
    cells.changed.connect(this._onCellsChanged, this);
    newValue.contentChanged.connect(this.onModelContentChanged, this);
    newValue.metadata.changed.connect(this.onMetadataChanged, this);
  }

  /**
   * Handle a change cells event.
   */
  private _onCellsChanged(
    sender: IObservableList<ICellModel>,
    args: IObservableList.IChangedArgs<ICellModel>
  ) {
    let index = 0;
    switch (args.type) {
      case 'add':
        index = args.newIndex;
        each(args.newValues, value => {
          this._insertCell(index++, value);
        });
        break;
      case 'move':
        this._moveCell(args.oldIndex, args.newIndex);
        break;
      case 'remove':
        each(args.oldValues, value => {
          this._removeCell(args.oldIndex);
        });
        // Add default cell if there are no cells remaining.
        if (!sender.length) {
          const model = this.model;
          // Add the cell in a new context to avoid triggering another
          // cell changed event during the handling of this signal.
          requestAnimationFrame(() => {
            if (model && !model.isDisposed && !model.cells.length) {
              model.cells.push(
                model.contentFactory.createCell(
                  this.notebookConfig.defaultCell,
                  {}
                )
              );
            }
          });
        }
        break;
      case 'set':
        // TODO: reuse existing widgets if possible.
        index = args.newIndex;
        each(args.newValues, value => {
          // Note: this ordering (insert then remove)
          // is important for getting the active cell
          // index for the editable notebook correct.
          this._insertCell(index, value);
          this._removeCell(index + 1);
          index++;
        });
        break;
      default:
        return;
    }
  }

  /**
   * Create a cell widget and insert into the notebook.
   */
  private _insertCell(index: number, cell: ICellModel): void {
    let widget: Cell;
    switch (cell.type) {
      case 'code':
        widget = this._createCodeCell(cell as ICodeCellModel);
        widget.model.mimeType = this._mimetype;
        break;
      case 'markdown':
        widget = this._createMarkdownCell(cell as IMarkdownCellModel);
        if (cell.value.text === '') {
          (widget as MarkdownCell).rendered = false;
        }
        break;
      default:
        widget = this._createRawCell(cell as IRawCellModel);
    }
    widget.addClass(NB_CELL_CLASS);
    let layout = this.layout as PanelLayout;
    layout.insertWidget(index, widget);
    this.onCellInserted(index, widget);
  }

  /**
   * Create a code cell widget from a code cell model.
   */
  private _createCodeCell(model: ICodeCellModel): CodeCell {
    let rendermime = this.rendermime;
    let contentFactory = this.contentFactory;
    const editorConfig = this.editorConfig.code;
    let options = {
      editorConfig,
      model,
      rendermime,
      contentFactory,
      updateEditorOnShow: false
    };
    const cell = this.contentFactory.createCodeCell(options, this);
    cell.syncCollapse = true;
    cell.syncEditable = true;
    cell.syncScrolled = true;
    return cell;
  }

  /**
   * Create a markdown cell widget from a markdown cell model.
   */
  private _createMarkdownCell(model: IMarkdownCellModel): MarkdownCell {
    let rendermime = this.rendermime;
    let contentFactory = this.contentFactory;
    const editorConfig = this.editorConfig.markdown;
    let options = {
      editorConfig,
      model,
      rendermime,
      contentFactory,
      updateEditorOnShow: false
    };
    const cell = this.contentFactory.createMarkdownCell(options, this);
    cell.syncCollapse = true;
    cell.syncEditable = true;
    return cell;
  }

  /**
   * Create a raw cell widget from a raw cell model.
   */
  private _createRawCell(model: IRawCellModel): RawCell {
    let contentFactory = this.contentFactory;
    const editorConfig = this.editorConfig.raw;
    let options = {
      editorConfig,
      model,
      contentFactory,
      updateEditorOnShow: false
    };
    const cell = this.contentFactory.createRawCell(options, this);
    cell.syncCollapse = true;
    cell.syncEditable = true;
    return cell;
  }

  /**
   * Move a cell widget.
   */
  private _moveCell(fromIndex: number, toIndex: number): void {
    let layout = this.layout as PanelLayout;
    layout.insertWidget(toIndex, layout.widgets[fromIndex]);
    this.onCellMoved(fromIndex, toIndex);
  }

  /**
   * Remove a cell widget.
   */
  private _removeCell(index: number): void {
    let layout = this.layout as PanelLayout;
    let widget = layout.widgets[index] as Cell;
    widget.parent = null;
    this.onCellRemoved(index, widget);
    widget.dispose();
  }

  /**
   * Update the mimetype of the notebook.
   */
  private _updateMimetype(): void {
    let info = this._model?.metadata.get(
      'language_info'
    ) as nbformat.ILanguageInfoMetadata;
    if (!info) {
      return;
    }
    this._mimetype = this._mimetypeService.getMimeTypeByLanguage(info);
    each(this.widgets, widget => {
      if (widget.model.type === 'code') {
        widget.model.mimeType = this._mimetype;
      }
    });
  }

  /**
   * Handle an update to the collaborators.
   */
  private _onCollaboratorsChanged(): void {
    // If there are selections corresponding to non-collaborators,
    // they are stale and should be removed.
    for (let i = 0; i < this.widgets.length; i++) {
      let cell = this.widgets[i];
      for (let key of cell.model.selections.keys()) {
        if (false === this._model?.modelDB?.collaborators?.has(key)) {
          cell.model.selections.delete(key);
        }
      }
    }
  }

  /**
   * Update editor settings for notebook cells.
   */
  private _updateEditorConfig() {
    for (let i = 0; i < this.widgets.length; i++) {
      const cell = this.widgets[i];
      let config: Partial<CodeEditor.IConfig>;
      switch (cell.model.type) {
        case 'code':
          config = this._editorConfig.code;
          break;
        case 'markdown':
          config = this._editorConfig.markdown;
          break;
        default:
          config = this._editorConfig.raw;
          break;
      }
      Object.keys(config).forEach((key: keyof CodeEditor.IConfig) => {
        cell.editor.setOption(key, config[key] ?? null);
      });
      cell.editor.refresh();
    }
  }

  /**
   * Apply updated notebook settings.
   */
  private _updateNotebookConfig() {
    // Apply scrollPastEnd setting.
    this.toggleClass(
      'jp-mod-scrollPastEnd',
      this._notebookConfig.scrollPastEnd
    );
  }

  private _editorConfig = StaticNotebook.defaultEditorConfig;
  private _notebookConfig = StaticNotebook.defaultNotebookConfig;
  private _mimetype = 'text/plain';
  private _model: INotebookModel | null = null;
  private _mimetypeService: IEditorMimeTypeService;
  private _modelChanged = new Signal<this, void>(this);
  private _modelContentChanged = new Signal<this, void>(this);
}

/**
 * The namespace for the `StaticNotebook` class statics.
 */
export namespace StaticNotebook {
  /**
   * An options object for initializing a static notebook.
   */
  export interface IOptions {
    /**
     * The rendermime instance used by the widget.
     */
    rendermime: IRenderMimeRegistry;

    /**
     * The language preference for the model.
     */
    languagePreference?: string;

    /**
     * A factory for creating content.
     */
    contentFactory?: IContentFactory;

    /**
     * A configuration object for the cell editor settings.
     */
    editorConfig?: IEditorConfig;

    /**
     * A configuration object for notebook settings.
     */
    notebookConfig?: INotebookConfig;

    /**
     * The service used to look up mime types.
     */
    mimeTypeService: IEditorMimeTypeService;
  }

  /**
   * A factory for creating notebook content.
   *
   * #### Notes
   * This extends the content factory of the cell itself, which extends the content
   * factory of the output area and input area. The result is that there is a single
   * factory for creating all child content of a notebook.
   */
  export interface IContentFactory extends Cell.IContentFactory {
    /**
     * Create a new code cell widget.
     */
    createCodeCell(
      options: CodeCell.IOptions,
      parent: StaticNotebook
    ): CodeCell;

    /**
     * Create a new markdown cell widget.
     */
    createMarkdownCell(
      options: MarkdownCell.IOptions,
      parent: StaticNotebook
    ): MarkdownCell;

    /**
     * Create a new raw cell widget.
     */
    createRawCell(options: RawCell.IOptions, parent: StaticNotebook): RawCell;
  }

  /**
   * A config object for the cell editors.
   */
  export interface IEditorConfig {
    /**
     * Config options for code cells.
     */
    readonly code: Partial<CodeEditor.IConfig>;
    /**
     * Config options for markdown cells.
     */
    readonly markdown: Partial<CodeEditor.IConfig>;
    /**
     * Config options for raw cells.
     */
    readonly raw: Partial<CodeEditor.IConfig>;
  }

  /**
   * Default configuration options for cell editors.
   */
  export const defaultEditorConfig: IEditorConfig = {
    code: {
      ...CodeEditor.defaultConfig,
      lineWrap: 'off',
      matchBrackets: true,
      autoClosingBrackets: true
    },
    markdown: {
      ...CodeEditor.defaultConfig,
      lineWrap: 'on',
      matchBrackets: false,
      autoClosingBrackets: false
    },
    raw: {
      ...CodeEditor.defaultConfig,
      lineWrap: 'on',
      matchBrackets: false,
      autoClosingBrackets: false
    }
  };

  /**
   * A config object for the notebook widget
   */
  export interface INotebookConfig {
    /**
     * Enable scrolling past the last cell
     */
    scrollPastEnd: boolean;

    /**
     * The default type for new notebook cells.
     */
    defaultCell: nbformat.CellType;

    /**
     * Should timing be recorded in metadata
     */
    recordTiming: boolean;
  }
  /**
   * Default configuration options for notebooks.
   */
  export const defaultNotebookConfig: INotebookConfig = {
    scrollPastEnd: true,
    defaultCell: 'code',
    recordTiming: false
  };

  /**
   * The default implementation of an `IContentFactory`.
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
    createCodeCell(
      options: CodeCell.IOptions,
      parent: StaticNotebook
    ): CodeCell {
      if (!options.contentFactory) {
        options.contentFactory = this;
      }
      return new CodeCell(options).initializeState();
    }

    /**
     * Create a new markdown cell widget.
     *
     * #### Notes
     * If no cell content factory is passed in with the options, the one on the
     * notebook content factory is used.
     */
    createMarkdownCell(
      options: MarkdownCell.IOptions,
      parent: StaticNotebook
    ): MarkdownCell {
      if (!options.contentFactory) {
        options.contentFactory = this;
      }
      return new MarkdownCell(options).initializeState();
    }

    /**
     * Create a new raw cell widget.
     *
     * #### Notes
     * If no cell content factory is passed in with the options, the one on the
     * notebook content factory is used.
     */
    createRawCell(options: RawCell.IOptions, parent: StaticNotebook): RawCell {
      if (!options.contentFactory) {
        options.contentFactory = this;
      }
      return new RawCell(options).initializeState();
    }
  }

  /**
   * A namespace for the staic notebook content factory.
   */
  export namespace ContentFactory {
    /**
     * Options for the content factory.
     */
    export interface IOptions extends Cell.ContentFactory.IOptions {}
  }

  /**
   * Default content factory for the static notebook widget.
   */
  export const defaultContentFactory: IContentFactory = new ContentFactory();
}

/**
 * A notebook widget that supports interactivity.
 */
export class Notebook extends StaticNotebook {
  /**
   * Construct a notebook widget.
   */
  constructor(options: Notebook.IOptions) {
    super(Private.processNotebookOptions(options));
    this.node.tabIndex = -1; // Allow the widget to take focus.
    // Allow the node to scroll while dragging items.
    this.node.setAttribute('data-lm-dragscroll', 'true');
  }

  /**
   * A signal emitted when the active cell changes.
   *
   * #### Notes
   * This can be due to the active index changing or the
   * cell at the active index changing.
   */
  get activeCellChanged(): ISignal<this, Cell> {
    return this._activeCellChanged;
  }

  /**
   * A signal emitted when the state of the notebook changes.
   */
  get stateChanged(): ISignal<this, IChangedArgs<any>> {
    return this._stateChanged;
  }

  /**
   * A signal emitted when the selection state of the notebook changes.
   */
  get selectionChanged(): ISignal<this, void> {
    return this._selectionChanged;
  }

  /**
   * The interactivity mode of the notebook.
   */
  get mode(): NotebookMode {
    return this._mode;
  }
  set mode(newValue: NotebookMode) {
    let activeCell = this.activeCell;
    if (!activeCell) {
      newValue = 'command';
    }
    if (newValue === this._mode) {
      this._ensureFocus();
      return;
    }
    // Post an update request.
    this.update();
    let oldValue = this._mode;
    this._mode = newValue;

    if (newValue === 'edit') {
      // Edit mode deselects all cells.
      each(this.widgets, widget => {
        this.deselect(widget);
      });
      //  Edit mode unrenders an active markdown widget.
      if (activeCell instanceof MarkdownCell) {
        activeCell.rendered = false;
      }
      activeCell!.inputHidden = false;
    } else {
      // Focus on the notebook document, which blurs the active cell.
      this.node.focus();
    }
    this._stateChanged.emit({ name: 'mode', oldValue, newValue });
    this._ensureFocus();
  }

  /**
   * The active cell index of the notebook.
   *
   * #### Notes
   * The index will be clamped to the bounds of the notebook cells.
   */
  get activeCellIndex(): number {
    if (!this.model) {
      return -1;
    }
    return this.model.cells.length ? this._activeCellIndex : -1;
  }
  set activeCellIndex(newValue: number) {
    let oldValue = this._activeCellIndex;
    if (!this.model || !this.model.cells.length) {
      newValue = -1;
    } else {
      newValue = Math.max(newValue, 0);
      newValue = Math.min(newValue, this.model.cells.length - 1);
    }

    this._activeCellIndex = newValue;
    let cell = this.widgets[newValue];
    if (cell !== this._activeCell) {
      // Post an update request.
      this.update();
      this._activeCell = cell;
      this._activeCellChanged.emit(cell);
    }
    if (this.mode === 'edit' && cell instanceof MarkdownCell) {
      cell.rendered = false;
    }
    this._ensureFocus();
    if (newValue === oldValue) {
      return;
    }
    this._trimSelections();
    this._stateChanged.emit({ name: 'activeCellIndex', oldValue, newValue });
  }

  /**
   * Get the active cell widget.
   *
   * #### Notes
   * This is a cell or `null` if there is no active cell.
   */
  get activeCell(): Cell | null {
    return this._activeCell;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._activeCell = null;
    super.dispose();
  }

  /**
   * Select a cell widget.
   *
   * #### Notes
   * It is a no-op if the value does not change.
   * It will emit the `selectionChanged` signal.
   */
  select(widget: Cell): void {
    if (Private.selectedProperty.get(widget)) {
      return;
    }
    Private.selectedProperty.set(widget, true);
    this._selectionChanged.emit(void 0);
    this.update();
  }

  /**
   * Deselect a cell widget.
   *
   * #### Notes
   * It is a no-op if the value does not change.
   * It will emit the `selectionChanged` signal.
   */
  deselect(widget: Cell): void {
    if (!Private.selectedProperty.get(widget)) {
      return;
    }
    Private.selectedProperty.set(widget, false);
    this._selectionChanged.emit(void 0);
    this.update();
  }

  /**
   * Whether a cell is selected.
   */
  isSelected(widget: Cell): boolean {
    return Private.selectedProperty.get(widget);
  }

  /**
   * Whether a cell is selected or is the active cell.
   */
  isSelectedOrActive(widget: Cell): boolean {
    if (widget === this._activeCell) {
      return true;
    }
    return Private.selectedProperty.get(widget);
  }

  /**
   * Deselect all of the cells.
   */
  deselectAll(): void {
    let changed = false;
    each(this.widgets, widget => {
      if (Private.selectedProperty.get(widget)) {
        changed = true;
      }
      Private.selectedProperty.set(widget, false);
    });
    if (changed) {
      this._selectionChanged.emit(void 0);
    }
    // Make sure we have a valid active cell.
    this.activeCellIndex = this.activeCellIndex;
    this.update();
  }

  /**
   * Move the head of an existing contiguous selection to extend the selection.
   *
   * @param index - The new head of the existing selection.
   *
   * #### Notes
   * If there is no existing selection, the active cell is considered an
   * existing one-cell selection.
   *
   * If the new selection is a single cell, that cell becomes the active cell
   * and all cells are deselected.
   *
   * There is no change if there are no cells (i.e., activeCellIndex is -1).
   */
  extendContiguousSelectionTo(index: number): void {
    let { head, anchor } = this.getContiguousSelection();
    let i: number;

    // Handle the case of no current selection.
    if (anchor === null || head === null) {
      if (index === this.activeCellIndex) {
        // Already collapsed selection, nothing more to do.
        return;
      }

      // We will start a new selection below.
      head = this.activeCellIndex;
      anchor = this.activeCellIndex;
    }

    // Move the active cell. We do this before the collapsing shortcut below.
    this.activeCellIndex = index;

    // Make sure the index is valid, according to the rules for setting and clipping the
    // active cell index. This may change the index.
    index = this.activeCellIndex;

    // Collapse the selection if it is only the active cell.
    if (index === anchor) {
      this.deselectAll();
      return;
    }

    let selectionChanged = false;

    if (head < index) {
      if (head < anchor) {
        Private.selectedProperty.set(this.widgets[head], false);
        selectionChanged = true;
      }

      // Toggle everything strictly between head and index except anchor.
      for (i = head + 1; i < index; i++) {
        if (i !== anchor) {
          Private.selectedProperty.set(
            this.widgets[i],
            !Private.selectedProperty.get(this.widgets[i])
          );
          selectionChanged = true;
        }
      }
    } else if (index < head) {
      if (anchor < head) {
        Private.selectedProperty.set(this.widgets[head], false);
        selectionChanged = true;
      }

      // Toggle everything strictly between index and head except anchor.
      for (i = index + 1; i < head; i++) {
        if (i !== anchor) {
          Private.selectedProperty.set(
            this.widgets[i],
            !Private.selectedProperty.get(this.widgets[i])
          );
          selectionChanged = true;
        }
      }
    }

    // Anchor and index should *always* be selected.
    if (!Private.selectedProperty.get(this.widgets[anchor])) {
      selectionChanged = true;
    }
    Private.selectedProperty.set(this.widgets[anchor], true);

    if (!Private.selectedProperty.get(this.widgets[index])) {
      selectionChanged = true;
    }
    Private.selectedProperty.set(this.widgets[index], true);

    if (selectionChanged) {
      this._selectionChanged.emit(void 0);
    }
  }

  /**
   * Get the head and anchor of a contiguous cell selection.
   *
   * The head of a contiguous selection is always the active cell.
   *
   * If there are no cells selected, `{head: null, anchor: null}` is returned.
   *
   * Throws an error if the currently selected cells do not form a contiguous
   * selection.
   */
  getContiguousSelection():
    | { head: number; anchor: number }
    | { head: null; anchor: null } {
    let cells = this.widgets;
    let first = ArrayExt.findFirstIndex(cells, c => this.isSelected(c));

    // Return early if no cells are selected.
    if (first === -1) {
      return { head: null, anchor: null };
    }

    let last = ArrayExt.findLastIndex(
      cells,
      c => this.isSelected(c),
      -1,
      first
    );

    // Check that the selection is contiguous.
    for (let i = first; i <= last; i++) {
      if (!this.isSelected(cells[i])) {
        throw new Error('Selection not contiguous');
      }
    }

    // Check that the active cell is one of the endpoints of the selection.
    let activeIndex = this.activeCellIndex;
    if (first !== activeIndex && last !== activeIndex) {
      throw new Error('Active cell not at endpoint of selection');
    }

    // Determine the head and anchor of the selection.
    if (first === activeIndex) {
      return { head: first, anchor: last };
    } else {
      return { head: last, anchor: first };
    }
  }

  /**
   * Scroll so that the given position is centered.
   *
   * @param position - The vertical position in the notebook widget.
   *
   * @param threshold - An optional threshold for the scroll (0-50, defaults to
   * 25).
   *
   * #### Notes
   * If the position is within the threshold percentage of the widget height,
   * measured from the center of the widget, the scroll position will not be
   * changed. A threshold of 0 means we will always scroll so the position is
   * centered, and a threshold of 50 means scrolling only happens if position is
   * outside the current window.
   */
  scrollToPosition(position: number, threshold = 25): void {
    let node = this.node;
    let ar = node.getBoundingClientRect();
    let delta = position - ar.top - ar.height / 2;
    if (Math.abs(delta) > (ar.height * threshold) / 100) {
      node.scrollTop += delta;
    }
  }

  /**
   * Set URI fragment identifier.
   */
  setFragment(fragment: string): void {
    // Wait all cells are rendered then set fragment and update.
    void Promise.all(this.widgets.map(widget => widget.ready)).then(() => {
      this._fragment = fragment;
      this.update();
    });
  }

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
    if (!this.model) {
      return;
    }

    switch (event.type) {
      case 'contextmenu':
        if (event.eventPhase === Event.CAPTURING_PHASE) {
          this._evtContextMenuCapture(event as PointerEvent);
        }
        break;
      case 'mousedown':
        if (event.eventPhase === Event.CAPTURING_PHASE) {
          this._evtMouseDownCapture(event as MouseEvent);
        } else {
          this._evtMouseDown(event as MouseEvent);
        }
        break;
      case 'mouseup':
        if (event.currentTarget === document) {
          this._evtDocumentMouseup(event as MouseEvent);
        }
        break;
      case 'mousemove':
        if (event.currentTarget === document) {
          this._evtDocumentMousemove(event as MouseEvent);
        }
        break;
      case 'keydown':
        this._ensureFocus(true);
        break;
      case 'dblclick':
        this._evtDblClick(event as MouseEvent);
        break;
      case 'focusin':
        this._evtFocusIn(event as MouseEvent);
        break;
      case 'focusout':
        this._evtFocusOut(event as MouseEvent);
        break;
      case 'lm-dragenter':
        this._evtDragEnter(event as IDragEvent);
        break;
      case 'lm-dragleave':
        this._evtDragLeave(event as IDragEvent);
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
   * Handle `after-attach` messages for the widget.
   */
  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    let node = this.node;
    node.addEventListener('contextmenu', this, true);
    node.addEventListener('mousedown', this, true);
    node.addEventListener('mousedown', this);
    node.addEventListener('keydown', this);
    node.addEventListener('dblclick', this);

    node.addEventListener('focusin', this);
    node.addEventListener('focusout', this);
    // Capture drag events for the notebook widget
    // in order to preempt the drag/drop handlers in the
    // code editor widgets, which can take text data.
    node.addEventListener('lm-dragenter', this, true);
    node.addEventListener('lm-dragleave', this, true);
    node.addEventListener('lm-dragover', this, true);
    node.addEventListener('lm-drop', this, true);
  }

  /**
   * Handle `before-detach` messages for the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    let node = this.node;
    node.removeEventListener('contextmenu', this, true);
    node.removeEventListener('mousedown', this, true);
    node.removeEventListener('mousedown', this);
    node.removeEventListener('keydown', this);
    node.removeEventListener('dblclick', this);
    node.removeEventListener('focusin', this);
    node.removeEventListener('focusout', this);
    node.removeEventListener('lm-dragenter', this, true);
    node.removeEventListener('lm-dragleave', this, true);
    node.removeEventListener('lm-dragover', this, true);
    node.removeEventListener('lm-drop', this, true);
    document.removeEventListener('mousemove', this, true);
    document.removeEventListener('mouseup', this, true);
  }

  /**
   * A message handler invoked on an `'after-show'` message.
   */
  protected onAfterShow(msg: Message): void {
    this._checkCacheOnNextResize = true;
  }

  /**
   * A message handler invoked on a `'resize'` message.
   */
  protected onResize(msg: Widget.ResizeMessage): void {
    if (!this._checkCacheOnNextResize) {
      return super.onResize(msg);
    }
    this._checkCacheOnNextResize = false;
    const cache = this._cellLayoutStateCache;
    const width = parseInt(this.node.style.width, 10);
    if (cache) {
      if (width === cache.width) {
        // Cache identical, do nothing
        return;
      }
    }
    // Update cache
    this._cellLayoutStateCache = { width };

    // Fallback:
    for (let w of this.widgets) {
      if (w instanceof Cell) {
        w.editorWidget.update();
      }
    }
  }

  /**
   * A message handler invoked on an `'before-hide'` message.
   */
  protected onBeforeHide(msg: Message): void {
    // Update cache
    const width = parseInt(this.node.style.width, 10);
    this._cellLayoutStateCache = { width };
  }

  /**
   * Handle `'activate-request'` messages.
   */
  protected onActivateRequest(msg: Message): void {
    this._ensureFocus(true);
  }

  /**
   * Handle `update-request` messages sent to the widget.
   */
  protected onUpdateRequest(msg: Message): void {
    let activeCell = this.activeCell;

    // Set the appropriate classes on the cells.
    if (this.mode === 'edit') {
      this.addClass(EDIT_CLASS);
      this.removeClass(COMMAND_CLASS);
    } else {
      this.addClass(COMMAND_CLASS);
      this.removeClass(EDIT_CLASS);
    }
    if (activeCell) {
      activeCell.addClass(ACTIVE_CLASS);
    }

    let count = 0;
    each(this.widgets, widget => {
      if (widget !== activeCell) {
        widget.removeClass(ACTIVE_CLASS);
      }
      widget.removeClass(OTHER_SELECTED_CLASS);
      if (this.isSelectedOrActive(widget)) {
        widget.addClass(SELECTED_CLASS);
        count++;
      } else {
        widget.removeClass(SELECTED_CLASS);
      }
    });
    if (count > 1) {
      activeCell?.addClass(OTHER_SELECTED_CLASS);
    }
    if (this._fragment) {
      let el;
      try {
        el = this.node.querySelector(this._fragment);
      } catch (error) {
        console.warn('Unable to set URI fragment identifier', error);
      }
      if (el) {
        el.scrollIntoView();
      }
      this._fragment = '';
    }
  }

  /**
   * Handle a cell being inserted.
   */
  protected onCellInserted(index: number, cell: Cell): void {
    if (this.model && this.model.modelDB.isCollaborative) {
      let modelDB = this.model.modelDB;
      void modelDB.connected.then(() => {
        if (!cell.isDisposed) {
          // Setup the selection style for collaborators.
          let localCollaborator = modelDB.collaborators!.localCollaborator;
          cell.editor.uuid = localCollaborator.sessionId;
          cell.editor.selectionStyle = {
            ...CodeEditor.defaultSelectionStyle,
            color: localCollaborator.color
          };
        }
      });
    }
    cell.editor.edgeRequested.connect(this._onEdgeRequest, this);
    // If the insertion happened above, increment the active cell
    // index, otherwise it stays the same.
    this.activeCellIndex =
      index <= this.activeCellIndex
        ? this.activeCellIndex + 1
        : this.activeCellIndex;
  }

  /**
   * Handle a cell being moved.
   */
  protected onCellMoved(fromIndex: number, toIndex: number): void {
    let i = this.activeCellIndex;
    if (fromIndex === i) {
      this.activeCellIndex = toIndex;
    } else if (fromIndex < i && i <= toIndex) {
      this.activeCellIndex--;
    } else if (toIndex <= i && i < fromIndex) {
      this.activeCellIndex++;
    }
  }

  /**
   * Handle a cell being removed.
   */
  protected onCellRemoved(index: number, cell: Cell): void {
    // If the removal happened above, decrement the active
    // cell index, otherwise it stays the same.
    this.activeCellIndex =
      index <= this.activeCellIndex
        ? this.activeCellIndex - 1
        : this.activeCellIndex;
    if (this.isSelected(cell)) {
      this._selectionChanged.emit(void 0);
    }
  }

  /**
   * Handle a new model.
   */
  protected onModelChanged(
    oldValue: INotebookModel,
    newValue: INotebookModel
  ): void {
    super.onModelChanged(oldValue, newValue);

    // Try to set the active cell index to 0.
    // It will be set to `-1` if there is no new model or the model is empty.
    this.activeCellIndex = 0;
  }

  /**
   * Handle edge request signals from cells.
   */
  private _onEdgeRequest(
    editor: CodeEditor.IEditor,
    location: CodeEditor.EdgeLocation
  ): void {
    let prev = this.activeCellIndex;
    if (location === 'top') {
      this.activeCellIndex--;
      // Move the cursor to the first position on the last line.
      if (this.activeCellIndex < prev) {
        let editor = this.activeCell!.editor;
        let lastLine = editor.lineCount - 1;
        editor.setCursorPosition({ line: lastLine, column: 0 });
      }
    } else if (location === 'bottom') {
      this.activeCellIndex++;
      // Move the cursor to the first character.
      if (this.activeCellIndex > prev) {
        let editor = this.activeCell!.editor;
        editor.setCursorPosition({ line: 0, column: 0 });
      }
    }
    this.mode = 'edit';
  }

  /**
   * Ensure that the notebook has proper focus.
   */
  private _ensureFocus(force = false): void {
    let activeCell = this.activeCell;
    if (this.mode === 'edit' && activeCell) {
      if (!activeCell.editor.hasFocus()) {
        activeCell.editor.focus();
      }
    }
    if (force && !this.node.contains(document.activeElement)) {
      this.node.focus();
    }
  }

  /**
   * Find the cell index containing the target html element.
   *
   * #### Notes
   * Returns -1 if the cell is not found.
   */
  private _findCell(node: HTMLElement): number {
    // Trace up the DOM hierarchy to find the root cell node.
    // Then find the corresponding child and select it.
    let n: HTMLElement | null = node;
    while (n && n !== this.node) {
      if (n.classList.contains(NB_CELL_CLASS)) {
        let i = ArrayExt.findFirstIndex(
          this.widgets,
          widget => widget.node === n
        );
        if (i !== -1) {
          return i;
        }
        break;
      }
      n = n.parentElement;
    }
    return -1;
  }

  /**
   * Handle `contextmenu` event.
   */
  private _evtContextMenuCapture(event: PointerEvent): void {
    // Allow the event to propagate un-modified if the user
    // is holding the shift-key (and probably requesting
    // the native context menu).
    if (event.shiftKey) {
      return;
    }
    // `event.target` sometimes gives an orphaned node in Firefox 57, which
    // can have `null` anywhere in its parent tree. If we fail to find a
    // cell using `event.target`, try again using a target reconstructed from
    // the position of the click event.
    let target = event.target as HTMLElement;
    let index = this._findCell(target);
    if (index === -1) {
      target = document.elementFromPoint(
        event.clientX,
        event.clientY
      ) as HTMLElement;
      index = this._findCell(target);
    }
    let widget = this.widgets[index];

    if (widget && widget.editorWidget.node.contains(target)) {
      // Prevent CodeMirror from focusing the editor.
      // TODO: find an editor-agnostic solution.
      event.preventDefault();
    }
  }

  /**
   * Handle `mousedown` event in the capture phase for the widget.
   */
  private _evtMouseDownCapture(event: MouseEvent): void {
    const { button, shiftKey } = event;

    // `event.target` sometimes gives an orphaned node in Firefox 57, which
    // can have `null` anywhere in its parent tree. If we fail to find a
    // cell using `event.target`, try again using a target reconstructed from
    // the position of the click event.
    let target = event.target as HTMLElement;
    let index = this._findCell(target);
    if (index === -1) {
      target = document.elementFromPoint(
        event.clientX,
        event.clientY
      ) as HTMLElement;
      index = this._findCell(target);
    }
    let widget = this.widgets[index];

    // On OS X, the context menu may be triggered with ctrl-left-click. In
    // Firefox, ctrl-left-click gives an event with button 2, but in Chrome,
    // ctrl-left-click gives an event with button 0 with the ctrl modifier.
    if (
      button === 2 &&
      !shiftKey &&
      widget &&
      widget.editorWidget.node.contains(target)
    ) {
      this.mode = 'command';

      // Prevent CodeMirror from focusing the editor.
      // TODO: find an editor-agnostic solution.
      event.preventDefault();
    }
  }

  /**
   * Handle `mousedown` events for the widget.
   */
  private _evtMouseDown(event: MouseEvent): void {
    const { button, shiftKey } = event;

    // We only handle main or secondary button actions.
    if (!(button === 0 || button === 2)) {
      return;
    }

    // Shift right-click gives the browser default behavior.
    if (shiftKey && button === 2) {
      return;
    }

    // Find the target cell.
    let target = event.target as HTMLElement;
    let index = this._findCell(target);
    if (index === -1) {
      // `event.target` sometimes gives an orphaned node in
      // Firefox 57, which can have `null` anywhere in its parent line. If we fail
      // to find a cell using `event.target`, try again using a target
      // reconstructed from the position of the click event.
      target = document.elementFromPoint(
        event.clientX,
        event.clientY
      ) as HTMLElement;
      index = this._findCell(target);
    }
    let widget = this.widgets[index];

    let targetArea: 'input' | 'prompt' | 'cell' | 'notebook';
    if (widget) {
      if (widget.editorWidget.node.contains(target)) {
        targetArea = 'input';
      } else if (widget.promptNode.contains(target)) {
        targetArea = 'prompt';
      } else {
        targetArea = 'cell';
      }
    } else {
      targetArea = 'notebook';
    }

    // Make sure we go to command mode if the click isn't in the cell editor If
    // we do click in the cell editor, the editor handles the focus event to
    // switch to edit mode.
    if (targetArea !== 'input') {
      this.mode = 'command';
    }

    if (targetArea === 'notebook') {
      this.deselectAll();
    } else if (targetArea === 'prompt' || targetArea === 'cell') {
      // We don't want to prevent the default selection behavior
      // if there is currently text selected in an output.
      const hasSelection = (window.getSelection() ?? '').toString() !== '';
      if (button === 0 && shiftKey && !hasSelection) {
        // Prevent browser selecting text in prompt or output
        event.preventDefault();

        // Shift-click - extend selection
        try {
          this.extendContiguousSelectionTo(index);
        } catch (e) {
          console.error(e);
          this.deselectAll();
          return;
        }
        // Enter selecting mode
        this._mouseMode = 'select';
        document.addEventListener('mouseup', this, true);
        document.addEventListener('mousemove', this, true);
      } else if (button === 0 && !shiftKey) {
        // Prepare to start a drag if we are on the drag region. TODO: If there is no drag, we'll deselect on mouseup.
        if (targetArea === 'prompt' && this.isSelectedOrActive(widget)) {
          // Prepare for a drag start
          this._dragData = {
            pressX: event.clientX,
            pressY: event.clientY,
            index: index
          };

          // Enter possible drag mode
          this._mouseMode = 'couldDrag';
          document.addEventListener('mouseup', this, true);
          document.addEventListener('mousemove', this, true);
          event.preventDefault();
        } else {
          this.deselectAll();
          this.activeCellIndex = index;
        }
      } else if (button === 2) {
        if (!this.isSelectedOrActive(widget)) {
          this.deselectAll();
          this.activeCellIndex = index;
        }
        event.preventDefault();
      }
    } else if (targetArea === 'input') {
      if (button === 2 && !this.isSelectedOrActive(widget)) {
        this.deselectAll();
        this.activeCellIndex = index;
      }
    }

    // If we didn't set focus above, make sure we get focus now.
    this._ensureFocus(true);
  }

  /**
   * Handle the `'mouseup'` event on the document.
   */
  private _evtDocumentMouseup(event: MouseEvent): void {
    // Remove the event listeners we put on the document
    document.removeEventListener('mousemove', this, true);
    document.removeEventListener('mouseup', this, true);

    if (this._mouseMode === 'couldDrag') {
      // We didn't end up dragging if we are here, so treat it as a click event.

      // Find the target cell.
      let target = event.target as HTMLElement;
      let index = this._findCell(target);
      if (index === -1) {
        // `event.target` sometimes gives an orphaned node in
        // Firefox 57, which can have `null` anywhere in its parent line. If we fail
        // to find a cell using `event.target`, try again using a target
        // reconstructed from the position of the click event.
        target = document.elementFromPoint(
          event.clientX,
          event.clientY
        ) as HTMLElement;
        index = this._findCell(target);
      }

      this.deselectAll();
      this.activeCellIndex = index;
    }

    this._mouseMode = null;
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Handle the `'mousemove'` event for the widget.
   */
  private _evtDocumentMousemove(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // If in select mode, update the selection
    switch (this._mouseMode) {
      case 'select':
        let target = event.target as HTMLElement;
        let index = this._findCell(target);
        if (index !== -1) {
          this.extendContiguousSelectionTo(index);
        }
        break;
      case 'couldDrag':
        // Check for a drag initialization.
        let data = this._dragData!;
        let dx = Math.abs(event.clientX - data.pressX);
        let dy = Math.abs(event.clientY - data.pressY);
        if (dx >= DRAG_THRESHOLD || dy >= DRAG_THRESHOLD) {
          this._mouseMode = null;
          this._startDrag(data.index, event.clientX, event.clientY);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Handle the `'lm-dragenter'` event for the widget.
   */
  private _evtDragEnter(event: IDragEvent): void {
    if (!event.mimeData.hasData(JUPYTER_CELL_MIME)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    let target = event.target as HTMLElement;
    let index = this._findCell(target);
    if (index === -1) {
      return;
    }

    let widget = (this.layout as PanelLayout).widgets[index];
    widget.node.classList.add(DROP_TARGET_CLASS);
  }

  /**
   * Handle the `'lm-dragleave'` event for the widget.
   */
  private _evtDragLeave(event: IDragEvent): void {
    if (!event.mimeData.hasData(JUPYTER_CELL_MIME)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    let elements = this.node.getElementsByClassName(DROP_TARGET_CLASS);
    if (elements.length) {
      (elements[0] as HTMLElement).classList.remove(DROP_TARGET_CLASS);
    }
  }

  /**
   * Handle the `'lm-dragover'` event for the widget.
   */
  private _evtDragOver(event: IDragEvent): void {
    if (!event.mimeData.hasData(JUPYTER_CELL_MIME)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dropAction = event.proposedAction;
    let elements = this.node.getElementsByClassName(DROP_TARGET_CLASS);
    if (elements.length) {
      (elements[0] as HTMLElement).classList.remove(DROP_TARGET_CLASS);
    }
    let target = event.target as HTMLElement;
    let index = this._findCell(target);
    if (index === -1) {
      return;
    }
    let widget = (this.layout as PanelLayout).widgets[index];
    widget.node.classList.add(DROP_TARGET_CLASS);
  }

  /**
   * Handle the `'lm-drop'` event for the widget.
   */
  private _evtDrop(event: IDragEvent): void {
    if (!event.mimeData.hasData(JUPYTER_CELL_MIME)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.proposedAction === 'none') {
      event.dropAction = 'none';
      return;
    }

    let target = event.target as HTMLElement;
    while (target && target.parentElement) {
      if (target.classList.contains(DROP_TARGET_CLASS)) {
        target.classList.remove(DROP_TARGET_CLASS);
        break;
      }
      target = target.parentElement;
    }

    // Model presence should be checked before calling event handlers
    let model = this.model!;

    let source: Notebook = event.source;
    if (source === this) {
      // Handle the case where we are moving cells within
      // the same notebook.
      event.dropAction = 'move';
      let toMove: Cell[] = event.mimeData.getData('internal:cells');

      // Compute the to/from indices for the move.
      let fromIndex = ArrayExt.firstIndexOf(this.widgets, toMove[0]);
      let toIndex = this._findCell(target);
      // This check is needed for consistency with the view.
      if (toIndex !== -1 && toIndex > fromIndex) {
        toIndex -= 1;
      } else if (toIndex === -1) {
        // If the drop is within the notebook but not on any cell,
        // most often this means it is past the cell areas, so
        // set it to move the cells to the end of the notebook.
        toIndex = this.widgets.length - 1;
      }
      // Don't move if we are within the block of selected cells.
      if (toIndex >= fromIndex && toIndex < fromIndex + toMove.length) {
        return;
      }

      // Move the cells one by one
      model.cells.beginCompoundOperation();
      if (fromIndex < toIndex) {
        each(toMove, cellWidget => {
          model.cells.move(fromIndex, toIndex);
        });
      } else if (fromIndex > toIndex) {
        each(toMove, cellWidget => {
          model.cells.move(fromIndex++, toIndex++);
        });
      }
      model.cells.endCompoundOperation();
    } else {
      // Handle the case where we are copying cells between
      // notebooks.
      event.dropAction = 'copy';
      // Find the target cell and insert the copied cells.
      let index = this._findCell(target);
      if (index === -1) {
        index = this.widgets.length;
      }
      let start = index;
      let values = event.mimeData.getData(JUPYTER_CELL_MIME);
      let factory = model.contentFactory;

      // Insert the copies of the original cells.
      model.cells.beginCompoundOperation();
      each(values, (cell: nbformat.ICell) => {
        let value: ICellModel;
        switch (cell.cell_type) {
          case 'code':
            value = factory.createCodeCell({ cell });
            break;
          case 'markdown':
            value = factory.createMarkdownCell({ cell });
            break;
          default:
            value = factory.createRawCell({ cell });
            break;
        }
        model.cells.insert(index++, value);
      });
      model.cells.endCompoundOperation();
      // Select the inserted cells.
      this.deselectAll();
      this.activeCellIndex = start;
      this.extendContiguousSelectionTo(index - 1);
    }
  }

  /**
   * Start a drag event.
   */
  private _startDrag(index: number, clientX: number, clientY: number): void {
    let cells = this.model!.cells;
    let selected: nbformat.ICell[] = [];
    let toMove: Cell[] = [];

    each(this.widgets, (widget, i) => {
      let cell = cells.get(i);
      if (this.isSelectedOrActive(widget)) {
        widget.addClass(DROP_SOURCE_CLASS);
        selected.push(cell.toJSON());
        toMove.push(widget);
      }
    });
    let activeCell = this.activeCell;
    let dragImage: HTMLElement | null = null;
    let countString: string;
    if (activeCell?.model.type === 'code') {
      let executionCount = (activeCell.model as ICodeCellModel).executionCount;
      countString = ' ';
      if (executionCount) {
        countString = executionCount.toString();
      }
    } else {
      countString = '';
    }

    // Create the drag image.
    dragImage = Private.createDragImage(
      selected.length,
      countString,
      activeCell?.model.value.text.split('\n')[0].slice(0, 26) ?? ''
    );

    // Set up the drag event.
    this._drag = new Drag({
      mimeData: new MimeData(),
      dragImage,
      supportedActions: 'copy-move',
      proposedAction: 'copy',
      source: this
    });
    this._drag.mimeData.setData(JUPYTER_CELL_MIME, selected);
    // Add mimeData for the fully reified cell widgets, for the
    // case where the target is in the same notebook and we
    // can just move the cells.
    this._drag.mimeData.setData('internal:cells', toMove);
    // Add mimeData for the text content of the selected cells,
    // allowing for drag/drop into plain text fields.
    const textContent = toMove.map(cell => cell.model.value.text).join('\n');
    this._drag.mimeData.setData('text/plain', textContent);

    // Remove mousemove and mouseup listeners and start the drag.
    document.removeEventListener('mousemove', this, true);
    document.removeEventListener('mouseup', this, true);
    this._mouseMode = null;
    void this._drag.start(clientX, clientY).then(action => {
      if (this.isDisposed) {
        return;
      }
      this._drag = null;
      each(toMove, widget => {
        widget.removeClass(DROP_SOURCE_CLASS);
      });
    });
  }

  /**
   * Handle `focus` events for the widget.
   */
  private _evtFocusIn(event: MouseEvent): void {
    let target = event.target as HTMLElement;

    let i = this._findCell(target);
    if (i !== -1) {
      let widget = this.widgets[i];
      // If the editor itself does not have focus, ensure command mode.
      if (!widget.editorWidget.node.contains(target)) {
        this.mode = 'command';
      }
      this.activeCellIndex = i;
      // If the editor has focus, ensure edit mode.
      let node = widget.editorWidget.node;
      if (node.contains(target)) {
        this.mode = 'edit';
      }
    } else {
      // No cell has focus, ensure command mode.
      this.mode = 'command';
    }
    if (this.mode === 'command' && target !== this.node) {
      delete this.node.dataset[CODE_RUNNER];
    } else {
      this.node.dataset[CODE_RUNNER] = 'true';
    }
  }

  /**
   * Handle `focusout` events for the notebook.
   */
  private _evtFocusOut(event: MouseEvent): void {
    let relatedTarget = event.relatedTarget as HTMLElement;

    // Bail if the window is losing focus, to preserve edit mode. This test
    // assumes that we explicitly focus things rather than calling blur()
    if (!relatedTarget) {
      return;
    }

    // Bail if the item gaining focus is another cell,
    // and we should not be entering command mode.
    const i = this._findCell(relatedTarget);
    if (i !== -1) {
      const widget = this.widgets[i];
      if (widget.editorWidget.node.contains(relatedTarget)) {
        return;
      }
    }

    // Otherwise enter command mode if not already.
    if (this.mode !== 'command') {
      this.mode = 'command';

      // Switching to command mode currently focuses the notebook element, so
      // refocus the relatedTarget so the focus actually switches as intended.
      if (relatedTarget) {
        relatedTarget.focus();
      }
    }
  }

  /**
   * Handle `dblclick` events for the widget.
   */
  private _evtDblClick(event: MouseEvent): void {
    let model = this.model;
    if (!model) {
      return;
    }
    this.deselectAll();

    // `event.target` sometimes gives an orphaned node in Firefox 57, which
    // can have `null` anywhere in its parent tree. If we fail to find a
    // cell using `event.target`, try again using a target reconstructed from
    // the position of the click event.
    let target = event.target as HTMLElement;
    let i = this._findCell(target);
    if (i === -1) {
      target = document.elementFromPoint(
        event.clientX,
        event.clientY
      ) as HTMLElement;
      i = this._findCell(target);
    }

    if (i === -1) {
      return;
    }
    this.activeCellIndex = i;
    if (model.cells.get(i).type === 'markdown') {
      let widget = this.widgets[i] as MarkdownCell;
      widget.rendered = false;
    } else if (target.localName === 'img') {
      target.classList.toggle(UNCONFINED_CLASS);
    }
  }

  /**
   * Remove selections from inactive cells to avoid
   * spurious cursors.
   */
  private _trimSelections(): void {
    for (let i = 0; i < this.widgets.length; i++) {
      if (i !== this._activeCellIndex) {
        let cell = this.widgets[i];
        cell.model.selections.delete(cell.editor.uuid);
      }
    }
  }

  private _activeCellIndex = -1;
  private _activeCell: Cell | null = null;
  private _mode: NotebookMode = 'command';
  private _drag: Drag | null = null;
  private _fragment = '';
  private _dragData: {
    pressX: number;
    pressY: number;
    index: number;
  } | null = null;
  private _mouseMode: 'select' | 'couldDrag' | null = null;
  private _activeCellChanged = new Signal<this, Cell>(this);
  private _stateChanged = new Signal<this, IChangedArgs<any>>(this);
  private _selectionChanged = new Signal<this, void>(this);

  // Attributes for optimized cell refresh:
  private _cellLayoutStateCache?: { width: number };
  private _checkCacheOnNextResize = false;
}

/**
 * The namespace for the `Notebook` class statics.
 */
export namespace Notebook {
  /**
   * An options object for initializing a notebook widget.
   */
  export interface IOptions extends StaticNotebook.IOptions {}

  /**
   * The content factory for the notebook widget.
   */
  export interface IContentFactory extends StaticNotebook.IContentFactory {}

  /**
   * The default implementation of a notebook content factory..
   *
   * #### Notes
   * Override methods on this class to customize the default notebook factory
   * methods that create notebook content.
   */
  export class ContentFactory extends StaticNotebook.ContentFactory {}

  /**
   * A namespace for the notebook content factory.
   */
  export namespace ContentFactory {
    /**
     * An options object for initializing a notebook content factory.
     */
    export interface IOptions extends StaticNotebook.ContentFactory.IOptions {}
  }

  export const defaultContentFactory: IContentFactory = new ContentFactory();
}

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * An attached property for the selected state of a cell.
   */
  export const selectedProperty = new AttachedProperty<Cell, boolean>({
    name: 'selected',
    create: () => false
  });

  /**
   * A custom panel layout for the notebook.
   */
  export class NotebookPanelLayout extends PanelLayout {
    /**
     * A message handler invoked on an `'update-request'` message.
     *
     * #### Notes
     * This is a reimplementation of the base class method,
     * and is a no-op.
     */
    protected onUpdateRequest(msg: Message): void {
      // This is a no-op.
    }
  }

  /**
   * Create a cell drag image.
   */
  export function createDragImage(
    count: number,
    promptNumber: string,
    cellContent: string
  ): HTMLElement {
    if (count > 1) {
      if (promptNumber !== '') {
        return VirtualDOM.realize(
          h.div(
            h.div(
              { className: DRAG_IMAGE_CLASS },
              h.span(
                { className: CELL_DRAG_PROMPT_CLASS },
                '[' + promptNumber + ']:'
              ),
              h.span({ className: CELL_DRAG_CONTENT_CLASS }, cellContent)
            ),
            h.div({ className: CELL_DRAG_MULTIPLE_BACK }, '')
          )
        );
      } else {
        return VirtualDOM.realize(
          h.div(
            h.div(
              { className: DRAG_IMAGE_CLASS },
              h.span({ className: CELL_DRAG_PROMPT_CLASS }),
              h.span({ className: CELL_DRAG_CONTENT_CLASS }, cellContent)
            ),
            h.div({ className: CELL_DRAG_MULTIPLE_BACK }, '')
          )
        );
      }
    } else {
      if (promptNumber !== '') {
        return VirtualDOM.realize(
          h.div(
            h.div(
              { className: `${DRAG_IMAGE_CLASS} ${SINGLE_DRAG_IMAGE_CLASS}` },
              h.span(
                { className: CELL_DRAG_PROMPT_CLASS },
                '[' + promptNumber + ']:'
              ),
              h.span({ className: CELL_DRAG_CONTENT_CLASS }, cellContent)
            )
          )
        );
      } else {
        return VirtualDOM.realize(
          h.div(
            h.div(
              { className: `${DRAG_IMAGE_CLASS} ${SINGLE_DRAG_IMAGE_CLASS}` },
              h.span({ className: CELL_DRAG_PROMPT_CLASS }),
              h.span({ className: CELL_DRAG_CONTENT_CLASS }, cellContent)
            )
          )
        );
      }
    }
  }

  /**
   * Process the `IOptions` passed to the notebook widget.
   *
   * #### Notes
   * This defaults the content factory to that in the `Notebook` namespace.
   */
  export function processNotebookOptions(options: Notebook.IOptions) {
    if (options.contentFactory) {
      return options;
    } else {
      return {
        rendermime: options.rendermime,
        languagePreference: options.languagePreference,
        contentFactory: Notebook.defaultContentFactory,
        mimeTypeService: options.mimeTypeService
      };
    }
  }
}
