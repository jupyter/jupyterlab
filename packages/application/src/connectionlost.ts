// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ServerConnection, ServiceManager } from '@jupyterlab/services';

import { IConnectionLost } from './tokens';

/**
 * A default connection lost handler, which does nothing, but
 * may be overriden by application extensions.
 */
export const ConnectionLost: IConnectionLost = async function(
  manager: ServiceManager.IManager,
  err: ServerConnection.NetworkError
): Promise<void> {
  return new Promise((res, rej) => {
    /* do nothing */
  });
};
