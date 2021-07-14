// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IDocumentWidget } from '@jupyterlab/docregistry';
import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';
import { TableOfContentsRegistry as Registry } from '../../registry';
import { IHeading } from '../../utils/headings';
import { render } from './render';

/**
 * Generates a table of contents.
 *
 * @private
 * @param editor - editor widget
 * @returns a list of headings
 */
function generate(editor: IDocumentWidget<FileEditor>): IHeading[] {
  // Split the text into lines:
  let lines = editor.content.model.value.text.split('\n') as Array<any>;

  // Iterate over the lines to get the heading level and text for each line:
  let headings: IHeading[] = [];
  let processingImports = false;
  let indentationStack: number[] = [];
  let current_indentation_level = 1;
  for (let i = 0; i < lines.length; i++) {
    let raw_line = lines[i];
    let line = raw_line.trim();
    if (line.indexOf('def ') === 0) {
      processingImports = false;
      current_indentation_level = updateIndentationLevel(
        current_indentation_level,
        raw_line,
        indentationStack
      );
      headings.push({
        text: line.slice(0, -1),
        level: current_indentation_level,
        onClick: onClick(i)
      });
    } else if (line.indexOf('class ') === 0) {
      processingImports = false;
      current_indentation_level = updateIndentationLevel(
        current_indentation_level,
        raw_line,
        indentationStack
      );
      headings.push({
        text: line.slice(0, -1),
        level: current_indentation_level,
        onClick: onClick(i)
      });
    } else if (line.indexOf('import ') == 0 && !processingImports) {
      processingImports = true;
      current_indentation_level = updateIndentationLevel(
        current_indentation_level,
        raw_line,
        indentationStack
      );
      headings.push({
        text: line,
        level: current_indentation_level,
        onClick: onClick(i)
      });
    }
  }
  return headings;

  /**
   * Returns a "click" handler.
   *
   * @private
   * @param line - line number
   * @returns click handler
   */
  function onClick(line: number) {
    return () => {
      editor.content.editor.setCursorPosition({
        line: line,
        column: 0
      });
    };
  }

  /**
   * Update indentation level of toc entry based on indentation of this line of code and previous toc entries
   *
   * @private
   * @param currentLevel - current indentation level
   * @param line - line of code including leading whitespace
   * @param indentationStack - stack of amount of whitespace for parent indentation levels
   * @returns new indentation level
   */
  function updateIndentationLevel(
    currentLevel: number,
    line: string,
    indentationStack: number[]
  ): number {
    let newIndentSpaces = line.search(/\S/);
    let indentationChange = 0;
    if (indentationStack.length == 0) {
      indentationStack.push(newIndentSpaces);
      indentationChange = 0;
    } else {
      let prevIndent = indentationStack[indentationStack.length - 1];
      if (prevIndent == newIndentSpaces) {
        indentationChange = 0;
      } else if (prevIndent < newIndentSpaces) {
        indentationStack.push(newIndentSpaces);
        indentationChange = 1;
      } else {
        indentationChange = 0;
        while (indentationStack.length > 0) {
          prevIndent = indentationStack[indentationStack.length - 1];
          if (prevIndent > newIndentSpaces) {
            --indentationChange;
            indentationStack.pop();
          } else {
            if (prevIndent < newIndentSpaces) {
              indentationStack.push(newIndentSpaces);
            }
            break;
          }
        }
      }
    }
    return Math.max(1, currentLevel + indentationChange);
  }
}

/**
 * Returns a boolean indicating whether this ToC generator is enabled.
 *
 * @private
 * @param editor - editor widget
 * @returns boolean indicating whether this ToC generator is enabled
 */
function isEnabled(editor: IDocumentWidget<FileEditor>) {
  let mime = editor.content.model.mimeType;
  return mime === 'application/x-python-code' || mime === 'text/x-python';
}

/**
 * Returns a ToC generator for Python files.
 *
 * @private
 * @param tracker - file editor tracker
 * @returns ToC generator capable of parsing Python files
 */
function createPythonGenerator(
  tracker: IEditorTracker
): Registry.IGenerator<IDocumentWidget<FileEditor>> {
  return {
    tracker,
    isEnabled: isEnabled,
    itemRenderer: render,
    generate: generate
  };
}

/**
 * Exports.
 */
export { createPythonGenerator };
