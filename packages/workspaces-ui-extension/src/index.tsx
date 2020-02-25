import React from 'react';
import {
  JupyterFrontEndPlugin,
  JupyterFrontEnd,
  ILayoutRestorer,
  IRouter
} from '@jupyterlab/application';
import {
  ReactWidget,
  ICommandPalette,
  Dialog,
  showDialog
} from '@jupyterlab/apputils';
import { ILauncher } from '@jupyterlab/launcher';
import { WorkspaceManager, Workspace } from '@jupyterlab/services';
import { folderIcon } from '@jupyterlab/ui-components';
import WorkspaceList from './WorkspaceList';
import CreateWorkspaceDialog from './CreateWorkspaceDialog';

class WorkspaceWidget extends ReactWidget {
  constructor(options: WorkspaceWidget.IOptions) {
    super();
    this._manager = options.manager;
    this._router = options.router;
  }

  refreshWorkspaceList(): Promise<{
    values: Workspace.IWorkspace[];
    ids: string[];
  }> {
    return this._manager.list();
  }

  navigateToWorkspace(id: string) {
    this._router.navigate(id);
    this._router.reload();
  }

  persistWorkspaceData(id: string, data: Workspace.IWorkspace) {
    return this._manager.save(id, data);
  }

  deleteWorkspace(id: string) {
    return this._manager.remove(id);
  }

  render() {
    return (
      <WorkspaceList
        persistWorkspaceData={this.persistWorkspaceData.bind(this)}
        refreshWorkspaceList={this.refreshWorkspaceList.bind(this)}
        navigateToWorkspace={this.navigateToWorkspace.bind(this)}
        deleteWorkspace={this.deleteWorkspace.bind(this)}
      />
    );
  }

  private _manager: WorkspaceManager;
  private _router: IRouter;
}

namespace WorkspaceWidget {
  export type IOptions = {
    manager: WorkspaceManager;
    router: IRouter;
  };
}

namespace CommandIDs {
  export const createNew = 'workspace:';
}

function addCommands(
  app: JupyterFrontEnd,
  router: IRouter,
  manager: WorkspaceManager
) {
  const { commands } = app;
  commands.addCommand(CommandIDs.createNew, {
    label: args => (args['isPalette'] ? 'New Workspace' : 'Workspace'),
    caption: 'Start a new workspace',
    execute: async () => {
      const { values } = await manager.list();
      const result: Dialog.IResult<Workspace.IWorkspace | null> = await showDialog(
        {
          title: 'Create a new workspace',
          body: new CreateWorkspaceDialog({
            workspaces: values
          }),
          buttons: [Dialog.okButton({ label: 'Create' }), Dialog.cancelButton()]
        }
      );
      if (result.button.accept && result.value) {
        const name = result.value.metadata.id;
        await app.serviceManager.workspaces.save(name, result.value);
        router.navigate(name);
        router.reload();
      }
    },
    iconClass: args => (args['isPalette'] ? '' : 'jp-FolderIcon')
  });
}

const extension: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/workspaces-extension',
  autoStart: true,
  requires: [IRouter],
  optional: [ILayoutRestorer, ILauncher, ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    router: IRouter,
    restorer: ILayoutRestorer | null,
    launcher: ILauncher | null,
    palette: ICommandPalette | null
  ) => {
    const workspaceManager: WorkspaceManager = app.serviceManager.workspaces;
    const widget = new WorkspaceWidget({ manager: workspaceManager, router });
    widget.id = 'workspace-manager';
    widget.title.caption = 'Workspaces';
    widget.title.iconRenderer = folderIcon;
    widget.addClass('jp-Workspaces');

    if (restorer) {
      restorer.add(widget, 'workspace-manager');
    }

    if (palette) {
      palette.addItem({
        command: CommandIDs.createNew,
        category: 'Other',
        args: { isPalette: true }
      });
    }

    if (launcher) {
      addCommands(app, router, workspaceManager);
      launcher.add({
        command: CommandIDs.createNew,
        category: 'Other',
        rank: 5
      });
    }

    app.shell.add(widget, 'left');
  }
};

export default extension;
