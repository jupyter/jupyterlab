/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module mathjax2
 */

import { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { PromiseDelegate } from '@lumino/coreutils';

// Stub for window MathJax.
declare let MathJax: any;

/**
 * The MathJax Typesetter.
 */
export class MathJaxTypesetter implements IRenderMime.ILatexTypesetter {
  /**
   * Create a new MathJax typesetter.
   */
  constructor(options: MathJaxTypesetter.IOptions) {
    this._url = options.url;
    this._config = options.config;
  }

  /**
   * Typeset the math in a node.
   *
   * #### Notes
   * MathJax schedules the typesetting asynchronously,
   * but there are not currently any callbacks or Promises
   * firing when it is done.
   */
  typeset(node: HTMLElement): void {
    if (!this._initialized) {
      this._init();
    }
    void this._initPromise.promise.then(() => {
      MathJax.Hub.Queue(['Typeset', MathJax.Hub, node]);
      try {
        MathJax.Hub.Queue(
          ['Require', MathJax.Ajax, '[MathJax]/extensions/TeX/AMSmath.js'],
          () => {
            MathJax.InputJax.TeX.resetEquationNumbers();
          }
        );
      } catch (e) {
        console.error('Error queueing resetEquationNumbers:', e);
      }
    });
  }

  /**
   * Initialize MathJax.
   */
  private _init(): void {
    const head = document.getElementsByTagName('head')[0];
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `${this._url}?config=${this._config}&amp;delayStartupUntil=configured`;
    script.charset = 'utf-8';
    head.appendChild(script);
    script.addEventListener('load', () => {
      this._onLoad();
    });
    this._initialized = true;
  }

  /**
   * Handle MathJax loading.
   */
  private _onLoad(): void {
    MathJax.Hub.Config({
      tex2jax: {
        inlineMath: [
          ['$', '$'],
          ['\\(', '\\)']
        ],
        displayMath: [
          ['$$', '$$'],
          ['\\[', '\\]']
        ],
        processEscapes: true,
        processEnvironments: true
      },
      // Center justify equations in code and markdown cells. Elsewhere
      // we use CSS to left justify single line equations in code cells.
      displayAlign: 'center',
      CommonHTML: {
        linebreaks: { automatic: true }
      },
      'HTML-CSS': {
        availableFonts: [],
        imageFont: null,
        preferredFont: null,
        webFont: 'TeX',
        styles: { '.MathJax_Display': { margin: 0 } },
        linebreaks: { automatic: true }
      },
      skipStartupTypeset: true,
      messageStyle: 'none'
    });
    MathJax.Hub.Configured();
    this._initPromise.resolve(void 0);
  }

  private _initPromise = new PromiseDelegate<void>();
  private _initialized = false;
  private _url: string;
  private _config: string;
}

/**
 * Namespace for MathJaxTypesetter.
 */
export namespace MathJaxTypesetter {
  /**
   * MathJaxTypesetter constructor options.
   */
  export interface IOptions {
    /**
     * The url to load MathJax from.
     */
    url: string;

    /**
     * A configuration string to compose into the MathJax URL.
     */
    config: string;
  }
}
