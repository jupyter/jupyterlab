/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { PanelLayout } from '@lumino/widgets';

import { Widget } from '@lumino/widgets';

import { CodeEditor, CodeEditorWrapper } from '@jupyterlab/codeeditor';

import { CodeMirrorEditorFactory } from '@jupyterlab/codemirror';

import { ICellModel } from './model';

/**
 * The class name added to input area widgets.
 */
const INPUT_AREA_CLASS = 'jp-InputArea';

/**
 * The class name added to the prompt area of cell.
 */
const INPUT_AREA_PROMPT_CLASS = 'jp-InputArea-prompt';

/**
 * The class name added to OutputPrompt.
 */
const INPUT_PROMPT_CLASS = 'jp-InputPrompt';

/**
 * The class name added to the editor area of the cell.
 */
const INPUT_AREA_EDITOR_CLASS = 'jp-InputArea-editor';

/** ****************************************************************************
 * InputArea
 ******************************************************************************/

/**
 * An input area widget, which hosts a prompt and an editor widget.
 */
export class InputArea extends Widget {
  /**
   * Construct an input area widget.
   */
  constructor(options: InputArea.IOptions) {
    super();
    this.addClass(INPUT_AREA_CLASS);
    const model = (this.model = options.model);

    // Prompt
    const prompt = (this._prompt = new InputPrompt());
    prompt.addClass(INPUT_AREA_PROMPT_CLASS);

    // Editor
    this._editorFactory =
      options.editorFactory || InputArea.defaultEditorFactory;
    const editorOptions = {
      model,
      factory: this.editorFactory,
      updateOnShow: options.updateOnShow
    };
    const editor = (this._editor = new CodeEditorWrapper(editorOptions));
    editor.addClass(INPUT_AREA_EDITOR_CLASS);

    const layout = (this.layout = new PanelLayout());
    layout.addWidget(prompt);
    layout.addWidget(editor);
  }

  /**
   * The model used by the widget.
   */
  readonly model: ICellModel;

  get editorFactory(): CodeEditor.Factory {
    return this._editorFactory;
  }

  /**
   * Get the CodeEditorWrapper used by the cell.
   */
  get editorWidget(): CodeEditorWrapper {
    return this._editor;
  }

  /**
   * Get the CodeEditor used by the cell.
   */
  get editor(): CodeEditor.IEditor {
    return this._editor.editor;
  }

  /**
   * Get the prompt node used by the cell.
   */
  get promptNode(): HTMLElement {
    return this._prompt.node;
  }

  /**
   * Render an input instead of the text editor.
   */
  renderInput(widget: Widget): void {
    const layout = this.layout as PanelLayout;
    if (this._rendered) {
      this._rendered.parent = null;
    }
    this._editor.hide();
    this._rendered = widget;
    layout.addWidget(widget);
  }

  /**
   * Show the text editor.
   */
  showEditor(): void {
    if (this._rendered) {
      this._rendered.parent = null;
    }
    this._editor.show();
  }

  /**
   * Set the prompt of the input area.
   */
  setPrompt(value: string): void {
    this._prompt.executionCount = value;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose() {
    // Do nothing if already disposed.
    if (this.isDisposed) {
      return;
    }
    this._prompt = null!;
    this._editor = null!;
    this._rendered = null!;
    super.dispose();
  }

  private _prompt: IInputPrompt;
  private _editor: CodeEditorWrapper;
  private _rendered: Widget;
  private _editorFactory: CodeEditor.Factory;
}

/**
 * A namespace for `InputArea` statics.
 */
export namespace InputArea {
  /**
   * The options used to create an `InputArea`.
   */
  export interface IOptions {
    /**
     * The model used by the widget.
     */
    model: ICellModel;

    /**
     * The editor factory used to create editor instances.
     */
    editorFactory?: CodeEditor.Factory;

    /**
     * Whether to send an update request to the editor when it is shown.
     */
    updateOnShow?: boolean;
  }

  /**
   * A function to create the default CodeMirror editor factory.
   */
  function _createDefaultEditorFactory(): CodeEditor.Factory {
    const editorServices = new CodeMirrorEditorFactory();
    return editorServices.newInlineEditor;
  }

  /**
   * The default editor factory singleton based on CodeMirror.
   */
  export const defaultEditorFactory: CodeEditor.Factory = _createDefaultEditorFactory();
}

/** ****************************************************************************
 * InputPrompt
 ******************************************************************************/

/**
 * The interface for the input prompt.
 */
export interface IInputPrompt extends Widget {
  /**
   * The execution count of the prompt.
   */
  executionCount: string | null;
}

/**
 * The default input prompt implementation.
 */
export class InputPrompt extends Widget implements IInputPrompt {
  /*
   * Create an output prompt widget.
   */
  constructor() {
    super();
    this.addClass(INPUT_PROMPT_CLASS);
  }

  /**
   * The execution count for the prompt.
   */
  get executionCount(): string | null {
    return this._executionCount;
  }
  set executionCount(value: string | null) {
    this._executionCount = value;
    if (value === null) {
      this.node.textContent = ' ';
    } else {
      this.node.textContent = `[${value || ' '}]:`;
    }
  }

  private _executionCount: string | null = null;
}
