// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { Message, MessageLoop } from '@lumino/messaging';
import { BoxLayout, BoxPanel, Widget } from '@lumino/widgets';
import { DOMUtils } from './domutils';
import { Printing } from './printing';
import { Spinner } from './spinner';
import { Toolbar } from './toolbar';

/**
 * A widget meant to be contained in the JupyterLab main area.
 *
 * #### Notes
 * Mirrors all of the `title` attributes of the content.
 * This widget is `closable` by default.
 * This widget is automatically disposed when closed.
 * This widget ensures its own focus when activated.
 */
export class MainAreaWidget<T extends Widget = Widget>
  extends Widget
  implements Printing.IPrintable {
  /**
   * Construct a new main area widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: MainAreaWidget.IOptions<T>) {
    super(options);
    this.addClass('jp-MainAreaWidget');
    // Set contain=strict to avoid many forced layout rendering while adding cells.
    // Don't forget to remove the CSS class when your remove the spinner to allow
    // the content to be rendered.
    // @see https://github.com/jupyterlab/jupyterlab/issues/9381
    this.addClass('jp-MainAreaWidget-ContainStrict');
    this.id = DOMUtils.createDomID();

    const trans = (options.translator || nullTranslator).load('jupyterlab');
    const content = (this._content = options.content);
    content.node.setAttribute('role', 'region');
    content.node.setAttribute('aria-label', trans.__('notebook content'));
    const toolbar = (this._toolbar = options.toolbar || new Toolbar());
    toolbar.node.setAttribute('role', 'navigation');
    toolbar.node.setAttribute('aria-label', trans.__('notebook actions'));
    const contentHeader = (this._contentHeader =
      options.contentHeader ||
      new BoxPanel({
        direction: 'top-to-bottom',
        spacing: 0
      }));

    const layout = (this.layout = new BoxLayout({ spacing: 0 }));
    layout.direction = 'top-to-bottom';
    BoxLayout.setStretch(toolbar, 0);
    BoxLayout.setStretch(contentHeader, 0);
    BoxLayout.setStretch(content, 1);
    layout.addWidget(toolbar);
    layout.addWidget(contentHeader);
    layout.addWidget(content);

    if (!content.id) {
      content.id = DOMUtils.createDomID();
    }
    content.node.tabIndex = 0;

    this._updateTitle();
    content.title.changed.connect(this._updateTitle, this);
    this.title.closable = true;
    this.title.changed.connect(this._updateContentTitle, this);

    if (options.reveal) {
      this.node.appendChild(this._spinner.node);
      this._revealed = options.reveal
        .then(() => {
          if (content.isDisposed) {
            this.dispose();
            return;
          }
          content.disposed.connect(() => this.dispose());
          const active = document.activeElement === this._spinner.node;
          this._disposeSpinner();
          this._isRevealed = true;
          if (active) {
            this._focusContent();
          }
        })
        .catch(e => {
          // Show a revealed promise error.
          const error = new Widget();
          error.addClass('jp-MainAreaWidget-error');
          // Show the error to the user.
          const pre = document.createElement('pre');
          pre.textContent = String(e);
          error.node.appendChild(pre);
          BoxLayout.setStretch(error, 1);
          this._disposeSpinner();
          content.dispose();
          this._content = null!;
          toolbar.dispose();
          this._toolbar = null!;
          layout.addWidget(error);
          this._isRevealed = true;
          throw error;
        });
    } else {
      // Handle no reveal promise.
      this._spinner.dispose();
      this.removeClass('jp-MainAreaWidget-ContainStrict');
      content.disposed.connect(() => this.dispose());
      this._isRevealed = true;
      this._revealed = Promise.resolve(undefined);
    }
  }

  /**
   * Print method. Deferred to content.
   */
  [Printing.symbol](): Printing.OptionalAsyncThunk {
    if (!this._content) {
      return null;
    }
    return Printing.getPrintFunction(this._content);
  }

  /**
   * The content hosted by the widget.
   */
  get content(): T {
    return this._content;
  }

  /**
   * The toolbar hosted by the widget.
   */
  get toolbar(): Toolbar {
    return this._toolbar;
  }

  /**
   * A panel for widgets that sit between the toolbar and the content.
   * Imagine a formatting toolbar, notification headers, etc.
   */
  get contentHeader(): BoxPanel {
    return this._contentHeader;
  }

  /**
   * Whether the content widget or an error is revealed.
   */
  get isRevealed(): boolean {
    return this._isRevealed;
  }

  /**
   * A promise that resolves when the widget is revealed.
   */
  get revealed(): Promise<void> {
    return this._revealed;
  }

  /**
   * Handle `'activate-request'` messages.
   */
  protected onActivateRequest(msg: Message): void {
    if (this._isRevealed) {
      if (this._content) {
        this._focusContent();
      }
    } else {
      this._spinner.node.focus();
    }
  }

  /**
   * Handle `'close-request'` messages.
   */
  protected onCloseRequest(msg: Message): void {
    this.dispose();
  }

  /**
   * Handle `'update-request'` messages by forwarding them to the content.
   */
  protected onUpdateRequest(msg: Message): void {
    if (this._content) {
      MessageLoop.sendMessage(this._content, msg);
    }
  }

  private _disposeSpinner() {
    this.node.removeChild(this._spinner.node);
    this._spinner.dispose();
    this.removeClass('jp-MainAreaWidget-ContainStrict');
  }

  /**
   * Update the title based on the attributes of the child widget.
   */
  private _updateTitle(): void {
    if (this._changeGuard || !this.content) {
      return;
    }
    this._changeGuard = true;
    const content = this.content;
    this.title.label = content.title.label;
    this.title.mnemonic = content.title.mnemonic;
    this.title.icon = content.title.icon;
    this.title.iconClass = content.title.iconClass;
    this.title.iconLabel = content.title.iconLabel;
    this.title.caption = content.title.caption;
    this.title.className = content.title.className;
    this.title.dataset = content.title.dataset;
    this._changeGuard = false;
  }

  /**
   * Update the content title based on attributes of the main widget.
   */
  private _updateContentTitle(): void {
    if (this._changeGuard || !this.content) {
      return;
    }
    this._changeGuard = true;
    const content = this.content;
    content.title.label = this.title.label;
    content.title.mnemonic = this.title.mnemonic;
    content.title.icon = this.title.icon;
    content.title.iconClass = this.title.iconClass;
    content.title.iconLabel = this.title.iconLabel;
    content.title.caption = this.title.caption;
    content.title.className = this.title.className;
    content.title.dataset = this.title.dataset;
    this._changeGuard = false;
  }

  /**
   * Give focus to the content.
   */
  private _focusContent(): void {
    if (!this.content) {
      return;
    }
    // Focus the content node if we aren't already focused on it or a
    // descendent.
    if (!this.content.node.contains(document.activeElement)) {
      this.content.node.focus();
    }

    // Activate the content asynchronously (which may change the focus).
    this.content.activate();
  }

  /*
  MainAreaWidget's layout:
  - this.layout, a BoxLayout, from parent
    - this._toolbar, a Toolbar
    - this._contentHeader, a BoxPanel, empty by default
    - this._content
  */
  private _content: T;
  private _toolbar: Toolbar;
  private _contentHeader: BoxPanel;

  private _changeGuard = false;
  private _spinner = new Spinner();

  private _isRevealed = false;
  private _revealed: Promise<void>;
}

/**
 * The namespace for the `MainAreaWidget` class statics.
 */
export namespace MainAreaWidget {
  /**
   * An options object for creating a main area widget.
   */
  export interface IOptions<T extends Widget = Widget> extends Widget.IOptions {
    /**
     * The child widget to wrap.
     */
    content: T;

    /**
     * The toolbar to use for the widget.  Defaults to an empty toolbar.
     */
    toolbar?: Toolbar;

    /**
     * The layout to sit underneath the toolbar and above the content,
     * and that extensions can populate. Defaults to an empty BoxPanel.
     */
    contentHeader?: BoxPanel;

    /**
     * An optional promise for when the content is ready to be revealed.
     */
    reveal?: Promise<any>;

    /**
     * The application language translator.
     */
    translator?: ITranslator;
  }

  /**
   * An options object for main area widget subclasses providing their own
   * default content.
   *
   * #### Notes
   * This makes it easier to have a subclass that provides its own default
   * content. This can go away once we upgrade to TypeScript 2.8 and have an
   * easy way to make a single property optional, ala
   * https://stackoverflow.com/a/46941824
   */
  export interface IOptionsOptionalContent<T extends Widget = Widget>
    extends Widget.IOptions {
    /**
     * The child widget to wrap.
     */
    content?: T;

    /**
     * The toolbar to use for the widget.  Defaults to an empty toolbar.
     */
    toolbar?: Toolbar;

    /**
     * An optional promise for when the content is ready to be revealed.
     */
    reveal?: Promise<any>;
  }
}
