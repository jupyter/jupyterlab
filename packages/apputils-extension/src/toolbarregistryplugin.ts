import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  createDefaultFactory,
  IToolbarWidgetRegistry,
  ToolbarWidgetRegistry
} from '@jupyterlab/apputils';

/**
 * The default toolbar registry.
 */
export const toolbarRegistry: JupyterFrontEndPlugin<IToolbarWidgetRegistry> = {
  id: '@jupyter/apputils-extension:toolbar-registry',
  autoStart: true,
  provides: IToolbarWidgetRegistry,
  activate: (app: JupyterFrontEnd) => {
    const registry = new ToolbarWidgetRegistry({
      defaultFactory: createDefaultFactory(app.commands)
    });
    return registry;
  }
};
