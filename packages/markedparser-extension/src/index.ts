/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { JupyterFrontEndPlugin } from '@jupyterlab/application';

import { IMarkdownParser } from '@jupyterlab/rendermime';

import { MarkedParser } from '@jupyterlab/markedparser';

/**
 * The MathJax latexTypesetter plugin.
 */
const plugin: JupyterFrontEndPlugin<IMarkdownParser> = {
  id: '@jupyterlab/markedparser-extension:plugin',
  autoStart: true,
  provides: IMarkdownParser,
  activate: () => {
    return new MarkedParser();
  }
};

/**
 * Export the plugin as default.
 */
export default plugin;
