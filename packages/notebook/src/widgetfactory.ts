// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { InputArea } from '@jupyterlab/cells';

import { IEditorMimeTypeService, CodeEditor } from '@jupyterlab/codeeditor';

import { ABCWidgetFactory, DocumentRegistry } from '@jupyterlab/docregistry';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { ToolbarItems } from './default-toolbar';

import { INotebookModel } from './model';

import { NotebookPanel } from './panel';

import { StaticNotebook, Notebook } from './widget';

import {
  ISessionContextDialogs,
  sessionContextDialogs
} from '@jupyterlab/apputils';

/**
 * A widget factory for notebook panels.
 */
export class NotebookWidgetFactory extends ABCWidgetFactory<
  NotebookPanel,
  INotebookModel
> {
  /**
   * Construct a new notebook widget factory.
   *
   * @param options - The options used to construct the factory.
   */
  constructor(options: NotebookWidgetFactory.IOptions<NotebookPanel>) {
    super(options);
    this.rendermime = options.rendermime;
    this.mimeTypeService = options.mimeTypeService;
    this.editorFactory =
      options.editorFactory || InputArea.defaultEditorFactory;
    this._editorConfig =
      options.editorConfig || StaticNotebook.defaultEditorConfig;
    this._notebookConfig =
      options.notebookConfig || StaticNotebook.defaultNotebookConfig;
    this._sessionDialogs = options.sessionDialogs || sessionContextDialogs;
  }

  /*
   * The rendermime instance.
   */
  readonly rendermime: IRenderMimeRegistry;

  /**
   * The service used to look up mime types.
   */
  readonly mimeTypeService: IEditorMimeTypeService;

  readonly editorFactory: CodeEditor.Factory;

  /**
   * A configuration object for cell editor settings.
   */
  get editorConfig(): StaticNotebook.IEditorConfig {
    return this._editorConfig;
  }
  set editorConfig(value: StaticNotebook.IEditorConfig) {
    this._editorConfig = value;
  }

  /**
   * A configuration object for notebook settings.
   */
  get notebookConfig(): StaticNotebook.INotebookConfig {
    return this._notebookConfig;
  }
  set notebookConfig(value: StaticNotebook.INotebookConfig) {
    this._notebookConfig = value;
  }

  /**
   * Create a new widget.
   *
   * #### Notes
   * The factory will start the appropriate kernel.
   */
  protected createNewWidget(
    context: DocumentRegistry.IContext<INotebookModel>,
    source?: NotebookPanel
  ): NotebookPanel {
    const nbOptions = {
      rendermime: source
        ? source.content.rendermime
        : this.rendermime.clone({ resolver: context.urlResolver }),
      mimeTypeService: this.mimeTypeService,
      editorConfig: source ? source.content.editorConfig : this._editorConfig,
      editorFactory: this.editorFactory,
      notebookConfig: source
        ? source.content.notebookConfig
        : this._notebookConfig
    };
    const content = new Notebook(nbOptions);

    return new NotebookPanel({ context, content });
  }

  /**
   * Default factory for toolbar items to be added after the widget is created.
   */
  protected defaultToolbarFactory(
    widget: NotebookPanel
  ): DocumentRegistry.IToolbarItem[] {
    return ToolbarItems.getDefaultItems(widget, this._sessionDialogs);
  }

  private _editorConfig: StaticNotebook.IEditorConfig;
  private _notebookConfig: StaticNotebook.INotebookConfig;
  private _sessionDialogs: ISessionContextDialogs;
}

/**
 * The namespace for `NotebookWidgetFactory` statics.
 */
export namespace NotebookWidgetFactory {
  /**
   * The options used to construct a `NotebookWidgetFactory`.
   */
  export interface IOptions<T extends NotebookPanel>
    extends DocumentRegistry.IWidgetFactoryOptions<T> {
    /*
     * A rendermime instance.
     */
    rendermime: IRenderMimeRegistry;

    /**
     * The service used to look up mime types.
     */
    mimeTypeService: IEditorMimeTypeService;

    /**
     * The notebook cell editor configuration.
     */
    editorConfig?: StaticNotebook.IEditorConfig;

    /**
     * The editor factory used to create editor instances.
     */
    editorFactory?: CodeEditor.Factory;

    /**
     * The notebook configuration.
     */
    notebookConfig?: StaticNotebook.INotebookConfig;

    /**
     * The session context dialogs.
     */
    sessionDialogs?: ISessionContextDialogs;
  }

  /**
   * The interface for a notebook widget factory.
   */
  export interface IFactory
    extends DocumentRegistry.IWidgetFactory<NotebookPanel, INotebookModel> {
    editorFactory: CodeEditor.Factory;
    /**
     * A configuration object for cell editor settings.
     */
    editorConfig: StaticNotebook.IEditorConfig;

    /**
     * A configuration object for notebook settings.
     */
    notebookConfig: StaticNotebook.INotebookConfig;

    /**
     * Whether the kernel should be shutdown when the widget is closed.
     */
    shutdownOnClose: boolean;
  }
}
