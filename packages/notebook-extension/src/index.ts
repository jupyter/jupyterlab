// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  Dialog,
  ICommandPalette,
  InstanceTracker,
  MainAreaWidget,
  showDialog
} from '@jupyterlab/apputils';

import { CodeCell } from '@jupyterlab/cells';

import { IEditorServices } from '@jupyterlab/codeeditor';

import {
  ISettingRegistry,
  IStateDB,
  nbformat,
  PageConfig,
  URLExt
} from '@jupyterlab/coreutils';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { ArrayExt } from '@phosphor/algorithm';

import { UUID, JSONObject } from '@phosphor/coreutils';

import { DisposableSet } from '@phosphor/disposable';

import { IFileBrowserFactory } from '@jupyterlab/filebrowser';

import { ILauncher } from '@jupyterlab/launcher';

import {
  IEditMenu,
  IFileMenu,
  IHelpMenu,
  IKernelMenu,
  IMainMenu,
  IRunMenu,
  IViewMenu
} from '@jupyterlab/mainmenu';

import {
  NotebookTools,
  INotebookTools,
  INotebookTracker,
  NotebookActions,
  NotebookModelFactory,
  NotebookPanel,
  NotebookTracker,
  NotebookWidgetFactory,
  StaticNotebook,
  CommandEditStatus,
  NotebookTrustStatus
} from '@jupyterlab/notebook';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { ServiceManager } from '@jupyterlab/services';

import { IStatusBar } from '@jupyterlab/statusbar';

import { ReadonlyJSONObject, JSONValue } from '@phosphor/coreutils';

import { Message, MessageLoop } from '@phosphor/messaging';

import { Panel, Menu } from '@phosphor/widgets';
import { CommandRegistry } from '@phosphor/commands';

/**
 * The command IDs used by the notebook plugin.
 */
namespace CommandIDs {
  export const createNew = 'notebook:create-new';

  export const interrupt = 'notebook:interrupt-kernel';

  export const restart = 'notebook:restart-kernel';

  export const restartClear = 'notebook:restart-clear-output';

  export const restartRunAll = 'notebook:restart-run-all';

  export const reconnectToKernel = 'notebook:reconnect-to-kernel';

  export const changeKernel = 'notebook:change-kernel';

  export const createConsole = 'notebook:create-console';

  export const createOutputView = 'notebook:create-output-view';

  export const clearAllOutputs = 'notebook:clear-all-cell-outputs';

  export const closeAndShutdown = 'notebook:close-and-shutdown';

  export const trust = 'notebook:trust';

  export const exportToFormat = 'notebook:export-to-format';

  export const run = 'notebook:run-cell';

  export const runAndAdvance = 'notebook:run-cell-and-select-next';

  export const runAndInsert = 'notebook:run-cell-and-insert-below';

  export const runInConsole = 'notebook:run-in-console';

  export const runAll = 'notebook:run-all-cells';

  export const runAllAbove = 'notebook:run-all-above';

  export const runAllBelow = 'notebook:run-all-below';

  export const renderAllMarkdown = 'notebook:render-all-markdown';

  export const toCode = 'notebook:change-cell-to-code';

  export const toMarkdown = 'notebook:change-cell-to-markdown';

  export const toRaw = 'notebook:change-cell-to-raw';

  export const cut = 'notebook:cut-cell';

  export const copy = 'notebook:copy-cell';

  export const pasteAbove = 'notebook:paste-cell-above';

  export const pasteBelow = 'notebook:paste-cell-below';

  export const pasteAndReplace = 'notebook:paste-and-replace-cell';

  export const moveUp = 'notebook:move-cell-up';

  export const moveDown = 'notebook:move-cell-down';

  export const clearOutputs = 'notebook:clear-cell-output';

  export const deleteCell = 'notebook:delete-cell';

  export const insertAbove = 'notebook:insert-cell-above';

  export const insertBelow = 'notebook:insert-cell-below';

  export const selectAbove = 'notebook:move-cursor-up';

  export const selectBelow = 'notebook:move-cursor-down';

  export const extendAbove = 'notebook:extend-marked-cells-above';

  export const extendBelow = 'notebook:extend-marked-cells-below';

  export const selectAll = 'notebook:select-all';

  export const deselectAll = 'notebook:deselect-all';

  export const editMode = 'notebook:enter-edit-mode';

  export const merge = 'notebook:merge-cells';

  export const split = 'notebook:split-cell-at-cursor';

  export const commandMode = 'notebook:enter-command-mode';

  export const toggleAllLines = 'notebook:toggle-all-cell-line-numbers';

  export const undoCellAction = 'notebook:undo-cell-action';

  export const redoCellAction = 'notebook:redo-cell-action';

  export const markdown1 = 'notebook:change-cell-to-heading-1';

  export const markdown2 = 'notebook:change-cell-to-heading-2';

  export const markdown3 = 'notebook:change-cell-to-heading-3';

  export const markdown4 = 'notebook:change-cell-to-heading-4';

  export const markdown5 = 'notebook:change-cell-to-heading-5';

  export const markdown6 = 'notebook:change-cell-to-heading-6';

  export const hideCode = 'notebook:hide-cell-code';

  export const showCode = 'notebook:show-cell-code';

  export const hideAllCode = 'notebook:hide-all-cell-code';

  export const showAllCode = 'notebook:show-all-cell-code';

  export const hideOutput = 'notebook:hide-cell-outputs';

  export const showOutput = 'notebook:show-cell-outputs';

  export const hideAllOutputs = 'notebook:hide-all-cell-outputs';

  export const showAllOutputs = 'notebook:show-all-cell-outputs';

  export const enableOutputScrolling = 'notebook:enable-output-scrolling';

  export const disableOutputScrolling = 'notebook:disable-output-scrolling';
}

/**
 * The class name for the notebook icon from the default theme.
 */
const NOTEBOOK_ICON_CLASS = 'jp-NotebookIcon';

/**
 * The name of the factory that creates notebooks.
 */
const FACTORY = 'Notebook';

/**
 * The rank of the notebook tools tab in the sidebar
 */
const NOTEBOOK_TOOLS_RANK = 400;

/**
 * The exluded Export To ...
 * (returned from nbconvert's export list)
 */
const FORMAT_EXCLUDE = ['notebook', 'python', 'custom'];

/**
 * The exluded Cell Inspector Raw NbConvert Formats
 * (returned from nbconvert's export list)
 */
const RAW_FORMAT_EXCLUDE = ['pdf', 'slides', 'script', 'notebook', 'custom'];

/**
 * The default Export To ... formats and their human readable labels.
 */
const FORMAT_LABEL: { [k: string]: string } = {
  html: 'HTML',
  latex: 'LaTeX',
  markdown: 'Markdown',
  pdf: 'PDF',
  rst: 'ReStructured Text',
  script: 'Executable Script',
  slides: 'Reveal.js Slides'
};

/**
 * The notebook widget tracker provider.
 */
const trackerPlugin: JupyterFrontEndPlugin<INotebookTracker> = {
  id: '@jupyterlab/notebook-extension:tracker',
  provides: INotebookTracker,
  requires: [
    NotebookPanel.IContentFactory,
    IDocumentManager,
    IEditorServices,
    IRenderMimeRegistry
  ],
  optional: [
    ICommandPalette,
    IFileBrowserFactory,
    ILauncher,
    ILayoutRestorer,
    IMainMenu,
    ISettingRegistry
  ],
  activate: activateNotebookHandler,
  autoStart: true
};

/**
 * The notebook cell factory provider.
 */
const factory: JupyterFrontEndPlugin<NotebookPanel.IContentFactory> = {
  id: '@jupyterlab/notebook-extension:factory',
  provides: NotebookPanel.IContentFactory,
  requires: [IEditorServices],
  autoStart: true,
  activate: (app: JupyterFrontEnd, editorServices: IEditorServices) => {
    let editorFactory = editorServices.factoryService.newInlineEditor;
    return new NotebookPanel.ContentFactory({ editorFactory });
  }
};

/**
 * The notebook tools extension.
 */
const tools: JupyterFrontEndPlugin<INotebookTools> = {
  activate: activateNotebookTools,
  provides: INotebookTools,
  id: '@jupyterlab/notebook-extension:tools',
  autoStart: true,
  requires: [INotebookTracker, IEditorServices, IStateDB],
  optional: [ILabShell]
};

/**
 * A plugin providing a CommandEdit status item.
 */
export const commandEditItem: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/notebook-extension:mode-status',
  autoStart: true,
  requires: [IStatusBar, INotebookTracker],
  activate: (
    app: JupyterFrontEnd,
    statusBar: IStatusBar,
    tracker: INotebookTracker
  ) => {
    const { shell } = app;
    const item = new CommandEditStatus();

    // Keep the status item up-to-date with the current notebook.
    tracker.currentChanged.connect(() => {
      const current = tracker.currentWidget;
      item.model.notebook = current && current.content;
    });

    statusBar.registerStatusItem('@jupyterlab/notebook-extension:mode-status', {
      item,
      align: 'right',
      rank: 4,
      isActive: () =>
        shell.currentWidget &&
        tracker.currentWidget &&
        shell.currentWidget === tracker.currentWidget
    });
  }
};

/**
 * A plugin that adds a notebook trust status item to the status bar.
 */
export const notebookTrustItem: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/notebook-extension:trust-status',
  autoStart: true,
  requires: [IStatusBar, INotebookTracker, ILabShell],
  activate: (
    app: JupyterFrontEnd,
    statusBar: IStatusBar,
    tracker: INotebookTracker
  ) => {
    const { shell } = app;
    const item = new NotebookTrustStatus();

    // Keep the status item up-to-date with the current notebook.
    tracker.currentChanged.connect(() => {
      const current = tracker.currentWidget;
      item.model.notebook = current && current.content;
    });

    statusBar.registerStatusItem(
      '@jupyterlab/notebook-extension:trust-status',
      {
        item,
        align: 'right',
        rank: 3,
        isActive: () =>
          shell.currentWidget &&
          tracker.currentWidget &&
          shell.currentWidget === tracker.currentWidget
      }
    );
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  factory,
  trackerPlugin,
  tools,
  commandEditItem,
  notebookTrustItem
];
export default plugins;

/**
 * Activate the notebook tools extension.
 */
function activateNotebookTools(
  app: JupyterFrontEnd,
  tracker: INotebookTracker,
  editorServices: IEditorServices,
  state: IStateDB,
  labShell: ILabShell | null
): INotebookTools {
  const id = 'notebook-tools';
  const notebookTools = new NotebookTools({ tracker });
  const activeCellTool = new NotebookTools.ActiveCellTool();
  const slideShow = NotebookTools.createSlideShowSelector();
  const editorFactory = editorServices.factoryService.newInlineEditor;
  const cellMetadataEditor = new NotebookTools.CellMetadataEditorTool({
    editorFactory,
    collapsed: false
  });
  const notebookMetadataEditor = new NotebookTools.NotebookMetadataEditorTool({
    editorFactory
  });

  const services = app.serviceManager;

  // Create message hook for triggers to save to the database.
  const hook = (sender: any, message: Message): boolean => {
    switch (message.type) {
      case 'activate-request':
        void state.save(id, { open: true });
        break;
      case 'after-hide':
      case 'close-request':
        void state.remove(id);
        break;
      default:
        break;
    }
    return true;
  };
  let optionsMap: { [key: string]: JSONValue } = {};
  optionsMap.None = null;
  void services.nbconvert.getExportFormats().then(response => {
    if (response) {
      // convert exportList to palette and menu items
      const formatList = Object.keys(response);
      formatList.forEach(function(key) {
        if (RAW_FORMAT_EXCLUDE.indexOf(key) === -1) {
          let capCaseKey = key[0].toUpperCase() + key.substr(1);
          let labelStr = FORMAT_LABEL[key] ? FORMAT_LABEL[key] : capCaseKey;
          let mimeType = response[key].output_mimetype;
          optionsMap[labelStr] = mimeType;
        }
      });
      const nbConvert = NotebookTools.createNBConvertSelector(optionsMap);
      notebookTools.addItem({ tool: nbConvert, section: 'common', rank: 3 });
    }
  });
  notebookTools.title.iconClass = 'jp-BuildIcon jp-SideBar-tabIcon';
  notebookTools.title.caption = 'Notebook Tools';
  notebookTools.id = id;

  notebookTools.addItem({ tool: activeCellTool, section: 'common', rank: 1 });
  notebookTools.addItem({ tool: slideShow, section: 'common', rank: 2 });

  notebookTools.addItem({
    tool: cellMetadataEditor,
    section: 'advanced',
    rank: 1
  });
  notebookTools.addItem({
    tool: notebookMetadataEditor,
    section: 'advanced',
    rank: 2
  });

  MessageLoop.installMessageHook(notebookTools, hook);

  // Wait until the application has finished restoring before rendering.
  void Promise.all([state.fetch(id), app.restored]).then(([value]) => {
    const open = !!(
      value && ((value as ReadonlyJSONObject)['open'] as boolean)
    );

    // After initial restoration, check if the notebook tools should render.
    if (tracker.size) {
      app.shell.add(notebookTools, 'left', { rank: NOTEBOOK_TOOLS_RANK });
      if (open) {
        app.shell.activateById(notebookTools.id);
      }
    }

    const updateTools = () => {
      // If there are any open notebooks, add notebook tools to the side panel if
      // it is not already there.
      if (tracker.size) {
        if (!notebookTools.isAttached) {
          labShell.add(notebookTools, 'left', { rank: NOTEBOOK_TOOLS_RANK });
        }
        return;
      }
      // If there are no notebooks, close notebook tools.
      notebookTools.close();
    };

    // For all subsequent widget changes, check if the notebook tools should render.
    if (labShell) {
      labShell.currentChanged.connect((sender, args) => {
        updateTools();
      });
    } else {
      tracker.currentChanged.connect((sender, args) => {
        updateTools();
      });
    }
  });

  return notebookTools;
}

/**
 * Activate the notebook handler extension.
 */
function activateNotebookHandler(
  app: JupyterFrontEnd,
  contentFactory: NotebookPanel.IContentFactory,
  docManager: IDocumentManager,
  editorServices: IEditorServices,
  rendermime: IRenderMimeRegistry,
  palette: ICommandPalette | null,
  browserFactory: IFileBrowserFactory | null,
  launcher: ILauncher | null,
  restorer: ILayoutRestorer | null,
  mainMenu: IMainMenu | null,
  settingRegistry: ISettingRegistry | null
): INotebookTracker {
  const services = app.serviceManager;

  const factory = new NotebookWidgetFactory({
    name: FACTORY,
    fileTypes: ['notebook'],
    modelName: 'notebook',
    defaultFor: ['notebook'],
    preferKernel: true,
    canStartKernel: true,
    rendermime: rendermime,
    contentFactory,
    editorConfig: StaticNotebook.defaultEditorConfig,
    notebookConfig: StaticNotebook.defaultNotebookConfig,
    mimeTypeService: editorServices.mimeTypeService
  });
  const { commands } = app;
  const tracker = new NotebookTracker({ namespace: 'notebook' });
  const clonedOutputs = new InstanceTracker<
    MainAreaWidget<Private.ClonedOutputArea>
  >({
    namespace: 'cloned-outputs'
  });

  // Handle state restoration.
  if (restorer) {
    restorer.restore(tracker, {
      command: 'docmanager:open',
      args: panel => ({ path: panel.context.path, factory: FACTORY }),
      name: panel => panel.context.path,
      when: services.ready
    });
    restorer.restore(clonedOutputs, {
      command: CommandIDs.createOutputView,
      args: widget => ({
        path: widget.content.path,
        index: widget.content.index
      }),
      name: widget => `${widget.content.path}:${widget.content.index}`,
      when: tracker.restored // After the notebook widgets (but not contents).
    });
  }

  let registry = app.docRegistry;
  registry.addModelFactory(new NotebookModelFactory({}));
  registry.addWidgetFactory(factory);

  addCommands(app, docManager, services, tracker, clonedOutputs);
  if (palette) {
    populatePalette(palette, services);
  }

  let id = 0; // The ID counter for notebook panels.

  factory.widgetCreated.connect((sender, widget) => {
    // If the notebook panel does not have an ID, assign it one.
    widget.id = widget.id || `notebook-${++id}`;
    widget.title.icon = NOTEBOOK_ICON_CLASS;
    // Notify the instance tracker if restore data needs to update.
    widget.context.pathChanged.connect(() => {
      void tracker.save(widget);
    });
    // Add the notebook panel to the tracker.
    void tracker.add(widget);
  });

  /**
   * Update the settings of the current tracker.
   */
  function updateTracker(options: NotebookPanel.IConfig): void {
    tracker.forEach(widget => {
      widget.setConfig(options);
    });
  }

  /**
   * Update the setting values.
   */
  function updateConfig(settings: ISettingRegistry.ISettings): void {
    let code = {
      ...StaticNotebook.defaultEditorConfig.code,
      ...(settings.get('codeCellConfig').composite as JSONObject)
    };

    let markdown = {
      ...StaticNotebook.defaultEditorConfig.markdown,
      ...(settings.get('markdownCellConfig').composite as JSONObject)
    };

    let raw = {
      ...StaticNotebook.defaultEditorConfig.raw,
      ...(settings.get('rawCellConfig').composite as JSONObject)
    };

    factory.editorConfig = { code, markdown, raw };
    factory.notebookConfig = {
      scrollPastEnd: settings.get('scrollPastEnd').composite as boolean,
      defaultCell: settings.get('defaultCell').composite as nbformat.CellType
    };
    factory.shutdownOnClose = settings.get('kernelShutdown')
      .composite as boolean;

    updateTracker({
      editorConfig: factory.editorConfig,
      notebookConfig: factory.notebookConfig,
      kernelShutdown: factory.shutdownOnClose
    });
  }

  // Fetch settings if possible.
  const fetchSettings = settingRegistry
    ? settingRegistry.load(trackerPlugin.id)
    : Promise.reject(new Error(`No setting registry for ${trackerPlugin.id}`));
  app.restored
    .then(() => fetchSettings)
    .then(settings => {
      updateConfig(settings);
      settings.changed.connect(() => {
        updateConfig(settings);
      });
    })
    .catch((reason: Error) => {
      console.warn(reason.message);
      updateTracker({
        editorConfig: factory.editorConfig,
        notebookConfig: factory.notebookConfig,
        kernelShutdown: factory.shutdownOnClose
      });
    });

  // Add main menu notebook menu.
  if (mainMenu) {
    populateMenus(app, mainMenu, tracker, services, palette);
  }

  // Utility function to create a new notebook.
  const createNew = (cwd: string, kernelName?: string) => {
    return commands
      .execute('docmanager:new-untitled', { path: cwd, type: 'notebook' })
      .then(model => {
        return commands.execute('docmanager:open', {
          path: model.path,
          factory: FACTORY,
          kernel: { name: kernelName }
        });
      });
  };

  // Add a command for creating a new notebook.
  commands.addCommand(CommandIDs.createNew, {
    label: args => {
      const kernelName = (args['kernelName'] as string) || '';
      if (args['isLauncher'] && args['kernelName']) {
        return services.specs.kernelspecs[kernelName].display_name;
      }
      if (args['isPalette']) {
        return 'New Notebook';
      }
      return 'Notebook';
    },
    caption: 'Create a new notebook',
    iconClass: args => (args['isPalette'] ? '' : 'jp-NotebookIcon'),
    execute: args => {
      const cwd =
        (args['cwd'] as string) ||
        (browserFactory ? browserFactory.defaultBrowser.model.path : '');
      const kernelName = (args['kernelName'] as string) || '';
      return createNew(cwd, kernelName);
    }
  });

  // Add a launcher item if the launcher is available.
  if (launcher) {
    void services.ready.then(() => {
      let disposables: DisposableSet | null = null;
      const onSpecsChanged = () => {
        if (disposables) {
          disposables.dispose();
          disposables = null;
        }
        const specs = services.specs;
        if (!specs) {
          return;
        }
        disposables = new DisposableSet();
        const baseUrl = PageConfig.getBaseUrl();

        for (let name in specs.kernelspecs) {
          let rank = name === specs.default ? 0 : Infinity;
          let kernelIconUrl = specs.kernelspecs[name].resources['logo-64x64'];
          if (kernelIconUrl) {
            let index = kernelIconUrl.indexOf('kernelspecs');
            kernelIconUrl = URLExt.join(baseUrl, kernelIconUrl.slice(index));
          }
          disposables.add(
            launcher.add({
              command: CommandIDs.createNew,
              args: { isLauncher: true, kernelName: name },
              category: 'Notebook',
              rank,
              kernelIconUrl
            })
          );
        }
      };
      onSpecsChanged();
      services.specsChanged.connect(onSpecsChanged);
    });
  }

  // Cell context menu groups
  app.contextMenu.addItem({
    type: 'separator',
    selector: '.jp-Notebook .jp-Cell',
    rank: 0
  });
  app.contextMenu.addItem({
    command: CommandIDs.cut,
    selector: '.jp-Notebook .jp-Cell',
    rank: 1
  });
  app.contextMenu.addItem({
    command: CommandIDs.copy,
    selector: '.jp-Notebook .jp-Cell',
    rank: 2
  });
  app.contextMenu.addItem({
    command: CommandIDs.pasteBelow,
    selector: '.jp-Notebook .jp-Cell',
    rank: 3
  });
  app.contextMenu.addItem({
    type: 'separator',
    selector: '.jp-Notebook .jp-Cell',
    rank: 4
  });
  app.contextMenu.addItem({
    command: CommandIDs.deleteCell,
    selector: '.jp-Notebook .jp-Cell',
    rank: 5
  });
  app.contextMenu.addItem({
    type: 'separator',
    selector: '.jp-Notebook .jp-Cell',
    rank: 6
  });
  app.contextMenu.addItem({
    command: CommandIDs.split,
    selector: '.jp-Notebook .jp-Cell',
    rank: 7
  });
  app.contextMenu.addItem({
    command: CommandIDs.merge,
    selector: '.jp-Notebook .jp-Cell',
    rank: 8
  });
  app.contextMenu.addItem({
    type: 'separator',
    selector: '.jp-Notebook .jp-Cell',
    rank: 9
  });

  // CodeCell context menu groups
  app.contextMenu.addItem({
    command: CommandIDs.createOutputView,
    selector: '.jp-Notebook .jp-CodeCell',
    rank: 10
  });
  app.contextMenu.addItem({
    type: 'separator',
    selector: '.jp-Notebook .jp-CodeCell',
    rank: 11
  });
  app.contextMenu.addItem({
    command: CommandIDs.clearOutputs,
    selector: '.jp-Notebook .jp-CodeCell',
    rank: 12
  });

  // Notebook context menu groups
  app.contextMenu.addItem({
    command: CommandIDs.clearAllOutputs,
    selector: '.jp-Notebook',
    rank: 0
  });
  app.contextMenu.addItem({
    type: 'separator',
    selector: '.jp-Notebook',
    rank: 1
  });
  app.contextMenu.addItem({
    command: CommandIDs.enableOutputScrolling,
    selector: '.jp-Notebook',
    rank: 2
  });
  app.contextMenu.addItem({
    command: CommandIDs.disableOutputScrolling,
    selector: '.jp-Notebook',
    rank: 3
  });
  app.contextMenu.addItem({
    type: 'separator',
    selector: '.jp-Notebook',
    rank: 4
  });
  app.contextMenu.addItem({
    command: CommandIDs.undoCellAction,
    selector: '.jp-Notebook',
    rank: 5
  });
  app.contextMenu.addItem({
    command: CommandIDs.redoCellAction,
    selector: '.jp-Notebook',
    rank: 6
  });
  app.contextMenu.addItem({
    command: CommandIDs.restart,
    selector: '.jp-Notebook',
    rank: 7
  });
  app.contextMenu.addItem({
    type: 'separator',
    selector: '.jp-Notebook',
    rank: 8
  });
  app.contextMenu.addItem({
    command: CommandIDs.createConsole,
    selector: '.jp-Notebook',
    rank: 9
  });

  return tracker;
}

/**
 * Add the notebook commands to the application's command registry.
 */
function addCommands(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  services: ServiceManager,
  tracker: NotebookTracker,
  clonedOutputs: InstanceTracker<MainAreaWidget>
): void {
  const { commands, shell } = app;

  // Get the current widget and activate unless the args specify otherwise.
  function getCurrent(args: ReadonlyJSONObject): NotebookPanel | null {
    const widget = tracker.currentWidget;
    const activate = args['activate'] !== false;

    if (activate && widget) {
      shell.activateById(widget.id);
    }

    return widget;
  }

  /**
   * Whether there is an active notebook.
   */
  function isEnabled(): boolean {
    return (
      tracker.currentWidget !== null &&
      tracker.currentWidget === shell.currentWidget
    );
  }

  /**
   * Whether there is an notebook active, with a single selected cell.
   */
  function isEnabledAndSingleSelected(): boolean {
    if (!isEnabled()) {
      return false;
    }
    const { content } = tracker.currentWidget;
    const index = content.activeCellIndex;
    // If there are selections that are not the active cell,
    // this command is confusing, so disable it.
    for (let i = 0; i < content.widgets.length; ++i) {
      if (content.isSelected(content.widgets[i]) && i !== index) {
        return false;
      }
    }
    return true;
  }

  commands.addCommand(CommandIDs.runAndAdvance, {
    label: 'Run Selected Cells',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        const { context, content } = current;

        return NotebookActions.runAndAdvance(content, context.session);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.run, {
    label: "Run Selected Cells and Don't Advance",
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        const { context, content } = current;

        return NotebookActions.run(content, context.session);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.runAndInsert, {
    label: 'Run Selected Cells and Insert Below',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        const { context, content } = current;

        return NotebookActions.runAndInsert(content, context.session);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.runInConsole, {
    label: 'Run Selected Text or Current Line in Console',
    execute: async args => {
      // Default to not activating the notebook (thereby putting the notebook
      // into command mode)
      const current = getCurrent({ activate: false, ...args });

      if (!current) {
        return;
      }

      const { context, content } = current;

      let cell = content.activeCell;
      let metadata = cell.model.metadata.toJSON();
      let path = context.path;
      // ignore action in non-code cell
      if (!cell || cell.model.type !== 'code') {
        return;
      }

      let code: string;
      const editor = cell.editor;
      const selection = editor.getSelection();
      const { start, end } = selection;
      let selected = start.column !== end.column || start.line !== end.line;

      if (selected) {
        // Get the selected code from the editor.
        const start = editor.getOffsetAt(selection.start);
        const end = editor.getOffsetAt(selection.end);
        code = editor.model.value.text.substring(start, end);
      } else {
        // no selection, submit whole line and advance
        code = editor.getLine(selection.start.line);
        const cursor = editor.getCursorPosition();
        if (cursor.line + 1 !== editor.lineCount) {
          editor.setCursorPosition({
            line: cursor.line + 1,
            column: cursor.column
          });
        }
      }

      if (!code) {
        return;
      }

      await commands.execute('console:open', {
        activate: false,
        insertMode: 'split-bottom',
        path
      });
      await commands.execute('console:inject', {
        activate: false,
        code,
        path,
        metadata
      });
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.runAll, {
    label: 'Run All Cells',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        const { context, content } = current;

        return NotebookActions.runAll(content, context.session);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.runAllAbove, {
    label: 'Run All Above Selected Cell',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        const { context, content } = current;

        return NotebookActions.runAllAbove(content, context.session);
      }
    },
    isEnabled: () => {
      // Can't run above if there are multiple cells selected,
      // or if we are at the top of the notebook.
      return (
        isEnabledAndSingleSelected() &&
        tracker.currentWidget.content.activeCellIndex !== 0
      );
    }
  });
  commands.addCommand(CommandIDs.runAllBelow, {
    label: 'Run Selected Cell and All Below',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        const { context, content } = current;

        return NotebookActions.runAllBelow(content, context.session);
      }
    },
    isEnabled: () => {
      // Can't run below if there are multiple cells selected,
      // or if we are at the bottom of the notebook.
      return (
        isEnabledAndSingleSelected() &&
        tracker.currentWidget.content.activeCellIndex !==
          tracker.currentWidget.content.widgets.length - 1
      );
    }
  });
  commands.addCommand(CommandIDs.renderAllMarkdown, {
    label: 'Render All Markdown Cells',
    execute: args => {
      const current = getCurrent(args);
      if (current) {
        const { context, content } = current;
        return NotebookActions.renderAllMarkdown(content, context.session);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.restart, {
    label: 'Restart Kernel…',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return current.session.restart();
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.closeAndShutdown, {
    label: 'Close and Shut Down',
    execute: args => {
      const current = getCurrent(args);

      if (!current) {
        return;
      }

      const fileName = current.title.label;

      return showDialog({
        title: 'Shut down the notebook?',
        body: `Are you sure you want to close "${fileName}"?`,
        buttons: [Dialog.cancelButton(), Dialog.warnButton()]
      }).then(result => {
        if (result.button.accept) {
          return current.context.session.shutdown().then(() => {
            current.dispose();
          });
        }
      });
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.trust, {
    label: () => 'Trust Notebook',
    execute: args => {
      const current = getCurrent(args);
      if (current) {
        const { context, content } = current;
        return NotebookActions.trust(content).then(() => context.save());
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.exportToFormat, {
    label: args => {
      const formatLabel = args['label'] as string;

      return (args['isPalette'] ? 'Export Notebook to ' : '') + formatLabel;
    },
    execute: args => {
      const current = getCurrent(args);

      if (!current) {
        return;
      }

      const url = PageConfig.getNBConvertURL({
        format: args['format'] as string,
        download: true,
        path: current.context.path
      });
      const child = window.open('', '_blank');
      const { context } = current;

      child.opener = null;
      if (context.model.dirty && !context.model.readOnly) {
        return context.save().then(() => {
          child.location.assign(url);
        });
      }

      return new Promise<void>(resolve => {
        child.location.assign(url);
        resolve(undefined);
      });
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.restartClear, {
    label: 'Restart Kernel and Clear All Outputs…',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        const { content, session } = current;

        return session.restart().then(() => {
          NotebookActions.clearAllOutputs(content);
        });
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.restartRunAll, {
    label: 'Restart Kernel and Run All Cells…',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        const { context, content, session } = current;

        return session.restart().then(restarted => {
          if (restarted) {
            void NotebookActions.runAll(content, context.session);
          }
          return restarted;
        });
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.clearAllOutputs, {
    label: 'Clear All Outputs',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.clearAllOutputs(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.clearOutputs, {
    label: 'Clear Outputs',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.clearOutputs(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.interrupt, {
    label: 'Interrupt Kernel',
    execute: args => {
      const current = getCurrent(args);

      if (!current) {
        return;
      }

      const kernel = current.context.session.kernel;

      if (kernel) {
        return kernel.interrupt();
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.toCode, {
    label: 'Change to Code Cell Type',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.changeCellType(current.content, 'code');
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.toMarkdown, {
    label: 'Change to Markdown Cell Type',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.changeCellType(current.content, 'markdown');
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.toRaw, {
    label: 'Change to Raw Cell Type',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.changeCellType(current.content, 'raw');
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.cut, {
    label: 'Cut Cells',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.cut(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.copy, {
    label: 'Copy Cells',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.copy(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.pasteBelow, {
    label: 'Paste Cells Below',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.paste(current.content, 'below');
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.pasteAbove, {
    label: 'Paste Cells Above',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.paste(current.content, 'above');
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.pasteAndReplace, {
    label: 'Paste Cells and Replace',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.paste(current.content, 'replace');
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.deleteCell, {
    label: 'Delete Cells',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.deleteCells(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.split, {
    label: 'Split Cell',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.splitCell(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.merge, {
    label: 'Merge Selected Cells',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.mergeCells(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.insertAbove, {
    label: 'Insert Cell Above',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.insertAbove(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.insertBelow, {
    label: 'Insert Cell Below',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.insertBelow(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.selectAbove, {
    label: 'Select Cell Above',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.selectAbove(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.selectBelow, {
    label: 'Select Cell Below',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.selectBelow(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.extendAbove, {
    label: 'Extend Selection Above',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.extendSelectionAbove(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.extendBelow, {
    label: 'Extend Selection Below',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.extendSelectionBelow(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.selectAll, {
    label: 'Select All Cells',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.selectAll(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.deselectAll, {
    label: 'Deselect All Cells',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.deselectAll(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.moveUp, {
    label: 'Move Cells Up',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.moveUp(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.moveDown, {
    label: 'Move Cells Down',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.moveDown(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.toggleAllLines, {
    label: 'Toggle All Line Numbers',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.toggleAllLineNumbers(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.commandMode, {
    label: 'Enter Command Mode',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        current.content.mode = 'command';
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.editMode, {
    label: 'Enter Edit Mode',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        current.content.mode = 'edit';
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.undoCellAction, {
    label: 'Undo Cell Operation',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.undo(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.redoCellAction, {
    label: 'Redo Cell Operation',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.redo(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.changeKernel, {
    label: 'Change Kernel…',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return current.context.session.selectKernel();
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.reconnectToKernel, {
    label: 'Reconnect To Kernel',
    execute: args => {
      const current = getCurrent(args);

      if (!current) {
        return;
      }

      const kernel = current.context.session.kernel;

      if (kernel) {
        return kernel.reconnect();
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.createOutputView, {
    label: 'Create New View for Output',
    execute: async args => {
      let cell: CodeCell | undefined;
      let current: NotebookPanel | undefined;
      // If we are given a notebook path and cell index, then
      // use that, otherwise use the current active cell.
      let path = args.path as string | undefined | null;
      let index = args.index as number | undefined | null;
      if (path && index !== undefined && index !== null) {
        const widgets = docManager.findWidgets(
          path,
          FACTORY
        ) as NotebookPanel[];
        if (!widgets.length) {
          return;
        }
        current = widgets[0];
      } else {
        current = getCurrent({ ...args, activate: false });
        if (!current) {
          return;
        }
        cell = current.content.activeCell as CodeCell;
        index = current.content.activeCellIndex;
      }
      // Create a MainAreaWidget
      const content = new Private.ClonedOutputArea({
        notebook: current,
        cell,
        index
      });
      const widget = new MainAreaWidget({ content });
      current.context.addSibling(widget, {
        ref: current.id,
        mode: 'split-bottom'
      });

      const updateCloned = () => {
        void clonedOutputs.save(widget);
      };
      current.context.pathChanged.connect(updateCloned);
      current.content.model.cells.changed.connect(updateCloned);

      // Add the cloned output to the output instance tracker.
      void clonedOutputs.add(widget);

      // Remove the output view if the parent notebook is closed.
      current.content.disposed.connect(() => {
        current.context.pathChanged.disconnect(updateCloned);
        current.content.model.cells.changed.disconnect(updateCloned);
        widget.dispose();
      });
    },
    isEnabled: isEnabledAndSingleSelected
  });
  commands.addCommand(CommandIDs.createConsole, {
    label: 'New Console for Notebook',
    execute: args => {
      const current = getCurrent({ ...args, activate: false });

      if (!current) {
        return;
      }

      return Private.createConsole(commands, current, args[
        'activate'
      ] as boolean);
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.markdown1, {
    label: 'Change to Heading 1',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.setMarkdownHeader(current.content, 1);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.markdown2, {
    label: 'Change to Heading 2',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.setMarkdownHeader(current.content, 2);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.markdown3, {
    label: 'Change to Heading 3',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.setMarkdownHeader(current.content, 3);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.markdown4, {
    label: 'Change to Heading 4',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.setMarkdownHeader(current.content, 4);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.markdown5, {
    label: 'Change to Heading 5',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.setMarkdownHeader(current.content, 5);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.markdown6, {
    label: 'Change to Heading 6',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.setMarkdownHeader(current.content, 6);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.hideCode, {
    label: 'Collapse Selected Code',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.hideCode(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.showCode, {
    label: 'Expand Selected Code',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.showCode(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.hideAllCode, {
    label: 'Collapse All Code',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.hideAllCode(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.showAllCode, {
    label: 'Expand All Code',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.showAllCode(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.hideOutput, {
    label: 'Collapse Selected Outputs',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.hideOutput(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.showOutput, {
    label: 'Expand Selected Outputs',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.showOutput(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.hideAllOutputs, {
    label: 'Collapse All Outputs',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.hideAllOutputs(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.showAllOutputs, {
    label: 'Expand All Outputs',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.showAllOutputs(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.enableOutputScrolling, {
    label: 'Enable Scrolling for Outputs',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.enableOutputScrolling(current.content);
      }
    },
    isEnabled
  });
  commands.addCommand(CommandIDs.disableOutputScrolling, {
    label: 'Disable Scrolling for Outputs',
    execute: args => {
      const current = getCurrent(args);

      if (current) {
        return NotebookActions.disableOutputScrolling(current.content);
      }
    },
    isEnabled
  });
}

/**
 * Populate the application's command palette with notebook commands.
 */
function populatePalette(
  palette: ICommandPalette,
  services: ServiceManager
): void {
  let category = 'Notebook Operations';
  [
    CommandIDs.interrupt,
    CommandIDs.restart,
    CommandIDs.restartClear,
    CommandIDs.restartRunAll,
    CommandIDs.runAll,
    CommandIDs.renderAllMarkdown,
    CommandIDs.runAllAbove,
    CommandIDs.runAllBelow,
    CommandIDs.selectAll,
    CommandIDs.deselectAll,
    CommandIDs.clearAllOutputs,
    CommandIDs.toggleAllLines,
    CommandIDs.editMode,
    CommandIDs.commandMode,
    CommandIDs.changeKernel,
    CommandIDs.reconnectToKernel,
    CommandIDs.createConsole,
    CommandIDs.closeAndShutdown,
    CommandIDs.trust
  ].forEach(command => {
    palette.addItem({ command, category });
  });

  palette.addItem({
    command: CommandIDs.createNew,
    category,
    args: { isPalette: true }
  });

  category = 'Notebook Cell Operations';
  [
    CommandIDs.run,
    CommandIDs.runAndAdvance,
    CommandIDs.runAndInsert,
    CommandIDs.runInConsole,
    CommandIDs.clearOutputs,
    CommandIDs.toCode,
    CommandIDs.toMarkdown,
    CommandIDs.toRaw,
    CommandIDs.cut,
    CommandIDs.copy,
    CommandIDs.pasteBelow,
    CommandIDs.pasteAbove,
    CommandIDs.pasteAndReplace,
    CommandIDs.deleteCell,
    CommandIDs.split,
    CommandIDs.merge,
    CommandIDs.insertAbove,
    CommandIDs.insertBelow,
    CommandIDs.selectAbove,
    CommandIDs.selectBelow,
    CommandIDs.extendAbove,
    CommandIDs.extendBelow,
    CommandIDs.moveDown,
    CommandIDs.moveUp,
    CommandIDs.undoCellAction,
    CommandIDs.redoCellAction,
    CommandIDs.markdown1,
    CommandIDs.markdown2,
    CommandIDs.markdown3,
    CommandIDs.markdown4,
    CommandIDs.markdown5,
    CommandIDs.markdown6,
    CommandIDs.hideCode,
    CommandIDs.showCode,
    CommandIDs.hideAllCode,
    CommandIDs.showAllCode,
    CommandIDs.hideOutput,
    CommandIDs.showOutput,
    CommandIDs.hideAllOutputs,
    CommandIDs.showAllOutputs,
    CommandIDs.enableOutputScrolling,
    CommandIDs.disableOutputScrolling
  ].forEach(command => {
    palette.addItem({ command, category });
  });
}

/**
 * Populates the application menus for the notebook.
 */
function populateMenus(
  app: JupyterFrontEnd,
  mainMenu: IMainMenu,
  tracker: INotebookTracker,
  services: ServiceManager,
  palette: ICommandPalette | null
): void {
  let { commands } = app;

  // Add undo/redo hooks to the edit menu.
  mainMenu.editMenu.undoers.add({
    tracker,
    undo: widget => {
      widget.content.activeCell.editor.undo();
    },
    redo: widget => {
      widget.content.activeCell.editor.redo();
    }
  } as IEditMenu.IUndoer<NotebookPanel>);

  // Add a clearer to the edit menu
  mainMenu.editMenu.clearers.add({
    tracker,
    noun: 'Outputs',
    pluralNoun: 'Outputs',
    clearCurrent: (current: NotebookPanel) => {
      return NotebookActions.clearOutputs(current.content);
    },
    clearAll: (current: NotebookPanel) => {
      return NotebookActions.clearAllOutputs(current.content);
    }
  } as IEditMenu.IClearer<NotebookPanel>);

  // Add new notebook creation to the file menu.
  mainMenu.fileMenu.newMenu.addGroup([{ command: CommandIDs.createNew }], 10);

  // Add a close and shutdown command to the file menu.
  mainMenu.fileMenu.closeAndCleaners.add({
    tracker,
    action: 'Shutdown',
    name: 'Notebook',
    closeAndCleanup: (current: NotebookPanel) => {
      const fileName = current.title.label;
      return showDialog({
        title: 'Shut down the notebook?',
        body: `Are you sure you want to close "${fileName}"?`,
        buttons: [Dialog.cancelButton(), Dialog.warnButton()]
      }).then(result => {
        if (result.button.accept) {
          return current.context.session.shutdown().then(() => {
            current.dispose();
          });
        }
      });
    }
  } as IFileMenu.ICloseAndCleaner<NotebookPanel>);

  // Add a notebook group to the File menu.
  let exportTo = new Menu({ commands });
  exportTo.title.label = 'Export Notebook As…';
  void services.nbconvert.getExportFormats().then(response => {
    if (response) {
      // Convert export list to palette and menu items.
      const formatList = Object.keys(response);
      formatList.forEach(function(key) {
        let capCaseKey = key[0].toUpperCase() + key.substr(1);
        let labelStr = FORMAT_LABEL[key] ? FORMAT_LABEL[key] : capCaseKey;
        let args = {
          format: key,
          label: labelStr,
          isPalette: true
        };
        if (FORMAT_EXCLUDE.indexOf(key) === -1) {
          exportTo.addItem({
            command: CommandIDs.exportToFormat,
            args: args
          });
          if (palette) {
            const category = 'Notebook Operations';
            palette.addItem({
              command: CommandIDs.exportToFormat,
              category,
              args
            });
          }
        }
      });
      const fileGroup = [
        { type: 'submenu', submenu: exportTo } as Menu.IItemOptions
      ];
      mainMenu.fileMenu.addGroup(fileGroup, 10);
    }
  });

  // Add a kernel user to the Kernel menu
  mainMenu.kernelMenu.kernelUsers.add({
    tracker,
    interruptKernel: current => {
      let kernel = current.session.kernel;
      if (kernel) {
        return kernel.interrupt();
      }
      return Promise.resolve(void 0);
    },
    noun: 'All Outputs',
    restartKernel: current => current.session.restart(),
    restartKernelAndClear: current => {
      return current.session.restart().then(restarted => {
        if (restarted) {
          NotebookActions.clearAllOutputs(current.content);
        }
        return restarted;
      });
    },
    changeKernel: current => current.session.selectKernel(),
    shutdownKernel: current => current.session.shutdown()
  } as IKernelMenu.IKernelUser<NotebookPanel>);

  // Add a console creator the the Kernel menu
  mainMenu.fileMenu.consoleCreators.add({
    tracker,
    name: 'Notebook',
    createConsole: current => Private.createConsole(commands, current, true)
  } as IFileMenu.IConsoleCreator<NotebookPanel>);

  // Add some commands to the application view menu.
  const collapseGroup = [
    CommandIDs.hideCode,
    CommandIDs.hideOutput,
    CommandIDs.hideAllCode,
    CommandIDs.hideAllOutputs
  ].map(command => {
    return { command };
  });
  mainMenu.viewMenu.addGroup(collapseGroup, 10);

  const expandGroup = [
    CommandIDs.showCode,
    CommandIDs.showOutput,
    CommandIDs.showAllCode,
    CommandIDs.showAllOutputs
  ].map(command => {
    return { command };
  });
  mainMenu.viewMenu.addGroup(expandGroup, 11);

  // Add an IEditorViewer to the application view menu
  mainMenu.viewMenu.editorViewers.add({
    tracker,
    toggleLineNumbers: widget => {
      NotebookActions.toggleAllLineNumbers(widget.content);
    },
    lineNumbersToggled: widget => {
      const config = widget.content.editorConfig;
      return !!(
        config.code.lineNumbers &&
        config.markdown.lineNumbers &&
        config.raw.lineNumbers
      );
    }
  } as IViewMenu.IEditorViewer<NotebookPanel>);

  // Add an ICodeRunner to the application run menu
  mainMenu.runMenu.codeRunners.add({
    tracker,
    noun: 'Cells',
    run: current => {
      const { context, content } = current;
      return NotebookActions.runAndAdvance(content, context.session).then(
        () => void 0
      );
    },
    runAll: current => {
      const { context, content } = current;
      return NotebookActions.runAll(content, context.session).then(
        () => void 0
      );
    },
    restartAndRunAll: current => {
      const { context, content } = current;
      return context.session.restart().then(restarted => {
        if (restarted) {
          void NotebookActions.runAll(content, context.session);
        }
        return restarted;
      });
    }
  } as IRunMenu.ICodeRunner<NotebookPanel>);

  // Add a renderAllMarkdown group to the run menu.
  const renderAllMarkdown = [CommandIDs.renderAllMarkdown].map(command => {
    return { command };
  });
  // Add a run+insert and run+don't advance group to the run menu.
  const runExtras = [
    CommandIDs.runAndInsert,
    CommandIDs.run,
    CommandIDs.runInConsole
  ].map(command => {
    return { command };
  });

  // Add a run all above/below group to the run menu.
  const runAboveBelowGroup = [
    CommandIDs.runAllAbove,
    CommandIDs.runAllBelow
  ].map(command => {
    return { command };
  });

  // Add commands to the application edit menu.
  const undoCellActionGroup = [
    CommandIDs.undoCellAction,
    CommandIDs.redoCellAction
  ].map(command => {
    return { command };
  });

  const copyGroup = [
    CommandIDs.cut,
    CommandIDs.copy,
    CommandIDs.pasteBelow,
    CommandIDs.pasteAbove,
    CommandIDs.pasteAndReplace
  ].map(command => {
    return { command };
  });

  const selectGroup = [CommandIDs.selectAll, CommandIDs.deselectAll].map(
    command => {
      return { command };
    }
  );

  const splitMergeGroup = [CommandIDs.split, CommandIDs.merge].map(command => {
    return { command };
  });

  const moveCellsGroup = [CommandIDs.moveUp, CommandIDs.moveDown].map(
    command => {
      return { command };
    }
  );

  mainMenu.editMenu.addGroup(undoCellActionGroup, 4);
  mainMenu.editMenu.addGroup(copyGroup, 5);
  mainMenu.editMenu.addGroup([{ command: CommandIDs.deleteCell }], 6);
  mainMenu.editMenu.addGroup(selectGroup, 7);
  mainMenu.editMenu.addGroup(moveCellsGroup, 8);
  mainMenu.editMenu.addGroup(splitMergeGroup, 9);
  mainMenu.runMenu.addGroup(runExtras, 10);
  mainMenu.runMenu.addGroup(runAboveBelowGroup, 11);
  mainMenu.runMenu.addGroup(renderAllMarkdown, 12);

  // Add kernel information to the application help menu.
  mainMenu.helpMenu.kernelUsers.add({
    tracker,
    getKernel: current => current.session.kernel
  } as IHelpMenu.IKernelUser<NotebookPanel>);
}

/**
 * A namespace for module private functionality.
 */
namespace Private {
  /**
   * Create a console connected with a notebook kernel
   *
   * @param commands Commands registry
   * @param widget Notebook panel
   * @param activate Should the console be activated
   */
  export function createConsole(
    commands: CommandRegistry,
    widget: NotebookPanel,
    activate?: boolean
  ): Promise<void> {
    const options = {
      path: widget.context.path,
      preferredLanguage: widget.context.model.defaultKernelLanguage,
      activate: activate,
      ref: widget.id,
      insertMode: 'split-bottom'
    };

    return commands.execute('console:create', options);
  }

  /**
   * A widget hosting a cloned output area.
   */
  export class ClonedOutputArea extends Panel {
    constructor(options: ClonedOutputArea.IOptions) {
      super();
      this._notebook = options.notebook;
      this._index = options.index !== undefined ? options.index : -1;
      this._cell = options.cell || null;
      this.id = `LinkedOutputView-${UUID.uuid4()}`;
      this.title.label = 'Output View';
      this.title.icon = NOTEBOOK_ICON_CLASS;
      this.title.caption = this._notebook.title.label
        ? `For Notebook: ${this._notebook.title.label}`
        : 'For Notebook:';
      this.addClass('jp-LinkedOutputView');

      // Wait for the notebook to be loaded before
      // cloning the output area.
      void this._notebook.context.ready.then(() => {
        if (!this._cell) {
          this._cell = this._notebook.content.widgets[this._index] as CodeCell;
        }
        if (!this._cell || this._cell.model.type !== 'code') {
          this.dispose();
          return;
        }
        const clone = this._cell.cloneOutputArea();
        this.addWidget(clone);
      });
    }

    /**
     * The index of the cell in the notebook.
     */
    get index(): number {
      return this._cell
        ? ArrayExt.findFirstIndex(
            this._notebook.content.widgets,
            c => c === this._cell
          )
        : this._index;
    }

    /**
     * The path of the notebook for the cloned output area.
     */
    get path(): string {
      return this._notebook.context.path;
    }

    private _notebook: NotebookPanel;
    private _index: number;
    private _cell: CodeCell | null = null;
  }

  /**
   * ClonedOutputArea statics.
   */
  export namespace ClonedOutputArea {
    export interface IOptions {
      /**
       * The notebook associated with the cloned output area.
       */
      notebook: NotebookPanel;

      /**
       * The cell for which to clone the output area.
       */
      cell?: CodeCell;

      /**
       * If the cell is not available, provide the index
       * of the cell for when the notebook is loaded.
       */
      index?: number;
    }
  }
}
