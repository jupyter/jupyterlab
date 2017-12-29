// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

// Use an ES6 import to verify that it works.
import {
  ILauncher
} from '@jupyterlab/launcher'


module.exports = [{
  id: 'mockextension',
  requires: [ILauncher],
  autoStart: true,
  activate: function(application, launcher) {
    // eslint-disable-next-line no-console
    console.log('mock extension activated', launcher);
    window.commands = application.commands;
  }
}];
