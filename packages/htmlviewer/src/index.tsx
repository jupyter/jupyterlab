/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module htmlviewer
 */

import {
  IFrame,
  IWidgetTracker,
  ReactWidget,
  ToolbarButton,
  ToolbarButtonComponent,
  UseSignal
} from '@jupyterlab/apputils';
import { ActivityMonitor } from '@jupyterlab/coreutils';
import {
  ABCWidgetFactory,
  DocumentRegistry,
  DocumentWidget,
  IDocumentWidget
} from '@jupyterlab/docregistry';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { refreshIcon } from '@jupyterlab/ui-components';
import { Token } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import * as React from 'react';

/**
 * A class that tracks HTML viewer widgets.
 */
export interface IHTMLViewerTracker extends IWidgetTracker<HTMLViewer> {}

/**
 * The HTML viewer tracker token.
 */
export const IHTMLViewerTracker = new Token<IHTMLViewerTracker>(
  '@jupyterlab/htmlviewer:IHTMLViewerTracker'
);
/**
 * The timeout to wait for change activity to have ceased before rendering.
 */
const RENDER_TIMEOUT = 1000;

/**
 * The CSS class to add to the HTMLViewer Widget.
 */
const CSS_CLASS = 'jp-HTMLViewer';

/**
 * A viewer widget for HTML documents.
 *
 * #### Notes
 * The iframed HTML document can pose a potential security risk,
 * since it can execute Javascript, and make same-origin requests
 * to the server, thereby executing arbitrary Javascript.
 *
 * Here, we sandbox the iframe so that it can't execute Javascript
 * or launch any popups. We allow one exception: 'allow-same-origin'
 * requests, so that local HTML documents can access CSS, images,
 * etc from the files system.
 */
export class HTMLViewer
  extends DocumentWidget<IFrame>
  implements IDocumentWidget<IFrame> {
  /**
   * Create a new widget for rendering HTML.
   */
  constructor(options: DocumentWidget.IOptionsOptionalContent) {
    super({
      ...options,
      content: new IFrame({ sandbox: ['allow-same-origin'] })
    });
    this.translator = options.translator || nullTranslator;
    this.content.addClass(CSS_CLASS);

    void this.context.ready.then(() => {
      this.update();
      // Throttle the rendering rate of the widget.
      this._monitor = new ActivityMonitor({
        signal: this.context.model.contentChanged,
        timeout: RENDER_TIMEOUT
      });
      this._monitor.activityStopped.connect(this.update, this);
    });
  }

  /**
   * Whether the HTML document is trusted. If trusted,
   * it can execute Javascript in the iframe sandbox.
   */
  get trusted(): boolean {
    return this.content.sandbox.indexOf('allow-scripts') !== -1;
  }
  set trusted(value: boolean) {
    if (this.trusted === value) {
      return;
    }
    if (value) {
      this.content.sandbox = Private.trusted;
    } else {
      this.content.sandbox = Private.untrusted;
    }
    // eslint-disable-next-line
    this.content.url = this.content.url; // Force a refresh.
    this._trustedChanged.emit(value);
  }

  /**
   * Emitted when the trust state of the document changes.
   */
  get trustedChanged(): ISignal<this, boolean> {
    return this._trustedChanged;
  }

  /**
   * Dispose of resources held by the html viewer.
   */
  dispose(): void {
    if (this._objectUrl) {
      try {
        URL.revokeObjectURL(this._objectUrl);
      } catch (error) {
        /* no-op */
      }
    }
    super.dispose();
  }

  /**
   * Handle and update request.
   */
  protected onUpdateRequest(): void {
    if (this._renderPending) {
      return;
    }
    this._renderPending = true;
    void this._renderModel().then(() => (this._renderPending = false));
  }

  /**
   * Render HTML in IFrame into this widget's node.
   */
  private async _renderModel(): Promise<void> {
    let data = this.context.model.toString();
    data = await this._setBase(data);

    // Set the new iframe url.
    const blob = new Blob([data], { type: 'text/html' });
    const oldUrl = this._objectUrl;
    this._objectUrl = URL.createObjectURL(blob);
    this.content.url = this._objectUrl;

    // Release reference to any previous object url.
    if (oldUrl) {
      try {
        URL.revokeObjectURL(oldUrl);
      } catch (error) {
        /* no-op */
      }
    }
    return;
  }

  /**
   * Set a <base> element in the HTML string so that the iframe
   * can correctly dereference relative links.
   */
  private async _setBase(data: string): Promise<string> {
    const doc = this._parser.parseFromString(data, 'text/html');
    let base = doc.querySelector('base');
    if (!base) {
      base = doc.createElement('base');
      doc.head.insertBefore(base, doc.head.firstChild);
    }
    const path = this.context.path;
    const baseUrl = await this.context.urlResolver.getDownloadUrl(path);

    // Set the base href, plus a fake name for the url of this
    // document. The fake name doesn't really matter, as long
    // as the document can dereference relative links to resources
    // (e.g. CSS and scripts).
    base.href = baseUrl;
    base.target = '_self';
    return doc.documentElement.innerHTML;
  }

  protected translator: ITranslator;
  private _renderPending = false;
  private _parser = new DOMParser();
  private _monitor: ActivityMonitor<
    DocumentRegistry.IModel,
    void
  > | null = null;
  private _objectUrl: string = '';
  private _trustedChanged = new Signal<this, boolean>(this);
}

/**
 * A widget factory for HTMLViewers.
 */
export class HTMLViewerFactory extends ABCWidgetFactory<HTMLViewer> {
  /**
   * Create a new widget given a context.
   */
  protected createNewWidget(context: DocumentRegistry.Context): HTMLViewer {
    return new HTMLViewer({ context });
  }

  /**
   * Default factory for toolbar items to be added after the widget is created.
   */
  protected defaultToolbarFactory(
    widget: HTMLViewer
  ): DocumentRegistry.IToolbarItem[] {
    return [
      // Make a refresh button for the toolbar.
      {
        name: 'refresh',
        widget: ToolbarItems.createRefreshButton(widget, this.translator)
      },
      // Make a trust button for the toolbar.
      {
        name: 'trust',
        widget: ToolbarItems.createTrustButton(widget, this.translator)
      }
    ];
  }
}

/**
 * A namespace for toolbar items generator
 */
export namespace ToolbarItems {
  /**
   * Create the refresh button
   *
   * @param widget HTML viewer widget
   * @param translator Application translator object
   * @returns Toolbar item button
   */
  export function createRefreshButton(
    widget: HTMLViewer,
    translator?: ITranslator
  ): Widget {
    const trans = (translator ?? nullTranslator).load('jupyterlab');
    return new ToolbarButton({
      icon: refreshIcon,
      onClick: async () => {
        if (!widget.context.model.dirty) {
          await widget.context.revert();
          widget.update();
        }
      },
      tooltip: trans.__('Rerender HTML Document')
    });
  }
  /**
   * Create the trust button
   *
   * @param document HTML viewer widget
   * @param translator Application translator object
   * @returns Toolbar item button
   */
  export function createTrustButton(
    document: HTMLViewer,
    translator: ITranslator
  ): Widget {
    return ReactWidget.create(
      <Private.TrustButtonComponent
        htmlDocument={document}
        translator={translator}
      />
    );
  }
}

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * Sandbox exceptions for untrusted HTML.
   */
  export const untrusted: IFrame.SandboxExceptions[] = [];

  /**
   * Sandbox exceptions for trusted HTML.
   */
  export const trusted: IFrame.SandboxExceptions[] = ['allow-scripts'];

  /**
   * Namespace for TrustedButton.
   */
  export namespace TrustButtonComponent {
    /**
     * Interface for TrustedButton props.
     */
    export interface IProps {
      htmlDocument: HTMLViewer;

      /**
       * Language translator.
       */
      translator?: ITranslator;
    }
  }

  /**
   * React component for a trusted button.
   *
   * This wraps the ToolbarButtonComponent and watches for trust changes.
   */
  export function TrustButtonComponent(
    props: TrustButtonComponent.IProps
  ): JSX.Element {
    const translator = props.translator || nullTranslator;
    const trans = translator.load('jupyterlab');
    return (
      <UseSignal
        signal={props.htmlDocument.trustedChanged}
        initialSender={props.htmlDocument}
      >
        {() => (
          <ToolbarButtonComponent
            className=""
            onClick={() =>
              (props.htmlDocument.trusted = !props.htmlDocument.trusted)
            }
            tooltip={trans.__(`Whether the HTML file is trusted.
Trusting the file allows scripts to run in it,
which may result in security risks.
Only enable for files you trust.`)}
            label={
              props.htmlDocument.trusted
                ? trans.__('Distrust HTML')
                : trans.__('Trust HTML')
            }
          />
        )}
      </UseSignal>
    );
  }
}
