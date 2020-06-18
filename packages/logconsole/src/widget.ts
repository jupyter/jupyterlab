// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IChangedArgs } from '@jupyterlab/coreutils';

import * as nbformat from '@jupyterlab/nbformat';

import { OutputArea, IOutputPrompt } from '@jupyterlab/outputarea';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { Kernel, KernelMessage } from '@jupyterlab/services';

import { Message } from '@lumino/messaging';

import { ISignal, Signal } from '@lumino/signaling';

import { Widget, Panel, PanelLayout, StackedPanel } from '@lumino/widgets';

import { LogOutputModel, LoggerOutputAreaModel } from './logger';

import {
  ILogger,
  IContentChange,
  ILoggerRegistry,
  ILoggerRegistryChange,
  LogLevel,
  IStateChange
} from './tokens';

function toTitleCase(value: string) {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

/**
 * All severity levels, including an internal one for metadata.
 */
type FullLogLevel = LogLevel | 'metadata';

/**
 * Log console output prompt implementation
 */
class LogConsoleOutputPrompt extends Widget implements IOutputPrompt {
  constructor() {
    super();
    this._timestampNode = document.createElement('div');
    this.node.append(this._timestampNode);
  }

  /**
   * Date & time when output is logged.
   */
  set timestamp(value: Date) {
    this._timestamp = value;
    this._timestampNode.innerHTML = this._timestamp.toLocaleTimeString();
    this.update();
  }

  /**
   * Log level
   */
  set level(value: FullLogLevel) {
    this._level = value;
    this.node.dataset.logLevel = value;
    this.update();
  }

  update() {
    if (this._level !== undefined && this._timestamp !== undefined) {
      this.node.title = `${this._timestamp.toLocaleString()}; ${toTitleCase(
        this._level
      )} level`;
    }
  }

  /**
   * The execution count for the prompt.
   */
  executionCount: nbformat.ExecutionCount;

  private _timestamp: Date;
  private _level: FullLogLevel;
  private _timestampNode: HTMLDivElement;
}

/**
 * Output Area implementation displaying log outputs
 * with prompts showing log timestamps.
 */
class LogConsoleOutputArea extends OutputArea {
  /**
   * The rendermime instance used by the widget.
   */
  rendermime: IRenderMimeRegistry | null;
  /**
   * Output area model used by the widget.
   */
  readonly model: LoggerOutputAreaModel;

  /**
   * Customize the default IOutputPrompt instance.
   */
  protected createOutputPrompt(): IOutputPrompt {
    return new LogConsoleOutputPrompt();
  }

  /**
   * Create an output item with a prompt and actual output
   */
  protected createOutputItem(model: LogOutputModel): Widget | null {
    const panel = super.createOutputItem(model) as Panel;
    if (panel === null) {
      // Could not render model
      return null;
    }

    // first widget in panel is prompt of type LoggerOutputPrompt
    const prompt = panel.widgets[0] as LogConsoleOutputPrompt;
    prompt.timestamp = model.timestamp;
    prompt.level = model.level;
    return panel;
  }

  /**
   * Handle an input request from a kernel by doing nothing.
   */
  protected onInputRequest(
    msg: KernelMessage.IInputRequestMsg,
    future: Kernel.IShellFuture
  ): void {
    return;
  }
}

/**
 * Implements a panel which supports pinning the position to the end if it is
 * scrolled to the end.
 *
 * #### Notes
 * This is useful for log viewing components or chat components that append
 * elements at the end. We would like to automatically scroll when the user
 * has scrolled to the bottom, but not change the scrolling when the user has
 * changed the scroll position.
 */
export class ScrollingWidget<T extends Widget> extends Widget {
  constructor({ content, ...options }: ScrollingWidget.IOptions<T>) {
    super(options);
    this.addClass('jp-Scrolling');
    const layout = (this.layout = new PanelLayout());
    layout.addWidget(content);

    this._content = content;
    this._sentinel = document.createElement('div');
    this.node.appendChild(this._sentinel);
  }

  /**
   * The content widget.
   */
  get content(): T {
    return this._content;
  }

  protected onAfterAttach(msg: Message) {
    super.onAfterAttach(msg);
    // defer so content gets a chance to attach first
    requestAnimationFrame(() => {
      this._sentinel.scrollIntoView();
      this._scrollHeight = this.node.scrollHeight;
    });

    // Set up intersection observer for the sentinel
    if (typeof IntersectionObserver !== 'undefined') {
      this._observer = new IntersectionObserver(
        args => {
          this._handleScroll(args);
        },
        { root: this.node, threshold: 1 }
      );
      this._observer.observe(this._sentinel);
    }
  }

  protected onBeforeDetach(msg: Message) {
    if (this._observer) {
      this._observer.disconnect();
    }
  }

  protected onAfterShow(msg: Message) {
    if (this._tracking) {
      this._sentinel.scrollIntoView();
    }
  }

  private _handleScroll([entry]: IntersectionObserverEntry[]) {
    if (entry.isIntersecting) {
      this._tracking = true;
    } else if (this.isVisible) {
      const currentHeight = this.node.scrollHeight;
      if (currentHeight === this._scrollHeight) {
        // Likely the user scrolled manually
        this._tracking = false;
      } else {
        // We assume we scrolled because our size changed, so scroll to the end.
        this._sentinel.scrollIntoView();
        this._scrollHeight = currentHeight;
        this._tracking = true;
      }
    }
  }

  private _content: T;
  private _observer: IntersectionObserver | null = null;
  private _scrollHeight: number;
  private _sentinel: HTMLDivElement;
  private _tracking: boolean;
}

export namespace ScrollingWidget {
  export interface IOptions<T extends Widget> extends Widget.IOptions {
    content: T;
  }
}

/**
 * A StackedPanel implementation that creates Output Areas
 * for each log source and activates as source is switched.
 */
export class LogConsolePanel extends StackedPanel {
  /**
   * Construct a LogConsolePanel instance.
   *
   * @param loggerRegistry - The logger registry that provides
   * logs to be displayed.
   */
  constructor(loggerRegistry: ILoggerRegistry) {
    super();

    this._loggerRegistry = loggerRegistry;
    this.addClass('jp-LogConsolePanel');

    loggerRegistry.registryChanged.connect(
      (sender: ILoggerRegistry, args: ILoggerRegistryChange) => {
        this._bindLoggerSignals();
      },
      this
    );

    this._bindLoggerSignals();

    this._placeholder = new Widget();
    this._placeholder.addClass('jp-LogConsoleListPlaceholder');
    this.addWidget(this._placeholder);
  }

  /**
   * The logger registry providing the logs.
   */
  get loggerRegistry(): ILoggerRegistry {
    return this._loggerRegistry;
  }

  /**
   * The current logger.
   */
  get logger(): ILogger | null {
    if (this.source === null) {
      return null;
    }
    return this.loggerRegistry.getLogger(this.source);
  }

  /**
   * The log source displayed
   */
  get source(): string | null {
    return this._source;
  }
  set source(name: string | null) {
    if (name === this._source) {
      return;
    }
    const oldValue = this._source;
    const newValue = (this._source = name);
    this._showOutputFromSource(newValue);
    this._handlePlaceholder();
    this._sourceChanged.emit({ oldValue, newValue, name: 'source' });
  }

  /**
   * The source version displayed.
   */
  get sourceVersion(): number | null {
    const source = this.source;
    return source !== null
      ? this._loggerRegistry.getLogger(source).version
      : null;
  }

  /**
   * Signal for source changes
   */
  get sourceChanged(): ISignal<
    this,
    IChangedArgs<string | null, string | null, 'source'>
  > {
    return this._sourceChanged;
  }

  /**
   * Signal for source changes
   */
  get sourceDisplayed(): ISignal<this, ISourceDisplayed> {
    return this._sourceDisplayed;
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this._updateOutputAreas();
    this._showOutputFromSource(this._source);
    this._handlePlaceholder();
  }

  protected onAfterShow(msg: Message) {
    super.onAfterShow(msg);
    if (this.source !== null) {
      this._sourceDisplayed.emit({
        source: this.source,
        version: this.sourceVersion
      });
    }
  }

  private _bindLoggerSignals() {
    const loggers = this._loggerRegistry.getLoggers();
    for (const logger of loggers) {
      if (this._loggersWatched.has(logger.source)) {
        continue;
      }

      logger.contentChanged.connect((sender: ILogger, args: IContentChange) => {
        this._updateOutputAreas();
        this._handlePlaceholder();
      }, this);

      logger.stateChanged.connect((sender: ILogger, change: IStateChange) => {
        if (change.name !== 'rendermime') {
          return;
        }
        const viewId = `source:${sender.source}`;
        const outputArea = this._outputAreas.get(viewId);
        if (outputArea) {
          if (change.newValue) {
            outputArea.rendermime = change.newValue;
          } else {
            outputArea.dispose();
          }
        }
      }, this);

      this._loggersWatched.add(logger.source);
    }
  }

  private _showOutputFromSource(source: string | null) {
    // If the source is null, pick a unique name so all output areas hide.
    const viewId = source === null ? 'null source' : `source:${source}`;

    this._outputAreas.forEach(
      (outputArea: LogConsoleOutputArea, name: string) => {
        // Show/hide the output area parents, the scrolling windows.
        if (outputArea.id === viewId) {
          outputArea.parent?.show();
          if (outputArea.isVisible) {
            this._sourceDisplayed.emit({
              source: this.source,
              version: this.sourceVersion
            });
          }
        } else {
          outputArea.parent?.hide();
        }
      }
    );

    const title = source === null ? 'Log Console' : `Log: ${source}`;
    this.title.label = title;
    this.title.caption = title;
  }

  private _handlePlaceholder() {
    if (this.source === null) {
      this._placeholder.node.textContent = 'No source selected.';
      this._placeholder.show();
    } else if (this._loggerRegistry.getLogger(this.source).length === 0) {
      this._placeholder.node.textContent = 'No log messages.';
      this._placeholder.show();
    } else {
      this._placeholder.hide();
      this._placeholder.node.textContent = '';
    }
  }

  private _updateOutputAreas() {
    const loggerIds = new Set<string>();
    const loggers = this._loggerRegistry.getLoggers();

    for (const logger of loggers) {
      const source = logger.source;
      const viewId = `source:${source}`;
      loggerIds.add(viewId);

      // add view for logger if not exist
      if (!this._outputAreas.has(viewId)) {
        const outputArea = new LogConsoleOutputArea({
          rendermime: logger.rendermime,
          model: logger.outputAreaModel
        });
        outputArea.id = viewId;

        // Attach the output area so it is visible, so the accounting
        // functions below record the outputs actually displayed.
        const w = new ScrollingWidget({
          content: outputArea
        });
        this.addWidget(w);
        this._outputAreas.set(viewId, outputArea);

        // This is where the source object is associated with the output area.
        // We capture the source from this environment in the closure.
        const outputUpdate = (sender: LogConsoleOutputArea) => {
          // If the current log console panel source is the source associated
          // with this output area, and the output area is visible, then emit
          // the logConsolePanel source displayed signal.
          if (this.source === source && sender.isVisible) {
            // We assume that the output area has been updated to the current
            // version of the source.
            this._sourceDisplayed.emit({
              source: this.source,
              version: this.sourceVersion
            });
          }
        };
        // Notify messages were displayed any time the output area is updated
        // and update for any outputs rendered on construction.
        outputArea.outputLengthChanged.connect(outputUpdate, this);
        // Since the output area was attached above, we can rely on its
        // visibility to account for the messages displayed.
        outputUpdate(outputArea);
      }
    }

    // remove output areas that do not have corresponding loggers anymore
    const viewIds = this._outputAreas.keys();

    for (const viewId of viewIds) {
      if (!loggerIds.has(viewId)) {
        const outputArea = this._outputAreas.get(viewId);
        outputArea?.dispose();
        this._outputAreas.delete(viewId);
      }
    }
  }

  private _loggerRegistry: ILoggerRegistry;
  private _outputAreas = new Map<string, LogConsoleOutputArea>();
  private _source: string | null = null;
  private _sourceChanged = new Signal<
    this,
    IChangedArgs<string | null, string | null, 'source'>
  >(this);
  private _sourceDisplayed = new Signal<this, ISourceDisplayed>(this);
  private _placeholder: Widget;
  private _loggersWatched: Set<string> = new Set();
}

export interface ISourceDisplayed {
  source: string | null;
  version: number | null;
}
