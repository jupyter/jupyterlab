/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { Widget } from '@phosphor/widgets';

/**
 * A widget suitable for use in the application sidebars.
 */
export class SideBarWidget extends Widget {
  /**
   * Activates the widget and selects the tab associated with the widget
   * in its containing sidebar. Crawls up a widget's ancestors until a
   * SideBarHandler or LabShell is found.
   */
  activateInSidebar(): void {
    let parent: Widget = this.parent;

    while (parent) {
      // avoid direct dependency on LabShell from @jupyterlab/application
      if ('activateById' in parent) {
        (parent as any).activateById(this.id);
      }
      parent = parent.parent;
    }
  }
}
