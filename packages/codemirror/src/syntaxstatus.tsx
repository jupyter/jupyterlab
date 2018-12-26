import React from 'react';

import {
  VDomRenderer,
  VDomModel,
  ReactWidget,
  UseSignal,
  mapSignal
} from '@jupyterlab/apputils';

import { CodeEditor } from '@jupyterlab/codeeditor';

import { IChangedArgs } from '@jupyterlab/coreutils';

import {
  interactiveItem,
  Popup,
  showPopup,
  TextItem
} from '@jupyterlab/statusbar';

import { Mode } from '.';

import { CommandRegistry } from '@phosphor/commands';

import { JSONObject } from '@phosphor/coreutils';

import { Menu } from '@phosphor/widgets';

import { ISignal } from '@phosphor/signaling';

/**
 * A namespace for `EditorSyntaxComponentStatics`.
 */
namespace EditorSyntaxComponent {
  /**
   * The props for the `EditorSyntaxComponent`.
   */
  export interface IProps {
    /**
     * The current CodeMirror mode for an editor.
     */
    mode: string;

    /**
     * A function to execute on clicking the component.
     * By default we provide a function that opens a menu
     * for CodeMirror mode selection.
     */
    handleClick: () => void;
  }
}

/**
 * A pure function that returns a tsx component for an editor syntax item.
 *
 * @param props: the props for the component.
 *
 * @returns an editor syntax component.
 */
function EditorSyntaxComponent(
  props: EditorSyntaxComponent.IProps
): React.ReactElement<EditorSyntaxComponent.IProps> {
  return <TextItem source={props.mode} onClick={props.handleClick} />;
}

/**
 * StatusBar item to change the language syntax highlighting of the file editor.
 */
export class EditorSyntaxStatus extends ReactWidget {
  /**
   * Construct a new VDomRenderer for the status item.
   */
  constructor(opts: EditorSyntaxStatus.IOptions) {
    super();
    this._commands = opts.commands;
    const mimetypeSignal: ISignal<any, string> = mapSignal(
      opts.editorSignal,
      (_, { model }) => {
        model.mimeTypeChanged;
      }
    );
    this._modeSignal = mapSignal(mimetypeSignal, (_, mimeType) => {
      const spec = Mode.findByMIME(mimeType);
      return spec.name || spec.mode;
    });
    this.addClass(interactiveItem);
    this.title.caption = 'Change text editor syntax highlighting';
  }

  /**
   * Render the status item.
   */
  render() {
    return (
      <UseSignal signal={this._modeSignal}>
        {(_, mode) => (
          <EditorSyntaxComponent mode={mode} handleClick={this._handleClick} />
        )}
      </UseSignal>
    );
  }

  /**
   * Create a menu for selecting the mode of the editor.
   */
  private _handleClick = () => {
    const modeMenu = new Menu({ commands: this._commands });
    let command = 'codemirror:change-mode';
    if (this._popup) {
      this._popup.dispose();
    }
    Mode.getModeInfo()
      .sort((a, b) => {
        let aName = a.name || '';
        let bName = b.name || '';
        return aName.localeCompare(bName);
      })
      .forEach(spec => {
        if (spec.mode.indexOf('brainf') === 0) {
          return;
        }

        let args: JSONObject = {
          insertSpaces: true,
          name: spec.name!
        };

        modeMenu.addItem({
          command,
          args
        });
      });
    this._popup = showPopup({
      body: modeMenu,
      anchor: this,
      align: 'left'
    });
  };

  private _commands: CommandRegistry;
  private _modeSignal: ISignal<any, string>;
  private _popup: Popup | null = null;
}

/**
 * A namespace for EditorSyntax statics.
 */
export namespace EditorSyntaxStatus {
  /**
   * A VDomModel for the current editor/mode combination.
   */
  export class Model extends VDomModel {
    /**
     * The current mode for the editor. If no editor is present,
     * returns the empty string.
     */
    get mode(): string {
      return this._mode;
    }

    /**
     * The current editor for the application editor tracker.
     */
    get editor(): CodeEditor.IEditor | null {
      return this._editor;
    }
    set editor(editor: CodeEditor.IEditor | null) {
      const oldEditor = this._editor;
      if (oldEditor !== null) {
        oldEditor.model.mimeTypeChanged.disconnect(this._onMIMETypeChange);
      }
      const oldMode = this._mode;
      this._editor = editor;
      if (this._editor === null) {
        this._mode = '';
      } else {
        const spec = Mode.findByMIME(this._editor.model.mimeType);
        this._mode = spec.name || spec.mode;

        this._editor.model.mimeTypeChanged.connect(this._onMIMETypeChange);
      }

      this._triggerChange(oldMode, this._mode);
    }

    /**
     * If the editor mode changes, update the model.
     */
    private _onMIMETypeChange = (
      mode: CodeEditor.IModel,
      change: IChangedArgs<string>
    ) => {
      const oldMode = this._mode;
      const spec = Mode.findByMIME(change.newValue);
      this._mode = spec.name || spec.mode;

      this._triggerChange(oldMode, this._mode);
    };

    /**
     * Trigger a rerender of the model.
     */
    private _triggerChange(oldState: string, newState: string) {
      if (oldState !== newState) {
        this.stateChanged.emit(void 0);
      }
    }

    private _mode: string = '';
    private _editor: CodeEditor.IEditor | null = null;
  }

  /**
   * Options for the EditorSyntax status item.
   */
  export interface IOptions {
    /**
     * The application command registry.
     */
    commands: CommandRegistry;

    /**
     * A signal of the active editors.
     */
    editorSignal: ISignal<any, CodeEditor.IEditor>;
  }
}
