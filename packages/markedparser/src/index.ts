/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import marked from 'marked';

import { Mode, CodeMirrorEditor } from '@jupyterlab/codemirror';

import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

/**
 * The marked markdown parser.
 */
export class MarkedParser implements IRenderMime.IMarkdownParser {
  constructor() {
    if (!MarkedParser._initialized) {
      this._init();
    }
  }

  /**
   * Render markdown for the specified content.
   *
   * @param source - The string of markdown to render.
   *
   * @return A promise which resolves with the rendered content.
   */
  render(source: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      marked(source, (err: any, html: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(html);
        }
      });
    });
  }

  /**
   * Support GitHub flavored Markdown, leave sanitizing to external library.
   */
  private _init(): void {
    MarkedParser._initialized = true;
    marked.setOptions({
      gfm: true,
      sanitize: false,
      tables: true,
      // breaks: true; We can't use GFM breaks as it causes problems with tables
      langPrefix: `cm-s-${CodeMirrorEditor.defaultConfig.theme} language-`,
      highlight: (code, lang, callback) => {
        let cb = (err: Error | null, code: string) => {
          if (callback) {
            callback(err, code);
          }
          return code;
        };
        if (!lang) {
          // no language, no highlight
          return cb(null, code);
        }
        Mode.ensure(lang)
          .then(spec => {
            let el = document.createElement('div');
            if (!spec) {
              console.log(`No CodeMirror mode: ${lang}`);
              return cb(null, code);
            }
            try {
              Mode.run(code, spec.mime, el);
              return cb(null, el.innerHTML);
            } catch (err) {
              console.log(`Failed to highlight ${lang} code`, err);
              return cb(err, code);
            }
          })
          .catch(err => {
            console.log(`No CodeMirror mode: ${lang}`);
            console.log(`Require CodeMirror mode error: ${err}`);
            return cb(null, code);
          });
        return code;
      }
    });
  }

  private static _initialized = false;
}
