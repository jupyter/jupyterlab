// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILabStatus,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  Dialog,
  ISessionContext,
  ISessionContextDialogs,
  ICommandPalette,
  sessionContextDialogs,
  showDialog,
  WidgetTracker
} from '@jupyterlab/apputils';

import { IEditorServices } from '@jupyterlab/codeeditor';

import { ConsolePanel, IConsoleTracker } from '@jupyterlab/console';

import { PageConfig, URLExt } from '@jupyterlab/coreutils';

import { IFileBrowserFactory } from '@jupyterlab/filebrowser';

import { ILauncher } from '@jupyterlab/launcher';

import {
  IEditMenu,
  IFileMenu,
  IHelpMenu,
  IKernelMenu,
  IMainMenu,
  IRunMenu
} from '@jupyterlab/mainmenu';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { consoleIcon } from '@jupyterlab/ui-components';

import { find } from '@lumino/algorithm';

import {
  JSONExt,
  JSONObject,
  ReadonlyPartialJSONObject,
  UUID,
  ReadonlyJSONValue
} from '@lumino/coreutils';

import { DisposableSet } from '@lumino/disposable';

import { DockLayout, Menu } from '@lumino/widgets';

import foreign from './foreign';

/**
 * The command IDs used by the console plugin.
 */
namespace CommandIDs {
  export const create = 'console:create';

  export const clear = 'console:clear';

  export const runUnforced = 'console:run-unforced';

  export const runForced = 'console:run-forced';

  export const linebreak = 'console:linebreak';

  export const interrupt = 'console:interrupt-kernel';

  export const restart = 'console:restart-kernel';

  export const closeAndShutdown = 'console:close-and-shutdown';

  export const open = 'console:open';

  export const inject = 'console:inject';

  export const changeKernel = 'console:change-kernel';

  export const enterToExecute = 'console:enter-to-execute';

  export const shiftEnterToExecute = 'console:shift-enter-to-execute';

  export const interactionMode = 'console:interaction-mode';

  export const replaceSelection = 'console:replace-selection';
}

/**
 * The console widget tracker provider.
 */
const tracker: JupyterFrontEndPlugin<IConsoleTracker> = {
  id: '@jupyterlab/console-extension:tracker',
  provides: IConsoleTracker,
  requires: [
    IEditorServices,
    ILayoutRestorer,
    IFileBrowserFactory,
    IRenderMimeRegistry,
    ISettingRegistry
  ],
  optional: [
    IMainMenu,
    ICommandPalette,
    ILauncher,
    ILabStatus,
    ISessionContextDialogs
  ],
  activate: activateConsole,
  autoStart: true
};

/**
 * Export the plugins as the default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [tracker, foreign];
export default plugins;

/**
 * Activate the console extension.
 */
async function activateConsole(
  app: JupyterFrontEnd,
  editorServices: IEditorServices,
  restorer: ILayoutRestorer,
  browserFactory: IFileBrowserFactory,
  rendermime: IRenderMimeRegistry,
  settingRegistry: ISettingRegistry,
  mainMenu: IMainMenu | null,
  palette: ICommandPalette | null,
  launcher: ILauncher | null,
  status: ILabStatus | null,
  sessionDialogs: ISessionContextDialogs | null
): Promise<IConsoleTracker> {
  const manager = app.serviceManager;
  const { commands, shell } = app;
  const category = 'Console';
  sessionDialogs = sessionDialogs ?? sessionContextDialogs;

  // Create a widget tracker for all console panels.
  const tracker = new WidgetTracker<ConsolePanel>({
    namespace: 'console'
  });

  // Handle state restoration.
  void restorer.restore(tracker, {
    command: CommandIDs.create,
    args: widget => {
      const { path, name, kernelPreference } = widget.console.sessionContext;
      return {
        path,
        name,
        kernelPreference: { ...kernelPreference }
      };
    },
    name: widget => widget.console.sessionContext.path ?? UUID.uuid4(),
    when: manager.ready
  });

  // Add a launcher item if the launcher is available.
  if (launcher) {
    void manager.ready.then(() => {
      let disposables: DisposableSet | null = null;
      const onSpecsChanged = () => {
        if (disposables) {
          disposables.dispose();
          disposables = null;
        }
        const specs = manager.kernelspecs.specs;
        if (!specs) {
          return;
        }
        disposables = new DisposableSet();
        const baseUrl = PageConfig.getBaseUrl();
        for (const name in specs.kernelspecs) {
          const rank = name === specs.default ? 0 : Infinity;
          const spec = specs.kernelspecs[name]!;
          let kernelIconUrl = spec.resources['logo-64x64'];
          if (kernelIconUrl) {
            const index = kernelIconUrl.indexOf('kernelspecs');
            kernelIconUrl = URLExt.join(baseUrl, kernelIconUrl.slice(index));
          }
          disposables.add(
            launcher.add({
              command: CommandIDs.create,
              args: { isLauncher: true, kernelPreference: { name } },
              category: 'Console',
              rank,
              kernelIconUrl,
              metadata: {
                kernel: JSONExt.deepCopy(
                  spec.metadata || {}
                ) as ReadonlyJSONValue
              }
            })
          );
        }
      };
      onSpecsChanged();
      manager.kernelspecs.specsChanged.connect(onSpecsChanged);
    });
  }

  /**
   * The options used to create a widget.
   */
  interface ICreateOptions extends Partial<ConsolePanel.IOptions> {
    /**
     * Whether to activate the widget.  Defaults to `true`.
     */
    activate?: boolean;

    /**
     * The reference widget id for the insert location.
     *
     * The default is `null`.
     */
    ref?: string | null;

    /**
     * The tab insert mode.
     *
     * An insert mode is used to specify how a widget should be added
     * to the main area relative to a reference widget.
     */
    insertMode?: DockLayout.InsertMode;
  }

  /**
   * Create a console for a given path.
   */
  async function createConsole(options: ICreateOptions): Promise<ConsolePanel> {
    await manager.ready;

    const panel = new ConsolePanel({
      manager,
      mimeTypeService: editorServices.mimeTypeService,
      rendermime,
      setBusy: (status && (() => status.setBusy())) ?? undefined,
      ...(options as Partial<ConsolePanel.IOptions>)
    });

    const interactionMode: string = (
      await settingRegistry.get(
        '@jupyterlab/console-extension:tracker',
        'interactionMode'
      )
    ).composite as string;
    panel.console.node.dataset.jpInteractionMode = interactionMode;

    // Add the console panel to the tracker. We want the panel to show up before
    // any kernel selection dialog, so we do not await panel.session.ready;
    await tracker.add(panel);
    panel.sessionContext.propertyChanged.connect(() => {
      void tracker.save(panel);
    });

    shell.add(panel, 'main', {
      ref: options.ref,
      mode: options.insertMode,
      activate: options.activate !== false
    });
    return panel;
  }

  const pluginId = '@jupyterlab/console-extension:tracker';
  let interactionMode: string;
  async function updateSettings() {
    interactionMode = (await settingRegistry.get(pluginId, 'interactionMode'))
      .composite as string;
    tracker.forEach(widget => {
      widget.console.node.dataset.jpInteractionMode = interactionMode;
    });
  }
  settingRegistry.pluginChanged.connect((sender, plugin) => {
    if (plugin === pluginId) {
      void updateSettings();
    }
  });
  await updateSettings();

  /**
   * Whether there is an active console.
   */
  function isEnabled(): boolean {
    return (
      tracker.currentWidget !== null &&
      tracker.currentWidget === shell.currentWidget
    );
  }

  /**
   * The options used to open a console.
   */
  interface IOpenOptions extends Partial<ConsolePanel.IOptions> {
    /**
     * Whether to activate the console.  Defaults to `true`.
     */
    activate?: boolean;
  }

  let command = CommandIDs.open;
  commands.addCommand(command, {
    execute: (args: IOpenOptions) => {
      const path = args['path'];
      const widget = tracker.find(value => {
        return value.console.sessionContext.session?.path === path;
      });
      if (widget) {
        if (args.activate !== false) {
          shell.activateById(widget.id);
        }
        return widget;
      } else {
        return manager.ready.then(() => {
          const model = find(manager.sessions.running(), item => {
            return item.path === path;
          });
          if (model) {
            return createConsole(args);
          }
          return Promise.reject(`No running kernel session for path: ${path}`);
        });
      }
    }
  });

  command = CommandIDs.create;
  commands.addCommand(command, {
    label: args => {
      if (args['isPalette']) {
        return 'New Console';
      } else if (args['isLauncher'] && args['kernelPreference']) {
        const kernelPreference = args[
          'kernelPreference'
        ] as ISessionContext.IKernelPreference;
        // TODO: Lumino command functions should probably be allowed to return undefined?
        return (
          manager.kernelspecs?.specs?.kernelspecs[kernelPreference.name || '']
            ?.display_name ?? ''
        );
      }
      return 'Console';
    },
    icon: args => (args['isPalette'] ? undefined : consoleIcon),
    execute: args => {
      const basePath =
        (args['basePath'] as string) ||
        (args['cwd'] as string) ||
        browserFactory.defaultBrowser.model.path;
      return createConsole({ basePath, ...args });
    }
  });

  // Get the current widget and activate unless the args specify otherwise.
  function getCurrent(args: ReadonlyPartialJSONObject): ConsolePanel | null {
    const widget = tracker.currentWidget;
    const activate = args['activate'] !== false;
    if (activate && widget) {
      shell.activateById(widget.id);
    }
    return widget ?? null;
  }

  commands.addCommand(CommandIDs.clear, {
    label: 'Clear Console Cells',
    execute: args => {
      const current = getCurrent(args);
      if (!current) {
        return;
      }
      current.console.clear();
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.runUnforced, {
    label: 'Run Cell (unforced)',
    execute: args => {
      const current = getCurrent(args);
      if (!current) {
        return;
      }
      return current.console.execute();
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.runForced, {
    label: 'Run Cell (forced)',
    execute: args => {
      const current = getCurrent(args);
      if (!current) {
        return;
      }
      return current.console.execute(true);
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.linebreak, {
    label: 'Insert Line Break',
    execute: args => {
      const current = getCurrent(args);
      if (!current) {
        return;
      }
      current.console.insertLinebreak();
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.replaceSelection, {
    label: 'Replace Selection in Console',
    execute: args => {
      const current = getCurrent(args);
      if (!current) {
        return;
      }
      const text: string = (args['text'] as string) || '';
      current.console.replaceSelection(text);
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
      const kernel = current.console.sessionContext.session?.kernel;
      if (kernel) {
        return kernel.interrupt();
      }
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.restart, {
    label: 'Restart Kernel…',
    execute: args => {
      const current = getCurrent(args);
      if (!current) {
        return;
      }
      return sessionDialogs!.restart(current.console.sessionContext);
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.closeAndShutdown, {
    label: 'Close and Shut Down…',
    execute: args => {
      const current = getCurrent(args);
      if (!current) {
        return;
      }
      return showDialog({
        title: 'Shut down the console?',
        body: `Are you sure you want to close "${current.title.label}"?`,
        buttons: [Dialog.cancelButton(), Dialog.warnButton()]
      }).then(result => {
        if (result.button.accept) {
          return current.console.sessionContext.shutdown().then(() => {
            current.dispose();
            return true;
          });
        } else {
          return false;
        }
      });
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.inject, {
    execute: args => {
      const path = args['path'];
      tracker.find(widget => {
        if (widget.console.sessionContext.session?.path === path) {
          if (args['activate'] !== false) {
            shell.activateById(widget.id);
          }
          void widget.console.inject(
            args['code'] as string,
            args['metadata'] as JSONObject
          );
          return true;
        }
        return false;
      });
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.changeKernel, {
    label: 'Change Kernel…',
    execute: args => {
      const current = getCurrent(args);
      if (!current) {
        return;
      }
      return sessionDialogs!.selectKernel(current.console.sessionContext);
    },
    isEnabled
  });

  if (palette) {
    // Add command palette items
    [
      CommandIDs.create,
      CommandIDs.linebreak,
      CommandIDs.clear,
      CommandIDs.runUnforced,
      CommandIDs.runForced,
      CommandIDs.restart,
      CommandIDs.interrupt,
      CommandIDs.changeKernel,
      CommandIDs.closeAndShutdown
    ].forEach(command => {
      palette.addItem({ command, category, args: { isPalette: true } });
    });
  }

  if (mainMenu) {
    // Add a console creator to the File menu
    mainMenu.fileMenu.newMenu.addGroup([{ command: CommandIDs.create }], 0);

    // Add a close and shutdown command to the file menu.
    mainMenu.fileMenu.closeAndCleaners.add({
      tracker,
      action: 'Shutdown',
      name: 'Console',
      closeAndCleanup: (current: ConsolePanel) => {
        return showDialog({
          title: 'Shut down the console?',
          body: `Are you sure you want to close "${current.title.label}"?`,
          buttons: [Dialog.cancelButton(), Dialog.warnButton()]
        }).then(result => {
          if (result.button.accept) {
            return current.console.sessionContext.shutdown().then(() => {
              current.dispose();
            });
          } else {
            return void 0;
          }
        });
      }
    } as IFileMenu.ICloseAndCleaner<ConsolePanel>);

    // Add a kernel user to the Kernel menu
    mainMenu.kernelMenu.kernelUsers.add({
      tracker,
      interruptKernel: current => {
        const kernel = current.console.sessionContext.session?.kernel;
        if (kernel) {
          return kernel.interrupt();
        }
        return Promise.resolve(void 0);
      },
      noun: 'Console',
      restartKernel: current =>
        sessionDialogs!.restart(current.console.sessionContext),
      restartKernelAndClear: current => {
        return sessionDialogs!
          .restart(current.console.sessionContext)
          .then(restarted => {
            if (restarted) {
              current.console.clear();
            }
            return restarted;
          });
      },
      changeKernel: current =>
        sessionDialogs!.selectKernel(current.console.sessionContext),
      shutdownKernel: current => current.console.sessionContext.shutdown()
    } as IKernelMenu.IKernelUser<ConsolePanel>);

    // Add a code runner to the Run menu.
    mainMenu.runMenu.codeRunners.add({
      tracker,
      noun: 'Cell',
      pluralNoun: 'Cells',
      run: current => current.console.execute(true)
    } as IRunMenu.ICodeRunner<ConsolePanel>);

    // Add a clearer to the edit menu
    mainMenu.editMenu.clearers.add({
      tracker,
      noun: 'Console Cells',
      clearCurrent: (current: ConsolePanel) => {
        return current.console.clear();
      }
    } as IEditMenu.IClearer<ConsolePanel>);
  }

  // For backwards compatibility and clarity, we explicitly label the run
  // keystroke with the actual effected change, rather than the generic
  // "notebook" or "terminal" interaction mode. When this interaction mode
  // affects more than just the run keystroke, we can make this menu title more
  // generic.
  const runShortcutTitles: { [index: string]: string } = {
    notebook: 'Execute with Shift+Enter',
    terminal: 'Execute with Enter'
  };

  // Add the execute keystroke setting submenu.
  commands.addCommand(CommandIDs.interactionMode, {
    label: args => runShortcutTitles[args['interactionMode'] as string] || '',
    execute: async args => {
      const key = 'keyMap';
      try {
        await settingRegistry.set(
          pluginId,
          'interactionMode',
          args['interactionMode'] as string
        );
      } catch (reason) {
        console.error(`Failed to set ${pluginId}:${key} - ${reason.message}`);
      }
    },
    isToggled: args => args['interactionMode'] === interactionMode
  });

  const executeMenu = new Menu({ commands });
  executeMenu.title.label = 'Console Run Keystroke';

  ['terminal', 'notebook'].forEach(name =>
    executeMenu.addItem({
      command: CommandIDs.interactionMode,
      args: { interactionMode: name }
    })
  );

  if (mainMenu) {
    mainMenu.settingsMenu.addGroup(
      [
        {
          type: 'submenu' as Menu.ItemType,
          submenu: executeMenu
        }
      ],
      10
    );

    // Add kernel information to the application help menu.
    mainMenu.helpMenu.kernelUsers.add({
      tracker,
      getKernel: current => current.sessionContext.session?.kernel
    } as IHelpMenu.IKernelUser<ConsolePanel>);
  }

  app.contextMenu.addItem({
    command: CommandIDs.clear,
    selector: '.jp-CodeConsole-content'
  });
  app.contextMenu.addItem({
    command: CommandIDs.restart,
    selector: '.jp-CodeConsole'
  });

  return tracker;
}
