// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { CodeEditor, IEditorFactoryService } from '@jupyterlab/codeeditor';

import { nullTranslator, ITranslator } from '@jupyterlab/translation';

import { CodeMirrorEditor } from './editor';

/**
 * CodeMirror editor factory.
 */
export class CodeMirrorEditorFactory implements IEditorFactoryService {
  /**
   * Construct an IEditorFactoryService for CodeMirrorEditors.
   */
  constructor(
    defaults: Partial<CodeMirrorEditor.IConfig> = {},
    translator?: ITranslator
  ) {
    this.translator = translator || nullTranslator;
    this.inlineCodeMirrorConfig = {
      ...CodeMirrorEditor.defaultConfig,
      extraKeys: {
        'Cmd-Right': 'goLineRight',
        End: 'goLineRight',
        'Cmd-Left': 'goLineLeft',
        Tab: 'indentMoreOrinsertTab',
        'Shift-Tab': 'indentLess'
      },
      ...defaults
    };
    this.documentCodeMirrorConfig = {
      ...CodeMirrorEditor.defaultConfig,
      extraKeys: {
        Tab: 'indentMoreOrinsertTab',
        'Shift-Tab': 'indentLess',
        'Shift-Enter': () => {
          /* no-op */
        }
      },
      lineNumbers: true,
      scrollPastEnd: true,
      ...defaults
    };
  }

  /**
   * Create a new editor for inline code.
   */
  newInlineEditor = (options: CodeEditor.IOptions) => {
    options.host.dataset.type = 'inline';
    return new CodeMirrorEditor({
      ...options,
      config: { ...this.inlineCodeMirrorConfig, ...(options.config || {}) },
      translator: this.translator
    });
  };

  /**
   * Create a new editor for a full document.
   */
  newDocumentEditor = (options: CodeEditor.IOptions) => {
    options.host.dataset.type = 'document';
    return new CodeMirrorEditor({
      ...options,
      config: { ...this.documentCodeMirrorConfig, ...(options.config || {}) },
      translator: this.translator
    });
  };

  protected translator: ITranslator;
  protected inlineCodeMirrorConfig: Partial<CodeMirrorEditor.IConfig>;
  protected documentCodeMirrorConfig: Partial<CodeMirrorEditor.IConfig>;
}
