// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module running-extension
 */

import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  IRunningSessionManagers,
  RunningSessionManagers,
  RunningSessions
} from '@jupyterlab/running';
import { ITranslator } from '@jupyterlab/translation';
import { runningIcon } from '@jupyterlab/ui-components';
import { addKernelRunningSessionManager } from './kernels';
import { addOpenTabsSessionManager } from './opentabs';

/**
 * The command IDs used by the running plugin.
 */
namespace CommandIDs {
  export const showPanel = 'running:show-panel';
}

/**
 * The default running sessions extension.
 */
const plugin: JupyterFrontEndPlugin<IRunningSessionManagers> = {
  activate,
  id: '@jupyterlab/running-extension:plugin',
  provides: IRunningSessionManagers,
  requires: [ITranslator],
  optional: [ILayoutRestorer, ILabShell],
  autoStart: true
};

/**
 * Export the plugin as default.
 */
export default plugin;

/**
 * Activate the running plugin.
 */
function activate(
  app: JupyterFrontEnd,
  translator: ITranslator,
  restorer: ILayoutRestorer | null,
  labShell: ILabShell | null
): IRunningSessionManagers {
  const trans = translator.load('jupyterlab');
  const runningSessionManagers = new RunningSessionManagers();
  const running = new RunningSessions(runningSessionManagers, translator);
  running.id = 'jp-running-sessions';
  running.title.caption = trans.__('Running Terminals and Kernels');
  running.title.icon = runningIcon;
  running.node.setAttribute('role', 'region');
  running.node.setAttribute('aria-label', trans.__('Running Sessions section'));

  // Let the application restorer track the running panel for restoration of
  // application state (e.g. setting the running panel as the current side bar
  // widget).
  if (restorer) {
    restorer.add(running, 'running-sessions');
  }
  if (labShell) {
    addOpenTabsSessionManager(runningSessionManagers, translator, labShell);
  }
  addKernelRunningSessionManager(runningSessionManagers, translator, app);
  // Rank has been chosen somewhat arbitrarily to give priority to the running
  // sessions widget in the sidebar.
  app.shell.add(running, 'left', { rank: 200 });

  app.commands.addCommand(CommandIDs.showPanel, {
    label: trans.__('Sessions and Tabs'),
    execute: () => {
      app.shell.activateById(running.id);
    }
  });

  return runningSessionManagers;
}
