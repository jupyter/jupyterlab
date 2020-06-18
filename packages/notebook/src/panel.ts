// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { isMarkdownCellModel } from '@jupyterlab/cells';

import { Kernel, KernelMessage, Session } from '@jupyterlab/services';

import { each } from '@lumino/algorithm';
import {
  ISessionContext,
  Printing,
  showDialog,
  Dialog
} from '@jupyterlab/apputils';

import { DocumentWidget, DocumentRegistry } from '@jupyterlab/docregistry';

import { INotebookModel } from './model';

import { Notebook, StaticNotebook } from './widget';
import { PageConfig } from '@jupyterlab/coreutils';

/**
 * The class name added to notebook panels.
 */
const NOTEBOOK_PANEL_CLASS = 'jp-NotebookPanel';

const NOTEBOOK_PANEL_TOOLBAR_CLASS = 'jp-NotebookPanel-toolbar';

const NOTEBOOK_PANEL_NOTEBOOK_CLASS = 'jp-NotebookPanel-notebook';

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

  _onSave(sender: DocumentRegistry.Context, state: DocumentRegistry.SaveState) {
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
   * The notebook used by the widget.
   */
  readonly content: Notebook;

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
        title: 'Kernel Restarting',
        body: `The kernel for ${this.sessionContext.session?.path} appears to have died. It will restart automatically.`,
        buttons: [Dialog.okButton()]
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
}
