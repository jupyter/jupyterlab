import React, { useState, useEffect } from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { Workspace } from '@jupyterlab/services';
import { PathExt } from '@jupyterlab/coreutils';

class CreateWorkspaceWidget extends ReactWidget {
  constructor(args: { workspaces: Workspace.IWorkspace[] }) {
    super();
    this.workspaces = args.workspaces;
  }

  workspaces: Workspace.IWorkspace[];
  value: Workspace.IWorkspace | null = null;

  getValue(): Workspace.IWorkspace | null {
    return this.value;
  }

  render() {
    return (
      <CreateWorkspaceDialog
        onChange={(ws: Workspace.IWorkspace) => {
          this.value = ws;
        }}
        workspaces={this.workspaces}
      />
    );
  }
}

const CreateWorkspaceDialog = (props: {
  onChange: (ws: Workspace.IWorkspace) => void;
  workspaces: Workspace.IWorkspace[];
}) => {
  const [name, setName] = useState('my-workspace');
  const [contents, setContents] = useState({
    data: {},
    metadata: { id: '/lab/workspaces/my-workspace' }
  });
  const [shouldClone, setShouldClone] = useState(false);

  const workspaceOptions = props.workspaces.map((ws: Workspace.IWorkspace) => {
    const selected = ws.metadata.id === '/lab';
    return (
      <option selected={selected} value={ws.metadata.id}>
        {PathExt.basename(ws.metadata.id)}
      </option>
    );
  });

  useEffect(() => {
    props.onChange({ ...contents });
  }, [contents]);

  useEffect(() => {
    setContents({
      ...contents,
      metadata: {
        ...contents.metadata,
        id: PathExt.join(PathExt.dirname(contents.metadata.id), name)
      }
    });
  }, [name]);

  return (
    <>
      <label className="jp-Workspaces--dialog--label">
        <span>Name</span>
        <input
          autoFocus
          type="text"
          name="name"
          value={name}
          onChange={evt => setName(evt.target.value)}
        />
      </label>
      <label className="jp-Workspaces--dialog--label">
        <span>Data</span>
        <textarea
          value={JSON.stringify(contents, null, 2)}
          onChange={evt => {
            setContents(JSON.parse(evt.target.value));
          }}
          rows={10}
        ></textarea>
      </label>
      <label className="jp-Workspaces--dialog--label">
        <span>Clone another workspace</span>
        <input
          type="checkbox"
          name="shouldClone"
          checked={shouldClone}
          onChange={() => setShouldClone(!shouldClone)}
        />
      </label>
      {shouldClone && (
        <label className="jp-Workspaces--dialog--label">
          <select
            onChange={evt => {
              const wsData =
                props.workspaces.find(
                  ({ metadata: { id } }) => id === evt.target.value
                ) || null;
              setContents({
                data: wsData?.data ?? contents.data,
                metadata: contents.metadata
              });
            }}
          >
            {workspaceOptions}
          </select>
        </label>
      )}
    </>
  );
};

export default CreateWorkspaceWidget;
