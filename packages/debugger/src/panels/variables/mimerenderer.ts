import { MainAreaWidget } from '@jupyterlab/apputils';
import { IRenderMimeRegistry, MimeModel } from '@jupyterlab/rendermime';
import { PromiseDelegate } from '@lumino/coreutils';
import { Panel } from '@lumino/widgets';
import { IDebugger } from '../../tokens';

/**
 * Debugger variable mime type renderer
 */
export class VariableMimeRenderer extends MainAreaWidget<Panel> {
  /**
   * Instantiate a new VariableMimeRenderer.
   */
  constructor(options: VariableMimeRenderer.IOptions) {
    const { dataLoader, rendermime } = options;
    const content = new Panel();
    const loaded = new PromiseDelegate<void>();
    super({
      content,
      reveal: Promise.all([dataLoader, loaded.promise])
    });

    dataLoader
      .then(async data => {
        const mimeType = rendermime.preferredMimeType(data.data);

        if (mimeType) {
          const widget = rendermime.createRenderer(mimeType);
          const model = new MimeModel(data);
          await widget.renderModel(model);

          content.addWidget(widget);
          loaded.resolve();
        } else {
          loaded.reject('Unable to determine the preferred mime type.');
        }
      })
      .catch(reason => {
        loaded.reject(reason);
      });
  }
}

/**
 * Debugger variable mime type renderer namespace
 */
export namespace VariableMimeRenderer {
  /**
   * Constructor options
   */
  export interface IOptions {
    /**
     * Variable to be rendered
     */
    dataLoader: Promise<IDebugger.IRichVariable>;
    /**
     * Render mime type registry
     */
    rendermime: IRenderMimeRegistry;
  }
}
