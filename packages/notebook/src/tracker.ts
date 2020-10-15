// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { WidgetTracker } from '@jupyterlab/apputils';
import { Cell } from '@jupyterlab/cells';

import { ISignal, Signal } from '@lumino/signaling';

import { INotebookTracker } from './tokens';
import { NotebookPanel } from './panel';
import { Notebook } from './widget';

export class NotebookTracker
  extends WidgetTracker<NotebookPanel>
  implements INotebookTracker {
  /**
   * The currently focused cell.
   *
   * #### Notes
   * This is a read-only property. If there is no cell with the focus, then this
   * value is `null`.
   */
  get activeCell(): Cell | null {
    const widget = this.currentWidget;
    if (!widget) {
      return null;
    }
    return widget.content.activeCell || null;
  }

  /**
   * A signal emitted when the current active cell changes.
   *
   * #### Notes
   * If there is no cell with the focus, then `null` will be emitted.
   */
  get activeCellChanged(): ISignal<this, Cell | null> {
    return this._activeCellChanged;
  }

  /**
   * A signal emitted when a new cell is created.
   */
  get newCellCreated(): ISignal<this, Cell | null> {
    return this._newCellCreated;
  }

  /**
   * A signal emitted when the selection state changes.
   */
  get selectionChanged(): ISignal<this, void> {
    return this._selectionChanged;
  }

  /**
   * Add a new notebook panel to the tracker.
   *
   * @param panel - The notebook panel being added.
   */
  add(panel: NotebookPanel): Promise<void> {
    const promise = super.add(panel);
    panel.content.activeCellChanged.connect(this._onActiveCellChanged, this);
    panel.content.newCellCreated.connect(this._onNewCellCreated, this);
    panel.content.selectionChanged.connect(this._onSelectionChanged, this);
    return promise;
  }

  /**
   * Dispose of the resources held by the tracker.
   */
  dispose(): void {
    this._activeCell = null;
    super.dispose();
  }

  /**
   * Handle the current change event.
   */
  protected onCurrentChanged(widget: NotebookPanel): void {
    // Store an internal reference to active cell to prevent false positives.
    const activeCell = this.activeCell;
    if (activeCell && activeCell === this._activeCell) {
      return;
    }
    this._activeCell = activeCell;

    if (!widget) {
      return;
    }

    // Since the notebook has changed, immediately signal an active cell change
    this._activeCellChanged.emit(widget.content.activeCell || null);
  }

  private _onActiveCellChanged(sender: Notebook, cell: Cell): void {
    // Check if the active cell change happened for the current notebook.
    if (this.currentWidget && this.currentWidget.content === sender) {
      this._activeCell = cell || null;
      this._activeCellChanged.emit(this._activeCell);
    }
  }

  private _onNewCellCreated(sender: Notebook, cell: Cell): void {
    // Check if the new cell creation change happened for the current notebook.
    if (this.currentWidget && this.currentWidget.content === sender) {
      this._activeCell = cell || null;
      this._newCellCreated.emit(cell);
    }
  }

  private _onSelectionChanged(sender: Notebook): void {
    // Check if the selection change happened for the current notebook.
    if (this.currentWidget && this.currentWidget.content === sender) {
      this._selectionChanged.emit(void 0);
    }
  }

  private _activeCell: Cell | null = null;
  private _activeCellChanged = new Signal<this, Cell | null>(this);
  private _newCellCreated = new Signal<this, Cell | null>(this);
  private _selectionChanged = new Signal<this, void>(this);
}
