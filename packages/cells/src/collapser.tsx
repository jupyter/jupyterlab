/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { ReactWidget } from '@jupyterlab/apputils';

import * as React from 'react';

import { Cell, CodeCell } from './widget';

/**
 * The CSS class added to all collapsers.
 */
const COLLAPSER_CLASS = 'jp-Collapser';

/**
 * The CSS class added to the collapser child.
 */
const COLLAPSER_CHILD_CLASS = 'jp-Collapser-child';

/**
 * The CSS class added to input collapsers.
 */
const INPUT_COLLAPSER = 'jp-InputCollapser';

/**
 * The CSS class added to output collapsers.
 */
const OUTPUT_COLLAPSER = 'jp-OutputCollapser';

/**
 * Abstract collapser base class.
 *
 * ### Notes
 * A collapser is a visible div to the left of a cell's
 * input/output that a user can click on to collapse the
 * input/output.
 */
export abstract class Collapser extends ReactWidget {
  /**
   * Construct a new collapser.
   */
  constructor() {
    super();
    this.addClass(COLLAPSER_CLASS);
    this.node.setAttribute('role', 'gridcell');
  }

  /**
   * Is the input/output of the parent collapsed.
   */
  get collapsed(): boolean {
    return false;
  }

  /**
   * Render the collapser with the virtual DOM.
   */
  protected render(): React.ReactElement<any> {
    let childClass = COLLAPSER_CHILD_CLASS;
    return <div className={childClass} onClick={e => this.handleClick(e)} />;
  }

  /**
   * Handle the click event.
   */
  protected abstract handleClick(e: React.MouseEvent<HTMLDivElement>): void;
}

/**
 * A collapser subclass to collapse a cell's input area.
 */
export class InputCollapser extends Collapser {
  /**
   * Construct a new input collapser.
   */
  constructor() {
    super();
    this.addClass(INPUT_COLLAPSER);
  }

  /**
   * Is the cell's input collapsed?
   */
  get collapsed(): boolean {
    let cell = this.parent?.parent as Cell | undefined | null;
    if (cell) {
      return cell.inputHidden;
    } else {
      return false;
    }
  }

  /**
   * Handle a click event for the user to collapse the cell's input.
   */
  protected handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    let cell = this.parent?.parent as Cell | undefined | null;
    if (cell) {
      cell.inputHidden = !cell.inputHidden;
    }
    /* We need this until we watch the cell state */
    this.update();
  }
}

/**
 * A collapser subclass to collapse a cell's output area.
 */
export class OutputCollapser extends Collapser {
  /**
   * Construct a new output collapser.
   */
  constructor() {
    super();
    this.addClass(OUTPUT_COLLAPSER);
    this.node.setAttribute('role', 'gridcell');
  }

  /**
   * Is the cell's output collapsed?
   */
  get collapsed(): boolean {
    let cell = this.parent?.parent as CodeCell | undefined | null;
    if (cell) {
      return cell.outputHidden;
    } else {
      return false;
    }
  }

  /**
   * Handle a click event for the user to collapse the cell's output.
   */
  protected handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    let cell = this.parent?.parent as CodeCell | undefined | null;
    if (cell) {
      cell.outputHidden = !cell.outputHidden;
    }
    /* We need this until we watch the cell state */
    this.update();
  }
}
