// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { some, map, each } from '@phosphor/algorithm';

import { Widget } from '@phosphor/widgets';

import {
  ILabShell,
  ILabStatus,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  showDialog,
  showErrorMessage,
  Dialog,
  ICommandPalette
} from '@jupyterlab/apputils';

import { IChangedArgs, ISettingRegistry, Time } from '@jupyterlab/coreutils';

import {
  renameDialog,
  getOpenPath,
  DocumentManager,
  IDocumentManager,
  PathStatus,
  SavingStatus
} from '@jupyterlab/docmanager';

import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';

import { IMainMenu } from '@jupyterlab/mainmenu';

import { Contents, Kernel } from '@jupyterlab/services';

import { IStatusBar } from '@jupyterlab/statusbar';

import { IDisposable } from '@phosphor/disposable';

/**
 * The command IDs used by the document manager plugin.
 */
namespace CommandIDs {
  export const clone = 'docmanager:clone';

  export const deleteFile = 'docmanager:delete-file';

  export const newUntitled = 'docmanager:new-untitled';

  export const open = 'docmanager:open';

  export const openBrowserTab = 'docmanager:open-browser-tab';

  export const openDirect = 'docmanager:open-direct';

  export const reload = 'docmanager:reload';

  export const rename = 'docmanager:rename';

  export const restoreCheckpoint = 'docmanager:restore-checkpoint';

  export const save = 'docmanager:save';

  export const saveAll = 'docmanager:save-all';

  export const saveAs = 'docmanager:save-as';

  export const toggleAutosave = 'docmanager:toggle-autosave';

  export const showInFileBrowser = 'docmanager:show-in-file-browser';
}

const pluginId = '@jupyterlab/docmanager-extension:plugin';

/**
 * The default document manager provider.
 */
const docManagerPlugin: JupyterFrontEndPlugin<IDocumentManager> = {
  id: pluginId,
  provides: IDocumentManager,
  requires: [ISettingRegistry],
  optional: [ILabStatus, ICommandPalette, ILabShell, IMainMenu],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    status: ILabStatus | null,
    palette: ICommandPalette | null,
    labShell: ILabShell | null,
    mainMenu: IMainMenu | null
  ): IDocumentManager => {
    const { shell } = app;
    const manager = app.serviceManager;
    const contexts = new WeakSet<DocumentRegistry.Context>();
    const opener: DocumentManager.IWidgetOpener = {
      open: (widget, options) => {
        if (!widget.id) {
          widget.id = `document-manager-${++Private.id}`;
        }
        widget.title.dataset = {
          type: 'document-title',
          ...widget.title.dataset
        };
        if (!widget.isAttached) {
          shell.add(widget, 'main', options || {});
        }
        shell.activateById(widget.id);

        // Handle dirty state for open documents.
        let context = docManager.contextForWidget(widget);
        if (!contexts.has(context)) {
          handleContext(status, context);
          contexts.add(context);
        }
      }
    };
    const registry = app.docRegistry;
    const when = app.restored.then(() => void 0);
    const docManager = new DocumentManager({
      registry,
      manager,
      opener,
      when,
      setBusy: status.setBusy.bind(app)
    });

    // Register the file operations commands.
    addCommands(
      app,
      docManager,
      opener,
      settingRegistry,
      labShell,
      palette,
      mainMenu
    );

    // Keep up to date with the settings registry.
    const onSettingsUpdated = (settings: ISettingRegistry.ISettings) => {
      const autosave = settings.get('autosave').composite as boolean | null;
      docManager.autosave =
        autosave === true || autosave === false ? autosave : true;
      app.commands.notifyCommandChanged(CommandIDs.toggleAutosave);

      const autosaveInterval = settings.get('autosaveInterval').composite as
        | number
        | null;
      docManager.autosaveInterval = autosaveInterval || 120;
    };

    // Fetch the initial state of the settings.
    Promise.all([settingRegistry.load(pluginId), app.restored])
      .then(([settings]) => {
        settings.changed.connect(onSettingsUpdated);
        onSettingsUpdated(settings);
      })
      .catch((reason: Error) => {
        console.error(reason.message);
      });

    return docManager;
  }
};

/**
 * A plugin for adding a saving status item to the status bar.
 */
export const savingStatusPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/docmanager-extension:saving-status',
  autoStart: true,
  requires: [IStatusBar, IDocumentManager, ILabShell],
  activate: (
    _: JupyterFrontEnd,
    statusBar: IStatusBar,
    docManager: IDocumentManager,
    labShell: ILabShell
  ) => {
    const saving = new SavingStatus({ docManager });

    // Keep the currently active widget synchronized.
    saving.model!.widget = labShell.currentWidget;
    labShell.currentChanged.connect(() => {
      saving.model!.widget = labShell.currentWidget;
    });

    statusBar.registerStatusItem(savingStatusPlugin.id, {
      item: saving,
      align: 'middle',
      isActive: () => true,
      activeStateChanged: saving.model!.stateChanged
    });
  }
};

/**
 * A plugin providing a file path widget to the status bar.
 */
export const pathStatusPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/docmanager-extension:path-status',
  autoStart: true,
  requires: [IStatusBar, IDocumentManager, ILabShell],
  activate: (
    _: JupyterFrontEnd,
    statusBar: IStatusBar,
    docManager: IDocumentManager,
    labShell: ILabShell
  ) => {
    const path = new PathStatus({ docManager });

    // Keep the file path widget up-to-date with the application active widget.
    path.model!.widget = labShell.currentWidget;
    labShell.currentChanged.connect(() => {
      path.model!.widget = labShell.currentWidget;
    });

    statusBar.registerStatusItem(pathStatusPlugin.id, {
      item: path,
      align: 'right',
      rank: 0,
      isActive: () => true
    });
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  docManagerPlugin,
  pathStatusPlugin,
  savingStatusPlugin
];
export default plugins;

/* Widget to display the revert to checkpoint confirmation. */
class RevertConfirmWidget extends Widget {
  /**
   * Construct a new revert confirmation widget.
   */
  constructor(
    checkpoint: Contents.ICheckpointModel,
    fileType: string = 'notebook'
  ) {
    super({ node: Private.createRevertConfirmNode(checkpoint, fileType) });
  }
}

// Returns the file type for a widget.
function fileType(widget: Widget, docManager: IDocumentManager): string {
  if (!widget) {
    return 'File';
  }
  const context = docManager.contextForWidget(widget);
  if (!context) {
    return '';
  }
  const fts = docManager.registry.getFileTypesForPath(context.path);
  return fts.length && fts[0].displayName ? fts[0].displayName : 'File';
}

/**
 * Add the file operations commands to the application's command registry.
 */
function addCommands(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  opener: DocumentManager.IWidgetOpener,
  settingRegistry: ISettingRegistry,
  labShell: ILabShell | null,
  palette: ICommandPalette | null,
  mainMenu: IMainMenu | null
): void {
  const { commands, shell } = app;
  const category = 'File Operations';
  const isEnabled = () => {
    const { currentWidget } = shell;
    return !!(currentWidget && docManager.contextForWidget(currentWidget));
  };

  const isWritable = () => {
    const { currentWidget } = shell;
    if (!currentWidget) {
      return false;
    }
    const context = docManager.contextForWidget(currentWidget);
    return !!(
      context &&
      context.contentsModel &&
      context.contentsModel.writable
    );
  };

  // If inside a rich application like JupyterLab, add additional functionality.
  if (labShell) {
    addLabCommands(app, docManager, labShell, opener, palette);
  }

  commands.addCommand(CommandIDs.deleteFile, {
    label: () => `Delete ${fileType(shell.currentWidget, docManager)}`,
    execute: args => {
      const path =
        typeof args['path'] === 'undefined' ? '' : (args['path'] as string);

      if (!path) {
        const command = CommandIDs.deleteFile;
        throw new Error(`A non-empty path is required for ${command}.`);
      }
      return docManager.deleteFile(path);
    }
  });

  commands.addCommand(CommandIDs.newUntitled, {
    execute: args => {
      const errorTitle = (args['error'] as string) || 'Error';
      const path =
        typeof args['path'] === 'undefined' ? '' : (args['path'] as string);
      let options: Partial<Contents.ICreateOptions> = {
        type: args['type'] as Contents.ContentType,
        path
      };

      if (args['type'] === 'file') {
        options.ext = (args['ext'] as string) || '.txt';
      }

      return docManager.services.contents
        .newUntitled(options)
        .catch(error => showErrorMessage(errorTitle, error));
    },
    label: args => (args['label'] as string) || `New ${args['type'] as string}`
  });

  commands.addCommand(CommandIDs.open, {
    execute: args => {
      const path =
        typeof args['path'] === 'undefined' ? '' : (args['path'] as string);
      const factory = (args['factory'] as string) || void 0;
      const kernel = (args['kernel'] as Kernel.IModel) || void 0;
      const options =
        (args['options'] as DocumentRegistry.IOpenOptions) || void 0;
      return docManager.services.contents
        .get(path, { content: false })
        .then(() => docManager.openOrReveal(path, factory, kernel, options));
    },
    icon: args => (args['icon'] as string) || '',
    label: args => (args['label'] || args['factory']) as string,
    mnemonic: args => (args['mnemonic'] as number) || -1
  });

  commands.addCommand(CommandIDs.openBrowserTab, {
    execute: args => {
      const path =
        typeof args['path'] === 'undefined' ? '' : (args['path'] as string);

      if (!path) {
        return;
      }

      return docManager.services.contents.getDownloadUrl(path).then(url => {
        const opened = window.open();
        opened.opener = null;
        opened.location.href = url;
      });
    },
    icon: args => (args['icon'] as string) || '',
    label: () => 'Open in New Browser Tab'
  });

  commands.addCommand(CommandIDs.openDirect, {
    label: () => 'Open From Path...',
    caption: 'Open from path',
    isEnabled: () => true,
    execute: () => {
      return getOpenPath(docManager.services.contents).then(path => {
        if (!path) {
          return;
        }
        docManager.services.contents.get(path, { content: false }).then(
          args => {
            // exists
            return commands.execute(CommandIDs.open, { path: path });
          },
          () => {
            // does not exist
            return showDialog({
              title: 'Cannot open',
              body: 'File not found',
              buttons: [Dialog.okButton()]
            });
          }
        );
        return;
      });
    }
  });

  commands.addCommand(CommandIDs.reload, {
    label: () =>
      `Reload ${fileType(shell.currentWidget, docManager)} from Disk`,
    caption: 'Reload contents from disk',
    isEnabled,
    execute: () => {
      if (!isEnabled()) {
        return;
      }
      const context = docManager.contextForWidget(shell.currentWidget);
      const type = fileType(shell.currentWidget, docManager);
      return showDialog({
        title: `Reload ${type} from Disk`,
        body: `Are you sure you want to reload
          the ${type} from the disk?`,
        buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Reload' })]
      }).then(result => {
        if (result.button.accept && !context.isDisposed) {
          return context.revert();
        }
      });
    }
  });

  commands.addCommand(CommandIDs.restoreCheckpoint, {
    label: () =>
      `Revert ${fileType(shell.currentWidget, docManager)} to Checkpoint`,
    caption: 'Revert contents to previous checkpoint',
    isEnabled,
    execute: () => {
      if (!isEnabled()) {
        return;
      }
      const context = docManager.contextForWidget(shell.currentWidget);
      return context.listCheckpoints().then(checkpoints => {
        if (checkpoints.length < 1) {
          return;
        }
        const lastCheckpoint = checkpoints[checkpoints.length - 1];
        if (!lastCheckpoint) {
          return;
        }
        const type = fileType(shell.currentWidget, docManager);
        return showDialog({
          title: `Revert ${type} to checkpoint`,
          body: new RevertConfirmWidget(lastCheckpoint, type),
          buttons: [
            Dialog.cancelButton(),
            Dialog.warnButton({ label: 'Revert' })
          ]
        }).then(result => {
          if (context.isDisposed) {
            return;
          }
          if (result.button.accept) {
            if (context.model.readOnly) {
              return context.revert();
            }
            return context.restoreCheckpoint().then(() => context.revert());
          }
        });
      });
    }
  });

  commands.addCommand(CommandIDs.save, {
    label: () => `Save ${fileType(shell.currentWidget, docManager)}`,
    caption: 'Save and create checkpoint',
    isEnabled: isWritable,
    execute: () => {
      if (isEnabled()) {
        let context = docManager.contextForWidget(shell.currentWidget);
        if (context.model.readOnly) {
          return showDialog({
            title: 'Cannot Save',
            body: 'Document is read-only',
            buttons: [Dialog.okButton()]
          });
        }
        return context
          .save()
          .then(() => context.createCheckpoint())
          .catch(err => {
            // If the save was canceled by user-action, do nothing.
            if (err.message === 'Cancel') {
              return;
            }
            throw err;
          });
      }
    }
  });

  commands.addCommand(CommandIDs.saveAll, {
    label: () => 'Save All',
    caption: 'Save all open documents',
    isEnabled: () => {
      return some(
        map(shell.widgets('main'), w => docManager.contextForWidget(w)),
        c => c && c.contentsModel && c.contentsModel.writable
      );
    },
    execute: () => {
      const promises: Promise<void>[] = [];
      const paths = new Set<string>(); // Cache so we don't double save files.
      each(shell.widgets('main'), widget => {
        const context = docManager.contextForWidget(widget);
        if (context && !context.model.readOnly && !paths.has(context.path)) {
          paths.add(context.path);
          promises.push(context.save());
        }
      });
      return Promise.all(promises);
    }
  });

  commands.addCommand(CommandIDs.saveAs, {
    label: () => `Save ${fileType(shell.currentWidget, docManager)} As…`,
    caption: 'Save with new path',
    isEnabled,
    execute: () => {
      if (isEnabled()) {
        let context = docManager.contextForWidget(shell.currentWidget);
        return context.saveAs();
      }
    }
  });

  commands.addCommand(CommandIDs.toggleAutosave, {
    label: 'Autosave Documents',
    isToggled: () => docManager.autosave,
    execute: () => {
      const value = !docManager.autosave;
      const key = 'autosave';
      return settingRegistry
        .set(pluginId, key, value)
        .catch((reason: Error) => {
          console.error(`Failed to set ${pluginId}:${key} - ${reason.message}`);
        });
    }
  });

  // .jp-mod-current added so that the console-creation command is only shown
  // on the current document.
  // Otherwise it will delegate to the wrong widget.
  app.contextMenu.addItem({
    command: 'filemenu:create-console',
    selector: '[data-type="document-title"].jp-mod-current',
    rank: 6
  });

  if (palette) {
    [
      CommandIDs.openDirect,
      CommandIDs.reload,
      CommandIDs.restoreCheckpoint,
      CommandIDs.save,
      CommandIDs.saveAs,
      CommandIDs.toggleAutosave
    ].forEach(command => {
      palette.addItem({ command, category });
    });
  }

  if (mainMenu) {
    mainMenu.settingsMenu.addGroup([{ command: CommandIDs.toggleAutosave }], 5);
  }
}

function addLabCommands(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  labShell: ILabShell,
  opener: DocumentManager.IWidgetOpener,
  palette: ICommandPalette | null
): void {
  const { commands } = app;

  /**
   * Retrieve the intended document widget if there is one.
   *
   * If there is currently a context menu event, this retrieves the document
   * widget associated with the context menu event if possible. If there is not
   * a context menu event, it returns the shell's current widget if it is a
   * document widget.
   */
  function contextMenuWidget(): IDocumentWidget | undefined {
    // This hit test tries to recover a path from a click on a tab too. It is
    // somewhat brittle, in that it actually recovers any node with a title
    // attribute matching this particular regex.
    const pathRe = /[Pp]ath:\s?(.*)\n?/;
    const node = app.contextMenuHitTest(
      (node: HTMLElement) => node['title'] && !!node['title'].match(pathRe)
    );

    if (node) {
      const pathMatch = node['title'].match(pathRe);
      let widgets = docManager.findWidgets(pathMatch[1]);
      // How do we pick out the right widget? The node may correspond to a tab,
      // not a widget itself, so we cannot test w.node.contains(node). Can we
      // recover a tab widget from its node? TODO: have an app hit test that, if
      // the hit is on a tab, returns the associated widget.
      return widgets[0];
    }

    // Fall back to current widget if it is an IDocumentWidget.
    const { currentWidget } = labShell;
    if (currentWidget && docManager.contextForWidget(currentWidget)) {
      return currentWidget as IDocumentWidget;
    }
  }

  // Returns `true` if the current widget has a document context.
  const isEnabled = () => {
    const { currentWidget } = labShell;
    return !!(currentWidget && docManager.contextForWidget(currentWidget));
  };

  commands.addCommand(CommandIDs.clone, {
    label: () => `New View for ${fileType(contextMenuWidget(), docManager)}`,
    isEnabled,
    execute: args => {
      const widget = contextMenuWidget();
      if (!widget) {
        return;
      }
      const options = (args['options'] as DocumentRegistry.IOpenOptions) || {
        mode: 'split-right'
      };
      // Clone the widget.
      let child = docManager.cloneWidget(widget);
      if (child) {
        opener.open(child, options);
      }
    }
  });

  commands.addCommand(CommandIDs.rename, {
    label: () => `Rename ${fileType(contextMenuWidget(), docManager)}…`,
    isEnabled,
    execute: () => {
      if (isEnabled()) {
        let context = docManager.contextForWidget(contextMenuWidget());
        return renameDialog(docManager, context!.path);
      }
    }
  });

  commands.addCommand(CommandIDs.showInFileBrowser, {
    label: () => `Show in File Browser`,
    isEnabled,
    execute: async () => {
      let context = docManager.contextForWidget(contextMenuWidget());
      if (!context) {
        return;
      }

      // 'activate' is needed if this command is selected in the "open tabs" sidebar
      await commands.execute('filebrowser:activate', { path: context.path });
      await commands.execute('filebrowser:navigate', { path: context.path });
    }
  });

  app.contextMenu.addItem({
    command: CommandIDs.rename,
    selector: '[data-type="document-title"]',
    rank: 1
  });
  app.contextMenu.addItem({
    command: CommandIDs.clone,
    selector: '[data-type="document-title"]',
    rank: 2
  });
  app.contextMenu.addItem({
    command: CommandIDs.showInFileBrowser,
    selector: '[data-type="document-title"]',
    rank: 3
  });
}

/**
 * Handle dirty state for a context.
 */
function handleContext(
  status: ILabStatus,
  context: DocumentRegistry.Context
): void {
  let disposable: IDisposable | null = null;
  let onStateChanged = (sender: any, args: IChangedArgs<any>) => {
    if (args.name === 'dirty') {
      if (args.newValue === true) {
        if (!disposable) {
          disposable = status.setDirty();
        }
      } else if (disposable) {
        disposable.dispose();
        disposable = null;
      }
    }
  };
  void context.ready.then(() => {
    context.model.stateChanged.connect(onStateChanged);
    if (context.model.dirty) {
      disposable = status.setDirty();
    }
  });
  context.disposed.connect(() => {
    if (disposable) {
      disposable.dispose();
    }
  });
}

/**
 * A namespace for private module data.
 */
namespace Private {
  /**
   * A counter for unique IDs.
   */
  export let id = 0;

  export function createRevertConfirmNode(
    checkpoint: Contents.ICheckpointModel,
    fileType: string
  ): HTMLElement {
    let body = document.createElement('div');
    let confirmMessage = document.createElement('p');
    let confirmText = document.createTextNode(`Are you sure you want to revert
      the ${fileType} to the latest checkpoint? `);
    let cannotUndoText = document.createElement('strong');
    cannotUndoText.textContent = 'This cannot be undone.';

    confirmMessage.appendChild(confirmText);
    confirmMessage.appendChild(cannotUndoText);

    let lastCheckpointMessage = document.createElement('p');
    let lastCheckpointText = document.createTextNode(
      'The checkpoint was last updated at: '
    );
    let lastCheckpointDate = document.createElement('p');
    let date = new Date(checkpoint.last_modified);
    lastCheckpointDate.style.textAlign = 'center';
    lastCheckpointDate.textContent =
      Time.format(date, 'dddd, MMMM Do YYYY, h:mm:ss a') +
      ' (' +
      Time.formatHuman(date) +
      ')';

    lastCheckpointMessage.appendChild(lastCheckpointText);
    lastCheckpointMessage.appendChild(lastCheckpointDate);

    body.appendChild(confirmMessage);
    body.appendChild(lastCheckpointMessage);
    return body;
  }
}
