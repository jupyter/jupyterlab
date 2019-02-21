// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IDisposable } from '@phosphor/disposable';

/**
 * A class that wraps an asynchronous function to poll at a regular interval
 * with exponential increases to the interval length if the poll fails.
 */
export class Poll implements IDisposable {
  /**
   * Instantiate a new poll with exponential back-off in case of failure.
   *
   * @param options - The poll instantiation options.
   */
  constructor(options: Poll.IOptions) {
    const { interval, max, poll } = options;

    if (interval > max) {
      throw new Error('Poll interval cannot exceed max interval length');
    }

    // Cache the original interval length and start polling.
    this._interval = interval;
    this._poll(poll, interval, max);
  }

  /**
   * Whether the poll is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose the poll, stop executing future poll requests.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
  }

  /**
   * Schedule a poll request.
   */
  private _poll(poll: () => Promise<any>, interval: number, max: number): void {
    setTimeout(async () => {
      if (this._isDisposed) {
        return;
      }

      // Only execute promise if not in a hidden tab.
      if (typeof document === 'undefined' || !document.hidden) {
        try {
          await poll();
          interval = this._interval;
        } catch (error) {
          const old = interval;
          interval = Math.min(old * 2, max);
          console.warn(`Poll error, raise interval from ${old} to ${interval}`);
        }
      }

      this._poll(poll, interval, max);
    }, interval);
  }

  private _interval: number;
  private _isDisposed = false;
}

export namespace Poll {
  /**
   * Instantiation options for polls.
   */
  export interface IOptions {
    /**
     * The millisecond interval between poll requests.
     */
    interval: number;

    /**
     * The maximum interval to wait between failing poll requests.
     */
    max: number;

    /**
     * A function that returns a poll promise.
     */
    poll: () => Promise<any>;
  }
}
