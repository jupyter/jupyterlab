// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module docmanager-extension
 */

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
  ICommandPalette,
  InputDialog,
  ISessionContextDialogs
} from '@jupyterlab/apputils';

import { IChangedArgs, Time } from '@jupyterlab/coreutils';

import {
  renameDialog,
  nameOnSaveDialog,
  DocumentManager,
  IDocumentManager,
  PathStatus,
  SavingStatus
} from '@jupyterlab/docmanager';

import { IDocumentProviderFactory } from '@jupyterlab/docprovider';

import { DocumentRegistry } from '@jupyterlab/docregistry';

import { Contents, Kernel } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStatusBar } from '@jupyterlab/statusbar';

import { ITranslator, TranslationBundle } from '@jupyterlab/translation';

import { each, map, some, toArray } from '@lumino/algorithm';

import { JSONExt } from '@lumino/coreutils';

import { IDisposable } from '@lumino/disposable';

import { Widget } from '@lumino/widgets';

/**
 * The command IDs used by the document manager plugin.
 */
namespace CommandIDs {
  export const clone = 'docmanager:clone';

  export const deleteFile = 'docmanager:delete-file';

  export const newUntitled = 'docmanager:new-untitled';

  export const open = 'docmanager:open';

  export const openBrowserTab = 'docmanager:open-browser-tab';

  export const reload = 'docmanager:reload';

  export const rename = 'docmanager:rename';

  export const nameOnSave = 'docmanager:name-on-save';

  export const del = 'docmanager:delete';

  export const restoreCheckpoint = 'docmanager:restore-checkpoint';

  export const save = 'docmanager:save';

  export const saveAll = 'docmanager:save-all';

  export const saveAs = 'docmanager:save-as';

  export const download = 'docmanager:download';

  export const toggleAutosave = 'docmanager:toggle-autosave';

  export const toggleNameFileOnSave = 'docmanager:toggle-name-file-on-save';

  export const showInFileBrowser = 'docmanager:show-in-file-browser';
}

/**
 * The id of the document manager plugin.
 */
const docManagerPluginId = '@jupyterlab/docmanager-extension:plugin';

/**
 * The default document manager provider.
 */
const docManagerPlugin: JupyterFrontEndPlugin<IDocumentManager> = {
  id: docManagerPluginId,
  provides: IDocumentManager,
  requires: [ISettingRegistry, ITranslator],
  optional: [
    ILabStatus,
    ICommandPalette,
    ILabShell,
    ISessionContextDialogs,
    IDocumentProviderFactory
  ],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    translator: ITranslator,
    status: ILabStatus | null,
    palette: ICommandPalette | null,
    labShell: ILabShell | null,
    sessionDialogs: ISessionContextDialogs | null,
    docProviderFactory: IDocumentProviderFactory | null
  ): IDocumentManager => {
    const trans = translator.load('jupyterlab');
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
          app.shell.add(widget, 'main', options || {});
        }
        app.shell.activateById(widget.id);

        // Handle dirty state for open documents.
        const context = docManager.contextForWidget(widget);
        if (context && !contexts.has(context)) {
          if (status) {
            handleContext(status, context);
          }
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
      setBusy: (status && (() => status.setBusy())) ?? undefined,
      sessionDialogs: sessionDialogs || undefined,
      translator,
      collaborative: true,
      docProviderFactory: docProviderFactory ?? undefined
    });

    // Register the file operations commands.
    addCommands(
      app,
      docManager,
      opener,
      settingRegistry,
      translator,
      labShell,
      palette
    );

    // Keep up to date with the settings registry.
    const onSettingsUpdated = (settings: ISettingRegistry.ISettings) => {
      // Handle whether to autosave
      const autosave = settings.get('autosave').composite as boolean | null;
      docManager.autosave =
        autosave === true || autosave === false ? autosave : true;
      app.commands.notifyCommandChanged(CommandIDs.toggleAutosave);

      // Handle autosave interval
      const autosaveInterval = settings.get('autosaveInterval').composite as
        | number
        | null;
      docManager.autosaveInterval = autosaveInterval || 120;

      // Handle whether to prompt to name file on first save
      const nameFileOnSave = settings.get('nameFileOnSave')
        .composite as boolean;

      if (docManager.nameFileOnSave != nameFileOnSave) {
        docManager.nameFileOnSave = nameFileOnSave;
        app.commands.notifyCommandChanged(CommandIDs.nameOnSave);
      }

      // Handle default widget factory overrides.
      const defaultViewers = settings.get('defaultViewers').composite as {
        [ft: string]: string;
      };
      const overrides: { [ft: string]: string } = {};
      // Filter the defaultViewers and file types for existing ones.
      Object.keys(defaultViewers).forEach(ft => {
        if (!registry.getFileType(ft)) {
          console.warn(`File Type ${ft} not found`);
          return;
        }
        if (!registry.getWidgetFactory(defaultViewers[ft])) {
          console.warn(`Document viewer ${defaultViewers[ft]} not found`);
        }
        overrides[ft] = defaultViewers[ft];
      });
      // Set the default factory overrides. If not provided, this has the
      // effect of unsetting any previous overrides.
      each(registry.fileTypes(), ft => {
        try {
          registry.setDefaultWidgetFactory(ft.name, overrides[ft.name]);
        } catch {
          console.warn(
            `Failed to set default viewer ${overrides[ft.name]} for file type ${
              ft.name
            }`
          );
        }
      });
    };

    // Fetch the initial state of the settings.
    Promise.all([settingRegistry.load(docManagerPluginId), app.restored])
      .then(([settings]) => {
        settings.changed.connect(onSettingsUpdated);
        onSettingsUpdated(settings);
      })
      .catch((reason: Error) => {
        console.error(reason.message);
      });

    // Register a fetch transformer for the settings registry,
    // allowing us to dynamically populate a help string with the
    // available document viewers and file types for the default
    // viewer overrides.
    settingRegistry.transform(docManagerPluginId, {
      fetch: plugin => {
        // Get the available file types.
        const fileTypes = toArray(registry.fileTypes())
          .map(ft => ft.name)
          .join('    \n');
        // Get the available widget factories.
        const factories = toArray(registry.widgetFactories())
          .map(f => f.name)
          .join('    \n');
        // Generate the help string.
        const description = trans.__(
          `Overrides for the default viewers for file types.
Specify a mapping from file type name to document viewer name, for example:

defaultViewers: {
  markdown: "Markdown Preview"
}

If you specify non-existent file types or viewers, or if a viewer cannot
open a given file type, the override will not function.

Available viewers:
%1

Available file types:
%2`,
          factories,
          fileTypes
        );
        const schema = JSONExt.deepCopy(plugin.schema);
        schema.properties!.defaultViewers.description = description;
        return { ...plugin, schema };
      }
    });

    // If the document registry gains or loses a factory or file type,
    // regenerate the settings description with the available options.
    registry.changed.connect(() => settingRegistry.reload(docManagerPluginId));

    return docManager;
  }
};

/**
 * A plugin for adding a saving status item to the status bar.
 */
export const savingStatusPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/docmanager-extension:saving-status',
  autoStart: true,
  requires: [IDocumentManager, ILabShell, ITranslator],
  optional: [IStatusBar],
  activate: (
    _: JupyterFrontEnd,
    docManager: IDocumentManager,
    labShell: ILabShell,
    translator: ITranslator,
    statusBar: IStatusBar | null
  ) => {
    if (!statusBar) {
      // Automatically disable if statusbar missing
      return;
    }
    const saving = new SavingStatus({ docManager, translator });

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
  requires: [IDocumentManager, ILabShell],
  optional: [IStatusBar],
  activate: (
    _: JupyterFrontEnd,
    docManager: IDocumentManager,
    labShell: ILabShell,
    statusBar: IStatusBar | null
  ) => {
    if (!statusBar) {
      // Automatically disable if statusbar missing
      return;
    }
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
 * A plugin providing download commands in the file menu and command palette.
 */
export const downloadPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/docmanager-extension:download',
  autoStart: true,
  requires: [ITranslator, IDocumentManager],
  optional: [ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    docManager: IDocumentManager,
    palette: ICommandPalette | null
  ) => {
    const trans = translator.load('jupyterlab');
    const { commands, shell } = app;
    const isEnabled = () => {
      const { currentWidget } = shell;
      return !!(currentWidget && docManager.contextForWidget(currentWidget));
    };
    commands.addCommand(CommandIDs.download, {
      label: trans.__('Download'),
      caption: trans.__('Download the file to your computer'),
      isEnabled,
      execute: () => {
        // Checks that shell.currentWidget is valid:
        if (isEnabled()) {
          const context = docManager.contextForWidget(shell.currentWidget!);
          if (!context) {
            return showDialog({
              title: trans.__('Cannot Download'),
              body: trans.__('No context found for current widget!'),
              buttons: [Dialog.okButton({ label: trans.__('OK') })]
            });
          }
          return context.download();
        }
      }
    });

    const category = trans.__('File Operations');
    if (palette) {
      palette.addItem({ command: CommandIDs.download, category });
    }
  }
};

/**
 * A plugin providing open-browser-tab commands.
 *
 * This is its own plugin in case you would like to disable this feature.
 * e.g. jupyter labextension disable @jupyterlab/docmanager-extension:open-browser-tab
 *
 * Note: If disabling this, you may also want to disable:
 * @jupyterlab/filebrowser-extension:open-browser-tab
 */
export const openBrowserTabPlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/docmanager-extension:open-browser-tab',
  autoStart: true,
  requires: [ITranslator, IDocumentManager],
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    docManager: IDocumentManager
  ) => {
    const trans = translator.load('jupyterlab');
    const { commands } = app;
    commands.addCommand(CommandIDs.openBrowserTab, {
      execute: args => {
        const path =
          typeof args['path'] === 'undefined' ? '' : (args['path'] as string);

        if (!path) {
          return;
        }

        return docManager.services.contents.getDownloadUrl(path).then(url => {
          const opened = window.open();
          if (opened) {
            opened.opener = null;
            opened.location.href = url;
          } else {
            throw new Error('Failed to open new browser tab.');
          }
        });
      },
      icon: args => (args['icon'] as string) || '',
      label: () => trans.__('Open in New Browser Tab')
    });
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  docManagerPlugin,
  pathStatusPlugin,
  savingStatusPlugin,
  downloadPlugin,
  openBrowserTabPlugin
];
export default plugins;

/* Widget to display the revert to checkpoint confirmation. */
class RevertConfirmWidget extends Widget {
  /**
   * Construct a new revert confirmation widget.
   */
  constructor(
    checkpoint: Contents.ICheckpointModel,
    trans: TranslationBundle,
    fileType: string = 'notebook'
  ) {
    super({
      node: Private.createRevertConfirmNode(checkpoint, fileType, trans)
    });
  }
}

// Returns the file type for a widget.
function fileType(widget: Widget | null, docManager: IDocumentManager): string {
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
  translator: ITranslator,
  labShell: ILabShell | null,
  palette: ICommandPalette | null
): void {
  const trans = translator.load('jupyterlab');
  const { commands, shell } = app;
  const category = trans.__('File Operations');
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
    addLabCommands(app, docManager, labShell, opener, translator);
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

  commands.addCommand(CommandIDs.nameOnSave, {
    label: () =>
      trans.__('Rename %1…', fileType(shell.currentWidget, docManager)),
    isEnabled,
    execute: () => {
      if (isEnabled()) {
        const context = docManager.contextForWidget(shell.currentWidget!);
        return nameOnSaveDialog(docManager, context!);
      }
    }
  });

  commands.addCommand(CommandIDs.newUntitled, {
    execute: args => {
      // FIXME-TRANS: Localizing args['error']?
      const errorTitle = (args['error'] as string) || trans.__('Error');
      const path =
        typeof args['path'] === 'undefined' ? '' : (args['path'] as string);
      const options: Partial<Contents.ICreateOptions> = {
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
      const kernel = (args?.kernel as unknown) as Kernel.IModel | undefined;
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

  commands.addCommand(CommandIDs.reload, {
    label: () =>
      trans.__(
        'Reload %1 from Disk',
        fileType(shell.currentWidget, docManager)
      ),
    caption: trans.__('Reload contents from disk'),
    isEnabled,
    execute: () => {
      // Checks that shell.currentWidget is valid:
      if (!isEnabled()) {
        return;
      }
      const context = docManager.contextForWidget(shell.currentWidget!);
      const type = fileType(shell.currentWidget!, docManager);
      if (!context) {
        return showDialog({
          title: trans.__('Cannot Reload'),
          body: trans.__('No context found for current widget!'),
          buttons: [Dialog.okButton({ label: trans.__('Ok') })]
        });
      }
      if (context.model.dirty) {
        return showDialog({
          title: trans.__('Reload %1 from Disk', type),
          body: trans.__(
            'Are you sure you want to reload the %1 from the disk?',
            type
          ),
          buttons: [
            Dialog.cancelButton({ label: trans.__('Cancel') }),
            Dialog.warnButton({ label: trans.__('Reload') })
          ]
        }).then(result => {
          if (result.button.accept && !context.isDisposed) {
            return context.revert();
          }
        });
      } else {
        if (!context.isDisposed) {
          return context.revert();
        }
      }
    }
  });

  commands.addCommand(CommandIDs.restoreCheckpoint, {
    label: () =>
      trans.__(
        'Revert %1 to Checkpoint...',
        fileType(shell.currentWidget, docManager)
      ),
    caption: trans.__('Revert contents to previous checkpoint'),
    isEnabled,
    execute: () => {
      // Checks that shell.currentWidget is valid:
      if (!isEnabled()) {
        return;
      }
      const context = docManager.contextForWidget(shell.currentWidget!);
      if (!context) {
        return showDialog({
          title: trans.__('Cannot Revert'),
          body: trans.__('No context found for current widget!'),
          buttons: [Dialog.okButton({ label: trans.__('Ok') })]
        });
      }
      return context.listCheckpoints().then(async checkpoints => {
        const type = fileType(shell.currentWidget, docManager);
        if (checkpoints.length < 1) {
          await showErrorMessage(
            trans.__('No checkpoints'),
            trans.__('No checkpoints are available for this %1.', type)
          );
          return;
        }
        const targetCheckpoint =
          checkpoints.length === 1
            ? checkpoints[0]
            : await Private.getTargetCheckpoint(checkpoints.reverse(), trans);

        if (!targetCheckpoint) {
          return;
        }
        return showDialog({
          title: trans.__('Revert %1 to checkpoint', type),
          body: new RevertConfirmWidget(targetCheckpoint, trans, type),
          buttons: [
            Dialog.cancelButton({ label: trans.__('Cancel') }),
            Dialog.warnButton({ label: trans.__('Revert') })
          ]
        }).then(result => {
          if (context.isDisposed) {
            return;
          }
          if (result.button.accept) {
            if (context.model.readOnly) {
              return context.revert();
            }
            return context
              .restoreCheckpoint(targetCheckpoint.id)
              .then(() => context.revert());
          }
        });
      });
    }
  });

  commands.addCommand(CommandIDs.save, {
    label: () => trans.__('Save %1', fileType(shell.currentWidget, docManager)),
    caption: trans.__('Save and create checkpoint'),
    isEnabled: isWritable,
    execute: () => {
      // Checks that shell.currentWidget is valid:
      if (isEnabled()) {
        const context = docManager.contextForWidget(shell.currentWidget!);
        if (!context) {
          return showDialog({
            title: trans.__('Cannot Save'),
            body: trans.__('No context found for current widget!'),
            buttons: [Dialog.okButton({ label: trans.__('Ok') })]
          });
        } else {
          if (context.model.readOnly) {
            return showDialog({
              title: trans.__('Cannot Save'),
              body: trans.__('Document is read-only'),
              buttons: [Dialog.okButton({ label: trans.__('Ok') })]
            });
          }

          return context
            .save(true)
            .then(() => context!.createCheckpoint())
            .catch(err => {
              // If the save was canceled by user-action, do nothing.
              // FIXME-TRANS: Is this using the text on the button or?
              if (err.message === 'Cancel') {
                return;
              }
              throw err;
            });
        }
      }
    }
  });

  commands.addCommand(CommandIDs.saveAll, {
    label: () => trans.__('Save All'),
    caption: trans.__('Save all open documents'),
    isEnabled: () => {
      return some(
        map(shell.widgets('main'), w => docManager.contextForWidget(w)),
        c => c?.contentsModel?.writable ?? false
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
    label: () =>
      trans.__('Save %1 As…', fileType(shell.currentWidget, docManager)),
    caption: trans.__('Save with new path'),
    isEnabled,
    execute: () => {
      // Checks that shell.currentWidget is valid:
      if (isEnabled()) {
        const context = docManager.contextForWidget(shell.currentWidget!);
        if (!context) {
          return showDialog({
            title: trans.__('Cannot Save'),
            body: trans.__('No context found for current widget!'),
            buttons: [Dialog.okButton({ label: trans.__('Ok') })]
          });
        }
        return context.saveAs();
      }
    }
  });

  commands.addCommand(CommandIDs.toggleAutosave, {
    label: trans.__('Autosave Documents'),
    isToggled: () => docManager.autosave,
    execute: () => {
      const value = !docManager.autosave;
      const key = 'autosave';
      return settingRegistry
        .set(docManagerPluginId, key, value)
        .catch((reason: Error) => {
          console.error(
            `Failed to set ${docManagerPluginId}:${key} - ${reason.message}`
          );
        });
    }
  });

  commands.addCommand(CommandIDs.toggleNameFileOnSave, {
    label: trans.__('Name File on First Save'),
    isToggled: () => docManager.nameFileOnSave,
    execute: () => {
      const value = !docManager.nameFileOnSave;
      const key = 'nameFileOnSave';
      return settingRegistry
        .set(docManagerPluginId, key, value)
        .catch((reason: Error) => {
          console.error(
            `Failed to set ${docManagerPluginId}:${key} - ${reason.message}`
          );
        });
    }
  });
  docManager.optionChanged.connect(() => {
    const key = 'nameFileOnSave';
    const value = settingRegistry.plugins[docManagerPluginId]?.data.user[key];
    if (value == docManager.nameFileOnSave) {
      void settingRegistry
        .set(docManagerPluginId, key, !value)
        .catch((reason: Error) => {
          console.error(
            `Failed to set ${docManagerPluginId}:${key} - ${reason.message}`
          );
        });
    }
  });

  docManager.activateRequested.connect((sender, args) => {
    const widget = sender.findWidget(args);
    if (widget && widget.shouldNameFile) {
      widget.shouldNameFile.connect(() => {
        if (sender.nameFileOnSave && widget == shell.currentWidget) {
          const context = sender.contextForWidget(widget!);
          return nameOnSaveDialog(sender, context!);
        }
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
      CommandIDs.reload,
      CommandIDs.restoreCheckpoint,
      CommandIDs.save,
      CommandIDs.saveAs,
      CommandIDs.toggleAutosave
    ].forEach(command => {
      palette.addItem({ command, category });
    });
  }
}

function addLabCommands(
  app: JupyterFrontEnd,
  docManager: IDocumentManager,
  labShell: ILabShell,
  opener: DocumentManager.IWidgetOpener,
  translator: ITranslator
): void {
  const trans = translator.load('jupyterlab');
  const { commands } = app;

  // Returns the doc widget associated with the most recent contextmenu event.
  const contextMenuWidget = (): Widget | null => {
    const pathRe = /[Pp]ath:\s?(.*)\n?/;
    const test = (node: HTMLElement) => !!node['title']?.match(pathRe);
    const node = app.contextMenuHitTest(test);

    const pathMatch = node?.['title'].match(pathRe);
    return (
      (pathMatch && docManager.findWidget(pathMatch[1], null)) ??
      // Fall back to active doc widget if path cannot be obtained from event.
      labShell.currentWidget
    );
  };

  // Returns `true` if the current widget has a document context.
  const isEnabled = () => {
    const { currentWidget } = labShell;
    return !!(currentWidget && docManager.contextForWidget(currentWidget));
  };

  commands.addCommand(CommandIDs.clone, {
    label: () =>
      trans.__('New View for %1', fileType(contextMenuWidget(), docManager)),
    isEnabled,
    execute: args => {
      const widget = contextMenuWidget();
      const options = (args['options'] as DocumentRegistry.IOpenOptions) || {
        mode: 'split-right'
      };
      if (!widget) {
        return;
      }
      // Clone the widget.
      const child = docManager.cloneWidget(widget);
      if (child) {
        opener.open(child, options);
      }
    }
  });

  commands.addCommand(CommandIDs.rename, {
    label: () => {
      let t = fileType(contextMenuWidget(), docManager);
      if (t) {
        t = ' ' + t;
      }
      return trans.__('Rename%1…', t);
    },
    isEnabled,
    execute: () => {
      // Implies contextMenuWidget() !== null
      if (isEnabled()) {
        const context = docManager.contextForWidget(contextMenuWidget()!);
        return renameDialog(docManager, context!.path);
      }
    }
  });

  commands.addCommand(CommandIDs.del, {
    label: () =>
      trans.__('Delete %1', fileType(contextMenuWidget(), docManager)),
    isEnabled,
    execute: async () => {
      // Implies contextMenuWidget() !== null
      if (isEnabled()) {
        const context = docManager.contextForWidget(contextMenuWidget()!);
        if (!context) {
          return;
        }
        const result = await showDialog({
          title: trans.__('Delete'),
          body: trans.__('Are you sure you want to delete %1', context.path),
          buttons: [
            Dialog.cancelButton({ label: trans.__('Cancel') }),
            Dialog.warnButton({ label: trans.__('Delete') })
          ]
        });

        if (result.button.accept) {
          await app.commands.execute('docmanager:delete-file', {
            path: context.path
          });
        }
      }
    }
  });

  commands.addCommand(CommandIDs.showInFileBrowser, {
    label: () => trans.__('Show in File Browser'),
    isEnabled,
    execute: async () => {
      const widget = contextMenuWidget();
      const context = widget && docManager.contextForWidget(widget);
      if (!context) {
        return;
      }

      // 'activate' is needed if this command is selected in the "open tabs" sidebar
      await commands.execute('filebrowser:activate', { path: context.path });
      await commands.execute('filebrowser:go-to-path', { path: context.path });
    }
  });

  app.contextMenu.addItem({
    command: CommandIDs.rename,
    selector: '[data-type="document-title"]',
    rank: 1
  });
  app.contextMenu.addItem({
    command: CommandIDs.del,
    selector: '[data-type="document-title"]',
    rank: 2
  });
  app.contextMenu.addItem({
    command: CommandIDs.clone,
    selector: '[data-type="document-title"]',
    rank: 3
  });
  app.contextMenu.addItem({
    command: CommandIDs.showInFileBrowser,
    selector: '[data-type="document-title"]',
    rank: 4
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
  const onStateChanged = (sender: any, args: IChangedArgs<any>) => {
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
    fileType: string,
    trans: TranslationBundle
  ): HTMLElement {
    const body = document.createElement('div');
    const confirmMessage = document.createElement('p');
    const confirmText = document.createTextNode(
      trans.__(
        'Are you sure you want to revert the %1 to checkpoint? ',
        fileType
      )
    );
    const cannotUndoText = document.createElement('strong');
    cannotUndoText.textContent = trans.__('This cannot be undone.');

    confirmMessage.appendChild(confirmText);
    confirmMessage.appendChild(cannotUndoText);

    const lastCheckpointMessage = document.createElement('p');
    const lastCheckpointText = document.createTextNode(
      trans.__('The checkpoint was last updated at: ')
    );
    const lastCheckpointDate = document.createElement('p');
    const date = new Date(checkpoint.last_modified);
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

  /**
   * Ask user for a checkpoint to revert to.
   */
  export async function getTargetCheckpoint(
    checkpoints: Contents.ICheckpointModel[],
    trans: TranslationBundle
  ): Promise<Contents.ICheckpointModel | undefined> {
    // the id could be too long to show so use the index instead
    const indexSeparator = '.';
    const items = checkpoints.map((checkpoint, index) => {
      const isoDate = Time.format(checkpoint.last_modified);
      const humanDate = Time.formatHuman(checkpoint.last_modified);
      return `${index}${indexSeparator} ${isoDate} (${humanDate})`;
    });

    const selectedItem = (
      await InputDialog.getItem({
        items: items,
        title: trans.__('Choose a checkpoint')
      })
    ).value;

    if (!selectedItem) {
      return;
    }
    const selectedIndex = parseInt(selectedItem.split(indexSeparator, 1)[0]);
    return checkpoints[selectedIndex];
  }
}
