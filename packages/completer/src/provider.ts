// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
import { Session } from '@jupyterlab/services';

import { CodeEditor } from '@jupyterlab/codeeditor';

import { KernelConnector } from './kernelconnector';

import { ContextConnector } from './contextconnector';

import { CompletionHandler } from './handler';

import { Completer } from './widget';

import { ICompletionContext, ICompletionProvider } from './tokens';

/**
 * A context+kernel connector for completion handlers.
 */
export class DefaultProvider implements ICompletionProvider {
  /**
   * Create a new connector for completion requests.
   */
  constructor(options: DefaultProvider.IOptions) {
    this._completer = options.completer;
    this._context = new ContextConnector({ editor: options.editor });
    this._kernel = new KernelConnector({ session: options.session });
  }

  /**
   * Unique identifier of the provider
   */
  readonly id: string = '@jupyterlab/completer:DefaultProvider';

  /**
   * Renderer for provider's completions (optional).
   */
  readonly renderer?: Completer.IRenderer = Completer.defaultRenderer;

  setEditor(editor: CodeEditor.IEditor | null): void {
    this._context = new ContextConnector({ editor });
  }

  setSession(session: Session.ISessionConnection | null): void {
    this._kernel = new KernelConnector({ session });
  }

  /**
   * Fetch completion requests.
   *
   * @param request - the completion request text and details
   * @param context - additional information about context of completion request
   */
  fetch(
    state: Completer.ITextState,
    request: CompletionHandler.IRequest
  ): void {
    // TODO: Merge replies
    this._kernel
      .fetch(request)
      .then(reply => {
        this._completer.addItems(state, reply);
      })
      .catch(e => console.error('No kernel for completion request.'));

    this._context
      .fetch(request)
      .then(reply => {
        this._completer.addItems(state, reply);
      })
      .catch(e => console.error(e));
  }

  /**
   * Is completion provider applicable to specified context?
   *
   * @param request - useful because we may want to disable specific sources in some parts of document (like sql code cell in a Python notebook)
   * @param context
   */
  isApplicable(
    request: CompletionHandler.IRequest,
    context: ICompletionContext
  ): Promise<boolean> {
    // TODO: Check wheter is aplicable
    return Promise.resolve(true);
  }

  /**
   * Given an incomplete (unresolved) completion item, resolve it by adding all missing details,
   * such as lazy-fetched documentation.
   *
   * @param completion - the completion item to resolve
   */
  resolve?(
    completion: CompletionHandler.ICompletionItem
  ): Promise<CompletionHandler.ICompletionItem> {
    // TODO: Request item
    return Promise.resolve(completion);
  }

  private _completer: Completer;
  private _kernel: KernelConnector;
  private _context: ContextConnector;
}

/**
 * A namespace for DefaultProvider.
 */
export namespace DefaultProvider {
  /**
   * The instantiation options for DefaultProvider.
   */
  export interface IOptions {
    editor: CodeEditor.IEditor | null;
    session: Session.ISessionConnection | null;
    completer: Completer;
  }
}
