// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IMiddleToken } from '@jupyterlab/example-federated-middle/tokens';

module.exports = [
  {
    id: '@jupyterlab/example-federated-middle',
    autoStart: true,
    provides: IMiddleToken,
    activate: function (app) {
      console.log('JupyterLab extension middle is activated!');
      console.log(app.commands);
      return 'hello';
    }
  }
];
