// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module application-extension
 */

import {
  ConnectionLost,
  IConnectionLost,
  ILabShell,
  ILabStatus,
  ILayoutRestorer,
  IRouter,
  ITreePathUpdater,
  JupyterFrontEnd,
  JupyterFrontEndContextMenu,
  JupyterFrontEndPlugin,
  JupyterLab,
  LabShell,
  LayoutRestorer,
  Router
} from '@jupyterlab/application';
import {
  Dialog,
  ICommandPalette,
  IWindowResolver,
  MenuFactory,
  showDialog,
  showErrorMessage
} from '@jupyterlab/apputils';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import {
  IPropertyInspectorProvider,
  SideBarPropertyInspectorProvider
} from '@jupyterlab/property-inspector';
import { ISettingRegistry, SettingRegistry } from '@jupyterlab/settingregistry';
import { IStateDB } from '@jupyterlab/statedb';
import { ITranslator, TranslationBundle } from '@jupyterlab/translation';
import {
  buildIcon,
  ContextMenuSvg,
  jupyterIcon,
  RankedMenu
} from '@jupyterlab/ui-components';
import { each, iter, toArray } from '@lumino/algorithm';
import { JSONExt, PromiseDelegate } from '@lumino/coreutils';
import { DisposableDelegate, DisposableSet } from '@lumino/disposable';
import { DockLayout, DockPanel, Widget } from '@lumino/widgets';
import * as React from 'react';

/**
 * The command IDs used by the application plugin.
 */
namespace CommandIDs {
  export const activateNextTab: string = 'application:activate-next-tab';

  export const activatePreviousTab: string =
    'application:activate-previous-tab';

  export const activateNextTabBar: string = 'application:activate-next-tab-bar';

  export const activatePreviousTabBar: string =
    'application:activate-previous-tab-bar';

  export const close = 'application:close';

  export const closeOtherTabs = 'application:close-other-tabs';

  export const closeRightTabs = 'application:close-right-tabs';

  export const closeAll: string = 'application:close-all';

  export const setMode: string = 'application:set-mode';

  export const showPropertyPanel: string = 'property-inspector:show-panel';

  export const toggleMode: string = 'application:toggle-mode';

  export const toggleLeftArea: string = 'application:toggle-left-area';

  export const toggleRightArea: string = 'application:toggle-right-area';

  export const toggleSideTabBar: string = 'application:toggle-side-tabbar';

  export const togglePresentationMode: string =
    'application:toggle-presentation-mode';

  export const tree: string = 'router:tree';

  export const switchSidebar = 'sidebar:switch';
}

/**
 * A plugin to register the commands for the main application.
 */
const mainCommands: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/application-extension:commands',
  autoStart: true,
  requires: [ITranslator],
  optional: [ILabShell, ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    labShell: ILabShell | null,
    palette: ICommandPalette | null
  ) => {
    const { commands, shell } = app;
    const trans = translator.load('jupyterlab');
    const category = trans.__('Main Area');

    // Add Command to override the JLab context menu.
    commands.addCommand(JupyterFrontEndContextMenu.contextMenu, {
      label: trans.__('Shift+Right Click for Browser Menu'),
      isEnabled: () => false,
      execute: () => void 0
    });

    // Returns the widget associated with the most recent contextmenu event.
    const contextMenuWidget = (): Widget | null => {
      const test = (node: HTMLElement) => !!node.dataset.id;
      const node = app.contextMenuHitTest(test);

      if (!node) {
        // Fall back to active widget if path cannot be obtained from event.
        return shell.currentWidget;
      }

      const matches = toArray(shell.widgets('main')).filter(
        widget => widget.id === node.dataset.id
      );

      if (matches.length < 1) {
        return shell.currentWidget;
      }

      return matches[0];
    };

    // Closes an array of widgets.
    const closeWidgets = (widgets: Array<Widget>): void => {
      widgets.forEach(widget => widget.close());
    };

    // Find the tab area for a widget within a specific dock area.
    const findTab = (
      area: DockLayout.AreaConfig,
      widget: Widget
    ): DockLayout.ITabAreaConfig | null => {
      switch (area.type) {
        case 'split-area': {
          const iterator = iter(area.children);
          let tab: DockLayout.ITabAreaConfig | null = null;
          let value: DockLayout.AreaConfig | undefined;
          do {
            value = iterator.next();
            if (value) {
              tab = findTab(value, widget);
            }
          } while (!tab && value);
          return tab;
        }
        case 'tab-area': {
          const { id } = widget;
          return area.widgets.some(widget => widget.id === id) ? area : null;
        }
        default:
          return null;
      }
    };

    // Find the tab area for a widget within the main dock area.
    const tabAreaFor = (widget: Widget): DockLayout.ITabAreaConfig | null => {
      const layout = labShell?.saveLayout();
      const mainArea = layout?.mainArea;
      if (!mainArea || PageConfig.getOption('mode') !== 'multiple-document') {
        return null;
      }
      const area = mainArea.dock?.main;
      if (!area) {
        return null;
      }
      return findTab(area, widget);
    };

    // Returns an array of all widgets to the right of a widget in a tab area.
    const widgetsRightOf = (widget: Widget): Array<Widget> => {
      const { id } = widget;
      const tabArea = tabAreaFor(widget);
      const widgets = tabArea ? tabArea.widgets || [] : [];
      const index = widgets.findIndex(widget => widget.id === id);
      if (index < 0) {
        return [];
      }
      return widgets.slice(index + 1);
    };

    commands.addCommand(CommandIDs.close, {
      label: () => trans.__('Close Tab'),
      isEnabled: () => {
        const widget = contextMenuWidget();
        return !!widget && widget.title.closable;
      },
      execute: () => {
        const widget = contextMenuWidget();
        if (widget) {
          widget.close();
        }
      }
    });

    commands.addCommand(CommandIDs.closeOtherTabs, {
      label: () => trans.__('Close All Other Tabs'),
      isEnabled: () => {
        // Ensure there are at least two widgets.
        const iterator = shell.widgets('main');
        return !!iterator.next() && !!iterator.next();
      },
      execute: () => {
        const widget = contextMenuWidget();
        if (!widget) {
          return;
        }
        const { id } = widget;
        const otherWidgets = toArray(shell.widgets('main')).filter(
          widget => widget.id !== id
        );
        closeWidgets(otherWidgets);
      }
    });

    commands.addCommand(CommandIDs.closeRightTabs, {
      label: () => trans.__('Close Tabs to Right'),
      isEnabled: () =>
        !!contextMenuWidget() &&
        widgetsRightOf(contextMenuWidget()!).length > 0,
      execute: () => {
        const widget = contextMenuWidget();
        if (!widget) {
          return;
        }
        closeWidgets(widgetsRightOf(widget));
      }
    });

    if (labShell) {
      commands.addCommand(CommandIDs.activateNextTab, {
        label: trans.__('Activate Next Tab'),
        execute: () => {
          labShell.activateNextTab();
        }
      });

      commands.addCommand(CommandIDs.activatePreviousTab, {
        label: trans.__('Activate Previous Tab'),
        execute: () => {
          labShell.activatePreviousTab();
        }
      });

      commands.addCommand(CommandIDs.activateNextTabBar, {
        label: trans.__('Activate Next Tab Bar'),
        execute: () => {
          labShell.activateNextTabBar();
        }
      });

      commands.addCommand(CommandIDs.activatePreviousTabBar, {
        label: trans.__('Activate Previous Tab Bar'),
        execute: () => {
          labShell.activatePreviousTabBar();
        }
      });

      commands.addCommand(CommandIDs.closeAll, {
        label: trans.__('Close All Tabs'),
        execute: () => {
          labShell.closeAll();
        }
      });

      commands.addCommand(CommandIDs.toggleLeftArea, {
        label: () => trans.__('Show Left Sidebar'),
        execute: () => {
          if (labShell.leftCollapsed) {
            labShell.expandLeft();
          } else {
            labShell.collapseLeft();
            if (labShell.currentWidget) {
              labShell.activateById(labShell.currentWidget.id);
            }
          }
        },
        isToggled: () => !labShell.leftCollapsed,
        isEnabled: () => !labShell.isEmpty('left')
      });

      commands.addCommand(CommandIDs.toggleRightArea, {
        label: () => trans.__('Show Right Sidebar'),
        execute: () => {
          if (labShell.rightCollapsed) {
            labShell.expandRight();
          } else {
            labShell.collapseRight();
            if (labShell.currentWidget) {
              labShell.activateById(labShell.currentWidget.id);
            }
          }
        },
        isToggled: () => !labShell.rightCollapsed,
        isEnabled: () => !labShell.isEmpty('right')
      });

      commands.addCommand(CommandIDs.toggleSideTabBar, {
        label: args =>
          args.side === 'right'
            ? trans.__('Show Right Activity Bar')
            : trans.__('Show Left Activity Bar'),
        execute: args => {
          if (args.side === 'right') {
            labShell.toggleSideTabBarVisibility('right');
          } else {
            labShell.toggleSideTabBarVisibility('left');
          }
        },
        isToggled: args =>
          args.side === 'right'
            ? labShell.isSideTabBarVisible('right')
            : labShell.isSideTabBarVisible('left'),
        isEnabled: args =>
          args.side === 'right'
            ? !labShell.isEmpty('right')
            : !labShell.isEmpty('left')
      });

      commands.addCommand(CommandIDs.togglePresentationMode, {
        label: () => trans.__('Presentation Mode'),
        execute: () => {
          labShell.presentationMode = !labShell.presentationMode;
        },
        isToggled: () => labShell.presentationMode,
        isVisible: () => true
      });

      commands.addCommand(CommandIDs.setMode, {
        isVisible: args => {
          const mode = args['mode'] as string;
          return mode === 'single-document' || mode === 'multiple-document';
        },
        execute: args => {
          const mode = args['mode'] as string;
          if (mode === 'single-document' || mode === 'multiple-document') {
            labShell.mode = mode;
            return;
          }
          throw new Error(`Unsupported application shell mode: ${mode}`);
        }
      });

      commands.addCommand(CommandIDs.toggleMode, {
        label: trans.__('Simple Interface'),
        isToggled: () => labShell.mode === 'single-document',
        execute: () => {
          const args =
            labShell.mode === 'multiple-document'
              ? { mode: 'single-document' }
              : { mode: 'multiple-document' };
          return commands.execute(CommandIDs.setMode, args);
        }
      });
    }

    if (palette) {
      [
        CommandIDs.activateNextTab,
        CommandIDs.activatePreviousTab,
        CommandIDs.activateNextTabBar,
        CommandIDs.activatePreviousTabBar,
        CommandIDs.close,
        CommandIDs.closeAll,
        CommandIDs.closeOtherTabs,
        CommandIDs.closeRightTabs,
        CommandIDs.toggleLeftArea,
        CommandIDs.toggleRightArea,
        CommandIDs.togglePresentationMode,
        CommandIDs.toggleMode
      ].forEach(command => palette.addItem({ command, category }));

      ['right', 'left'].forEach(side => {
        palette.addItem({
          command: CommandIDs.toggleSideTabBar,
          category,
          args: { side }
        });
      });
    }
  }
};

/**
 * Main plugin id
 */
const MAIN_PLUGIN_ID = '@jupyterlab/application-extension:main';

/**
 * The main extension.
 */
const main: JupyterFrontEndPlugin<ITreePathUpdater> = {
  id: MAIN_PLUGIN_ID,
  requires: [IRouter, IWindowResolver, ITranslator],
  optional: [IConnectionLost, ISettingRegistry],
  provides: ITreePathUpdater,
  activate: (
    app: JupyterFrontEnd,
    router: IRouter,
    resolver: IWindowResolver,
    translator: ITranslator,
    connectionLost: IConnectionLost | null,
    settingRegistry: ISettingRegistry | null
  ) => {
    const trans = translator.load('jupyterlab');

    if (!(app instanceof JupyterLab)) {
      throw new Error(`${main.id} must be activated in JupyterLab.`);
    }

    // Build context menu from settings
    if (settingRegistry) {
      function createMenu(options: ISettingRegistry.IMenu): RankedMenu {
        const menu = new RankedMenu({ ...options, commands: app.commands });
        if (options.label) {
          menu.title.label = trans.__(options.label);
        }
        return menu;
      }

      // Load the context menu lately so plugins are loaded.
      app.started
        .then(() => {
          return Private.loadSettingsContextMenu(
            app.contextMenu,
            settingRegistry,
            createMenu,
            translator
          );
        })
        .catch(reason => {
          console.error(
            'Failed to load context menu items from settings registry.',
            reason
          );
        });
    }

    // These two internal state variables are used to manage the two source
    // of the tree part of the URL being updated: 1) path of the active document,
    // 2) path of the default browser if the active main area widget isn't a document.
    let _docTreePath = '';
    let _defaultBrowserTreePath = '';

    function updateTreePath(treePath: string) {
      _defaultBrowserTreePath = treePath;
      if (!_docTreePath) {
        const path = PageConfig.getUrl({ treePath });
        router.navigate(path, { skipRouting: true });
        // Persist the new tree path to PageConfig as it is used elsewhere at runtime.
        PageConfig.setOption('treePath', treePath);
      }
    }

    // Requiring the window resolver guarantees that the application extension
    // only loads if there is a viable window name. Otherwise, the application
    // will short-circuit and ask the user to navigate away.
    const workspace = resolver.name;

    console.debug(`Starting application in workspace: "${workspace}"`);

    // If there were errors registering plugins, tell the user.
    if (app.registerPluginErrors.length !== 0) {
      const body = (
        <pre>{app.registerPluginErrors.map(e => e.message).join('\n')}</pre>
      );

      void showErrorMessage(trans.__('Error Registering Plugins'), {
        message: body
      });
    }

    // If the application shell layout is modified,
    // trigger a refresh of the commands.
    app.shell.layoutModified.connect(() => {
      app.commands.notifyCommandChanged();
    });

    // Watch the mode and update the page URL to /lab or /doc to reflect the
    // change.
    app.shell.modeChanged.connect((_, args: DockPanel.Mode) => {
      const path = PageConfig.getUrl({ mode: args as string });
      router.navigate(path, { skipRouting: true });
      // Persist this mode change to PageConfig as it is used elsewhere at runtime.
      PageConfig.setOption('mode', args as string);
    });

    // Watch the path of the current widget in the main area and update the page
    // URL to reflect the change.
    app.shell.currentPathChanged.connect((_, args) => {
      const maybeTreePath = args.newValue as string;
      const treePath = maybeTreePath || _defaultBrowserTreePath;
      const path = PageConfig.getUrl({ treePath: treePath });
      router.navigate(path, { skipRouting: true });
      // Persist the new tree path to PageConfig as it is used elsewhere at runtime.
      PageConfig.setOption('treePath', treePath);
      _docTreePath = maybeTreePath;
    });

    // If the connection to the server is lost, handle it with the
    // connection lost handler.
    connectionLost = connectionLost || ConnectionLost;
    app.serviceManager.connectionFailure.connect((manager, error) =>
      connectionLost!(manager, error, translator)
    );

    const builder = app.serviceManager.builder;
    const build = () => {
      return builder
        .build()
        .then(() => {
          return showDialog({
            title: trans.__('Build Complete'),
            body: (
              <div>
                {trans.__('Build successfully completed, reload page?')}
                <br />
                {trans.__('You will lose any unsaved changes.')}
              </div>
            ),
            buttons: [
              Dialog.cancelButton({
                label: trans.__('Reload Without Saving'),
                actions: ['reload']
              }),
              Dialog.okButton({ label: trans.__('Save and Reload') })
            ],
            hasClose: true
          });
        })
        .then(({ button: { accept, actions } }) => {
          if (accept) {
            void app.commands
              .execute('docmanager:save')
              .then(() => {
                router.reload();
              })
              .catch(err => {
                void showErrorMessage(trans.__('Save Failed'), {
                  message: <pre>{err.message}</pre>
                });
              });
          } else if (actions.includes('reload')) {
            router.reload();
          }
        })
        .catch(err => {
          void showErrorMessage(trans.__('Build Failed'), {
            message: <pre>{err.message}</pre>
          });
        });
    };

    if (builder.isAvailable && builder.shouldCheck) {
      void builder.getStatus().then(response => {
        if (response.status === 'building') {
          return build();
        }

        if (response.status !== 'needed') {
          return;
        }

        const body = (
          <div>
            {trans.__('JupyterLab build is suggested:')}
            <br />
            <pre>{response.message}</pre>
          </div>
        );

        void showDialog({
          title: trans.__('Build Recommended'),
          body,
          buttons: [
            Dialog.cancelButton(),
            Dialog.okButton({ label: trans.__('Build') })
          ]
        }).then(result => (result.button.accept ? build() : undefined));
      });
    }

    const message = trans.__(
      'Are you sure you want to exit JupyterLab?\n\nAny unsaved changes will be lost.'
    );

    // The spec for the `beforeunload` event is implemented differently by
    // the different browser vendors. Consequently, the `event.returnValue`
    // attribute needs to set in addition to a return value being returned.
    // For more information, see:
    // https://developer.mozilla.org/en/docs/Web/Events/beforeunload
    window.addEventListener('beforeunload', event => {
      if (app.status.isDirty) {
        return ((event as any).returnValue = message);
      }
    });
    return updateTreePath;
  },
  autoStart: true
};

/**
 * The default layout restorer provider.
 */
const layout: JupyterFrontEndPlugin<ILayoutRestorer> = {
  id: '@jupyterlab/application-extension:layout',
  requires: [IStateDB, ILabShell],
  activate: (
    app: JupyterFrontEnd,
    state: IStateDB,
    labShell: ILabShell,
    info: JupyterLab.IInfo
  ) => {
    const first = app.started;
    const registry = app.commands;
    const restorer = new LayoutRestorer({ connector: state, first, registry });

    void restorer.fetch().then(saved => {
      labShell.restoreLayout(
        PageConfig.getOption('mode') as DockPanel.Mode,
        saved
      );
      labShell.layoutModified.connect(() => {
        void restorer.save(labShell.saveLayout());
      });
    });

    return restorer;
  },
  autoStart: true,
  provides: ILayoutRestorer
};

/**
 * The default URL router provider.
 */
const router: JupyterFrontEndPlugin<IRouter> = {
  id: '@jupyterlab/application-extension:router',
  requires: [JupyterFrontEnd.IPaths],
  activate: (app: JupyterFrontEnd, paths: JupyterFrontEnd.IPaths) => {
    const { commands } = app;
    const base = paths.urls.base;
    const router = new Router({ base, commands });

    void app.started.then(() => {
      // Route the very first request on load.
      void router.route();

      // Route all pop state events.
      window.addEventListener('popstate', () => {
        void router.route();
      });
    });

    return router;
  },
  autoStart: true,
  provides: IRouter
};

/**
 * The default tree route resolver plugin.
 */
const tree: JupyterFrontEndPlugin<JupyterFrontEnd.ITreeResolver> = {
  id: '@jupyterlab/application-extension:tree-resolver',
  autoStart: true,
  requires: [IRouter],
  provides: JupyterFrontEnd.ITreeResolver,
  activate: (
    app: JupyterFrontEnd,
    router: IRouter
  ): JupyterFrontEnd.ITreeResolver => {
    const { commands } = app;
    const set = new DisposableSet();
    const delegate = new PromiseDelegate<JupyterFrontEnd.ITreeResolver.Paths>();

    const treePattern = new RegExp(
      '/(lab|doc)(/workspaces/[a-zA-Z0-9-_]+)?(/tree/.*)?'
    );

    set.add(
      commands.addCommand(CommandIDs.tree, {
        execute: async (args: IRouter.ILocation) => {
          if (set.isDisposed) {
            return;
          }

          const query = URLExt.queryStringToObject(args.search ?? '');
          const browser = query['file-browser-path'] || '';

          // Remove the file browser path from the query string.
          delete query['file-browser-path'];

          // Clean up artifacts immediately upon routing.
          set.dispose();

          delegate.resolve({ browser, file: PageConfig.getOption('treePath') });
        }
      })
    );
    set.add(
      router.register({ command: CommandIDs.tree, pattern: treePattern })
    );

    // If a route is handled by the router without the tree command being
    // invoked, resolve to `null` and clean up artifacts.
    const listener = () => {
      if (set.isDisposed) {
        return;
      }
      set.dispose();
      delegate.resolve(null);
    };
    router.routed.connect(listener);
    set.add(
      new DisposableDelegate(() => {
        router.routed.disconnect(listener);
      })
    );

    return { paths: delegate.promise };
  }
};

/**
 * The default URL not found extension.
 */
const notfound: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/application-extension:notfound',
  requires: [JupyterFrontEnd.IPaths, IRouter, ITranslator],
  activate: (
    _: JupyterFrontEnd,
    paths: JupyterFrontEnd.IPaths,
    router: IRouter,
    translator: ITranslator
  ) => {
    const trans = translator.load('jupyterlab');
    const bad = paths.urls.notFound;

    if (!bad) {
      return;
    }

    const base = router.base;
    const message = trans.__(
      'The path: %1 was not found. JupyterLab redirected to: %2',
      bad,
      base
    );

    // Change the URL back to the base application URL.
    router.navigate('');

    void showErrorMessage(trans.__('Path Not Found'), { message });
  },
  autoStart: true
};

/**
 * Change the favicon changing based on the busy status;
 */
const busy: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/application-extension:faviconbusy',
  requires: [ILabStatus],
  activate: async (_: JupyterFrontEnd, status: ILabStatus) => {
    status.busySignal.connect((_, isBusy) => {
      const favicon = document.querySelector(
        `link[rel="icon"]${isBusy ? '.idle.favicon' : '.busy.favicon'}`
      ) as HTMLLinkElement;
      if (!favicon) {
        return;
      }
      const newFavicon = document.querySelector(
        `link${isBusy ? '.busy.favicon' : '.idle.favicon'}`
      ) as HTMLLinkElement;
      if (!newFavicon) {
        return;
      }
      // If we have the two icons with the special classes, then toggle them.
      if (favicon !== newFavicon) {
        favicon.rel = '';
        newFavicon.rel = 'icon';

        // Firefox doesn't seem to recognize just changing rel, so we also
        // reinsert the link into the DOM.
        newFavicon.parentNode!.replaceChild(newFavicon, newFavicon);
      }
    });
  },
  autoStart: true
};

const SIDEBAR_ID = '@jupyterlab/application-extension:sidebar';

/**
 * Keep user settings for where to show the side panels.
 */
const sidebar: JupyterFrontEndPlugin<void> = {
  id: SIDEBAR_ID,
  autoStart: true,
  requires: [ISettingRegistry, ILabShell, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    labShell: ILabShell,
    translator: ITranslator,
    info: JupyterLab.IInfo
  ) => {
    const trans = translator.load('jupyterlab');
    type overrideMap = { [id: string]: 'left' | 'right' };
    let overrides: overrideMap = {};
    // const trans = translator.load("jupyterlab");
    const handleLayoutOverrides = () => {
      each(labShell.widgets('left'), widget => {
        if (overrides[widget.id] && overrides[widget.id] === 'right') {
          labShell.add(widget, 'right');
        }
      });
      each(labShell.widgets('right'), widget => {
        if (overrides[widget.id] && overrides[widget.id] === 'left') {
          labShell.add(widget, 'left');
        }
      });
    };
    labShell.layoutModified.connect(handleLayoutOverrides);
    // Fetch overrides from the settings system.
    void Promise.all([settingRegistry.load(SIDEBAR_ID), app.restored]).then(
      ([settings]) => {
        overrides = (settings.get('overrides').composite as overrideMap) || {};
        settings.changed.connect(settings => {
          overrides =
            (settings.get('overrides').composite as overrideMap) || {};
          handleLayoutOverrides();
        });
      }
    );

    // Add a command to switch a side panels's side
    app.commands.addCommand(CommandIDs.switchSidebar, {
      label: trans.__('Switch Sidebar Side'),
      execute: () => {
        // First, try to find the correct panel based on the
        // application context menu click.
        const contextNode: HTMLElement | undefined = app.contextMenuHitTest(
          node => !!node.dataset.id
        );
        let id: string;
        let side: 'left' | 'right';
        if (contextNode) {
          id = contextNode.dataset['id']!;
          const leftPanel = document.getElementById('jp-left-stack');
          const node = document.getElementById(id);
          if (leftPanel && node && leftPanel.contains(node)) {
            side = 'right';
          } else {
            side = 'left';
          }
        } else {
          // Bail if we don't find a sidebar for the widget.
          return;
        }
        // Move the panel to the other side.
        const newOverrides = { ...overrides };
        newOverrides[id] = side;
        return settingRegistry.set(SIDEBAR_ID, 'overrides', newOverrides);
      }
    });
  }
};

/**
 * The default JupyterLab application shell.
 */
const shell: JupyterFrontEndPlugin<ILabShell> = {
  id: '@jupyterlab/application-extension:shell',
  activate: (app: JupyterFrontEnd) => {
    if (!(app.shell instanceof LabShell)) {
      throw new Error(`${shell.id} did not find a LabShell instance.`);
    }
    return app.shell;
  },
  autoStart: true,
  provides: ILabShell
};

/**
 * The default JupyterLab application status provider.
 */
const status: JupyterFrontEndPlugin<ILabStatus> = {
  id: '@jupyterlab/application-extension:status',
  activate: (app: JupyterFrontEnd) => {
    if (!(app instanceof JupyterLab)) {
      throw new Error(`${status.id} must be activated in JupyterLab.`);
    }
    return app.status;
  },
  autoStart: true,
  provides: ILabStatus
};

/**
 * The default JupyterLab application-specific information provider.
 *
 * #### Notes
 * This plugin should only be used by plugins that specifically need to access
 * JupyterLab application information, e.g., listing extensions that have been
 * loaded or deferred within JupyterLab.
 */
const info: JupyterFrontEndPlugin<JupyterLab.IInfo> = {
  id: '@jupyterlab/application-extension:info',
  activate: (app: JupyterFrontEnd) => {
    if (!(app instanceof JupyterLab)) {
      throw new Error(`${info.id} must be activated in JupyterLab.`);
    }
    return app.info;
  },
  autoStart: true,
  provides: JupyterLab.IInfo
};

/**
 * The default JupyterLab paths dictionary provider.
 */
const paths: JupyterFrontEndPlugin<JupyterFrontEnd.IPaths> = {
  id: '@jupyterlab/apputils-extension:paths',
  activate: (app: JupyterFrontEnd): JupyterFrontEnd.IPaths => {
    if (!(app instanceof JupyterLab)) {
      throw new Error(`${paths.id} must be activated in JupyterLab.`);
    }
    return app.paths;
  },
  autoStart: true,
  provides: JupyterFrontEnd.IPaths
};

/**
 * The default property inspector provider.
 */
const propertyInspector: JupyterFrontEndPlugin<IPropertyInspectorProvider> = {
  id: '@jupyterlab/application-extension:property-inspector',
  autoStart: true,
  requires: [ILabShell, ITranslator],
  optional: [ILayoutRestorer],
  provides: IPropertyInspectorProvider,
  activate: (
    app: JupyterFrontEnd,
    labshell: ILabShell,
    translator: ITranslator,
    restorer: ILayoutRestorer | null
  ) => {
    const trans = translator.load('jupyterlab');
    const widget = new SideBarPropertyInspectorProvider(
      labshell,
      undefined,
      translator
    );
    widget.title.icon = buildIcon;
    widget.title.caption = trans.__('Property Inspector');
    widget.id = 'jp-property-inspector';
    labshell.add(widget, 'right', { rank: 100 });

    app.commands.addCommand(CommandIDs.showPropertyPanel, {
      label: trans.__('Property Inspector'),
      execute: () => {
        labshell.activateById(widget.id);
      }
    });

    if (restorer) {
      restorer.add(widget, 'jp-property-inspector');
    }
    return widget;
  }
};

const JupyterLogo: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/application-extension:logo',
  autoStart: true,
  requires: [ILabShell],
  activate: (app: JupyterFrontEnd, shell: ILabShell) => {
    const logo = new Widget();
    jupyterIcon.element({
      container: logo.node,
      elementPosition: 'center',
      margin: '2px 2px 2px 8px',
      height: 'auto',
      width: '16px'
    });
    logo.id = 'jp-MainLogo';
    shell.add(logo, 'top', { rank: 0 });
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  main,
  mainCommands,
  layout,
  router,
  tree,
  notfound,
  busy,
  sidebar,
  shell,
  status,
  info,
  paths,
  propertyInspector,
  JupyterLogo
];

export default plugins;

namespace Private {
  async function displayInformation(trans: TranslationBundle): Promise<void> {
    const result = await showDialog({
      title: trans.__('Information'),
      body: trans.__(
        'Context menu customization has changed. You will need to reload JupyterLab to see the changes.'
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

  export async function loadSettingsContextMenu(
    contextMenu: ContextMenuSvg,
    registry: ISettingRegistry,
    menuFactory: (options: ISettingRegistry.IMenu) => RankedMenu,
    translator: ITranslator
  ): Promise<void> {
    const trans = translator.load('jupyterlab');
    let canonical: ISettingRegistry.ISchema | null;
    let loaded: { [name: string]: ISettingRegistry.IContextMenuItem[] } = {};

    /**
     * Populate the plugin's schema defaults.
     *
     * We keep track of disabled entries in case the plugin is loaded
     * after the menu initialization.
     */
    function populate(schema: ISettingRegistry.ISchema) {
      loaded = {};
      schema.properties!.contextMenu.default = Object.keys(registry.plugins)
        .map(plugin => {
          const items =
            registry.plugins[plugin]!.schema['jupyter.lab.menus']?.context ??
            [];
          loaded[plugin] = items;
          return items;
        })
        .concat([
          schema['jupyter.lab.menus']?.context ?? [],
          schema.properties!.contextMenu.default as any[]
        ])
        .reduceRight(
          (
            acc: ISettingRegistry.IContextMenuItem[],
            val: ISettingRegistry.IContextMenuItem[]
          ) => SettingRegistry.reconcileItems(acc, val, true),
          []
        )! // flatten one level
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    }

    // Transform the plugin object to return different schema than the default.
    registry.transform(MAIN_PLUGIN_ID, {
      compose: plugin => {
        // Only override the canonical schema the first time.
        if (!canonical) {
          canonical = JSONExt.deepCopy(plugin.schema);
          populate(canonical);
        }

        const defaults = canonical.properties?.contextMenu?.default ?? [];
        const user = {
          contextMenu: plugin.data.user.contextMenu ?? []
        };
        const composite = {
          contextMenu: SettingRegistry.reconcileItems(
            defaults as ISettingRegistry.IContextMenuItem[],
            user.contextMenu as ISettingRegistry.IContextMenuItem[],
            false
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

    const settings = await registry.load(MAIN_PLUGIN_ID);

    const contextItems: ISettingRegistry.IContextMenuItem[] =
      JSONExt.deepCopy(settings.composite.contextMenu as any) ?? [];

    // Create menu item for non-disabled element
    SettingRegistry.filterDisabledItems(contextItems).forEach(item => {
      MenuFactory.addContextItem(item, contextMenu, menuFactory);
    });

    settings.changed.connect(() => {
      // As extension may change the context menu through API,
      // prompt the user to reload if the menu has been updated.
      const newItems = (settings.composite.contextMenu as any) ?? [];
      if (!JSONExt.deepEqual(contextItems, newItems)) {
        void displayInformation(trans);
      }
    });

    registry.pluginChanged.connect(async (sender, plugin) => {
      if (plugin !== MAIN_PLUGIN_ID) {
        // If the plugin changed its menu.
        const oldItems = loaded[plugin] ?? [];
        const newItems =
          registry.plugins[plugin]!.schema['jupyter.lab.menus']?.context ?? [];
        if (!JSONExt.deepEqual(oldItems, newItems)) {
          if (loaded[plugin]) {
            // The plugin has changed, request the user to reload the UI
            await displayInformation(trans);
          } else {
            // The plugin was not yet loaded when the menu was built => update the menu
            loaded[plugin] = JSONExt.deepCopy(newItems);
            // Merge potential disabled state
            const toAdd =
              SettingRegistry.reconcileItems(
                newItems,
                contextItems,
                false,
                false
              ) ?? [];
            SettingRegistry.filterDisabledItems(toAdd).forEach(item => {
              MenuFactory.addContextItem(item, contextMenu, menuFactory);
            });
          }
        }
      }
    });
  }
}
