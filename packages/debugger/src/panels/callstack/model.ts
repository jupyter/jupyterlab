// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ISignal, Signal } from '@lumino/signaling';

import { IDebugger } from '../../tokens';

/**
 * A model for a callstack.
 */
export class CallstackModel implements IDebugger.Model.ICallstack {
  /**
   * Get all the frames.
   */
  get frames(): IDebugger.IStackFrame[] {
    return this._state;
  }

  /**
   * Set the frames.
   */
  set frames(newFrames: IDebugger.IStackFrame[]) {
    this._state = newFrames;
    const currentFrameId =
      this.frame !== null ? Private.getFrameId(this.frame) : '';
    const frame = newFrames.find(
      frame => Private.getFrameId(frame) === currentFrameId
    );
    // Default to the first frame if the previous one can't be found.
    // Otherwise keep the current frame selected.
    if (!frame) {
      this.frame = newFrames[0];
    }
    this._framesChanged.emit(newFrames);
  }

  /**
   * Get the current frame.
   */
  get frame(): IDebugger.IStackFrame | null {
    return this._currentFrame;
  }

  /**
   * Set the current frame.
   */
  set frame(frame: IDebugger.IStackFrame | null) {
    this._currentFrame = frame;
    this._currentFrameChanged.emit(frame);
  }

  /**
   * Signal emitted when the frames have changed.
   */
  get framesChanged(): ISignal<this, IDebugger.IStackFrame[]> {
    return this._framesChanged;
  }

  /**
   * Signal emitted when the current frame has changed.
   */
  get currentFrameChanged(): ISignal<this, IDebugger.IStackFrame | null> {
    return this._currentFrameChanged;
  }

  private _state: IDebugger.IStackFrame[] = [];
  private _currentFrame: IDebugger.IStackFrame | null = null;
  private _framesChanged = new Signal<this, IDebugger.IStackFrame[]>(this);
  private _currentFrameChanged = new Signal<this, IDebugger.IStackFrame | null>(
    this
  );
}

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * Construct an id for the given frame.
   *
   * @param frame The frame.
   */
  export function getFrameId(frame: IDebugger.IStackFrame): string {
    return `${frame?.source?.path}-${frame?.id}`;
  }
}
