// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Dialog } from '@jupyterlab/apputils';
import { PathExt } from '@jupyterlab/coreutils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { Contents } from '@jupyterlab/services';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { toArray } from '@lumino/algorithm';
import { PanelLayout, Widget } from '@lumino/widgets';
import { FileBrowser } from './browser';
import { FilterFileBrowserModel } from './model';
import { IFileBrowserFactory } from './tokens';

/**
 * The class name added to open file dialog
 */
const OPEN_DIALOG_CLASS = 'jp-Open-Dialog';

/**
 * Namespace for file dialog
 */
export namespace FileDialog {
  /**
   * Options for the open directory dialog
   */
  export interface IDirectoryOptions
    extends Partial<
      Pick<
        Dialog.IOptions<Promise<Contents.IModel[]>>,
        Exclude<
          keyof Dialog.IOptions<Promise<Contents.IModel[]>>,
          'body' | 'buttons' | 'defaultButton'
        >
      >
    > {
    /**
     * Document manager
     */
    manager: IDocumentManager;

    /**
     * The application language translator.
     */
    translator?: ITranslator;
  }

  /**
   * Options for the open file dialog
   */
  export interface IFileOptions extends IDirectoryOptions {
    /**
     * Filter function on file browser item model
     */
    filter?: (value: Contents.IModel) => boolean;

    /**
     * The application language translator.
     */
    translator?: ITranslator;
  }

  /**
   * Create and show a open files dialog.
   *
   * Note: if nothing is selected when `getValue` will return the browser
   * model current path.
   *
   * @param options - The dialog setup options.
   *
   * @returns A promise that resolves with whether the dialog was accepted.
   */
  export function getOpenFiles(
    options: IFileOptions
  ): Promise<Dialog.IResult<Contents.IModel[]>> {
    const translator = options.translator || nullTranslator;
    const trans = translator.load('jupyterlab');
    const dialogOptions: Partial<Dialog.IOptions<Contents.IModel[]>> = {
      title: options.title,
      buttons: [
        Dialog.cancelButton({ label: trans.__('Cancel') }),
        Dialog.okButton({
          label: trans.__('Select')
        })
      ],
      focusNodeSelector: options.focusNodeSelector,
      host: options.host,
      renderer: options.renderer,
      body: new OpenDialog(options.manager, options.filter, translator)
    };
    const dialog = new Dialog(dialogOptions);
    return dialog.launch();
  }

  /**
   * Create and show a open directory dialog.
   *
   * Note: if nothing is selected when `getValue` will return the browser
   * model current path.
   *
   * @param options - The dialog setup options.
   *
   * @returns A promise that resolves with whether the dialog was accepted.
   */
  export function getExistingDirectory(
    options: IDirectoryOptions
  ): Promise<Dialog.IResult<Contents.IModel[]>> {
    return getOpenFiles({
      ...options,
      filter: model => false
    });
  }
}

/**
 * Open dialog widget
 */
class OpenDialog
  extends Widget
  implements Dialog.IBodyWidget<Contents.IModel[]> {
  constructor(
    manager: IDocumentManager,
    filter?: (value: Contents.IModel) => boolean,
    translator?: ITranslator
  ) {
    super();
    translator = translator || nullTranslator;
    this.addClass(OPEN_DIALOG_CLASS);

    this._browser = Private.createFilteredFileBrowser(
      'filtered-file-browser-dialog',
      manager,
      filter,
      {},
      translator
    );

    // Build the sub widgets
    const layout = new PanelLayout();
    layout.addWidget(this._browser);

    // Set Widget content
    this.layout = layout;
  }

  /**
   * Get the selected items.
   */
  getValue(): Contents.IModel[] {
    const selection = toArray(this._browser.selectedItems());
    if (selection.length === 0) {
      // Return current path
      return [
        {
          path: this._browser.model.path,
          name: PathExt.basename(this._browser.model.path),
          type: 'directory',
          content: undefined,
          writable: false,
          created: 'unknown',
          last_modified: 'unknown',
          mimetype: 'text/plain',
          format: 'text'
        }
      ];
    } else {
      return selection;
    }
  }

  private _browser: FileBrowser;
}

namespace Private {
  /**
   * Create a new file browser instance.
   *
   * @param id - The widget/DOM id of the file browser.
   *
   * @param manager - A document manager instance.
   *
   * @param filter - function to filter file browser item.
   *
   * @param options - The optional file browser configuration object.
   *
   * #### Notes
   * The ID parameter is used to set the widget ID. It is also used as part of
   * the unique key necessary to store the file browser's restoration data in
   * the state database if that functionality is enabled.
   *
   * If, after the file browser has been generated by the factory, the ID of the
   * resulting widget is changed by client code, the restoration functionality
   * will not be disrupted as long as there are no ID collisions, i.e., as long
   * as the initial ID passed into the factory is used for only one file browser
   * instance.
   */
  export const createFilteredFileBrowser = (
    id: string,
    manager: IDocumentManager,
    filter?: (value: Contents.IModel) => boolean,
    options: IFileBrowserFactory.IOptions = {},
    translator?: ITranslator
  ): FileBrowser => {
    translator = translator || nullTranslator;
    const model = new FilterFileBrowserModel({
      manager,
      filter,
      translator,
      driveName: options.driveName,
      refreshInterval: options.refreshInterval
    });
    const widget = new FileBrowser({
      id,
      model,
      translator
    });

    return widget;
  };
}
