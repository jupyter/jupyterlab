// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILabShell,
  ILayoutRestorer,
  IRouter,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  Clipboard,
  MainAreaWidget,
  ToolbarButton,
  WidgetTracker,
  ICommandPalette,
  InputDialog,
  showErrorMessage,
  showDialog,
  Dialog,
  DOMUtils
} from '@jupyterlab/apputils';

import { PageConfig, PathExt, URLExt, Time } from '@jupyterlab/coreutils';

import { IDocumentManager } from '@jupyterlab/docmanager';

import {
  FileBrowserModel,
  FileBrowser,
  FileUploadStatus,
  IFileBrowserFactory
} from '@jupyterlab/filebrowser';

import { Launcher } from '@jupyterlab/launcher';

import { IMainMenu } from '@jupyterlab/mainmenu';

import { Contents } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStateDB } from '@jupyterlab/statedb';

import { IStatusBar } from '@jupyterlab/statusbar';

import {
  addIcon,
  closeIcon,
  copyIcon,
  cutIcon,
  downloadIcon,
  editIcon,
  fileIcon,
  folderIcon,
  linkIcon,
  markdownIcon,
  newFolderIcon,
  pasteIcon,
  stopIcon,
  textEditorIcon,
  listingsInfoIcon,
  classes,
  LabIcon
} from '@jupyterlab/ui-components';

import { IIterator, map, reduce, toArray, find } from '@lumino/algorithm';

import { CommandRegistry } from '@lumino/commands';

import { Message } from '@lumino/messaging';

import { Menu, Widget } from '@lumino/widgets';

/**
 * The command IDs used by the file browser plugin.
 */
namespace CommandIDs {
  export const copy = 'filebrowser:copy';

  export const copyDownloadLink = 'filebrowser:copy-download-link';

  // For main browser only.
  export const createLauncher = 'filebrowser:create-main-launcher';

  export const cut = 'filebrowser:cut';

  export const del = 'filebrowser:delete';

  export const download = 'filebrowser:download';

  export const duplicate = 'filebrowser:duplicate';

  // For main browser only.
  export const hideBrowser = 'filebrowser:hide-main';

  export const goToPath = 'filebrowser:go-to-path';

  export const openPath = 'filebrowser:open-path';

  export const open = 'filebrowser:open';

  export const openBrowserTab = 'filebrowser:open-browser-tab';

  export const paste = 'filebrowser:paste';

  export const createNewDirectory = 'filebrowser:create-new-directory';

  export const createNewFile = 'filebrowser:create-new-file';

  export const createNewMarkdownFile = 'filebrowser:create-new-markdown-file';

  export const rename = 'filebrowser:rename';

  // For main browser only.
  export const share = 'filebrowser:share-main';

  // For main browser only.
  export const copyPath = 'filebrowser:copy-path';

  export const showBrowser = 'filebrowser:activate';

  export const shutdown = 'filebrowser:shutdown';

  export const fileInfo = 'filebrowser:fileInfo'

  // For main browser only.
  export const toggleBrowser = 'filebrowser:toggle-main';

  export const toggleNavigateToCurrentDirectory =
    'filebrowser:toggle-navigate-to-current-directory';

  export const toggleLastModified = 'filebrowser:toggle-last-modified';
}

/**
 * The default file browser extension.
 */
const browser: JupyterFrontEndPlugin<void> = {
  activate: activateBrowser,
  id: '@jupyterlab/filebrowser-extension:browser',
  requires: [
    IFileBrowserFactory,
    IDocumentManager,
    ILabShell,
    ILayoutRestorer,
    ISettingRegistry
  ],
  optional: [ICommandPalette, IMainMenu],
  autoStart: true
};

/**
 * The default file browser factory provider.
 */
const factory: JupyterFrontEndPlugin<IFileBrowserFactory> = {
  activate: activateFactory,
  id: '@jupyterlab/filebrowser-extension:factory',
  provides: IFileBrowserFactory,
  requires: [IDocumentManager],
  optional: [IStateDB, IRouter, JupyterFrontEnd.ITreeResolver]
};

/**
 * The default file browser share-file plugin
 *
 * This extension adds a "Copy Shareable Link" command that generates a copy-
 * pastable URL. This url can be used to open a particular file in JupyterLab,
 * handy for emailing links or bookmarking for reference.
 *
 * If you need to change how this link is generated (for instance, to copy a
 * /user-redirect URL for JupyterHub), disable this plugin and replace it
 * with another implementation.
 */
const shareFile: JupyterFrontEndPlugin<void> = {
  activate: activateShareFile,
  id: '@jupyterlab/filebrowser-extension:share-file',
  requires: [IFileBrowserFactory],
  autoStart: true
};

/**
 * A plugin providing file upload status.
 */
export const fileUploadStatus: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/filebrowser-extension:file-upload-status',
  autoStart: true,
  requires: [IFileBrowserFactory],
  optional: [IStatusBar],
  activate: (
    app: JupyterFrontEnd,
    browser: IFileBrowserFactory,
    statusBar: IStatusBar | null
  ) => {
    if (!statusBar) {
      // Automatically disable if statusbar missing
      return;
    }
    const item = new FileUploadStatus({
      tracker: browser.tracker
    });

    statusBar.registerStatusItem(
      '@jupyterlab/filebrowser-extension:file-upload-status',
      {
        item,
        align: 'middle',
        isActive: () => {
          return !!item.model && item.model.items.length > 0;
        },
        activeStateChanged: item.model.stateChanged
      }
    );
  }
};

/**
 * The file browser namespace token.
 */
const namespace = 'filebrowser';

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  factory,
  browser,
  shareFile,
  fileUploadStatus
];
export default plugins;

/**
 * Activate the file browser factory provider.
 */
async function activateFactory(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  state: IStateDB | null,
  router: IRouter | null,
  tree: JupyterFrontEnd.ITreeResolver | null
): Promise<IFileBrowserFactory> {
  const { commands } = app;
  const tracker = new WidgetTracker<FileBrowser>({ namespace });
  const createFileBrowser = (
    id: string,
    options: IFileBrowserFactory.IOptions = {}
  ) => {
    const model = new FileBrowserModel({
      auto: options.auto ?? true,
      manager: docManager,
      driveName: options.driveName || '',
      refreshInterval: options.refreshInterval,
      state:
        options.state === null ? undefined : options.state || state || undefined
    });
    const restore = options.restore;
    const widget = new FileBrowser({ id, model, restore });

    // Add a launcher toolbar item.
    const launcher = new ToolbarButton({
      icon: addIcon,
      onClick: () => {
        if (commands.hasCommand('launcher:create')) {
          return Private.createLauncher(commands, widget);
        }
      },
      tooltip: 'New Launcher'
    });
    widget.toolbar.insertItem(0, 'launch', launcher);

    // Track the newly created file browser.
    void tracker.add(widget);

    return widget;
  };

  // Manually restore and load the default file browser.
  const defaultBrowser = createFileBrowser('filebrowser', {
    auto: false,
    restore: false
  });
  void Private.restoreBrowser(defaultBrowser, commands, router, tree);

  return { createFileBrowser, defaultBrowser, tracker };
}

/**
 * Activate the default file browser in the sidebar.
 */
function activateBrowser(
  app: JupyterFrontEnd,
  factory: IFileBrowserFactory,
  docManager: IDocumentManager,
  labShell: ILabShell,
  restorer: ILayoutRestorer,
  settingRegistry: ISettingRegistry,
  commandPalette: ICommandPalette | null,
  mainMenu: IMainMenu | null
): void {
  const browser = factory.defaultBrowser;
  const { commands } = app;

  // Let the application restorer track the primary file browser (that is
  // automatically created) for restoration of application state (e.g. setting
  // the file browser as the current side bar widget).
  //
  // All other file browsers created by using the factory function are
  // responsible for their own restoration behavior, if any.
  restorer.add(browser, namespace);

  addCommands(
    app,
    factory,
    labShell,
    docManager,
    settingRegistry,
    commandPalette,
    mainMenu
  );

  browser.title.icon = folderIcon;
  // Show the current file browser shortcut in its title.
  const updateBrowserTitle = () => {
    const binding = find(
      app.commands.keyBindings,
      b => b.command === CommandIDs.toggleBrowser
    );
    if (binding) {
      const ks = CommandRegistry.formatKeystroke(binding.keys.join(' '));
      browser.title.caption = `File Browser (${ks})`;
    } else {
      browser.title.caption = 'File Browser';
    }
  };
  updateBrowserTitle();
  app.commands.keyBindingChanged.connect(() => {
    updateBrowserTitle();
  });
  labShell.add(browser, 'left', { rank: 100 });

  // If the layout is a fresh session without saved data, open file browser.
  void labShell.restored.then(layout => {
    if (layout.fresh) {
      void commands.execute(CommandIDs.showBrowser, void 0);
    }
  });

  void Promise.all([app.restored, browser.model.restored]).then(() => {
    function maybeCreate() {
      // Create a launcher if there are no open items.
      if (labShell.isEmpty('main') && commands.hasCommand('launcher:create')) {
        void Private.createLauncher(commands, browser);
      }
    }

    // When layout is modified, create a launcher if there are no open items.
    labShell.layoutModified.connect(() => {
      maybeCreate();
    });

    let navigateToCurrentDirectory: boolean = false;

    void settingRegistry
      .load('@jupyterlab/filebrowser-extension:browser')
      .then(settings => {
        settings.changed.connect(settings => {
          navigateToCurrentDirectory = settings.get(
            'navigateToCurrentDirectory'
          ).composite as boolean;
          browser.navigateToCurrentDirectory = navigateToCurrentDirectory;
        });
        navigateToCurrentDirectory = settings.get('navigateToCurrentDirectory')
          .composite as boolean;
        browser.navigateToCurrentDirectory = navigateToCurrentDirectory;
      });

    // Whether to automatically navigate to a document's current directory
    labShell.currentChanged.connect(async (_, change) => {
      if (navigateToCurrentDirectory && change.newValue) {
        const { newValue } = change;
        const context = docManager.contextForWidget(newValue);
        if (context) {
          const { path } = context;
          try {
            await Private.navigateToPath(path, factory);
            labShell.currentWidget?.activate();
          } catch (reason) {
            console.warn(
              `${CommandIDs.goToPath} failed to open: ${path}`,
              reason
            );
          }
        }
      }
    });

    maybeCreate();
  });
}

function activateShareFile(
  app: JupyterFrontEnd,
  factory: IFileBrowserFactory
): void {
  const { commands } = app;
  const { tracker } = factory;

  commands.addCommand(CommandIDs.share, {
    execute: () => {
      const widget = tracker.currentWidget;
      const model = widget?.selectedItems().next();
      if (!model) {
        return;
      }
      const path = encodeURI(model.path);
      Clipboard.copyToSystem(URLExt.join(PageConfig.getTreeShareUrl(), path));
    },
    isVisible: () =>
      !!tracker.currentWidget &&
      toArray(tracker.currentWidget.selectedItems()).length === 1,
    icon: linkIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Copy Shareable Link'
  });
}

/**
 * Add the main file browser commands to the application's command registry.
 */
function addCommands(
  app: JupyterFrontEnd,
  factory: IFileBrowserFactory,
  labShell: ILabShell,
  docManager: IDocumentManager,
  settingRegistry: ISettingRegistry,
  commandPalette: ICommandPalette | null,
  mainMenu: IMainMenu | null
): void {
  const { docRegistry: registry, commands } = app;
  const { defaultBrowser: browser, tracker } = factory;

  commands.addCommand(CommandIDs.del, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.delete();
      }
    },
    icon: closeIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Delete',
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.copy, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.copy();
      }
    },
    icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Copy',
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.cut, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.cut();
      }
    },
    icon: cutIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Cut'
  });

  commands.addCommand(CommandIDs.download, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.download();
      }
    },
    icon: downloadIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Download'
  });

  commands.addCommand(CommandIDs.duplicate, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.duplicate();
      }
    },
    icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Duplicate'
  });

  commands.addCommand(CommandIDs.hideBrowser, {
    execute: () => {
      const widget = tracker.currentWidget;
      if (widget && !widget.isHidden) {
        labShell.collapseLeft();
      }
    }
  });

  commands.addCommand(CommandIDs.goToPath, {
    execute: async args => {
      const path = (args.path as string) || '';
      try {
        const item = await Private.navigateToPath(path, factory);
        if (item.type !== 'directory') {
          const browserForPath = Private.getBrowserForPath(path, factory);
          if (browserForPath) {
            browserForPath.clearSelectedItems();
            const parts = path.split('/');
            const name = parts[parts.length - 1];
            if (name) {
              await browserForPath.selectItemByName(name);
            }
          }
        }
      } catch (reason) {
        console.warn(`${CommandIDs.goToPath} failed to go to: ${path}`, reason);
      }
      return commands.execute(CommandIDs.showBrowser, { path });
    }
  });

  commands.addCommand(CommandIDs.openPath, {
    label: args => (args.path ? `Open ${args.path}` : 'Open from Path…'),
    caption: args => (args.path ? `Open ${args.path}` : 'Open from path'),
    execute: async ({ path }: { path?: string }) => {
      if (!path) {
        path =
          (
            await InputDialog.getText({
              label: 'Path',
              placeholder: '/path/relative/to/jlab/root',
              title: 'Open Path',
              okLabel: 'Open'
            })
          ).value ?? undefined;
      }
      if (!path) {
        return;
      }
      try {
        const trailingSlash = path !== '/' && path.endsWith('/');
        if (trailingSlash) {
          // The normal contents service errors on paths ending in slash
          path = path.slice(0, path.length - 1);
        }
        const browserForPath = Private.getBrowserForPath(path, factory)!;
        const { services } = browserForPath.model.manager;
        const item = await services.contents.get(path, {
          content: false
        });
        if (trailingSlash && item.type !== 'directory') {
          throw new Error(`Path ${path}/ is not a directory`);
        }
        await commands.execute(CommandIDs.goToPath, { path });
        if (item.type === 'directory') {
          return;
        }
        return commands.execute('docmanager:open', { path });
      } catch (reason) {
        if (reason.response && reason.response.status === 404) {
          reason.message = `Could not find path: ${path}`;
        }
        return showErrorMessage('Cannot open', reason);
      }
    }
  });
  // Add the openPath command to the command palette
  if (commandPalette) {
    commandPalette.addItem({
      command: CommandIDs.openPath,
      category: 'File Operations'
    });
  }

  commands.addCommand(CommandIDs.open, {
    execute: args => {
      const factory = (args['factory'] as string) || void 0;
      const widget = tracker.currentWidget;

      if (!widget) {
        return;
      }

      const { contents } = widget.model.manager.services;
      return Promise.all(
        toArray(
          map(widget.selectedItems(), item => {
            if (item.type === 'directory') {
              const localPath = contents.localPath(item.path);
              return widget.model.cd(`/${localPath}`);
            }

            return commands.execute('docmanager:open', {
              factory: factory,
              path: item.path
            });
          })
        )
      );
    },
    icon: args => {
      const factory = (args['factory'] as string) || void 0;
      if (factory) {
        // if an explicit factory is passed...
        const ft = registry.getFileType(factory);
        // ...set an icon if the factory name corresponds to a file type name...
        // ...or leave the icon blank
        return ft?.icon?.bindprops({ stylesheet: 'menuItem' });
      } else {
        return folderIcon.bindprops({ stylesheet: 'menuItem' });
      }
    },
    label: args => (args['label'] || args['factory'] || 'Open') as string,
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.openBrowserTab, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (!widget) {
        return;
      }

      return Promise.all(
        toArray(
          map(widget.selectedItems(), item => {
            return commands.execute('docmanager:open-browser-tab', {
              path: item.path
            });
          })
        )
      );
    },
    icon: addIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Open in New Browser Tab',
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.copyDownloadLink, {
    execute: () => {
      const widget = tracker.currentWidget;
      if (!widget) {
        return;
      }

      return widget.model.manager.services.contents
        .getDownloadUrl(widget.selectedItems().next()!.path)
        .then(url => {
          Clipboard.copyToSystem(url);
        });
    },
    icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Copy Download Link',
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.paste, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.paste();
      }
    },
    icon: pasteIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Paste',
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.createNewDirectory, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.createNewDirectory();
      }
    },
    icon: newFolderIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'New Folder'
  });

  commands.addCommand(CommandIDs.createNewFile, {
    execute: () => {
      const {
        model: { path }
      } = browser;
      void commands.execute('docmanager:new-untitled', {
        path,
        type: 'file',
        ext: 'txt'
      });
    },
    icon: textEditorIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'New File'
  });

  commands.addCommand(CommandIDs.createNewMarkdownFile, {
    execute: () => {
      const {
        model: { path }
      } = browser;
      void commands.execute('docmanager:new-untitled', {
        path,
        type: 'file',
        ext: 'md'
      });
    },
    icon: markdownIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'New Markdown File'
  });

  commands.addCommand(CommandIDs.rename, {
    execute: args => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.rename();
      }
    },
    icon: editIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Rename',
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.copyPath, {
    execute: () => {
      const widget = tracker.currentWidget;
      if (!widget) {
        return;
      }
      const item = widget.selectedItems().next();
      if (!item) {
        return;
      }

      Clipboard.copyToSystem(item.path);
    },
    isVisible: () =>
      !!tracker.currentWidget &&
      tracker.currentWidget.selectedItems().next !== undefined,
    icon: fileIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Copy Path'
  });

  commands.addCommand(CommandIDs.showBrowser, {
    execute: args => {
      const path = (args.path as string) || '';
      const browserForPath = Private.getBrowserForPath(path, factory);

      // Check for browser not found
      if (!browserForPath) {
        return;
      }
      // Shortcut if we are using the main file browser
      if (browser === browserForPath) {
        labShell.activateById(browser.id);
        return;
      } else {
        const areas: ILabShell.Area[] = ['left', 'right'];
        for (const area of areas) {
          const it = labShell.widgets(area);
          let widget = it.next();
          while (widget) {
            if (widget.contains(browserForPath)) {
              labShell.activateById(widget.id);
              return;
            }
            widget = it.next();
          }
        }
      }
    }
  });

  commands.addCommand(CommandIDs.shutdown, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.shutdownKernels();
      }
    },
    icon: stopIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'Shut Down Kernel'
  });

  commands.addCommand(CommandIDs.toggleBrowser, {
    execute: () => {
      if (browser.isHidden) {
        return commands.execute(CommandIDs.showBrowser, void 0);
      }

      return commands.execute(CommandIDs.hideBrowser, void 0);
    }
  });

  commands.addCommand(CommandIDs.createLauncher, {
    label: 'New Launcher',
    execute: () => Private.createLauncher(commands, browser)
  });

  commands.addCommand(CommandIDs.toggleNavigateToCurrentDirectory, {
    label: 'Show Active File in File Browser',
    isToggled: () => browser.navigateToCurrentDirectory,
    execute: () => {
      const value = !browser.navigateToCurrentDirectory;
      const key = 'navigateToCurrentDirectory';
      return settingRegistry
        .set('@jupyterlab/filebrowser-extension:browser', key, value)
        .catch((reason: Error) => {
          console.error(`Failed to set navigateToCurrentDirectory setting`);
        });
    }
  });

  commands.addCommand(CommandIDs.toggleLastModified, {
    label: 'Toggle Last Modified Column',
    execute: () => {
      const header = DOMUtils.findElement(document.body, 'jp-id-modified');
      const column = DOMUtils.findElements(
        document.body,
        'jp-DirListing-itemModified'
      );
      if (header.classList.contains('jp-LastModified-hidden')) {
        header.classList.remove('jp-LastModified-hidden');
        for (let i = 0; i < column.length; i++) {
          column[i].classList.remove('jp-LastModified-hidden');
        }
      } else {
        header.classList.add('jp-LastModified-hidden');
        for (let i = 0; i < column.length; i++) {
          column[i].classList.add('jp-LastModified-hidden');
        }
      }
    }
  });

  commands.addCommand(CommandIDs.fileInfo, {
    execute: () => {
      const model = tracker.currentWidget?.selectedItems().next();
      if (!model) {
        return;
      }
      //let title= model.name
      let size;
      if (model.size !== null && model.size !== undefined) {
       size= formatFileSize(model.size, 1, 1024);
      }
      
      
      const homeIcon = folderIcon.element({
        tag: 'span',
        stylesheet: 'breadCrumb'
      });

      let body = new Widget({ node: document.createElement('div') });
      const { icon, iconClass} = docManager.registry.getFileTypeForModel(model);
      body.addClass('jp-file-info-dialog');
      let bodyHtml = `
      <div class="jp-info-title"><span class="jp-info-title-icon"></span><span>${model.name}</span></div>
      <div class="jp-inner-header">File Info</div>
      <div class="jp-info-dialog-content">
      <div><label>Location:</label><span><span class="jp-info-folder-icon"></span>/${model.path}</span></div>
      <div><label>Type:</label><span>${model.type}</span></div>
      ${size?`<div><label>Size:</label><span>${size}</span></div>`:''}
      <div><label>Created:</label><span>${Time.format(new Date(model.created), 'YYYY-MM-DD HH:mm:ss')}</span></div>
      <div><label>Modified:</label><span>${Time.format(new Date(model.last_modified), 'YYYY-MM-DD HH:mm:ss')}</span></div>
      <div><label>Writable:</label><span>${model.writable}</span></div>
      </div>
      ${model.type !== 'directory'?
      `<div class="jp-inner-header">Launch Activity</div>
      <div class="jp-info-action-buttons">
      <span class="jp-info-notebook-editor-icon"></span>
      <span class="jp-info-text-editor-icon"></span>
      </div>
      `:''}
      `
      body.node.innerHTML = bodyHtml;
      const folderIconContainer = DOMUtils.findElement(body.node, 'jp-info-folder-icon');
      folderIconContainer.innerHTML = homeIcon.innerHTML;


      const ITEM_ICON_CLASS = 'jp-info-title-icon';
      const iconContainer = DOMUtils.findElement(body.node, ITEM_ICON_CLASS);

      // render the file item's icon
      LabIcon.resolveElement({
        icon,
        iconClass: classes(iconClass, 'jp-Icon'),
        container: iconContainer,
        className: ITEM_ICON_CLASS,
        stylesheet: 'launcherSection'
      });

      const ITEM_ICON_NOTEBOOK_CLASS = 'jp-info-notebook-editor-icon';
      const iconContainerNotebook = DOMUtils.findElement(body.node, ITEM_ICON_NOTEBOOK_CLASS);

      // render the notebook editor icon
      LabIcon.resolveElement({
        icon,
        iconClass: classes(iconClass, 'jp-Icon'),
        container: iconContainerNotebook,
        className: ITEM_ICON_NOTEBOOK_CLASS,
        stylesheet: 'launcherSection'
      });

      const ITEM_ICON_TEXT_CLASS = 'jp-info-text-editor-icon';
      const iconContainerText = DOMUtils.findElement(body.node, ITEM_ICON_TEXT_CLASS);

      // render the text editor item's icon
      LabIcon.resolveElement({
        icon,
        iconClass: classes(iconClass, 'jp-Icon'),
        container: iconContainerText,
        className: ITEM_ICON_TEXT_CLASS,
        stylesheet: 'launcherSection'
      });

      
      
      
      return showDialog({
        //title,
        body,
        buttons: [
          Dialog.createButton({
            label: 'Close',
            className: 'jp-info-dialog-button jp-mod-reject jp-mod-styled'
          })
        ]
      });
    },
    icon: listingsInfoIcon.bindprops({ stylesheet: 'menuItem' }),
    label: 'File Info'
  });

  if (mainMenu) {
    mainMenu.settingsMenu.addGroup(
      [{ command: CommandIDs.toggleNavigateToCurrentDirectory }],
      5
    );
  }

  if (commandPalette) {
    commandPalette.addItem({
      command: CommandIDs.toggleNavigateToCurrentDirectory,
      category: 'File Operations'
    });
  }

  /**
   * A menu widget that dynamically populates with different widget factories
   * based on current filebrowser selection.
   */
  class OpenWithMenu extends Menu {
    protected onBeforeAttach(msg: Message): void {
      // clear the current menu items
      this.clearItems();

      // get the widget factories that could be used to open all of the items
      // in the current filebrowser selection
      const factories = tracker.currentWidget
        ? OpenWithMenu._intersection(
            map(tracker.currentWidget.selectedItems(), i => {
              return OpenWithMenu._getFactories(i);
            })
          )
        : undefined;

      if (factories) {
        // make new menu items from the widget factories
        factories.forEach(factory => {
          this.addItem({
            args: { factory: factory },
            command: CommandIDs.open
          });
        });
      }

      super.onBeforeAttach(msg);
    }

    static _getFactories(item: Contents.IModel): Array<string> {
      const factories = registry
        .preferredWidgetFactories(item.path)
        .map(f => f.name);
      const notebookFactory = registry.getWidgetFactory('notebook')?.name;
      if (
        notebookFactory &&
        item.type === 'notebook' &&
        factories.indexOf(notebookFactory) === -1
      ) {
        factories.unshift(notebookFactory);
      }

      return factories;
    }

    static _intersection<T>(iter: IIterator<Array<T>>): Set<T> | void {
      // pop the first element of iter
      const first = iter.next();
      // first will be undefined if iter is empty
      if (!first) {
        return;
      }

      // "initialize" the intersection from first
      const isect = new Set(first);
      // reduce over the remaining elements of iter
      return reduce(
        iter,
        (isect, subarr) => {
          // filter out all elements not present in both isect and subarr,
          // accumulate result in new set
          return new Set(subarr.filter(x => isect.has(x)));
        },
        isect
      );
    }
  }

  // matches anywhere on filebrowser
  const selectorContent = '.jp-DirListing-content';
  // matches all filebrowser items
  const selectorItem = '.jp-DirListing-item[data-isdir]';
  // matches only non-directory items
  const selectorNotDir = '.jp-DirListing-item[data-isdir="false"]';

  // If the user did not click on any file, we still want to show paste and new folder,
  // so target the content rather than an item.
  app.contextMenu.addItem({
    command: CommandIDs.createNewDirectory,
    selector: selectorContent,
    rank: 1
  });

  app.contextMenu.addItem({
    command: CommandIDs.createNewFile,
    selector: selectorContent,
    rank: 2
  });

  app.contextMenu.addItem({
    command: CommandIDs.createNewMarkdownFile,
    selector: selectorContent,
    rank: 3
  });

  app.contextMenu.addItem({
    command: CommandIDs.paste,
    selector: selectorContent,
    rank: 4
  });

  app.contextMenu.addItem({
    command: CommandIDs.open,
    selector: selectorItem,
    rank: 1
  });

  const openWith = new OpenWithMenu({ commands });
  openWith.title.label = 'Open With';
  app.contextMenu.addItem({
    type: 'submenu',
    submenu: openWith,
    selector: selectorNotDir,
    rank: 2
  });

  app.contextMenu.addItem({
    command: CommandIDs.openBrowserTab,
    selector: selectorNotDir,
    rank: 3
  });

  app.contextMenu.addItem({
    command: CommandIDs.rename,
    selector: selectorItem,
    rank: 4
  });
  app.contextMenu.addItem({
    command: CommandIDs.del,
    selector: selectorItem,
    rank: 5
  });
  app.contextMenu.addItem({
    command: CommandIDs.cut,
    selector: selectorItem,
    rank: 6
  });

  app.contextMenu.addItem({
    command: CommandIDs.copy,
    selector: selectorNotDir,
    rank: 7
  });

  app.contextMenu.addItem({
    command: CommandIDs.duplicate,
    selector: selectorNotDir,
    rank: 8
  });
  app.contextMenu.addItem({
    command: CommandIDs.download,
    selector: selectorNotDir,
    rank: 9
  });
  app.contextMenu.addItem({
    command: CommandIDs.shutdown,
    selector: selectorNotDir,
    rank: 10
  });

  app.contextMenu.addItem({
    command: CommandIDs.share,
    selector: selectorItem,
    rank: 11
  });
  app.contextMenu.addItem({
    command: CommandIDs.copyPath,
    selector: selectorItem,
    rank: 12
  });
  app.contextMenu.addItem({
    command: CommandIDs.copyDownloadLink,
    selector: selectorNotDir,
    rank: 13
  });
  app.contextMenu.addItem({
    command: CommandIDs.toggleLastModified,
    selector: '.jp-DirListing-header',
    rank: 14
  });

  app.contextMenu.addItem({
    command: CommandIDs.fileInfo,
    selector: selectorItem,
    rank: 15
  });
}

/**
 * A namespace for private module data.
 */
namespace Private {
  /**
   * Create a launcher for a given filebrowser widget.
   */
  export function createLauncher(
    commands: CommandRegistry,
    browser: FileBrowser
  ): Promise<MainAreaWidget<Launcher>> {
    const { model } = browser;

    return commands
      .execute('launcher:create', { cwd: model.path })
      .then((launcher: MainAreaWidget<Launcher>) => {
        model.pathChanged.connect(() => {
          if (launcher.content) {
            launcher.content.cwd = model.path;
          }
        }, launcher);
        return launcher;
      });
  }

  /**
   * Get browser object given file path.
   */
  export function getBrowserForPath(
    path: string,
    factory: IFileBrowserFactory
  ): FileBrowser | undefined {
    const { defaultBrowser: browser, tracker } = factory;
    const driveName = browser.model.manager.services.contents.driveName(path);

    if (driveName) {
      const browserForPath = tracker.find(
        _path => _path.model.driveName === driveName
      );

      if (!browserForPath) {
        // warn that no filebrowser could be found for this driveName
        console.warn(
          `${CommandIDs.goToPath} failed to find filebrowser for path: ${path}`
        );
        return;
      }

      return browserForPath;
    }

    // if driveName is empty, assume the main filebrowser
    return browser;
  }

  /**
   * Navigate to a path or the path containing a file.
   */
  export async function navigateToPath(
    path: string,
    factory: IFileBrowserFactory
  ): Promise<Contents.IModel> {
    const browserForPath = Private.getBrowserForPath(path, factory);
    if (!browserForPath) {
      throw new Error('No browser for path');
    }
    const { services } = browserForPath.model.manager;
    const localPath = services.contents.localPath(path);

    await services.ready;
    const item = await services.contents.get(path, { content: false });
    const { model } = browserForPath;
    await model.restored;
    if (item.type === 'directory') {
      await model.cd(`/${localPath}`);
    } else {
      await model.cd(`/${PathExt.dirname(localPath)}`);
    }
    return item;
  }

  /**
   * Restores file browser state and overrides state if tree resolver resolves.
   */
  export async function restoreBrowser(
    browser: FileBrowser,
    commands: CommandRegistry,
    router: IRouter | null,
    tree: JupyterFrontEnd.ITreeResolver | null
  ): Promise<void> {
    const restoring = 'jp-mod-restoring';

    browser.addClass(restoring);

    if (!router) {
      await browser.model.restore(browser.id);
      await browser.model.refresh();
      browser.removeClass(restoring);
      return;
    }

    const listener = async () => {
      router.routed.disconnect(listener);

      const paths = await tree?.paths;
      if (paths?.file || paths?.browser) {
        // Restore the model without populating it.
        await browser.model.restore(browser.id, false);
        if (paths.file) {
          await commands.execute(CommandIDs.openPath, { path: paths.file });
        }
        if (paths.browser) {
          await commands.execute(CommandIDs.openPath, { path: paths.browser });
        }
      } else {
        await browser.model.restore(browser.id);
        await browser.model.refresh();
      }
      browser.removeClass(restoring);
    };
    router.routed.connect(listener);
  }
}

/**
   * Format bytes to human readable string.
   */
  export function formatFileSize(
    bytes: number,
    decimalPoint: number,
    k: number
  ): string {
    // https://www.codexworld.com/how-to/convert-file-size-bytes-kb-mb-gb-javascript/
    if (bytes === 0) {
      return '0 Bytes';
    }
    const dm = decimalPoint || 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i >= 0 && i < sizes.length) {
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    } else {
      return String(bytes);
    }
  }