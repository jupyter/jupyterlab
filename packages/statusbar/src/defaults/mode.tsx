import { ReactWidget } from '@jupyterlab/apputils';

import { TranslationBundle } from '@jupyterlab/translation';

import { fileIcon, inspectorIcon } from '@jupyterlab/ui-components';

import { CommandRegistry } from '@lumino/commands';

import { DockPanel } from '@lumino/widgets';

import React, { useEffect, useState } from 'react';

import { classes } from 'typestyle';

import { interactiveItem, noUserSelect } from '..';

/**
 * A React component to toggle the shell mode.
 *
 * @param {object} props The component props.
 * @param props.shell The shell.
 * @param props.commands The command registry.
 * @param props.trans The translation bundle.
 */
function ModeSwitchComponent({
  shell,
  commands,
  trans
}: {
  shell: ModeSwitch.IShell;
  commands: CommandRegistry;
  trans: TranslationBundle;
}): JSX.Element {
  const [caption, setCaption] = useState('');

  const onClick = () => {
    const newMode =
      shell.mode === 'multiple-document'
        ? 'single-document'
        : 'multiple-document';
    shell.mode = newMode;
    updateTitle();
  };

  const updateTitle = () => {
    const binding = commands.keyBindings.find(
      b => b.command === 'application:toggle-mode'
    );
    const title =
      shell.mode === 'single-document'
        ? 'Multiple-Document Mode'
        : 'Single-Document Mode';
    if (binding) {
      const ks = CommandRegistry.formatKeystroke(binding.keys.join(' '));
      setCaption(trans.__(`${title} (%1)`, ks));
    } else {
      setCaption(trans.__(title));
    }
  };

  useEffect(() => {
    commands.keyBindingChanged.connect(updateTitle);
    updateTitle();

    return () => {
      commands.keyBindingChanged.disconnect(updateTitle);
    };
  }, [shell.mode]);

  return (
    <div title={caption} onClick={onClick} className={classes(noUserSelect)}>
      {shell.mode === 'multiple-document' ? (
        <fileIcon.react left={'1px'} top={'3px'} stylesheet={'statusBar'} />
      ) : (
        <inspectorIcon.react
          left={'1px'}
          top={'3px'}
          stylesheet={'statusBar'}
        />
      )}
    </div>
  );
}

/**
 * A class that exposes a component to toggle the shell mode.
 */
export class ModeSwitch extends ReactWidget {
  /**
   * Construct a new ModeSwitch.
   */
  constructor(options: ModeSwitch.IOptions) {
    super();
    this._commands = options.commands;
    this._shell = options.shell;
    this._trans = options.trans;

    this.addClass(interactiveItem);
  }

  /**
   * Render a ModeSwitch component.
   */
  render(): JSX.Element {
    return (
      <ModeSwitchComponent
        commands={this._commands}
        shell={this._shell}
        trans={this._trans}
      />
    );
  }

  private _commands: CommandRegistry;
  private _trans: TranslationBundle;
  private _shell: ModeSwitch.IShell;
}

/**
 * A namespace for ModeSwitch statics.
 */
export namespace ModeSwitch {
  /**
   * Instantiation options for a ModeSwitch.
   */
  export interface IOptions {
    /**
     * The command registry.
     */
    commands: CommandRegistry;

    /**
     * The translation bundle.
     */
    trans: TranslationBundle;

    /**
     * A simplified shell with access to its mode
     */
    shell: ModeSwitch.IShell;
  }

  /**
   * A simplified shell interface to access and modify the mode.
   */
  export interface IShell {
    /**
     * The mode for the shell.
     */
    mode: DockPanel.Mode;
  }
}
