import { Workspace } from '@jupyterlab/services';
import React from 'react';
import { PathExt } from '@jupyterlab/coreutils';
import { editIcon, closeIcon } from '@jupyterlab/ui-components';
import {
  ToolbarButtonComponent,
  showDialog,
  Dialog
} from '@jupyterlab/apputils';
import EditWorkspaceDialogWidget from './EditWorkspaceDialog';

const WorkspaceItem = (props: {
  persistData: (ws: Workspace.IWorkspace) => void;
  ws: Workspace.IWorkspace;
  navigateToWorkspace: () => void;
  deleteWorkspace: () => void;
}) => {
  const name = props.ws.metadata.id;
  return (
    <li
      onClick={props.navigateToWorkspace}
      className="jp-Workspaces--list--item"
    >
      <span>{PathExt.basename(name)}</span>
      <div className="jp-Workspaces--list--item--toolbar">
        <ToolbarButtonComponent
          icon={closeIcon}
          tooltip="Delete Workspace"
          onClick={() => {
            showDialog({
              title: `Confirm deleting workspace ${PathExt.basename(name)}`,
              buttons: [
                Dialog.warnButton({ label: 'Delete' }),
                Dialog.cancelButton()
              ],
              defaultButton: 1
            }).then((result: Dialog.IResult<string>) => {
              if (result.button.accept) {
                props.deleteWorkspace();
              }
            });
          }}
        />
        <ToolbarButtonComponent
          icon={editIcon}
          tooltip="Edit Workspace"
          onClick={() => {
            showDialog({
              title: `Edit workspace ${PathExt.basename(name)}`,
              body: new EditWorkspaceDialogWidget({
                value: JSON.stringify(props.ws, null, 2)
              }),
              buttons: [
                Dialog.okButton({ label: 'Save' }),
                Dialog.cancelButton()
              ],
              defaultButton: 1
            }).then((result: Dialog.IResult<string>) => {
              if (result.button.accept && result.value) {
                props.persistData(
                  JSON.parse(result.value) as Workspace.IWorkspace
                );
              }
            });
          }}
        />
      </div>
    </li>
  );
};

export default WorkspaceItem;
