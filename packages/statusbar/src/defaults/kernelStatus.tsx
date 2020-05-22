// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import React from 'react';

import { ISessionContext, VDomRenderer, VDomModel } from '@jupyterlab/apputils';

import { Text } from '@jupyterlab/coreutils';

import { Session, Kernel } from '@jupyterlab/services';

import { interactiveItem, TextItem } from '..';

import { JSONExt, JSONArray } from '@lumino/coreutils';

/**
 * A pure functional component for rendering kernel status.
 */
function KernelStatusComponent(
  props: KernelStatusComponent.IProps
): React.ReactElement<KernelStatusComponent.IProps> {
  let statusText = '';
  if (props.status) {
    statusText = ` | ${Text.titleCase(props.status)}`;
  }
  return (
    <TextItem
      onClick={props.handleClick}
      source={`${props.kernelName}${statusText}`}
      title={`Change kernel for ${props.activityName}`}
      className={props.classes.join(' ')}
    />
  );
}

/**
 * A namespace for KernelStatusComponent statics.
 */
namespace KernelStatusComponent {
  /**
   * Props for the kernel status component.
   */
  export interface IProps {
    /**
     * A click handler for the kernel status component. By default
     * we have it bring up the kernel change dialog.
     */
    handleClick: () => void;

    /**
     * The name the kernel.
     */
    kernelName: string;

    /**
     * The name of the activity using the kernel.
     */
    activityName: string;

    /**
     * The status of the kernel.
     */
    status?: string;

    /**
     * Style for the status line.
     */
    classes: string[];
  }
}

/**
 * A VDomRenderer widget for displaying the status of a kernel.
 */
export class KernelStatus extends VDomRenderer<KernelStatus.Model> {
  /**
   * Construct the kernel status widget.
   */
  constructor(opts: KernelStatus.IOptions) {
    super(new KernelStatus.Model());
    this._handleClick = opts.onClick;
    this.addClass(interactiveItem);
  }

  /**
   * Render the kernel status item.
   */
  render() {
    if (this.model === null) {
      return null;
    } else {
      return (
        <KernelStatusComponent
          status={this.model.status}
          kernelName={this.model.kernelName}
          activityName={this.model.activityName}
          handleClick={this._handleClick}
          classes={this.model.classes}
        />
      );
    }
  }

  private _handleClick: () => void;
}

/**
 * A namespace for KernelStatus statics.
 */
export namespace KernelStatus {
  /**
   * A VDomModel for the kernel status indicator.
   */
  export class Model extends VDomModel {
    /**
     * The name of the kernel.
     */
    get kernelName() {
      return this._kernelName;
    }

    /**
     * The current status of the kernel.
     */
    get status() {
      return this._kernelStatus;
    }

    /**
     * A display name for the activity.
     */
    get activityName(): string {
      return this._activityName;
    }
    set activityName(val: string) {
      const oldVal = this._activityName;
      if (oldVal === val) {
        return;
      }
      this._activityName = val;
      this.stateChanged.emit(void 0);
    }

    /**
     * extra classes to style the component.
     */
    get classes(): string[] {
      let extra_classes = [];
      if (typeof this.status === 'string') {
        if (
          this._CiriticalKernelStatus.includes(this.status as Kernel.Status)
        ) {
          extra_classes.push('kernel-status-critical');
        }
        if (this.status === 'connecting') {
          extra_classes.push('waiting-dots');
        }
      }
      return extra_classes;
    }

    /**
     * The current client session associated with the kernel status indicator.
     */
    get sessionContext(): ISessionContext | null {
      return this._sessionContext;
    }
    set sessionContext(sessionContext: ISessionContext | null) {
      this._sessionContext?.statusChanged.disconnect(
        this._onKernelStatusChanged
      );
      this._sessionContext?.kernelChanged.disconnect(this._onKernelChanged);

      const oldState = this._getAllState();
      this._sessionContext = sessionContext;
      this._kernelStatus = sessionContext?.kernelDisplayStatus;
      this._kernelName = sessionContext?.kernelDisplayName ?? 'No Kernel';
      sessionContext?.statusChanged.connect(this._onKernelStatusChanged, this);
      sessionContext?.connectionStatusChanged.connect(
        this._onKernelStatusChanged,
        this
      );
      sessionContext?.kernelChanged.connect(this._onKernelChanged, this);
      this._triggerChange(oldState, this._getAllState());
    }

    /**
     * React to changes to the kernel status.
     */
    private _onKernelStatusChanged = () => {
      this._kernelStatus = this._sessionContext?.kernelDisplayStatus;
      this.stateChanged.emit(void 0);
    };

    /**
     * React to changes in the kernel.
     */
    private _onKernelChanged = (
      _sessionContext: ISessionContext,
      change: Session.ISessionConnection.IKernelChangedArgs
    ) => {
      const oldState = this._getAllState();

      // sync setting of status and display name
      this._kernelStatus = this._sessionContext?.kernelDisplayStatus;
      this._kernelName = _sessionContext.kernelDisplayName;
      this._triggerChange(oldState, this._getAllState());
    };

    private _getAllState(): Private.State {
      return [this._kernelName, this._kernelStatus, this._activityName];
    }

    private _triggerChange(oldState: Private.State, newState: Private.State) {
      if (JSONExt.deepEqual(oldState as JSONArray, newState as JSONArray)) {
        this.stateChanged.emit(void 0);
      }
    }

    private _activityName: string = 'activity';
    private _kernelName: string = 'No Kernel!';
    private _kernelStatus: string | undefined = '';
    private _sessionContext: ISessionContext | null = null;
    private _CiriticalKernelStatus: ISessionContext.KernelDisplayStatus[] = [
      'disconnected',
      'connecting',
      'dead',
      'unknown'
    ];
  }

  /**
   * Options for creating a KernelStatus object.
   */
  export interface IOptions {
    /**
     * A click handler for the item. By default
     * we launch a kernel selection dialog.
     */
    onClick: () => void;
  }
}

namespace Private {
  export type State = [string, string | undefined, string];
}
