// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IChangedArgs } from '@jupyterlab/coreutils';
import * as nbformat from '@jupyterlab/nbformat';
import {
  IModelDB,
  IObservableMap,
  IObservableString,
  IObservableValue,
  ModelDB,
  ObservableValue
} from '@jupyterlab/observables';
import * as models from '@jupyterlab/shared-models';
import { ITranslator } from '@jupyterlab/translation';
import { JSONObject } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { ISignal, Signal } from '@lumino/signaling';

/**
 * A namespace for code editors.
 *
 * #### Notes
 * - A code editor is a set of common assumptions which hold for all concrete editors.
 * - Changes in implementations of the code editor should only be caused by changes in concrete editors.
 * - Common JLab services which are based on the code editor should belong to `IEditorServices`.
 */
export namespace CodeEditor {
  /**
   * A zero-based position in the editor.
   */
  export interface IPosition extends JSONObject {
    /**
     * The cursor line number.
     */
    readonly line: number;

    /**
     * The cursor column number.
     */
    readonly column: number;
  }

  /**
   * The dimension of an element.
   */
  export interface IDimension {
    /**
     * The width of an element in pixels.
     */
    readonly width: number;

    /**
     * The height of an element in pixels.
     */
    readonly height: number;
  }

  /**
   * An interface describing editor state coordinates.
   */
  export interface ICoordinate extends JSONObject, ClientRect {}

  /**
   * A range.
   */
  export interface IRange extends JSONObject {
    /**
     * The position of the first character in the current range.
     *
     * #### Notes
     * If this position is greater than [end] then the range is considered
     * to be backward.
     */
    readonly start: IPosition;

    /**
     * The position of the last character in the current range.
     *
     * #### Notes
     * If this position is less than [start] then the range is considered
     * to be backward.
     */
    readonly end: IPosition;
  }

  /**
   * A selection style.
   */
  export interface ISelectionStyle extends JSONObject {
    /**
     * A class name added to a selection.
     */
    className: string;

    /**
     * A display name added to a selection.
     */
    displayName: string;

    /**
     * A color for UI elements.
     */
    color: string;
  }

  /**
   * The default selection style.
   */
  export const defaultSelectionStyle: ISelectionStyle = {
    className: '',
    displayName: '',
    color: 'black'
  };

  /**
   * A text selection.
   */
  export interface ITextSelection extends IRange {
    /**
     * The uuid of the text selection owner.
     */
    readonly uuid: string;

    /**
     * The style of this selection.
     */
    readonly style: ISelectionStyle;
  }

  /**
   * An interface for a text token, such as a word, keyword, or variable.
   */
  export interface IToken {
    /**
     * The value of the token.
     */
    value: string;

    /**
     * The offset of the token in the code editor.
     */
    offset: number;

    /**
     * An optional type for the token.
     */
    type?: string;
  }

  /**
   * An interface to manage selections by selection owners.
   *
   * #### Definitions
   * - a user code that has an associated uuid is called a selection owner, see `CodeEditor.ISelectionOwner`
   * - a selection belongs to a selection owner only if it is associated with the owner by an uuid, see `CodeEditor.ITextSelection`
   *
   * #### Read access
   * - any user code can observe any selection
   *
   * #### Write access
   * - if a user code is a selection owner then:
   *   - it can change selections belonging to it
   *   - but it must not change selections belonging to other selection owners
   * - otherwise it must not change any selection
   */

  /**
   * An editor model.
   */
  export interface IModel extends IDisposable {
    /**
     * A signal emitted when a property changes.
     */
    mimeTypeChanged: ISignal<IModel, IChangedArgs<string>>;

    /**
     * A signal emitted when the shared model was switched.
     */
    sharedModelSwitched: ISignal<IModel, boolean>;

    /**
     * The text stored in the model.
     */
    readonly value: IObservableString;

    /**
     * A mime type of the model.
     *
     * #### Notes
     * It is never `null`, the default mime type is `text/plain`.
     */
    mimeType: string;

    /**
     * The currently selected code.
     */
    readonly selections: IObservableMap<ITextSelection[]>;

    /**
     * The underlying `IModelDB` instance in which model
     * data is stored.
     */
    readonly modelDB: IModelDB;

    /**
     * The shared model for the cell editor.
     */
    readonly sharedModel: models.ISharedText;

    /**
     * When we initialize a cell model, we create a standalone cell model that cannot be shared in a YNotebook.
     * Call this function to re-initialize the local representation based on a fresh shared model (e.g. models.YFile or models.YCodeCell).
     */
    switchSharedModel(
      sharedModel: models.ISharedText,
      reinitialize: boolean
    ): void;
  }

  /**
   * The default implementation of the editor model.
   */
  export class Model implements IModel {
    /**
     * Construct a new Model.
     */
    constructor(options?: Model.IOptions) {
      options = options || {};

      if (options.modelDB) {
        this.modelDB = options.modelDB;
      } else {
        this.modelDB = new ModelDB();
      }
      this.sharedModel = models.createStandaloneCell(
        this.type,
        options.id
      ) as models.ISharedText;
      this.sharedModel.changed.connect(this._onSharedModelChanged, this);

      const value = this.modelDB.createString('value');
      value.changed.connect(this._onModelDBValueChanged, this);
      value.text = value.text || options.value || '';

      const mimeType = this.modelDB.createValue('mimeType');
      mimeType.changed.connect(this._onModelDBMimeTypeChanged, this);
      mimeType.set(options.mimeType || 'text/plain');

      this.modelDB.createMap('selections');
    }

    /**
     * When we initialize a cell model, we create a standalone model that cannot be shared in a YNotebook.
     * Call this function to re-initialize the local representation based on a fresh shared model (e.g. models.YFile or models.YCodeCell).
     *
     * @param sharedModel
     * @param reinitialize Whether to reinitialize the shared model.
     */
    public switchSharedModel(
      sharedModel: models.ISharedText,
      reinitialize?: boolean
    ): void {
      if (reinitialize) {
        // update local modeldb
        // @todo also change metadata
        this.value.text = sharedModel.getSource();
      }
      this.sharedModel.changed.disconnect(this._onSharedModelChanged, this);
      // clone model retrieve a shared (not standalone) model
      this.sharedModel = sharedModel;
      this.sharedModel.changed.connect(this._onSharedModelChanged, this);
      this._sharedModelSwitched.emit(true);
    }

    /**
     * We update the modeldb store when the shared model changes.
     * To ensure that we don't run into infinite loops, we wrap this call in a "mutex".
     * The "mutex" ensures that the wrapped code can only be executed by either the sharedModelChanged hander
     * or the modelDB change handler.
     */
    protected _onSharedModelChanged(
      sender: models.ISharedBaseCell<any>,
      change: models.CellChange<nbformat.IBaseCellMetadata>
    ): void {
      this._mutex(() => {
        if (change.sourceChange) {
          const value = this.modelDB.get('value') as IObservableString;
          let currpos = 0;
          change.sourceChange.forEach(delta => {
            if (delta.insert != null) {
              value.insert(currpos, delta.insert);
              currpos += delta.insert.length;
            } else if (delta.delete != null) {
              value.remove(currpos, currpos + delta.delete);
            } else if (delta.retain != null) {
              currpos += delta.retain;
            }
          });
        }
      });
    }

    /**
     * Handle a change to the modelDB value.
     */
    private _onModelDBValueChanged(
      value: IObservableString,
      event: IObservableString.IChangedArgs
    ): void {
      this._mutex(() => {
        this.sharedModel.transact(() => {
          switch (event.type) {
            case 'insert':
              this.sharedModel.updateSource(
                event.start,
                event.start,
                event.value
              );
              break;
            case 'remove':
              this.sharedModel.updateSource(event.start, event.end);
              break;
            default:
              this.sharedModel.setSource(value.text);
              break;
          }
        });
      });
    }

    get type(): nbformat.CellType {
      return 'code';
    }

    /**
     * The shared model for the cell editor.
     */
    sharedModel: models.ISharedText;

    /**
     * A mutex to update the shared model.
     */
    protected readonly _mutex = models.createMutex();

    /**
     * The underlying `IModelDB` instance in which model
     * data is stored.
     */
    readonly modelDB: IModelDB;

    /**
     * A signal emitted when a mimetype changes.
     */
    get mimeTypeChanged(): ISignal<this, IChangedArgs<string>> {
      return this._mimeTypeChanged;
    }

    /**
     * A signal emitted when the shared model was switched.
     */
    get sharedModelSwitched(): ISignal<this, boolean> {
      return this._sharedModelSwitched;
    }

    /**
     * Get the value of the model.
     */
    get value(): IObservableString {
      return this.modelDB.get('value') as IObservableString;
    }

    /**
     * Get the selections for the model.
     */
    get selections(): IObservableMap<ITextSelection[]> {
      return this.modelDB.get('selections') as IObservableMap<ITextSelection[]>;
    }

    /**
     * A mime type of the model.
     */
    get mimeType(): string {
      return this.modelDB.getValue('mimeType') as string;
    }
    set mimeType(newValue: string) {
      const oldValue = this.mimeType;
      if (oldValue === newValue) {
        return;
      }
      this.modelDB.setValue('mimeType', newValue);
    }

    /**
     * Whether the model is disposed.
     */
    get isDisposed(): boolean {
      return this._isDisposed;
    }

    /**
     * Dispose of the resources used by the model.
     */
    dispose(): void {
      if (this._isDisposed) {
        return;
      }
      this._isDisposed = true;
      Signal.clearData(this);
    }

    private _onModelDBMimeTypeChanged(
      mimeType: IObservableValue,
      args: ObservableValue.IChangedArgs
    ): void {
      this._mimeTypeChanged.emit({
        name: 'mimeType',
        oldValue: args.oldValue as string,
        newValue: args.newValue as string
      });
    }

    private _isDisposed = false;
    private _mimeTypeChanged = new Signal<this, IChangedArgs<string>>(this);
    private _sharedModelSwitched = new Signal<this, boolean>(this);
  }

  /**
   * A selection owner.
   */
  export interface ISelectionOwner {
    /**
     * The uuid of this selection owner.
     */
    uuid: string;

    /**
     * Returns the primary position of the cursor, never `null`.
     */
    getCursorPosition(): IPosition;

    /**
     * Set the primary position of the cursor.
     *
     * @param position - The new primary position.
     *
     * #### Notes
     * This will remove any secondary cursors.
     */
    setCursorPosition(position: IPosition): void;

    /**
     * Returns the primary selection, never `null`.
     */
    getSelection(): IRange;

    /**
     * Set the primary selection.
     *
     * @param selection - The desired selection range.
     *
     * #### Notes
     * This will remove any secondary cursors.
     */
    setSelection(selection: IRange): void;

    /**
     * Gets the selections for all the cursors, never `null` or empty.
     */
    getSelections(): IRange[];

    /**
     * Sets the selections for all the cursors.
     *
     * @param selections - The new selections.
     *
     * #### Notes
     * Cursors will be removed or added, as necessary.
     * Passing an empty array resets a cursor position to the start of a
     * document.
     */
    setSelections(selections: IRange[]): void;
  }

  /**
   * A keydown handler type.
   *
   * #### Notes
   * Return `true` to prevent the default handling of the event by the
   * editor.
   */
  export type KeydownHandler = (
    instance: IEditor,
    event: KeyboardEvent
  ) => boolean;

  /**
   * The location of requested edges.
   */
  export type EdgeLocation = 'top' | 'topLine' | 'bottom';

  /**
   * A widget that provides a code editor.
   */
  export interface IEditor extends ISelectionOwner, IDisposable {
    /**
     * A signal emitted when either the top or bottom edge is requested.
     */
    readonly edgeRequested: ISignal<IEditor, EdgeLocation>;

    /**
     * The default selection style for the editor.
     */
    selectionStyle: CodeEditor.ISelectionStyle;

    /**
     * The DOM node that hosts the editor.
     */
    readonly host: HTMLElement;

    /**
     * The model used by the editor.
     */
    readonly model: IModel;

    /**
     * The height of a line in the editor in pixels.
     */
    readonly lineHeight: number;

    /**
     * The widget of a character in the editor in pixels.
     */
    readonly charWidth: number;

    /**
     * Get the number of lines in the editor.
     */
    readonly lineCount: number;

    /**
     * Get a config option for the editor.
     */
    getOption<K extends keyof IConfig>(option: K): IConfig[K];

    /**
     * Set a config option for the editor.
     */
    setOption<K extends keyof IConfig>(option: K, value: IConfig[K]): void;

    /**
     * Set config options for the editor.
     */
    setOptions<K extends keyof IConfig>(options: IConfigOptions<K>[]): void;

    /**
     * Returns the content for the given line number.
     *
     * @param line - The line of interest.
     *
     * @returns The value of the line.
     *
     * #### Notes
     * Lines are 0-based, and accessing a line out of range returns
     * `undefined`.
     */
    getLine(line: number): string | undefined;

    /**
     * Find an offset for the given position.
     *
     * @param position - The position of interest.
     *
     * @returns The offset at the position, clamped to the extent of the
     * editor contents.
     */
    getOffsetAt(position: IPosition): number;

    /**
     * Find a position for the given offset.
     *
     * @param offset - The offset of interest.
     *
     * @returns The position at the offset, clamped to the extent of the
     * editor contents.
     */
    getPositionAt(offset: number): IPosition | undefined;

    /**
     * Undo one edit (if any undo events are stored).
     */
    undo(): void;

    /**
     * Redo one undone edit.
     */
    redo(): void;

    /**
     * Clear the undo history.
     */
    clearHistory(): void;

    /**
     * Brings browser focus to this editor text.
     */
    focus(): void;

    /**
     * Test whether the editor has keyboard focus.
     */
    hasFocus(): boolean;

    /**
     * Explicitly blur the editor.
     */
    blur(): void;

    /**
     * Repaint the editor.
     *
     * #### Notes
     * A repainted editor should fit to its host node.
     */
    refresh(): void;

    /**
     * Resize the editor to fit its host node.
     */
    resizeToFit(): void;

    /**
     * Add a keydown handler to the editor.
     *
     * @param handler - A keydown handler.
     *
     * @returns A disposable that can be used to remove the handler.
     */
    addKeydownHandler(handler: KeydownHandler): IDisposable;

    /**
     * Set the size of the editor.
     *
     * @param size - The desired size.
     *
     * #### Notes
     * Use `null` if the size is unknown.
     */
    setSize(size: IDimension | null): void;

    /**
     * Reveals the given position in the editor.
     *
     * @param position - The desired position to reveal.
     */
    revealPosition(position: IPosition): void;

    /**
     * Reveals the given selection in the editor.
     *
     * @param position - The desired selection to reveal.
     */
    revealSelection(selection: IRange): void;

    /**
     * Get the window coordinates given a cursor position.
     *
     * @param position - The desired position.
     *
     * @returns The coordinates of the position.
     */
    getCoordinateForPosition(position: IPosition): ICoordinate;

    /**
     * Get the cursor position given window coordinates.
     *
     * @param coordinate - The desired coordinate.
     *
     * @returns The position of the coordinates, or null if not
     *   contained in the editor.
     */
    getPositionForCoordinate(coordinate: ICoordinate): IPosition | null;

    /**
     * Inserts a new line at the cursor position and indents it.
     */
    newIndentedLine(): void;

    /**
     * Gets the token at a given position.
     */
    getTokenForPosition(position: IPosition): IToken;

    /**
     * Gets the list of tokens for the editor model.
     */
    getTokens(): IToken[];

    /**
     * Replaces selection with the given text.
     */
    replaceSelection?(text: string): void;
  }

  /**
   * A factory used to create a code editor.
   */
  export type Factory = (options: IOptions) => CodeEditor.IEditor;

  /**
   * The configuration options for an editor.
   */
  export interface IConfig {
    /**
     * Half-period in milliseconds used for cursor blinking.
     * By setting this to zero, blinking can be disabled.
     * A negative value hides the cursor entirely.
     */
    cursorBlinkRate: number;

    /**
     * User preferred font family for text editors.
     */
    fontFamily: string | null;

    /**
     * User preferred size in pixel of the font used in text editors.
     */
    fontSize: number | null;

    /**
     * User preferred text line height, as a multiplier of font size.
     */
    lineHeight: number | null;

    /**
     * Whether line numbers should be displayed.
     */
    lineNumbers: boolean;

    /**
     * Control the line wrapping of the editor. Possible values are:
     * - "off", lines will never wrap.
     * - "on", lines will wrap at the viewport border.
     * - "wordWrapColumn", lines will wrap at `wordWrapColumn`.
     * - "bounded", lines will wrap at minimum between viewport width and wordWrapColumn.
     */
    lineWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';

    /**
     * Whether the editor is read-only.
     */
    readOnly: boolean;

    /**
     * The number of spaces a tab is equal to.
     */
    tabSize: number;

    /**
     * Whether to insert spaces when pressing Tab.
     */
    insertSpaces: boolean;

    /**
     * Whether to highlight matching brackets when one of them is selected.
     */
    matchBrackets: boolean;

    /**
     * Whether to automatically close brackets after opening them.
     */
    autoClosingBrackets: boolean;

    /**
     * Whether the editor should handle paste events.
     */
    handlePaste?: boolean;

    /**
     * The column where to break text line.
     */
    wordWrapColumn: number;

    /**
     * Column index at which rulers should be added.
     */
    rulers: Array<number>;

    /**
     * Wheter to allow code folding
     */
    codeFolding: boolean;

    /**
     * Wheter to highlight trailing whitespace
     */
    showTrailingSpace: boolean;
  }

  /**
   * The default configuration options for an editor.
   */
  export const defaultConfig: IConfig = {
    cursorBlinkRate: 530,
    fontFamily: null,
    fontSize: null,
    lineHeight: null,
    lineNumbers: false,
    lineWrap: 'on',
    wordWrapColumn: 80,
    readOnly: false,
    tabSize: 4,
    insertSpaces: true,
    matchBrackets: true,
    autoClosingBrackets: true,
    handlePaste: true,
    rulers: [],
    codeFolding: false,
    showTrailingSpace: false
  };

  /**
   * The options used to set several options at once with setOptions.
   */
  export interface IConfigOptions<K extends keyof IConfig> {
    K: IConfig[K];
  }

  /**
   * The options used to initialize an editor.
   */
  export interface IOptions {
    /**
     * The host widget used by the editor.
     */
    host: HTMLElement;

    /**
     * The model used by the editor.
     */
    model: IModel;

    /**
     * The desired uuid for the editor.
     */
    uuid?: string;

    /**
     * The default selection style for the editor.
     */
    selectionStyle?: Partial<CodeEditor.ISelectionStyle>;

    /**
     * The configuration options for the editor.
     */
    config?: Partial<IConfig>;

    /**
     * The configuration options for the editor.
     */
    translator?: ITranslator;
  }

  export namespace Model {
    export interface IOptions {
      id?: string;
      /**
       * The initial value of the model.
       */
      value?: string;

      /**
       * The mimetype of the model.
       */
      mimeType?: string;

      /**
       * An optional modelDB for storing model state.
       */
      modelDB?: IModelDB;
    }
  }
}
