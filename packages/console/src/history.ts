// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ISessionContext } from '@jupyterlab/apputils';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { KernelMessage } from '@jupyterlab/services';
import { IDisposable } from '@lumino/disposable';
import { Signal } from '@lumino/signaling';

/**
 * The definition of a console history manager object.
 */
export interface IConsoleHistory extends IDisposable {
  /**
   * The session context used by the foreign handler.
   */
  readonly sessionContext: ISessionContext | null;

  /**
   * The current editor used by the history widget.
   */
  editor: CodeEditor.IEditor | null;

  /**
   * The placeholder text that a history session began with.
   */
  readonly placeholder: string;

  /**
   * Get the previous item in the console history.
   *
   * @param placeholder - The placeholder string that gets temporarily added
   * to the history only for the duration of one history session. If multiple
   * placeholders are sent within a session, only the first one is accepted.
   *
   * @returns A Promise for console command text or `undefined` if unavailable.
   */
  back(placeholder: string): Promise<string>;

  /**
   * Get the next item in the console history.
   *
   * @param placeholder - The placeholder string that gets temporarily added
   * to the history only for the duration of one history session. If multiple
   * placeholders are sent within a session, only the first one is accepted.
   *
   * @returns A Promise for console command text or `undefined` if unavailable.
   */
  forward(placeholder: string): Promise<string>;

  /**
   * Add a new item to the bottom of history.
   *
   * @param item The item being added to the bottom of history.
   *
   * #### Notes
   * If the item being added is undefined or empty, it is ignored. If the item
   * being added is the same as the last item in history, it is ignored as well
   * so that the console's history will consist of no contiguous repetitions.
   */
  push(item: string): void;

  /**
   * Reset the history navigation state, i.e., start a new history session.
   */
  reset(): void;
}

/**
 * A console history manager object.
 */
export class ConsoleHistory implements IConsoleHistory {
  /**
   * Construct a new console history object.
   */
  constructor(options: ConsoleHistory.IOptions) {
    const { sessionContext } = options;
    if (sessionContext) {
      this.sessionContext = sessionContext;
      void this._handleKernel();
      this.sessionContext.kernelChanged.connect(this._handleKernel, this);
    }
  }

  /**
   * The client session used by the foreign handler.
   */
  readonly sessionContext: ISessionContext | null;

  /**
   * The current editor used by the history manager.
   */
  get editor(): CodeEditor.IEditor | null {
    return this._editor;
  }
  set editor(value: CodeEditor.IEditor | null) {
    if (this._editor === value) {
      return;
    }

    const prev = this._editor;
    if (prev) {
      prev.edgeRequested.disconnect(this.onEdgeRequest, this);
      prev.model.value.changed.disconnect(this.onTextChange, this);
    }

    this._editor = value;

    if (value) {
      value.edgeRequested.connect(this.onEdgeRequest, this);
      value.model.value.changed.connect(this.onTextChange, this);
    }
  }

  /**
   * The placeholder text that a history session began with.
   */
  get placeholder(): string {
    return this._placeholder;
  }

  /**
   * Get whether the console history manager is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the console history manager.
   */
  dispose(): void {
    this._isDisposed = true;
    this._history.length = 0;
    Signal.clearData(this);
  }

  /**
   * Get the previous item in the console history.
   *
   * @param placeholder - The placeholder string that gets temporarily added
   * to the history only for the duration of one history session. If multiple
   * placeholders are sent within a session, only the first one is accepted.
   *
   * @returns A Promise for console command text or `undefined` if unavailable.
   */
  back(placeholder: string): Promise<string> {
    if (!this._hasSession) {
      this._hasSession = true;
      this._placeholder = placeholder;
      // Filter the history with the placeholder string.
      this.setFilter(placeholder);
      this._cursor = this._filtered.length - 1;
    }

    --this._cursor;
    this._cursor = Math.max(0, this._cursor);
    const content = this._filtered[this._cursor];
    return Promise.resolve(content);
  }

  /**
   * Get the next item in the console history.
   *
   * @param placeholder - The placeholder string that gets temporarily added
   * to the history only for the duration of one history session. If multiple
   * placeholders are sent within a session, only the first one is accepted.
   *
   * @returns A Promise for console command text or `undefined` if unavailable.
   */
  forward(placeholder: string): Promise<string> {
    if (!this._hasSession) {
      this._hasSession = true;
      this._placeholder = placeholder;
      // Filter the history with the placeholder string.
      this.setFilter(placeholder);
      this._cursor = this._filtered.length;
    }

    ++this._cursor;
    this._cursor = Math.min(this._filtered.length - 1, this._cursor);
    const content = this._filtered[this._cursor];
    return Promise.resolve(content);
  }

  /**
   * Add a new item to the bottom of history.
   *
   * @param item The item being added to the bottom of history.
   *
   * #### Notes
   * If the item being added is undefined or empty, it is ignored. If the item
   * being added is the same as the last item in history, it is ignored as well
   * so that the console's history will consist of no contiguous repetitions.
   */
  push(item: string): void {
    if (item && item !== this._history[this._history.length - 1]) {
      this._history.push(item);
    }
    this.reset();
  }

  /**
   * Reset the history navigation state, i.e., start a new history session.
   */
  reset(): void {
    this._cursor = this._history.length;
    this._hasSession = false;
    this._placeholder = '';
  }

  /**
   * Populate the history collection on history reply from a kernel.
   *
   * @param value The kernel message history reply.
   *
   * #### Notes
   * History entries have the shape:
   * [session: number, line: number, input: string]
   * Contiguous duplicates are stripped out of the API response.
   */
  protected onHistory(value: KernelMessage.IHistoryReplyMsg): void {
    this._history.length = 0;
    let last = '';
    let current = '';
    if (value.content.status === 'ok') {
      for (let i = 0; i < value.content.history.length; i++) {
        current = (value.content.history[i] as string[])[2];
        if (current !== last) {
          this._history.push((last = current));
        }
      }
    }
    // Reset the history navigation cursor back to the bottom.
    this._cursor = this._history.length;
  }

  /**
   * Handle a text change signal from the editor.
   */
  protected onTextChange(): void {
    if (this._setByHistory) {
      this._setByHistory = false;
      return;
    }
    this.reset();
  }

  /**
   * Handle an edge requested signal.
   */
  protected onEdgeRequest(
    editor: CodeEditor.IEditor,
    location: CodeEditor.EdgeLocation
  ): void {
    const model = editor.model;
    const source = model.value.text;

    if (location === 'top' || location === 'topLine') {
      void this.back(source).then(value => {
        if (this.isDisposed || !value) {
          return;
        }
        if (model.value.text === value) {
          return;
        }
        this._setByHistory = true;
        model.value.text = value;
        let columnPos = 0;
        columnPos = value.indexOf('\n');
        if (columnPos < 0) {
          columnPos = value.length;
        }
        editor.setCursorPosition({ line: 0, column: columnPos });
      });
    } else {
      void this.forward(source).then(value => {
        if (this.isDisposed) {
          return;
        }
        const text = value || this.placeholder;
        if (model.value.text === text) {
          return;
        }
        this._setByHistory = true;
        model.value.text = text;
        const pos = editor.getPositionAt(text.length);
        if (pos) {
          editor.setCursorPosition(pos);
        }
      });
    }
  }

  /**
   * Handle the current kernel changing.
   */
  private async _handleKernel(): Promise<void> {
    const kernel = this.sessionContext?.session?.kernel;
    if (!kernel) {
      this._history.length = 0;
      return;
    }

    return kernel.requestHistory(Private.initialRequest).then(v => {
      this.onHistory(v);
    });
  }

  /**
   * Set the filter data.
   *
   * @param filterStr - The string to use when filtering the data.
   */
  protected setFilter(filterStr: string = ''): void {
    // Apply the new filter and remove contiguous duplicates.
    this._filtered.length = 0;

    let last = '';
    let current = '';

    for (let i = 0; i < this._history.length; i++) {
      current = this._history[i];
      if (
        current !== last &&
        filterStr === current.slice(0, filterStr.length)
      ) {
        this._filtered.push((last = current));
      }
    }

    this._filtered.push(filterStr);
  }

  private _cursor = 0;
  private _hasSession = false;
  private _history: string[] = [];
  private _placeholder: string = '';
  private _setByHistory = false;
  private _isDisposed = false;
  private _editor: CodeEditor.IEditor | null = null;
  private _filtered: string[] = [];
}

/**
 * A namespace for ConsoleHistory statics.
 */
export namespace ConsoleHistory {
  /**
   * The initialization options for a console history object.
   */
  export interface IOptions {
    /**
     * The client session used by the foreign handler.
     */
    sessionContext?: ISessionContext;
  }
}

/**
 * A namespace for private data.
 */
namespace Private {
  export const initialRequest: KernelMessage.IHistoryRequestMsg['content'] = {
    output: false,
    raw: true,
    hist_access_type: 'tail',
    n: 500
  };
}
