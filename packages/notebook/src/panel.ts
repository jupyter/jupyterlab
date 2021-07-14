// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Dialog,
  ISessionContext,
  Printing,
  showDialog
} from '@jupyterlab/apputils';
import { isMarkdownCellModel } from '@jupyterlab/cells';
import { PageConfig } from '@jupyterlab/coreutils';
import { DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import { Kernel, KernelMessage, Session } from '@jupyterlab/services';
import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';
import { each } from '@lumino/algorithm';
import { Token } from '@lumino/coreutils';
import { INotebookModel } from './model';
import { Notebook, StaticNotebook } from './widget';

/**
 * The class name added to notebook panels.
 */
const NOTEBOOK_PANEL_CLASS = 'jp-NotebookPanel';

const NOTEBOOK_PANEL_TOOLBAR_CLASS = 'jp-NotebookPanel-toolbar';

const NOTEBOOK_PANEL_NOTEBOOK_CLASS = 'jp-NotebookPanel-notebook';

/**
 * The class name to add when the document is loaded for the search box.
 */
const SEARCH_DOCUMENT_LOADED_CLASS = 'jp-DocumentSearch-document-loaded';

/**
 * A widget that hosts a notebook toolbar and content area.
 *
 * #### Notes
 * The widget keeps the document metadata in sync with the current
 * kernel on the context.
 */
export class NotebookPanel extends DocumentWidget<Notebook, INotebookModel> {
  /**
   * Construct a new notebook panel.
   */
  constructor(options: DocumentWidget.IOptions<Notebook, INotebookModel>) {
    super(options);
    this.translator = options.translator || nullTranslator;
    this._trans = this.translator.load('jupyterlab');

    // Set up CSS classes
    this.addClass(NOTEBOOK_PANEL_CLASS);
    this.toolbar.addClass(NOTEBOOK_PANEL_TOOLBAR_CLASS);
    this.content.addClass(NOTEBOOK_PANEL_NOTEBOOK_CLASS);

    // Set up things related to the context
    this.content.model = this.context.model;
    this.context.sessionContext.kernelChanged.connect(
      this._onKernelChanged,
      this
    );
    this.context.sessionContext.statusChanged.connect(
      this._onSessionStatusChanged,
      this
    );
    this.content.fullyRendered.connect(this._onFullyRendered, this);
    this.context.saveState.connect(this._onSave, this);
    void this.revealed.then(() => {
      if (this.isDisposed) {
        // this widget has already been disposed, bail
        return;
      }

      // Set the document edit mode on initial open if it looks like a new document.
      if (this.content.widgets.length === 1) {
        const cellModel = this.content.widgets[0].model;
        if (cellModel.type === 'code' && cellModel.value.text === '') {
          this.content.mode = 'edit';
        }
      }
    });
  }

  /**
   * Handle a change to the document registry save state.
   *
   * @param sender The document registry context
   * @param state The document registry save state
   */
  private _onSave(
    sender: DocumentRegistry.Context,
    state: DocumentRegistry.SaveState
  ): void {
    if (state === 'started' && this.model) {
      // Find markdown cells
      const { cells } = this.model;
      each(cells, cell => {
        if (isMarkdownCellModel(cell)) {
          for (const key of cell.attachments.keys) {
            if (!cell.value.text.includes(key)) {
              cell.attachments.remove(key);
            }
          }
        }
      });
    }
  }

  /**
   * The session context used by the panel.
   */
  get sessionContext(): ISessionContext {
    return this.context.sessionContext;
  }

  /**
   * The model for the widget.
   */
  get model(): INotebookModel | null {
    return this.content.model;
  }

  /**
   * Update the options for the current notebook panel.
   *
   * @param config new options to set
   */
  setConfig(config: NotebookPanel.IConfig): void {
    this.content.editorConfig = config.editorConfig;
    this.content.notebookConfig = config.notebookConfig;
    // Update kernel shutdown behavior
    const kernelPreference = this.context.sessionContext.kernelPreference;
    this.context.sessionContext.kernelPreference = {
      ...kernelPreference,
      shutdownOnDispose: config.kernelShutdown
    };
  }

  /**
   * Set URI fragment identifier.
   */
  setFragment(fragment: string) {
    void this.context.ready.then(() => {
      this.content.setFragment(fragment);
    });
  }

  /**
   * Dispose of the resources used by the widget.
   */
  dispose(): void {
    this.content.dispose();
    super.dispose();
  }

  /**
   * Prints the notebook by converting to HTML with nbconvert.
   */
  [Printing.symbol]() {
    return async () => {
      // Save before generating HTML
      if (this.context.model.dirty && !this.context.model.readOnly) {
        await this.context.save();
      }

      await Printing.printURL(
        PageConfig.getNBConvertURL({
          format: 'html',
          download: false,
          path: this.context.path
        })
      );
    };
  }

  /**
   * Handle a fully rendered signal notebook.
   */
  private _onFullyRendered(notebook: Notebook, fullyRendered: boolean): void {
    fullyRendered
      ? this.removeClass(SEARCH_DOCUMENT_LOADED_CLASS)
      : this.addClass(SEARCH_DOCUMENT_LOADED_CLASS);
  }

  /**
   * Handle a change in the kernel by updating the document metadata.
   */
  private _onKernelChanged(
    sender: any,
    args: Session.ISessionConnection.IKernelChangedArgs
  ): void {
    if (!this.model || !args.newValue) {
      return;
    }
    const { newValue } = args;
    void newValue.info.then(info => {
      if (
        this.model &&
        this.context.sessionContext.session?.kernel === newValue
      ) {
        this._updateLanguage(info.language_info);
      }
    });
    void this._updateSpec(newValue);
  }

  private _onSessionStatusChanged(
    sender: ISessionContext,
    status: Kernel.Status
  ) {
    // If the status is autorestarting, and we aren't already in a series of
    // autorestarts, show the dialog.
    if (status === 'autorestarting' && !this._autorestarting) {
      // The kernel died and the server is restarting it. We notify the user so
      // they know why their kernel state is gone.
      void showDialog({
        title: this._trans.__('Kernel Restarting'),
        body: this._trans.__(
          'The kernel for %1 appears to have died. It will restart automatically.',
          this.sessionContext.session?.path
        ),
        buttons: [Dialog.okButton({ label: this._trans.__('Ok') })]
      });
      this._autorestarting = true;
    } else if (status === 'restarting') {
      // Another autorestart attempt will first change the status to
      // restarting, then to autorestarting again, so we don't reset the
      // autorestarting status if the status is 'restarting'.
      /* no-op */
    } else {
      this._autorestarting = false;
    }
  }

  /**
   * Update the kernel language.
   */
  private _updateLanguage(language: KernelMessage.ILanguageInfo): void {
    this.model!.metadata.set('language_info', language);
  }

  /**
   * Update the kernel spec.
   */
  private async _updateSpec(kernel: Kernel.IKernelConnection): Promise<void> {
    const spec = await kernel.spec;
    if (this.isDisposed) {
      return;
    }
    this.model!.metadata.set('kernelspec', {
      name: kernel.name,
      display_name: spec?.display_name,
      language: spec?.language
    });
  }

  translator: ITranslator;
  private _trans: TranslationBundle;
  /**
   * Whether we are currently in a series of autorestarts we have already
   * notified the user about.
   */
  private _autorestarting = false;
}

/**
 * A namespace for `NotebookPanel` statics.
 */
export namespace NotebookPanel {
  /**
   * Notebook config interface for NotebookPanel
   */
  export interface IConfig {
    /**
     * A config object for cell editors
     */
    editorConfig: StaticNotebook.IEditorConfig;
    /**
     * A config object for notebook widget
     */
    notebookConfig: StaticNotebook.INotebookConfig;
    /**
     * Whether to shut down the kernel when closing the panel or not
     */
    kernelShutdown: boolean;
  }

  /**
   * A content factory interface for NotebookPanel.
   */
  export interface IContentFactory extends Notebook.IContentFactory {
    /**
     * Create a new content area for the panel.
     */
    createNotebook(options: Notebook.IOptions): Notebook;
  }

  /**
   * The default implementation of an `IContentFactory`.
   */
  export class ContentFactory
    extends Notebook.ContentFactory
    implements IContentFactory {
    /**
     * Create a new content area for the panel.
     */
    createNotebook(options: Notebook.IOptions): Notebook {
      return new Notebook(options);
    }
  }

  /**
   * Default content factory for the notebook panel.
   */
  export const defaultContentFactory: ContentFactory = new ContentFactory();

  /* tslint:disable */
  /**
   * The notebook renderer token.
   */
  export const IContentFactory = new Token<IContentFactory>(
    '@jupyterlab/notebook:IContentFactory'
  );
  /* tslint:enable */
}
