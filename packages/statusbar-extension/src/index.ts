// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  ISessionContext,
  ICommandPalette,
  ISessionContextDialogs,
  sessionContextDialogs
} from '@jupyterlab/apputils';

import { Cell, CodeCell } from '@jupyterlab/cells';

import {
  CodeConsole,
  ConsolePanel,
  IConsoleTracker
} from '@jupyterlab/console';

import { IDocumentWidget } from '@jupyterlab/docregistry';

import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';

import { IMainMenu } from '@jupyterlab/mainmenu';

import {
  INotebookTracker,
  Notebook,
  NotebookPanel
} from '@jupyterlab/notebook';

import {
  IStatusBar,
  KernelStatus,
  LineCol,
  MemoryUsage,
  ModeSwitch,
  RunningSessions,
  StatusBar
} from '@jupyterlab/statusbar';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { ITranslator } from '@jupyterlab/translation';

import { DockPanel, Title, Widget } from '@lumino/widgets';

export const STATUSBAR_PLUGIN_ID = '@jupyterlab/statusbar-extension:plugin';

/**
 * Initialization data for the statusbar extension.
 */
const statusBar: JupyterFrontEndPlugin<IStatusBar> = {
  id: STATUSBAR_PLUGIN_ID,
  requires: [ITranslator],
  provides: IStatusBar,
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    labShell: ILabShell | null,
    settingRegistry: ISettingRegistry | null,
    mainMenu: IMainMenu | null,
    palette: ICommandPalette | null
  ) => {
    const trans = translator.load('jupyterlab');
    const statusBar = new StatusBar();
    statusBar.id = 'jp-main-statusbar';
    app.shell.add(statusBar, 'bottom');

    // If available, connect to the shell's layout modified signal.
    if (labShell) {
      labShell.layoutModified.connect(() => {
        statusBar.update();
      });
    }

    const category: string = trans.__('Main Area');
    const command: string = 'statusbar:toggle';

    app.commands.addCommand(command, {
      label: trans.__('Show Status Bar'),
      execute: (args: any) => {
        statusBar.setHidden(statusBar.isVisible);
        if (settingRegistry) {
          void settingRegistry.set(
            STATUSBAR_PLUGIN_ID,
            'visible',
            statusBar.isVisible
          );
        }
      },
      isToggled: () => statusBar.isVisible
    });

    if (palette) {
      palette.addItem({ command, category });
    }
    if (mainMenu) {
      mainMenu.viewMenu.addGroup([{ command }], 1);
    }

    let ready = app.restored;
    if (settingRegistry) {
      const loadSettings = settingRegistry.load(STATUSBAR_PLUGIN_ID);
      const updateSettings = (settings: ISettingRegistry.ISettings): void => {
        const visible = settings.get('visible').composite as boolean;
        statusBar.setHidden(!visible);
      };

      ready = Promise.all([loadSettings, app.restored])
        .then(([settings]) => {
          updateSettings(settings);
          settings.changed.connect(settings => {
            updateSettings(settings);
          });
        })
        .catch((reason: Error) => {
          console.error(reason.message);
        });
    }

    // Hide the status bar in the mobile format.
    void ready.then(() => {
      const handleFormat = () => {
        if (app.format === 'mobile') {
          statusBar.setHidden(true);
        } else {
          statusBar.setHidden(false);
        }
      };
      app.formatChanged.connect(handleFormat);
      handleFormat();
    });

    return statusBar;
  },
  optional: [ILabShell, ISettingRegistry, IMainMenu, ICommandPalette]
};

/**
 * A plugin that provides a kernel status item to the status bar.
 */
export const kernelStatus: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/statusbar-extension:kernel-status',
  autoStart: true,
  requires: [
    IStatusBar,
    INotebookTracker,
    IConsoleTracker,
    ILabShell,
    ITranslator
  ],
  optional: [ISessionContextDialogs],
  activate: (
    app: JupyterFrontEnd,
    statusBar: IStatusBar,
    notebookTracker: INotebookTracker,
    consoleTracker: IConsoleTracker,
    labShell: ILabShell,
    translator: ITranslator,
    sessionDialogs: ISessionContextDialogs | null
  ) => {
    // When the status item is clicked, launch the kernel
    // selection dialog for the current session.
    let currentSession: ISessionContext | null = null;
    const changeKernel = async () => {
      if (!currentSession) {
        return;
      }
      await (sessionDialogs || sessionContextDialogs).selectKernel(
        currentSession,
        translator
      );
    };

    // Create the status item.
    const item = new KernelStatus({ onClick: changeKernel }, translator);

    // When the title of the active widget changes, update the label
    // of the hover text.
    const onTitleChanged = (title: Title<Widget>) => {
      item.model!.activityName = title.label;
    };

    // Keep the session object on the status item up-to-date.
    labShell.currentChanged.connect((_, change) => {
      const { oldValue, newValue } = change;

      // Clean up after the old value if it exists,
      // listen for changes to the title of the activity
      if (oldValue) {
        oldValue.title.changed.disconnect(onTitleChanged);
      }
      if (newValue) {
        newValue.title.changed.connect(onTitleChanged);
      }

      // Grab the session off of the current widget, if it exists.
      if (newValue && consoleTracker.has(newValue)) {
        currentSession = (newValue as ConsolePanel).sessionContext;
      } else if (newValue && notebookTracker.has(newValue)) {
        currentSession = (newValue as NotebookPanel).sessionContext;
      } else {
        currentSession = null;
      }
      item.model!.sessionContext = currentSession;
    });

    statusBar.registerStatusItem(
      '@jupyterlab/statusbar-extension:kernel-status',
      {
        item,
        align: 'left',
        rank: 1,
        isActive: () => {
          const current = labShell.currentWidget;
          return (
            !!current &&
            (notebookTracker.has(current) || consoleTracker.has(current))
          );
        }
      }
    );
  }
};

/**
 * A plugin providing a line/column status item to the application.
 */
export const lineColItem: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/statusbar-extension:line-col-status',
  autoStart: true,
  requires: [
    IStatusBar,
    INotebookTracker,
    IEditorTracker,
    IConsoleTracker,
    ILabShell,
    ITranslator
  ],
  activate: (
    _: JupyterFrontEnd,
    statusBar: IStatusBar,
    notebookTracker: INotebookTracker,
    editorTracker: IEditorTracker,
    consoleTracker: IConsoleTracker,
    labShell: ILabShell,
    translator: ITranslator
  ) => {
    const item = new LineCol(translator);

    const onActiveCellChanged = (notebook: Notebook, cell: Cell) => {
      item.model!.editor = cell && cell.editor;
    };

    const onPromptCreated = (console: CodeConsole, prompt: CodeCell) => {
      item.model!.editor = prompt && prompt.editor;
    };

    labShell.currentChanged.connect((_, change) => {
      const { oldValue, newValue } = change;

      // Check if we need to disconnect the console listener
      // or the notebook active cell listener
      if (oldValue && consoleTracker.has(oldValue)) {
        (oldValue as ConsolePanel).console.promptCellCreated.disconnect(
          onPromptCreated
        );
      } else if (oldValue && notebookTracker.has(oldValue)) {
        (oldValue as NotebookPanel).content.activeCellChanged.disconnect(
          onActiveCellChanged
        );
      }

      // Wire up the new editor to the model if it exists
      if (newValue && consoleTracker.has(newValue)) {
        (newValue as ConsolePanel).console.promptCellCreated.connect(
          onPromptCreated
        );
        const prompt = (newValue as ConsolePanel).console.promptCell;
        item.model!.editor = prompt && prompt.editor;
      } else if (newValue && notebookTracker.has(newValue)) {
        (newValue as NotebookPanel).content.activeCellChanged.connect(
          onActiveCellChanged
        );
        const cell = (newValue as NotebookPanel).content.activeCell;
        item.model!.editor = cell && cell.editor;
      } else if (newValue && editorTracker.has(newValue)) {
        item.model!.editor = (newValue as IDocumentWidget<
          FileEditor
        >).content.editor;
      } else {
        item.model!.editor = null;
      }
    });

    // Add the status item to the status bar.
    statusBar.registerStatusItem(
      '@jupyterlab/statusbar-extension:line-col-status',
      {
        item,
        align: 'right',
        rank: 2,
        isActive: () => {
          const current = labShell.currentWidget;
          return (
            !!current &&
            (notebookTracker.has(current) ||
              editorTracker.has(current) ||
              consoleTracker.has(current))
          );
        }
      }
    );
  }
};

/**
 * A plugin providing memory usage statistics to the application.
 *
 * #### Notes
 * This plugin will not work unless the memory usage server extension
 * is installed.
 */
export const memoryUsageItem: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/statusbar-extension:memory-usage-status',
  autoStart: true,
  requires: [IStatusBar, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    statusBar: IStatusBar,
    translator: ITranslator
  ) => {
    const item = new MemoryUsage(translator);

    statusBar.registerStatusItem(
      '@jupyterlab/statusbar-extension:memory-usage-status',
      {
        item,
        align: 'left',
        rank: 2,
        isActive: () => item.model!.metricsAvailable,
        activeStateChanged: item.model!.stateChanged
      }
    );
  }
};

/*
 * A plugin providing running terminals and sessions information
 * to the status bar.
 */
export const runningSessionsItem: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/statusbar-extension:running-sessions-status',
  autoStart: true,
  requires: [IStatusBar, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    statusBar: IStatusBar,
    translator: ITranslator
  ) => {
    const item = new RunningSessions({
      onClick: () => app.shell.activateById('jp-running-sessions'),
      serviceManager: app.serviceManager,
      translator
    });

    statusBar.registerStatusItem(
      '@jupyterlab/statusbar-extension:running-sessions-status',
      {
        item,
        align: 'left',
        rank: 0
      }
    );
  }
};

/**
 * The single-document mode switch in the top area.
 */
const modeSwitch: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/statusbar-extension:mode-switch',
  requires: [ILabShell, ITranslator, IStatusBar],
  activate: (
    app: JupyterFrontEnd,
    labShell: ILabShell,
    translator: ITranslator,
    statusBar: IStatusBar
  ) => {
    const trans = translator.load('jupyterlab');

    // proxy to access and modify the lab shell mode
    const shell = {
      get mode(): DockPanel.Mode {
        return labShell.mode;
      },
      set mode(mode: DockPanel.Mode) {
        labShell.mode = mode;
      }
    };
    const { commands } = app;
    const modeSwitch = new ModeSwitch({
      shell,
      commands,
      trans
    });
    modeSwitch.id = 'jp-single-document-mode';

    statusBar.registerStatusItem(
      '@jupyterlab/statusbar-extension:mode-switch',
      {
        item: modeSwitch,
        align: 'left',
        isActive: () => true,
        rank: -1
      }
    );
  },
  autoStart: true
};

const plugins: JupyterFrontEndPlugin<any>[] = [
  statusBar,
  lineColItem,
  kernelStatus,
  runningSessionsItem,
  memoryUsageItem,
  modeSwitch
];

export default plugins;
