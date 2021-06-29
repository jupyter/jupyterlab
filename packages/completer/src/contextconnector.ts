// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { CodeEditor } from '@jupyterlab/codeeditor';
import { DataConnector } from '@jupyterlab/statedb';
import { CompletionHandler } from './handler';

/**
 * A context connector for completion handlers.
 */
export class ContextConnector extends DataConnector<
  CompletionHandler.IReply,
  void,
  CompletionHandler.IRequest
> {
  /**
   * Create a new context connector for completion requests.
   *
   * @param options - The instatiation options for the context connector.
   */
  constructor(options: ContextConnector.IOptions) {
    super();
    this._editor = options.editor;
  }

  /**
   * Fetch completion requests.
   *
   * @param request - The completion request text and details.
   */
  fetch(
    request: CompletionHandler.IRequest
  ): Promise<CompletionHandler.IReply> {
    if (!this._editor) {
      return Promise.reject('No editor');
    }
    return new Promise<CompletionHandler.IReply>(resolve => {
      resolve(Private.contextHint(this._editor!));
    });
  }

  private _editor: CodeEditor.IEditor | null;
}

/**
 * A namespace for context connector statics.
 */
export namespace ContextConnector {
  /**
   * The instantiation options for cell completion handlers.
   */
  export interface IOptions {
    /**
     * The session used by the context connector.
     */
    editor: CodeEditor.IEditor | null;
  }
}

/**
 * A namespace for Private functionality.
 */
namespace Private {
  /**
   * Get a list of completion hints from a tokenization
   * of the editor.
   */
  export function contextHint(
    editor: CodeEditor.IEditor
  ): CompletionHandler.IReply {
    // Find the token at the cursor
    const cursor = editor.getCursorPosition();
    const token = editor.getTokenForPosition(cursor);

    // Get the list of matching tokens.
    const tokenList = getCompletionTokens(token, editor);

    // Only choose the ones that have a non-empty type
    // field, which are likely to be of interest.
    let completionList = tokenList.filter(t => t.type);

    // Extract value and remove duplicate completions
    let completionValuesSet = new Set<string>(completionList.map(t => t.value));
    const matches = Array.from(completionValuesSet);

    // Create value-type mappings
    const types = completionList.map(t => ({ text: t.value, type: t.type }));

    return {
      start: token.offset,
      end: token.offset + token.value.length,
      matches,
      metadata: {
        _jupyter_types_experimental: types
      }
    };
  }

  /**
   * Get a list of tokens that match the completion request,
   * but are not identical to the completion request.
   */
  function getCompletionTokens(
    token: CodeEditor.IToken,
    editor: CodeEditor.IEditor
  ): CodeEditor.IToken[] {
    const candidates = editor.getTokens();
    // Only get the tokens that have a common start, but
    // are not identical.
    return candidates.filter(
      t => t.value.indexOf(token.value) === 0 && t.value !== token.value
    );
  }
}
