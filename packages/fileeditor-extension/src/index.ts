// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module fileeditor-extension
 */

import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  createToolbarFactory,
  ICommandPalette,
  ISessionContextDialogs,
  IToolbarWidgetRegistry,
  WidgetTracker
} from '@jupyterlab/apputils';
import { CodeEditor, IEditorServices } from '@jupyterlab/codeeditor';
import { IConsoleTracker } from '@jupyterlab/console';
import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import {
  FileEditor,
  FileEditorFactory,
  IEditorTracker,
  TabSpaceStatus
} from '@jupyterlab/fileeditor';
import { ILauncher } from '@jupyterlab/launcher';
import { IMainMenu } from '@jupyterlab/mainmenu';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStatusBar } from '@jupyterlab/statusbar';
import { ITranslator } from '@jupyterlab/translation';
import { JSONObject } from '@lumino/coreutils';
import { Menu } from '@lumino/widgets';
import { Commands, FACTORY, IFileTypeData } from './commands';

export { Commands } from './commands';

/**
 * The editor tracker extension.
 */
const plugin: JupyterFrontEndPlugin<IEditorTracker> = {
  activate,
  id: '@jupyterlab/fileeditor-extension:plugin',
  requires: [
    IEditorServices,
    IFileBrowserFactory,
    ISettingRegistry,
    ITranslator
  ],
  optional: [
    IConsoleTracker,
    ICommandPalette,
    ILauncher,
    IMainMenu,
    ILayoutRestorer,
    ISessionContextDialogs,
    IToolbarWidgetRegistry
  ],
  provides: IEditorTracker,
  autoStart: true
};

/**
 * A plugin that provides a status item allowing the user to
 * switch tabs vs spaces and tab widths for text editors.
 */
export const tabSpaceStatus: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/fileeditor-extension:tab-space-status',
  autoStart: true,
  requires: [IEditorTracker, ISettingRegistry, ITranslator],
  optional: [IStatusBar],
  activate: (
    app: JupyterFrontEnd,
    editorTracker: IEditorTracker,
    settingRegistry: ISettingRegistry,
    translator: ITranslator,
    statusBar: IStatusBar | null
  ) => {
    const trans = translator.load('jupyterlab');
    if (!statusBar) {
      // Automatically disable if statusbar missing
      return;
    }
    // Create a menu for switching tabs vs spaces.
    const menu = new Menu({ commands: app.commands });
    const command = 'fileeditor:change-tabs';
    const { shell } = app;
    const args: JSONObject = {
      insertSpaces: false,
      size: 4,
      name: trans.__('Indent with Tab')
    };
    menu.addItem({ command, args });
    for (const size of [1, 2, 4, 8]) {
      const args: JSONObject = {
        insertSpaces: true,
        size,
        name: trans._n('Spaces: %1', 'Spaces: %1', size)
      };
      menu.addItem({ command, args });
    }

    // Create the status item.
    const item = new TabSpaceStatus({ menu, translator });

    // Keep a reference to the code editor config from the settings system.
    const updateSettings = (settings: ISettingRegistry.ISettings): void => {
      item.model!.config = {
        ...CodeEditor.defaultConfig,
        ...(settings.get('editorConfig').composite as JSONObject)
      };
    };
    void Promise.all([
      settingRegistry.load('@jupyterlab/fileeditor-extension:plugin'),
      app.restored
    ]).then(([settings]) => {
      updateSettings(settings);
      settings.changed.connect(updateSettings);
    });

    // Add the status item.
    statusBar.registerStatusItem(
      '@jupyterlab/fileeditor-extension:tab-space-status',
      {
        item,
        align: 'right',
        rank: 1,
        isActive: () => {
          return (
            !!shell.currentWidget && editorTracker.has(shell.currentWidget)
          );
        }
      }
    );
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [plugin, tabSpaceStatus];
export default plugins;

/**
 * Activate the editor tracker plugin.
 */
function activate(
  app: JupyterFrontEnd,
  editorServices: IEditorServices,
  browserFactory: IFileBrowserFactory,
  settingRegistry: ISettingRegistry,
  translator: ITranslator,
  consoleTracker: IConsoleTracker | null,
  palette: ICommandPalette | null,
  launcher: ILauncher | null,
  menu: IMainMenu | null,
  restorer: ILayoutRestorer | null,
  sessionDialogs: ISessionContextDialogs | null,
  toolbarRegistry: IToolbarWidgetRegistry | null
): IEditorTracker {
  const id = plugin.id;
  const trans = translator.load('jupyterlab');
  const namespace = 'editor';
  let toolbarFactory:
    | ((widget: IDocumentWidget<FileEditor>) => DocumentRegistry.IToolbarItem[])
    | undefined;

  if (toolbarRegistry) {
    toolbarFactory = createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      FACTORY,
      id,
      translator
    );
  }

  const factory = new FileEditorFactory({
    editorServices,
    factoryOptions: {
      name: FACTORY,
      fileTypes: ['markdown', '*'], // Explicitly add the markdown fileType so
      defaultFor: ['markdown', '*'], // it outranks the defaultRendered viewer.
      toolbarFactory,
      translator
    }
  });
  const { commands, restored, shell } = app;
  const tracker = new WidgetTracker<IDocumentWidget<FileEditor>>({
    namespace
  });
  const isEnabled = () =>
    tracker.currentWidget !== null &&
    tracker.currentWidget === shell.currentWidget;

  const commonLanguageFileTypeData = new Map<string, IFileTypeData[]>([
    [
      'python',
      [
        {
          fileExt: 'py',
          iconName: 'ui-components:python',
          launcherLabel: trans.__('Python File'),
          paletteLabel: trans.__('New Python File'),
          caption: trans.__('Create a new Python file')
        }
      ]
    ],
    [
      'julia',
      [
        {
          fileExt: 'jl',
          iconName: 'ui-components:julia',
          launcherLabel: trans.__('Julia File'),
          paletteLabel: trans.__('New Julia File'),
          caption: trans.__('Create a new Julia file')
        }
      ]
    ],
    [
      'R',
      [
        {
          fileExt: 'r',
          iconName: 'ui-components:r-kernel',
          launcherLabel: trans.__('R File'),
          paletteLabel: trans.__('New R File'),
          caption: trans.__('Create a new R file')
        }
      ]
    ]
  ]);

  // Use available kernels to determine which common file types should have 'Create New' options in the Launcher, File Editor palette, and File menu
  const getAvailableKernelFileTypes = async (): Promise<Set<IFileTypeData>> => {
    const specsManager = app.serviceManager.kernelspecs;
    await specsManager.ready;
    let fileTypes = new Set<IFileTypeData>();
    const specs = specsManager.specs?.kernelspecs ?? {};
    Object.keys(specs).forEach(spec => {
      const specModel = specs[spec];
      if (specModel) {
        const exts = commonLanguageFileTypeData.get(specModel.language);
        exts?.forEach(ext => fileTypes.add(ext));
      }
    });
    return fileTypes;
  };

  // Handle state restoration.
  if (restorer) {
    void restorer.restore(tracker, {
      command: 'docmanager:open',
      args: widget => ({ path: widget.context.path, factory: FACTORY }),
      name: widget => widget.context.path
    });
  }

  // Add a console creator to the File menu
  // Fetch the initial state of the settings.
  Promise.all([settingRegistry.load(id), restored])
    .then(([settings]) => {
      Commands.updateSettings(settings, commands);
      Commands.updateTracker(tracker);
      settings.changed.connect(() => {
        Commands.updateSettings(settings, commands);
        Commands.updateTracker(tracker);
      });
    })
    .catch((reason: Error) => {
      console.error(reason.message);
      Commands.updateTracker(tracker);
    });

  factory.widgetCreated.connect((sender, widget) => {
    // Notify the widget tracker if restore data needs to update.
    widget.context.pathChanged.connect(() => {
      void tracker.save(widget);
    });
    void tracker.add(widget);
    Commands.updateWidget(widget.content);
  });
  app.docRegistry.addWidgetFactory(factory);

  // Handle the settings of new widgets.
  tracker.widgetAdded.connect((sender, widget) => {
    Commands.updateWidget(widget.content);
  });

  Commands.addCommands(
    commands,
    settingRegistry,
    trans,
    id,
    isEnabled,
    tracker,
    browserFactory
  );

  // Add a launcher item if the launcher is available.
  if (launcher) {
    Commands.addLauncherItems(launcher, trans);
  }

  if (palette) {
    Commands.addPaletteItems(palette, trans);
  }

  if (menu) {
    Commands.addMenuItems(
      menu,
      commands,
      tracker,
      trans,
      consoleTracker,
      sessionDialogs
    );
  }

  getAvailableKernelFileTypes()
    .then(availableKernelFileTypes => {
      if (launcher) {
        Commands.addKernelLanguageLauncherItems(
          launcher,
          trans,
          availableKernelFileTypes
        );
      }

      if (palette) {
        Commands.addKernelLanguagePaletteItems(
          palette,
          trans,
          availableKernelFileTypes
        );
      }

      if (menu) {
        Commands.addKernelLanguageMenuItems(menu, availableKernelFileTypes);
      }
    })
    .catch((reason: Error) => {
      console.error(reason.message);
    });

  return tracker;
}
