// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module mainmenu-extension
 */

import {
  ILabShell,
  IRouter,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  Dialog,
  ICommandPalette,
  MenuFactory,
  showDialog
} from '@jupyterlab/apputils';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import {
  IEditMenu,
  IFileMenu,
  IKernelMenu,
  IMainMenu,
  IMenuExtender,
  IRunMenu,
  ITabsMenu,
  IViewMenu,
  JupyterLabMenu,
  MainMenu
} from '@jupyterlab/mainmenu';
import { ServerConnection } from '@jupyterlab/services';
import { ISettingRegistry, SettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator, TranslationBundle } from '@jupyterlab/translation';
import {
  fastForwardIcon,
  refreshIcon,
  runIcon,
  stopIcon
} from '@jupyterlab/ui-components';
import { each, find } from '@lumino/algorithm';
import { JSONExt } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { Menu, Widget } from '@lumino/widgets';

const PLUGIN_ID = '@jupyterlab/mainmenu-extension:plugin';

/**
 * A namespace for command IDs of semantic extension points.
 */
export namespace CommandIDs {
  export const openEdit = 'editmenu:open';

  export const undo = 'editmenu:undo';

  export const redo = 'editmenu:redo';

  export const clearCurrent = 'editmenu:clear-current';

  export const clearAll = 'editmenu:clear-all';

  export const find = 'editmenu:find';

  export const goToLine = 'editmenu:go-to-line';

  export const openFile = 'filemenu:open';

  export const closeAndCleanup = 'filemenu:close-and-cleanup';

  export const createConsole = 'filemenu:create-console';

  export const shutdown = 'filemenu:shutdown';

  export const logout = 'filemenu:logout';

  export const openKernel = 'kernelmenu:open';

  export const interruptKernel = 'kernelmenu:interrupt';

  export const reconnectToKernel = 'kernelmenu:reconnect-to-kernel';

  export const restartKernel = 'kernelmenu:restart';

  export const restartKernelAndClear = 'kernelmenu:restart-and-clear';

  export const changeKernel = 'kernelmenu:change';

  export const shutdownKernel = 'kernelmenu:shutdown';

  export const shutdownAllKernels = 'kernelmenu:shutdownAll';

  export const openView = 'viewmenu:open';

  export const wordWrap = 'viewmenu:word-wrap';

  export const lineNumbering = 'viewmenu:line-numbering';

  export const matchBrackets = 'viewmenu:match-brackets';

  export const openRun = 'runmenu:open';

  export const run = 'runmenu:run';

  export const runAll = 'runmenu:run-all';

  export const restartAndRunAll = 'runmenu:restart-and-run-all';

  export const runAbove = 'runmenu:run-above';

  export const runBelow = 'runmenu:run-below';

  export const openTabs = 'tabsmenu:open';

  export const activateById = 'tabsmenu:activate-by-id';

  export const activatePreviouslyUsedTab =
    'tabsmenu:activate-previously-used-tab';

  export const openSettings = 'settingsmenu:open';

  export const openHelp = 'helpmenu:open';

  export const openFirst = 'mainmenu:open-first';
}

/**
 * A service providing an interface to the main menu.
 */
const plugin: JupyterFrontEndPlugin<IMainMenu> = {
  id: PLUGIN_ID,
  requires: [IRouter, ITranslator],
  optional: [ICommandPalette, ILabShell, ISettingRegistry],
  provides: IMainMenu,
  activate: async (
    app: JupyterFrontEnd,
    router: IRouter,
    translator: ITranslator,
    palette: ICommandPalette | null,
    labShell: ILabShell | null,
    registry: ISettingRegistry | null
  ): Promise<IMainMenu> => {
    const { commands } = app;
    const trans = translator.load('jupyterlab');

    const menu = new MainMenu(commands);
    menu.id = 'jp-MainMenu';
    menu.addClass('jp-scrollbar-tiny');

    // Built menu from settings
    if (registry) {
      await Private.loadSettingsMenu(
        registry,
        (aMenu: JupyterLabMenu) => {
          menu.addMenu(aMenu, { rank: aMenu.rank });
        },
        options => MainMenu.generateMenu(commands, options, trans),
        translator
      );
    }

    // Only add quit button if the back-end supports it by checking page config.
    const quitButton = PageConfig.getOption('quitButton').toLowerCase();
    menu.fileMenu.quitEntry = quitButton === 'true';

    // Create the application menus.
    createEditMenu(app, menu.editMenu, trans);
    createFileMenu(app, menu.fileMenu, router, trans);
    createKernelMenu(app, menu.kernelMenu, trans);
    createRunMenu(app, menu.runMenu, trans);
    createViewMenu(app, menu.viewMenu, trans);

    // The tabs menu relies on lab shell functionality.
    if (labShell) {
      createTabsMenu(app, menu.tabsMenu, labShell, trans);
    }

    // Create commands to open the main application menus.
    const activateMenu = (item: Menu) => {
      menu.activeMenu = item;
      menu.openActiveMenu();
    };

    commands.addCommand(CommandIDs.openEdit, {
      label: trans.__('Open Edit Menu'),
      execute: () => activateMenu(menu.editMenu)
    });
    commands.addCommand(CommandIDs.openFile, {
      label: trans.__('Open File Menu'),
      execute: () => activateMenu(menu.fileMenu)
    });
    commands.addCommand(CommandIDs.openKernel, {
      label: trans.__('Open Kernel Menu'),
      execute: () => activateMenu(menu.kernelMenu)
    });
    commands.addCommand(CommandIDs.openRun, {
      label: trans.__('Open Run Menu'),
      execute: () => activateMenu(menu.runMenu)
    });
    commands.addCommand(CommandIDs.openView, {
      label: trans.__('Open View Menu'),
      execute: () => activateMenu(menu.viewMenu)
    });
    commands.addCommand(CommandIDs.openSettings, {
      label: trans.__('Open Settings Menu'),
      execute: () => activateMenu(menu.settingsMenu)
    });
    commands.addCommand(CommandIDs.openTabs, {
      label: trans.__('Open Tabs Menu'),
      execute: () => activateMenu(menu.tabsMenu)
    });
    commands.addCommand(CommandIDs.openHelp, {
      label: trans.__('Open Help Menu'),
      execute: () => activateMenu(menu.helpMenu)
    });
    commands.addCommand(CommandIDs.openFirst, {
      label: trans.__('Open First Menu'),
      execute: () => {
        menu.activeIndex = 0;
        menu.openActiveMenu();
      }
    });

    if (palette) {
      // Add some of the commands defined here to the command palette.
      palette.addItem({
        command: CommandIDs.shutdown,
        category: trans.__('Main Area')
      });
      palette.addItem({
        command: CommandIDs.logout,
        category: trans.__('Main Area')
      });

      palette.addItem({
        command: CommandIDs.shutdownAllKernels,
        category: trans.__('Kernel Operations')
      });

      palette.addItem({
        command: CommandIDs.activatePreviouslyUsedTab,
        category: trans.__('Main Area')
      });
    }

    app.shell.add(menu, 'menu', { rank: 100 });

    return menu;
  }
};

/**
 * Create the basic `Edit` menu.
 */
export function createEditMenu(
  app: JupyterFrontEnd,
  menu: IEditMenu,
  trans: TranslationBundle
): void {
  const commands = app.commands;

  // Add the undo/redo commands the the Edit menu.
  commands.addCommand(CommandIDs.undo, {
    label: trans.__('Undo'),
    isEnabled: Private.delegateEnabled(app, menu.undoers, 'undo'),
    execute: Private.delegateExecute(app, menu.undoers, 'undo')
  });
  commands.addCommand(CommandIDs.redo, {
    label: trans.__('Redo'),
    isEnabled: Private.delegateEnabled(app, menu.undoers, 'redo'),
    execute: Private.delegateExecute(app, menu.undoers, 'redo')
  });

  // Add the clear commands to the Edit menu.
  commands.addCommand(CommandIDs.clearCurrent, {
    label: () => {
      const enabled = Private.delegateEnabled(
        app,
        menu.clearers,
        'clearCurrent'
      )();
      let localizedLabel = trans.__('Clear');
      if (enabled) {
        localizedLabel = Private.delegateLabel(
          app,
          menu.clearers,
          'clearCurrentLabel'
        );
      }
      return localizedLabel;
    },
    isEnabled: Private.delegateEnabled(app, menu.clearers, 'clearCurrent'),
    execute: Private.delegateExecute(app, menu.clearers, 'clearCurrent')
  });
  commands.addCommand(CommandIDs.clearAll, {
    label: () => {
      const enabled = Private.delegateEnabled(app, menu.clearers, 'clearAll')();
      let localizedLabel = trans.__('Clear All');
      if (enabled) {
        localizedLabel = Private.delegateLabel(
          app,
          menu.clearers,
          'clearAllLabel'
        );
      }
      return localizedLabel;
    },
    isEnabled: Private.delegateEnabled(app, menu.clearers, 'clearAll'),
    execute: Private.delegateExecute(app, menu.clearers, 'clearAll')
  });

  commands.addCommand(CommandIDs.goToLine, {
    label: trans.__('Go to Line…'),
    isEnabled: Private.delegateEnabled(app, menu.goToLiners, 'goToLine'),
    execute: Private.delegateExecute(app, menu.goToLiners, 'goToLine')
  });
}

/**
 * Create the basic `File` menu.
 */
export function createFileMenu(
  app: JupyterFrontEnd,
  menu: IFileMenu,
  router: IRouter,
  trans: TranslationBundle
): void {
  const commands = app.commands;

  // Add a delegator command for closing and cleaning up an activity.
  // This one is a bit different, in that we consider it enabled
  // even if it cannot find a delegate for the activity.
  // In that case, we instead call the application `close` command.
  commands.addCommand(CommandIDs.closeAndCleanup, {
    label: () => {
      const localizedLabel = Private.delegateLabel(
        app,
        menu.closeAndCleaners,
        'closeAndCleanupLabel'
      );
      return localizedLabel ? localizedLabel : trans.__('Close and Shutdown');
    },
    isEnabled: () =>
      !!app.shell.currentWidget && !!app.shell.currentWidget.title.closable,
    execute: () => {
      // Check if we have a registered delegate. If so, call that.
      if (
        Private.delegateEnabled(app, menu.closeAndCleaners, 'closeAndCleanup')()
      ) {
        return Private.delegateExecute(
          app,
          menu.closeAndCleaners,
          'closeAndCleanup'
        )();
      }
      // If we have no delegate, call the top-level application close.
      return app.commands.execute('application:close');
    }
  });

  // Add a delegator command for creating a console for an activity.
  commands.addCommand(CommandIDs.createConsole, {
    label: () => {
      const localizedLabel = Private.delegateLabel(
        app,
        menu.consoleCreators,
        'createConsoleLabel'
      );
      return localizedLabel
        ? localizedLabel
        : trans.__('New Console for Activity');
    },
    isEnabled: Private.delegateEnabled(
      app,
      menu.consoleCreators,
      'createConsole'
    ),
    execute: Private.delegateExecute(app, menu.consoleCreators, 'createConsole')
  });

  commands.addCommand(CommandIDs.shutdown, {
    label: trans.__('Shut Down'),
    caption: trans.__('Shut down JupyterLab'),
    isVisible: () => menu.quitEntry,
    isEnabled: () => menu.quitEntry,
    execute: () => {
      return showDialog({
        title: trans.__('Shutdown confirmation'),
        body: trans.__('Please confirm you want to shut down JupyterLab.'),
        buttons: [
          Dialog.cancelButton(),
          Dialog.warnButton({ label: trans.__('Shut Down') })
        ]
      }).then(result => {
        if (result.button.accept) {
          const setting = ServerConnection.makeSettings();
          const apiURL = URLExt.join(setting.baseUrl, 'api/shutdown');
          return ServerConnection.makeRequest(
            apiURL,
            { method: 'POST' },
            setting
          )
            .then(result => {
              if (result.ok) {
                // Close this window if the shutdown request has been successful
                const body = document.createElement('div');
                const p1 = document.createElement('p');
                p1.textContent = trans.__(
                  'You have shut down the Jupyter server. You can now close this tab.'
                );
                const p2 = document.createElement('p');
                p2.textContent = trans.__(
                  'To use JupyterLab again, you will need to relaunch it.'
                );

                body.appendChild(p1);
                body.appendChild(p2);
                void showDialog({
                  title: trans.__('Server stopped'),
                  body: new Widget({ node: body }),
                  buttons: []
                });
                window.close();
              } else {
                throw new ServerConnection.ResponseError(result);
              }
            })
            .catch(data => {
              throw new ServerConnection.NetworkError(data);
            });
        }
      });
    }
  });

  commands.addCommand(CommandIDs.logout, {
    label: trans.__('Log Out'),
    caption: trans.__('Log out of JupyterLab'),
    isVisible: () => menu.quitEntry,
    isEnabled: () => menu.quitEntry,
    execute: () => {
      router.navigate('/logout', { hard: true });
    }
  });
}

/**
 * Create the basic `Kernel` menu.
 */
export function createKernelMenu(
  app: JupyterFrontEnd,
  menu: IKernelMenu,
  trans: TranslationBundle
): void {
  const commands = app.commands;

  commands.addCommand(CommandIDs.interruptKernel, {
    label: trans.__('Interrupt Kernel'),
    caption: trans.__('Interrupt the kernel'),
    icon: args => (args.toolbar ? stopIcon : undefined),
    isEnabled: Private.delegateEnabled(
      app,
      menu.kernelUsers,
      'interruptKernel'
    ),
    execute: Private.delegateExecute(app, menu.kernelUsers, 'interruptKernel')
  });

  commands.addCommand(CommandIDs.reconnectToKernel, {
    label: trans.__('Reconnect to Kernel'),
    isEnabled: Private.delegateEnabled(
      app,
      menu.kernelUsers,
      'reconnectToKernel'
    ),
    execute: Private.delegateExecute(app, menu.kernelUsers, 'reconnectToKernel')
  });

  commands.addCommand(CommandIDs.restartKernel, {
    label: trans.__('Restart Kernel…'),
    caption: trans.__('Restart the kernel'),
    icon: args => (args.toolbar ? refreshIcon : undefined),
    isEnabled: Private.delegateEnabled(app, menu.kernelUsers, 'restartKernel'),
    execute: Private.delegateExecute(app, menu.kernelUsers, 'restartKernel')
  });

  commands.addCommand(CommandIDs.restartKernelAndClear, {
    label: () => {
      const enabled = Private.delegateEnabled(
        app,
        menu.kernelUsers,
        'restartKernelAndClear'
      )();
      let localizedLabel = trans.__('Restart Kernel and Clear…');
      if (enabled) {
        localizedLabel = Private.delegateLabel(
          app,
          menu.kernelUsers,
          'restartKernelAndClearLabel'
        );
      }
      return localizedLabel;
    },
    isEnabled: Private.delegateEnabled(
      app,
      menu.kernelUsers,
      'restartKernelAndClear'
    ),
    execute: Private.delegateExecute(
      app,
      menu.kernelUsers,
      'restartKernelAndClear'
    )
  });

  commands.addCommand(CommandIDs.changeKernel, {
    label: trans.__('Change Kernel…'),
    isEnabled: Private.delegateEnabled(app, menu.kernelUsers, 'changeKernel'),
    execute: Private.delegateExecute(app, menu.kernelUsers, 'changeKernel')
  });

  commands.addCommand(CommandIDs.shutdownKernel, {
    label: trans.__('Shut Down Kernel'),
    isEnabled: Private.delegateEnabled(app, menu.kernelUsers, 'shutdownKernel'),
    execute: Private.delegateExecute(app, menu.kernelUsers, 'shutdownKernel')
  });

  commands.addCommand(CommandIDs.shutdownAllKernels, {
    label: trans.__('Shut Down All Kernels…'),
    isEnabled: () => {
      return app.serviceManager.sessions.running().next() !== undefined;
    },
    execute: () => {
      return showDialog({
        title: trans.__('Shut Down All?'),
        body: trans.__('Shut down all kernels?'),
        buttons: [
          Dialog.cancelButton({ label: trans.__('Dismiss') }),
          Dialog.warnButton({ label: trans.__('Shut Down All') })
        ]
      }).then(result => {
        if (result.button.accept) {
          return app.serviceManager.sessions.shutdownAll();
        }
      });
    }
  });
}

/**
 * Create the basic `View` menu.
 */
export function createViewMenu(
  app: JupyterFrontEnd,
  menu: IViewMenu,
  trans: TranslationBundle
): void {
  const commands = app.commands;

  commands.addCommand(CommandIDs.lineNumbering, {
    label: trans.__('Show Line Numbers'),
    isEnabled: Private.delegateEnabled(
      app,
      menu.editorViewers,
      'toggleLineNumbers'
    ),
    isToggled: Private.delegateToggled(
      app,
      menu.editorViewers,
      'lineNumbersToggled'
    ),
    execute: Private.delegateExecute(
      app,
      menu.editorViewers,
      'toggleLineNumbers'
    )
  });

  commands.addCommand(CommandIDs.matchBrackets, {
    label: trans.__('Match Brackets'),
    isEnabled: Private.delegateEnabled(
      app,
      menu.editorViewers,
      'toggleMatchBrackets'
    ),
    isToggled: Private.delegateToggled(
      app,
      menu.editorViewers,
      'matchBracketsToggled'
    ),
    execute: Private.delegateExecute(
      app,
      menu.editorViewers,
      'toggleMatchBrackets'
    )
  });

  commands.addCommand(CommandIDs.wordWrap, {
    label: trans.__('Wrap Words'),
    isEnabled: Private.delegateEnabled(
      app,
      menu.editorViewers,
      'toggleWordWrap'
    ),
    isToggled: Private.delegateToggled(
      app,
      menu.editorViewers,
      'wordWrapToggled'
    ),
    execute: Private.delegateExecute(app, menu.editorViewers, 'toggleWordWrap')
  });
}

/**
 * Create the basic `Run` menu.
 */
export function createRunMenu(
  app: JupyterFrontEnd,
  menu: IRunMenu,
  trans: TranslationBundle
): void {
  const commands = app.commands;

  commands.addCommand(CommandIDs.run, {
    label: () => {
      const localizedLabel = Private.delegateLabel(
        app,
        menu.codeRunners,
        'runLabel'
      );
      const enabled = Private.delegateEnabled(app, menu.codeRunners, 'run')();
      return enabled ? localizedLabel : trans.__('Run Selected');
    },
    caption: () => {
      const localizedCaption = Private.delegateLabel(
        app,
        menu.codeRunners,
        'runCaption'
      );
      const enabled = Private.delegateEnabled(app, menu.codeRunners, 'run')();
      return enabled ? localizedCaption : trans.__('Run Selected');
    },
    icon: args => (args.toolbar ? runIcon : undefined),
    isEnabled: Private.delegateEnabled(app, menu.codeRunners, 'run'),
    execute: Private.delegateExecute(app, menu.codeRunners, 'run')
  });

  commands.addCommand(CommandIDs.runAll, {
    label: () => {
      let localizedLabel = trans.__('Run All');
      const enabled = Private.delegateEnabled(
        app,
        menu.codeRunners,
        'runAll'
      )();
      if (enabled) {
        localizedLabel = Private.delegateLabel(
          app,
          menu.codeRunners,
          'runAllLabel'
        );
      }
      return localizedLabel;
    },
    caption: () => {
      let localizedCaption = trans.__('Run All');
      const enabled = Private.delegateEnabled(
        app,
        menu.codeRunners,
        'runAll'
      )();
      if (enabled) {
        localizedCaption = Private.delegateLabel(
          app,
          menu.codeRunners,
          'runAllCaption'
        );
      }
      return localizedCaption;
    },
    isEnabled: Private.delegateEnabled(app, menu.codeRunners, 'runAll'),
    execute: Private.delegateExecute(app, menu.codeRunners, 'runAll')
  });
  commands.addCommand(CommandIDs.restartAndRunAll, {
    label: () => {
      let localizedLabel = trans.__('Restart Kernel and Run All');
      const enabled = Private.delegateEnabled(
        app,
        menu.codeRunners,
        'restartAndRunAll'
      )();
      if (enabled) {
        localizedLabel = Private.delegateLabel(
          app,
          menu.codeRunners,
          'restartAndRunAllLabel'
        );
      }
      return localizedLabel;
    },
    caption: () => {
      let localizedCaption = trans.__('Restart Kernel and Run All');
      const enabled = Private.delegateEnabled(
        app,
        menu.codeRunners,
        'restartAndRunAll'
      )();
      if (enabled) {
        localizedCaption = Private.delegateLabel(
          app,
          menu.codeRunners,
          'restartAndRunAllLabel'
        );
      }
      return localizedCaption;
    },
    icon: args => (args.toolbar ? fastForwardIcon : undefined),
    isEnabled: Private.delegateEnabled(
      app,
      menu.codeRunners,
      'restartAndRunAll'
    ),
    execute: Private.delegateExecute(app, menu.codeRunners, 'restartAndRunAll')
  });
}

/**
 * Create the basic `Tabs` menu.
 */
export function createTabsMenu(
  app: JupyterFrontEnd,
  menu: ITabsMenu,
  labShell: ILabShell | null,
  trans: TranslationBundle
): void {
  const commands = app.commands;

  // A list of the active tabs in the main area.
  const tabGroup: Menu.IItemOptions[] = [];
  // A disposable for getting rid of the out-of-date tabs list.
  let disposable: IDisposable;

  // Command to activate a widget by id.
  commands.addCommand(CommandIDs.activateById, {
    label: args => {
      const id = args['id'] || '';
      const widget = find(app.shell.widgets('main'), w => w.id === id);
      return (widget && widget.title.label) || '';
    },
    isToggled: args => {
      const id = args['id'] || '';
      return !!app.shell.currentWidget && app.shell.currentWidget.id === id;
    },
    execute: args => app.shell.activateById((args['id'] as string) || '')
  });

  let previousId = '';
  // Command to toggle between the current
  // tab and the last modified tab.
  commands.addCommand(CommandIDs.activatePreviouslyUsedTab, {
    label: trans.__('Activate Previously Used Tab'),
    isEnabled: () => !!previousId,
    execute: () => commands.execute(CommandIDs.activateById, { id: previousId })
  });

  if (labShell) {
    void app.restored.then(() => {
      // Iterate over the current widgets in the
      // main area, and add them to the tab group
      // of the menu.
      const populateTabs = () => {
        // remove the previous tab list
        if (disposable && !disposable.isDisposed) {
          disposable.dispose();
        }
        tabGroup.length = 0;

        let isPreviouslyUsedTabAttached = false;
        each(app.shell.widgets('main'), widget => {
          if (widget.id === previousId) {
            isPreviouslyUsedTabAttached = true;
          }
          tabGroup.push({
            command: CommandIDs.activateById,
            args: { id: widget.id }
          });
        });
        disposable = menu.addGroup(tabGroup, 1);
        previousId = isPreviouslyUsedTabAttached ? previousId : '';
      };
      populateTabs();
      labShell.layoutModified.connect(() => {
        populateTabs();
      });
      // Update the ID of the previous active tab if a new tab is selected.
      labShell.currentChanged.connect((_, args) => {
        const widget = args.oldValue;
        if (!widget) {
          return;
        }
        previousId = widget.id;
      });
    });
  }
}

export default plugin;

/**
 * A namespace for Private data.
 */
namespace Private {
  /**
   * Return the first value of the iterable that satisfies the predicate
   * function.
   */
  function find<T>(
    it: Iterable<T>,
    predicate: (value: T) => boolean
  ): T | undefined {
    for (const value of it) {
      if (predicate(value)) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * A utility function that delegates a portion of a label to an IMenuExtender.
   */
  export function delegateLabel<E extends IMenuExtender<Widget>>(
    app: JupyterFrontEnd,
    s: Set<E>,
    label: keyof E
  ): string {
    const widget = app.shell.currentWidget;
    const extender = widget
      ? find(s, value => value.tracker.has(widget!))
      : undefined;

    if (!extender) {
      return '';
    } else {
      const count: number = extender.tracker.size;

      // Coerce the result to be a string. When Typedoc is updated to use
      // Typescript 2.8, we can possibly use conditional types to get Typescript
      // to recognize this is a string.
      return (extender[label] as any)(count) as string;
    }
  }

  /**
   * A utility function that delegates command execution
   * to an IMenuExtender.
   */
  export function delegateExecute<E extends IMenuExtender<Widget>>(
    app: JupyterFrontEnd,
    s: Set<E>,
    executor: keyof E
  ): () => Promise<any> {
    return () => {
      const widget = app.shell.currentWidget;
      const extender = widget
        ? find(s, value => value.tracker.has(widget!))
        : undefined;
      if (!extender) {
        return Promise.resolve(void 0);
      }
      // Coerce the result to be a function. When Typedoc is updated to use
      // Typescript 2.8, we can possibly use conditional types to get Typescript
      // to recognize this is a function.
      const f = (extender[executor] as any) as (w: Widget) => Promise<any>;
      return f(widget!);
    };
  }

  /**
   * A utility function that delegates whether a command is enabled
   * to an IMenuExtender.
   */
  export function delegateEnabled<E extends IMenuExtender<Widget>>(
    app: JupyterFrontEnd,
    s: Set<E>,
    executor: keyof E
  ): () => boolean {
    return () => {
      const widget = app.shell.currentWidget;
      const extender = widget
        ? find(s, value => value.tracker.has(widget!))
        : undefined;
      return (
        !!extender &&
        !!extender[executor] &&
        (extender.isEnabled && widget ? extender.isEnabled(widget) : true)
      );
    };
  }

  /**
   * A utility function that delegates whether a command is toggled
   * for an IMenuExtender.
   */
  export function delegateToggled<E extends IMenuExtender<Widget>>(
    app: JupyterFrontEnd,
    s: Set<E>,
    toggled: keyof E
  ): () => boolean {
    return () => {
      const widget = app.shell.currentWidget;
      const extender = widget
        ? find(s, value => value.tracker.has(widget!))
        : undefined;
      // Coerce extender[toggled] to be a function. When Typedoc is updated to use
      // Typescript 2.8, we can possibly use conditional types to get Typescript
      // to recognize this is a function.
      return (
        !!extender &&
        !!extender[toggled] &&
        !!widget &&
        !!((extender[toggled] as any) as (w: Widget) => () => boolean)(widget)
      );
    };
  }

  async function displayInformation(trans: TranslationBundle): Promise<void> {
    const result = await showDialog({
      title: trans.__('Information'),
      body: trans.__(
        'Menu customization has changed. You will need to reload JupyterLab to see the changes.'
      ),
      buttons: [
        Dialog.cancelButton(),
        Dialog.okButton({ label: trans.__('Reload') })
      ]
    });

    if (result.button.accept) {
      location.reload();
    }
  }

  export async function loadSettingsMenu(
    registry: ISettingRegistry,
    addMenu: (menu: Menu) => void,
    menuFactory: (options: IMainMenu.IMenuOptions) => JupyterLabMenu,
    translator: ITranslator
  ): Promise<void> {
    const trans = translator.load('jupyterlab');
    let canonical: ISettingRegistry.ISchema | null;
    let loaded: { [name: string]: ISettingRegistry.IMenu[] } = {};

    /**
     * Populate the plugin's schema defaults.
     */
    function populate(schema: ISettingRegistry.ISchema) {
      loaded = {};
      schema.properties!.menus.default = Object.keys(registry.plugins)
        .map(plugin => {
          const menus =
            registry.plugins[plugin]!.schema['jupyter.lab.menus']?.main ?? [];
          loaded[plugin] = menus;
          return menus;
        })
        .concat([
          schema['jupyter.lab.menus']?.main ?? [],
          schema.properties!.menus.default as any[]
        ])
        .reduceRight(
          (acc, val) => SettingRegistry.reconcileMenus(acc, val, true),
          []
        ) // flatten one level
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    }

    // Transform the plugin object to return different schema than the default.
    registry.transform(PLUGIN_ID, {
      compose: plugin => {
        // Only override the canonical schema the first time.
        if (!canonical) {
          canonical = JSONExt.deepCopy(plugin.schema);
          populate(canonical);
        }

        const defaults = canonical.properties?.menus?.default ?? [];
        const user = {
          menus: plugin.data.user.menus ?? []
        };
        const composite = {
          menus: SettingRegistry.reconcileMenus(
            defaults as ISettingRegistry.IMenu[],
            user.menus as ISettingRegistry.IMenu[]
          )
        };

        plugin.data = { composite, user };

        return plugin;
      },
      fetch: plugin => {
        // Only override the canonical schema the first time.
        if (!canonical) {
          canonical = JSONExt.deepCopy(plugin.schema);
          populate(canonical);
        }

        return {
          data: plugin.data,
          id: plugin.id,
          raw: plugin.raw,
          schema: canonical,
          version: plugin.version
        };
      }
    });

    // Repopulate the canonical variable after the setting registry has
    // preloaded all initial plugins.
    canonical = null;

    const settings = await registry.load(PLUGIN_ID);

    const currentMenus: ISettingRegistry.IMenu[] =
      JSONExt.deepCopy(settings.composite.menus as any) ?? [];
    const menus = new Array<Menu>();
    // Create menu for non-disabled element
    MenuFactory.createMenus(
      currentMenus
        .filter(menu => !menu.disabled)
        .map(menu => {
          return {
            ...menu,
            items: SettingRegistry.filterDisabledItems(menu.items ?? [])
          };
        }),
      menuFactory
    ).forEach(menu => {
      menus.push(menu);
      addMenu(menu);
    });

    settings.changed.connect(() => {
      // As extension may change menu through API, prompt the user to reload if the
      // menu has been updated.
      const newMenus = (settings.composite.menus as any) ?? [];
      if (!JSONExt.deepEqual(currentMenus, newMenus)) {
        void displayInformation(trans);
      }
    });

    registry.pluginChanged.connect(async (sender, plugin) => {
      if (plugin !== PLUGIN_ID) {
        // If the plugin changed its menu.
        const oldMenus = loaded[plugin] ?? [];
        const newMenus =
          registry.plugins[plugin]!.schema['jupyter.lab.menus']?.main ?? [];
        if (!JSONExt.deepEqual(oldMenus, newMenus)) {
          if (loaded[plugin]) {
            // The plugin has changed, request the user to reload the UI - this should not happen
            await displayInformation(trans);
          } else {
            // The plugin was not yet loaded when the menu was built => update the menu
            loaded[plugin] = JSONExt.deepCopy(newMenus);
            // Merge potential disabled state
            const toAdd = SettingRegistry.reconcileMenus(
              newMenus,
              currentMenus,
              false,
              false
            )
              .filter(menu => !menu.disabled)
              .map(menu => {
                return {
                  ...menu,
                  items: SettingRegistry.filterDisabledItems(menu.items ?? [])
                };
              });

            MenuFactory.updateMenus(menus, toAdd, menuFactory).forEach(menu => {
              addMenu(menu);
            });
          }
        }
      }
    });
  }
}
