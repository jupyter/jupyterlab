// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module docprovider-extension
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import {
  IDocumentProvider,
  IDocumentProviderFactory,
  ProviderMock,
  WebSocketProviderWithLocks
} from '@jupyterlab/docprovider';
import { ServerConnection } from '@jupyterlab/services';
import { IStateDB } from '@jupyterlab/statedb';

/**
 * The default document provider plugin
 */
const docProviderPlugin: JupyterFrontEndPlugin<IDocumentProviderFactory> = {
  id: '@jupyterlab/docprovider-extension:plugin',
  optional: [IStateDB],
  provides: IDocumentProviderFactory,
  activate: (
    app: JupyterFrontEnd,
    state: IStateDB | null
  ): IDocumentProviderFactory => {
    const server = ServerConnection.makeSettings();
    const url = URLExt.join(server.wsUrl, 'api/yjs');
    const collaborative =
      PageConfig.getOption('collaborative') == 'true' ? true : false;
    const factory = (
      options: IDocumentProviderFactory.IOptions
    ): IDocumentProvider => {
      return collaborative
        ? new WebSocketProviderWithLocks({
            ...options,
            url,
            state
          })
        : new ProviderMock();
    };
    return factory;
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [docProviderPlugin];
export default plugins;
