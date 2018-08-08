// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { CodeEditor } from '@jupyterlab/codeeditor';

import { CompletionHandler } from './handler';

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
  const completionList = tokenList.filter(t => t.type).map(t => t.value);
  // Remove duplicate completsions from the list
  const matches = Array.from(new Set<string>(completionList));

  return {
    start: token.offset,
    end: token.offset + token.value.length,
    matches,
    metadata: {}
  };
}

/**
 * Get a list of tokens that match the completion request,
 * but are not identical to the completion request.
 */
export function getCompletionTokens(
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
