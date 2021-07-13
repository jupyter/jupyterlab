// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IRankedMenu, RankedMenu } from '@jupyterlab/ui-components';
import { Widget } from '@lumino/widgets';
import { IMenuExtender } from './tokens';

/**
 * An interface for a Run menu.
 */
export interface IRunMenu extends IRankedMenu {
  /**
   * A set storing ICodeRunner for the Run menu.
   *
   * ### Notes
   * The key for the set may be used in menu labels.
   */
  readonly codeRunners: Set<IRunMenu.ICodeRunner<Widget>>;
}

/**
 * An extensible Run menu for the application.
 */
export class RunMenu extends RankedMenu implements IRunMenu {
  /**
   * Construct the run menu.
   */
  constructor(options: IRankedMenu.IOptions) {
    super(options);
    this.codeRunners = new Set<IRunMenu.ICodeRunner<Widget>>();
  }

  /**
   * A set storing ICodeRunner for the Run menu.
   *
   * ### Notes
   * The key for the set may be used in menu labels.
   */
  readonly codeRunners: Set<IRunMenu.ICodeRunner<Widget>>;

  /**
   * Dispose of the resources held by the run menu.
   */
  dispose(): void {
    this.codeRunners.clear();
    super.dispose();
  }
}

/**
 * A namespace for RunMenu statics.
 */
export namespace IRunMenu {
  /**
   * An object that runs code, which may be
   * registered with the Run menu.
   */
  export interface ICodeRunner<T extends Widget> extends IMenuExtender<T> {
    /**
     * Return the caption associated to the `run` function.
     *
     * This function receives the number of items `n` to be able to provided
     * correct pluralized forms of translations.
     */
    runCaption?: (n: number) => string;

    /**
     * Return the label associated to the `run` function.
     *
     * This function receives the number of items `n` to be able to provided
     * correct pluralized forms of translations.
     */
    runLabel?: (n: number) => string;

    /**
     * Return the caption associated to the `runAll` function.
     *
     * This function receives the number of items `n` to be able to provided
     * correct pluralized forms of translations.
     */
    runAllCaption?: (n: number) => string;

    /**
     * Return the label associated to the `runAll` function.
     *
     * This function receives the number of items `n` to be able to provided
     * correct pluralized forms of translations.
     */
    runAllLabel?: (n: number) => string;

    /**
     * Return the caption associated to the `restartAndRunAll` function.
     *
     * This function receives the number of items `n` to be able to provided
     * correct pluralized forms of translations.
     */
    restartAndRunAllCaption?: (n: number) => string;

    /**
     * Return the label associated to the `restartAndRunAll` function.
     *
     * This function receives the number of items `n` to be able to provided
     * correct pluralized forms of translations.
     */
    restartAndRunAllLabel?: (n: number) => string;

    /**
     * A function to run a chunk of code.
     */
    run?: (widget: T) => Promise<void>;

    /**
     * A function to run the entirety of the code hosted by the widget.
     */
    runAll?: (widget: T) => Promise<void>;

    /**
     * A function to restart and run all the code hosted by the widget, which
     * returns a promise of whether the action was performed.
     */
    restartAndRunAll?: (widget: T) => Promise<boolean>;
  }
}
