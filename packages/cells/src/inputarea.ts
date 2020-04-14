/*-----------------------------------------------------------------------------
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

/******************************************************************************
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
    this.node.setAttribute('role', 'gridcell');
    let model = (this.model = options.model);
    let contentFactory = (this.contentFactory =
      options.contentFactory || InputArea.defaultContentFactory);

    // Prompt
    let prompt = (this._prompt = contentFactory.createInputPrompt());
    prompt.addClass(INPUT_AREA_PROMPT_CLASS);

    // Editor
    let editorOptions = {
      model,
      factory: contentFactory.editorFactory,
      updateOnShow: options.updateOnShow
    };
    let editor = (this._editor = new CodeEditorWrapper(editorOptions));
    editor.addClass(INPUT_AREA_EDITOR_CLASS);
    editor.node.setAttribute('role', 'gridcell');

    let layout = (this.layout = new PanelLayout());
    layout.addWidget(prompt);
    layout.addWidget(editor);
  }

  /**
   * The model used by the widget.
   */
  readonly model: ICellModel;

  /**
   * The content factory used by the widget.
   */
  readonly contentFactory: InputArea.IContentFactory;

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
    let layout = this.layout as PanelLayout;
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
     * The content factory used by the widget to create children.
     *
     * Defaults to one that uses CodeMirror.
     */
    contentFactory?: IContentFactory;

    /**
     * Whether to send an update request to the editor when it is shown.
     */
    updateOnShow?: boolean;
  }

  /**
   * An input area widget content factory.
   *
   * The content factory is used to create children in a way
   * that can be customized.
   */
  export interface IContentFactory {
    /**
     * The editor factory we need to include in `CodeEditorWratter.IOptions`.
     *
     * This is a separate readonly attribute rather than a factory method as we need
     * to pass it around.
     */
    readonly editorFactory: CodeEditor.Factory;

    /**
     * Create an input prompt.
     */
    createInputPrompt(): IInputPrompt;
  }

  /**
   * Default implementation of `IContentFactory`.
   *
   * This defaults to using an `editorFactory` based on CodeMirror.
   */
  export class ContentFactory implements IContentFactory {
    /**
     * Construct a `ContentFactory`.
     */
    constructor(options: ContentFactory.IOptions = {}) {
      this._editor = options.editorFactory || defaultEditorFactory;
    }

    /**
     * Return the `CodeEditor.Factory` being used.
     */
    get editorFactory(): CodeEditor.Factory {
      return this._editor;
    }

    /**
     * Create an input prompt.
     */
    createInputPrompt(): IInputPrompt {
      return new InputPrompt();
    }

    private _editor: CodeEditor.Factory;
  }

  /**
   * A namespace for the input area content factory.
   */
  export namespace ContentFactory {
    /**
     * Options for the content factory.
     */
    export interface IOptions {
      /**
       * The editor factory used by the content factory.
       *
       * If this is not passed, a default CodeMirror editor factory
       * will be used.
       */
      editorFactory?: CodeEditor.Factory;
    }
  }

  /**
   * A function to create the default CodeMirror editor factory.
   */
  function _createDefaultEditorFactory(): CodeEditor.Factory {
    let editorServices = new CodeMirrorEditorFactory();
    return editorServices.newInlineEditor;
  }

  /**
   * The default editor factory singleton based on CodeMirror.
   */
  export const defaultEditorFactory: CodeEditor.Factory = _createDefaultEditorFactory();

  /**
   * The default `ContentFactory` instance.
   */
  export const defaultContentFactory = new ContentFactory({});
}

/******************************************************************************
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
    this.node.setAttribute('role', 'gridcell');
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
