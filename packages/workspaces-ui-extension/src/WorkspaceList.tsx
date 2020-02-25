import { Workspace } from '@jupyterlab/services';
import React from 'react';
import { Poll } from '@lumino/polling';
import { refreshIcon } from '@jupyterlab/ui-components';
import { ToolbarButtonComponent } from '@jupyterlab/apputils';
import WorkspaceItem from './WorkspaceItem';
import ErrorBoundary from './ErrorBoundary';

type WorkspaceListOptions = {
  refreshWorkspaceList: () => { values: Workspace.IWorkspace[]; ids: string[] };
  navigateToWorkspace: (id: string) => void;
  persistWorkspaceData: (
    id: string,
    data: Workspace.IWorkspace
  ) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
};

type WorkspaceListState = {
  workspaces: Workspace.IWorkspace[];
};

class WorkspaceList extends React.Component<
  WorkspaceListOptions,
  WorkspaceListState
> {
  constructor(props: WorkspaceListOptions) {
    super(props);
    this.state = { workspaces: [] };
    this._poll = new Poll({
      factory: this.fetchWorkspaces.bind(this),
      auto: false,
      frequency: {
        interval: 30 * 1000,
        backoff: true,
        max: 300 * 1000
      },
      standby: 'when-hidden'
    });
  }

  async fetchWorkspaces() {
    const { values } = await this.props.refreshWorkspaceList();
    this.setState({ workspaces: values });
    return Promise.resolve();
  }

  componentDidMount() {
    if (this._poll) {
      this._poll.start();
    }
  }

  render() {
    if (this.state.workspaces.length === 0) {
      return 'Loading workspaces...';
    }
    const children = this.state.workspaces.map(ws => (
      <WorkspaceItem
        deleteWorkspace={() => this.props.deleteWorkspace(ws.metadata.id)}
        ws={ws}
        persistData={(newWs: Workspace.IWorkspace) => {
          this.props.persistWorkspaceData(ws.metadata.id, newWs);
          this._poll && this._poll.refresh();
        }}
        navigateToWorkspace={() =>
          this.props.navigateToWorkspace(ws.metadata.id)
        }
      />
    ));
    return (
      <ErrorBoundary>
        <div className="jp-Workspaces--header">
          <h2 className="jp-Workspaces--header--title">Workspaces</h2>
          <ToolbarButtonComponent
            icon={refreshIcon}
            onClick={() => this._poll && this._poll.refresh()}
            tooltip="Refresh Workspaces"
          />
        </div>
        <ul className="jp-Workspaces--list">{children}</ul>
      </ErrorBoundary>
    );
  }

  private _poll: Poll | null = null;
}

export default WorkspaceList;
