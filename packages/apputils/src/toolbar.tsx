// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Text } from '@jupyterlab/coreutils';
import {
  Button,
  circleCrossIcon,
  circleEmptyIcon,
  circleTickIcon,
  classes,
  LabIcon,
  refreshIcon,
  stopIcon
} from '@jupyterlab/ui-components';

import { IIterator, find, map, some } from '@lumino/algorithm';
import { CommandRegistry } from '@lumino/commands';
import { ReadonlyJSONObject } from '@lumino/coreutils';
import { Message, MessageLoop } from '@lumino/messaging';
import { AttachedProperty } from '@lumino/properties';
import { PanelLayout, Widget } from '@lumino/widgets';
import * as React from 'react';

import { ISessionContext, sessionContextDialogs } from './sessioncontext';
import { UseSignal, ReactWidget } from './vdom';

/**
 * The class name added to toolbars.
 */
const TOOLBAR_CLASS = 'jp-Toolbar';

/**
 * The class name added to toolbar items.
 */
const TOOLBAR_ITEM_CLASS = 'jp-Toolbar-item';

/**
 * The class name added to toolbar kernel name text.
 */
const TOOLBAR_KERNEL_NAME_CLASS = 'jp-Toolbar-kernelName';

/**
 * The class name added to toolbar spacer.
 */
const TOOLBAR_SPACER_CLASS = 'jp-Toolbar-spacer';

/**
 * The class name added to toolbar kernel status icon.
 */
const TOOLBAR_KERNEL_STATUS_CLASS = 'jp-Toolbar-kernelStatus';

/**
 * A layout for toolbars.
 *
 * #### Notes
 * This layout automatically collapses its height if there are no visible
 * toolbar widgets, and expands to the standard toolbar height if there are
 * visible toolbar widgets.
 */
class ToolbarLayout extends PanelLayout {
  /**
   * A message handler invoked on a `'fit-request'` message.
   *
   * If any child widget is visible, expand the toolbar height to the normal
   * toolbar height.
   */
  protected onFitRequest(msg: Message): void {
    super.onFitRequest(msg);
    if (this.parent!.isAttached) {
      // If there are any widgets not explicitly hidden, expand the toolbar to
      // accommodate them.
      if (some(this.widgets, w => !w.isHidden)) {
        this.parent!.node.style.minHeight = 'var(--jp-private-toolbar-height)';
      } else {
        this.parent!.node.style.minHeight = '';
      }
    }

    // Set the dirty flag to ensure only a single update occurs.
    this._dirty = true;

    // Notify the ancestor that it should fit immediately. This may
    // cause a resize of the parent, fulfilling the required update.
    if (this.parent!.parent) {
      MessageLoop.sendMessage(this.parent!.parent!, Widget.Msg.FitRequest);
    }

    // If the dirty flag is still set, the parent was not resized.
    // Trigger the required update on the parent widget immediately.
    if (this._dirty) {
      MessageLoop.sendMessage(this.parent!, Widget.Msg.UpdateRequest);
    }
  }

  /**
   * A message handler invoked on an `'update-request'` message.
   */
  protected onUpdateRequest(msg: Message): void {
    super.onUpdateRequest(msg);
    if (this.parent!.isVisible) {
      this._dirty = false;
    }
  }

  /**
   * A message handler invoked on a `'child-shown'` message.
   */
  protected onChildShown(msg: Widget.ChildMessage): void {
    super.onChildShown(msg);

    // Post a fit request for the parent widget.
    this.parent!.fit();
  }

  /**
   * A message handler invoked on a `'child-hidden'` message.
   */
  protected onChildHidden(msg: Widget.ChildMessage): void {
    super.onChildHidden(msg);

    // Post a fit request for the parent widget.
    this.parent!.fit();
  }

  /**
   * A message handler invoked on a `'before-attach'` message.
   */
  protected onBeforeAttach(msg: Message): void {
    super.onBeforeAttach(msg);

    // Post a fit request for the parent widget.
    this.parent!.fit();
  }

  /**
   * Attach a widget to the parent's DOM node.
   *
   * @param index - The current index of the widget in the layout.
   *
   * @param widget - The widget to attach to the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  protected attachWidget(index: number, widget: Widget): void {
    super.attachWidget(index, widget);

    // Post a fit request for the parent widget.
    this.parent!.fit();
  }

  /**
   * Detach a widget from the parent's DOM node.
   *
   * @param index - The previous index of the widget in the layout.
   *
   * @param widget - The widget to detach from the parent.
   *
   * #### Notes
   * This is a reimplementation of the superclass method.
   */
  protected detachWidget(index: number, widget: Widget): void {
    super.detachWidget(index, widget);

    // Post a fit request for the parent widget.
    this.parent!.fit();
  }

  private _dirty = false;
}

/**
 * A class which provides a toolbar widget.
 */
export class Toolbar<T extends Widget = Widget> extends Widget {
  /**
   * Construct a new toolbar widget.
   */
  constructor() {
    super();
    this.addClass(TOOLBAR_CLASS);
    this.layout = new ToolbarLayout();
  }

  /**
   * Get an iterator over the ordered toolbar item names.
   *
   * @returns An iterator over the toolbar item names.
   */
  names(): IIterator<string> {
    const layout = this.layout as ToolbarLayout;
    return map(layout.widgets, widget => {
      return Private.nameProperty.get(widget);
    });
  }

  /**
   * Add an item to the end of the toolbar.
   *
   * @param name - The name of the widget to add to the toolbar.
   *
   * @param widget - The widget to add to the toolbar.
   *
   * @param index - The optional name of the item to insert after.
   *
   * @returns Whether the item was added to toolbar.  Returns false if
   *   an item of the same name is already in the toolbar.
   *
   * #### Notes
   * The item can be removed from the toolbar by setting its parent to `null`.
   */
  addItem(name: string, widget: T): boolean {
    const layout = this.layout as ToolbarLayout;
    return this.insertItem(layout.widgets.length, name, widget);
  }

  /**
   * Insert an item into the toolbar at the specified index.
   *
   * @param index - The index at which to insert the item.
   *
   * @param name - The name of the item.
   *
   * @param widget - The widget to add.
   *
   * @returns Whether the item was added to the toolbar. Returns false if
   *   an item of the same name is already in the toolbar.
   *
   * #### Notes
   * The index will be clamped to the bounds of the items.
   * The item can be removed from the toolbar by setting its parent to `null`.
   */
  insertItem(index: number, name: string, widget: T): boolean {
    const existing = find(this.names(), value => value === name);
    if (existing) {
      return false;
    }
    widget.addClass(TOOLBAR_ITEM_CLASS);
    const layout = this.layout as ToolbarLayout;
    layout.insertWidget(index, widget);
    Private.nameProperty.set(widget, name);
    return true;
  }

  /**
   * Insert an item into the toolbar at the after a target item.
   *
   * @param at - The target item to insert after.
   *
   * @param name - The name of the item.
   *
   * @param widget - The widget to add.
   *
   * @returns Whether the item was added to the toolbar. Returns false if
   *   an item of the same name is already in the toolbar.
   *
   * #### Notes
   * The index will be clamped to the bounds of the items.
   * The item can be removed from the toolbar by setting its parent to `null`.
   */
  insertAfter(at: string, name: string, widget: T): boolean {
    return this._insertRelative(at, 1, name, widget);
  }

  /**
   * Insert an item into the toolbar at the before a target item.
   *
   * @param at - The target item to insert before.
   *
   * @param name - The name of the item.
   *
   * @param widget - The widget to add.
   *
   * @returns Whether the item was added to the toolbar. Returns false if
   *   an item of the same name is already in the toolbar.
   *
   * #### Notes
   * The index will be clamped to the bounds of the items.
   * The item can be removed from the toolbar by setting its parent to `null`.
   */
  insertBefore(at: string, name: string, widget: T): boolean {
    return this._insertRelative(at, 0, name, widget);
  }

  private _insertRelative(
    at: string,
    offset: number,
    name: string,
    widget: T
  ): boolean {
    const nameWithIndex = map(this.names(), (name, i) => {
      return { name: name, index: i };
    });
    const target = find(nameWithIndex, x => x.name === at);
    if (target) {
      return this.insertItem(target.index + offset, name, widget);
    }
    return false;
  }

  /**
   * Handle the DOM events for the widget.
   *
   * @param event - The DOM event sent to the widget.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the dock panel's node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    switch (event.type) {
      case 'click':
        this.handleClick(event);
        break;
      default:
        break;
    }
  }

  /**
   * Handle a DOM click event.
   */
  protected handleClick(event: Event) {
    // Clicking a label focuses the corresponding control
    // that is linked with `for` attribute, so let it be.
    if (event.target instanceof HTMLLabelElement) {
      const forId = event.target.getAttribute('for');
      if (forId && this.node.querySelector(`#${forId}`)) {
        return;
      }
    }

    // If this click already focused a control, let it be.
    if (this.node.contains(document.activeElement)) {
      return;
    }

    // Otherwise, activate the parent widget, which may take focus if desired.
    if (this.parent) {
      this.parent.activate();
    }
  }

  /**
   * Handle `after-attach` messages for the widget.
   */
  protected onAfterAttach(msg: Message): void {
    this.node.addEventListener('click', this);
  }

  /**
   * Handle `before-detach` messages for the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    this.node.removeEventListener('click', this);
  }
}

/**
 * The namespace for Toolbar class statics.
 */
export namespace Toolbar {
  /**
   * Create an interrupt toolbar item.
   */
  export function createInterruptButton(
    sessionContext: ISessionContext
  ): Widget {
    return new ToolbarButton({
      icon: stopIcon,
      onClick: () => {
        void sessionContext.session?.kernel?.interrupt();
      },
      tooltip: 'Interrupt the kernel'
    });
  }

  /**
   * Create a restart toolbar item.
   */
  export function createRestartButton(
    sessionContext: ISessionContext,
    dialogs?: ISessionContext.IDialogs
  ): Widget {
    return new ToolbarButton({
      icon: refreshIcon,
      onClick: () => {
        void (dialogs ?? sessionContextDialogs).restart(sessionContext);
      },
      tooltip: 'Restart the kernel'
    });
  }

  /**
   * Create a toolbar spacer item.
   *
   * #### Notes
   * It is a flex spacer that separates the left toolbar items
   * from the right toolbar items.
   */
  export function createSpacerItem(): Widget {
    return new Private.Spacer();
  }

  /**
   * Create a kernel name indicator item.
   *
   * #### Notes
   * It will display the `'display_name`' of the session context. It can
   * handle a change in context or kernel.
   */
  export function createKernelNameItem(
    sessionContext: ISessionContext,
    dialogs?: ISessionContext.IDialogs
  ): Widget {
    const el = ReactWidget.create(
      <Private.KernelNameComponent
        sessionContext={sessionContext}
        dialogs={dialogs ?? sessionContextDialogs}
      />
    );
    el.addClass('jp-KernelName');
    return el;
  }

  /**
   * Create a kernel status indicator item.
   *
   * #### Notes
   * It will show a busy status if the kernel status is busy.
   * It will show the current status in the node title.
   * It can handle a change to the context or the kernel.
   */
  export function createKernelStatusItem(
    sessionContext: ISessionContext
  ): Widget {
    return new Private.KernelStatus(sessionContext);
  }
}

/**
 * Namespace for ToolbarButtonComponent.
 */
export namespace ToolbarButtonComponent {
  /**
   * Interface for ToolbarButttonComponent props.
   */
  export interface IProps {
    className?: string;
    label?: string;
    icon?: LabIcon.IMaybeResolvable;
    iconClass?: string;
    iconLabel?: string;
    tooltip?: string;
    onClick?: () => void;
    enabled?: boolean;
  }
}

/**
 * React component for a toolbar button.
 *
 * @param props - The props for ToolbarButtonComponent.
 */
export function ToolbarButtonComponent(props: ToolbarButtonComponent.IProps) {
  // In some browsers, a button click event moves the focus from the main
  // content to the button (see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button#Clicking_and_focus).
  // We avoid a click event by calling preventDefault in mousedown, and
  // we bind the button action to `mousedown`.
  const handleMouseDown = (event: React.MouseEvent) => {
    // Fire action only when left button is pressed.
    if (event.button === 0) {
      event.preventDefault();
      props.onClick?.();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const { key } = event;
    if (key === 'Enter' || key === ' ') {
      props.onClick?.();
    }
  };

  return (
    <Button
      className={
        props.className
          ? props.className + ' jp-ToolbarButtonComponent'
          : 'jp-ToolbarButtonComponent'
      }
      disabled={props.enabled === false}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      title={props.tooltip || props.iconLabel}
      minimal
    >
      {(props.icon || props.iconClass) && (
        <LabIcon.resolveReact
          icon={props.icon}
          iconClass={
            // add some extra classes for proper support of icons-as-css-backgorund
            classes(props.iconClass, 'jp-Icon')
          }
          className="jp-ToolbarButtonComponent-icon"
          tag="span"
          stylesheet="toolbarButton"
        />
      )}
      {props.label && (
        <span className="jp-ToolbarButtonComponent-label">{props.label}</span>
      )}
    </Button>
  );
}

/**
 * Adds the toolbar button class to the toolbar widget.
 * @param w Toolbar button widget.
 */
export function addToolbarButtonClass(w: Widget): Widget {
  w.addClass('jp-ToolbarButton');
  return w;
}

/**
 * Phosphor Widget version of static ToolbarButtonComponent.
 */
export class ToolbarButton extends ReactWidget {
  /**
   * Creates a toolbar button
   * @param props props for underlying `ToolbarButton` componenent
   */
  constructor(private props: ToolbarButtonComponent.IProps = {}) {
    super();
    addToolbarButtonClass(this);
  }
  render() {
    return <ToolbarButtonComponent {...this.props} />;
  }
}

/**
 * Namespace for CommandToolbarButtonComponent.
 */
export namespace CommandToolbarButtonComponent {
  /**
   * Interface for CommandToolbarButtonComponent props.
   */
  export interface IProps {
    commands: CommandRegistry;
    id: string;
    args?: ReadonlyJSONObject;
  }
}

/**
 * React component for a toolbar button that wraps a command.
 *
 * This wraps the ToolbarButtonComponent and watches the command registry
 * for changes to the command.
 */
export function CommandToolbarButtonComponent(
  props: CommandToolbarButtonComponent.IProps
) {
  return (
    <UseSignal
      signal={props.commands.commandChanged}
      shouldUpdate={(sender, args) =>
        (args.id === props.id && args.type === 'changed') ||
        args.type === 'many-changed'
      }
    >
      {() => <ToolbarButtonComponent {...Private.propsFromCommand(props)} />}
    </UseSignal>
  );
}

/*
 * Adds the command toolbar button class to the command toolbar widget.
 * @param w Command toolbar button widget.
 */
export function addCommandToolbarButtonClass(w: Widget): Widget {
  w.addClass('jp-CommandToolbarButton');
  return w;
}

/**
 * Phosphor Widget version of CommandToolbarButtonComponent.
 */
export class CommandToolbarButton extends ReactWidget {
  /**
   * Creates a command toolbar button
   * @param props props for underlying `CommandToolbarButtonComponent` componenent
   */
  constructor(private props: CommandToolbarButtonComponent.IProps) {
    super();
    addCommandToolbarButtonClass(this);
  }
  render() {
    return <CommandToolbarButtonComponent {...this.props} />;
  }
}

/**
 * A namespace for private data.
 */
namespace Private {
  export function propsFromCommand(
    options: CommandToolbarButtonComponent.IProps
  ): ToolbarButtonComponent.IProps {
    const { commands, id, args } = options;

    const iconClass = commands.iconClass(id, args);
    const iconLabel = commands.iconLabel(id, args);
    // DEPRECATED: remove _icon when lumino 2.0 is adopted
    // if icon is aliasing iconClass, don't use it
    const _icon = commands.icon(id, args);
    const icon = _icon === iconClass ? undefined : _icon;

    const label = commands.label(id, args);
    let className = commands.className(id, args);
    // Add the boolean state classes.
    if (commands.isToggled(id, args)) {
      className += ' lm-mod-toggled';
    }
    if (!commands.isVisible(id, args)) {
      className += ' lm-mod-hidden';
    }
    const tooltip = commands.caption(id, args) || label || iconLabel;
    const onClick = () => {
      void commands.execute(id, args);
    };
    const enabled = commands.isEnabled(id, args);

    return { className, icon, iconClass, tooltip, onClick, enabled, label };
  }

  /**
   * An attached property for the name of a toolbar item.
   */
  export const nameProperty = new AttachedProperty<Widget, string>({
    name: 'name',
    create: () => ''
  });

  /**
   * A no-op function.
   */
  export function noOp() {
    /* no-op */
  }

  /**
   * A spacer widget.
   */
  export class Spacer extends Widget {
    /**
     * Construct a new spacer widget.
     */
    constructor() {
      super();
      this.addClass(TOOLBAR_SPACER_CLASS);
    }
  }

  /**
   * Namespace for KernelNameComponent.
   */
  export namespace KernelNameComponent {
    /**
     * Interface for KernelNameComponent props.
     */
    export interface IProps {
      sessionContext: ISessionContext;
      dialogs: ISessionContext.IDialogs;
    }
  }

  /**
   * React component for a kernel name button.
   *
   * This wraps the ToolbarButtonComponent and watches the kernel
   * session for changes.
   */

  export function KernelNameComponent(props: KernelNameComponent.IProps) {
    const callback = () => {
      void props.dialogs.selectKernel(props.sessionContext);
    };
    return (
      <UseSignal
        signal={props.sessionContext.kernelChanged}
        initialSender={props.sessionContext}
      >
        {sessionContext => (
          <ToolbarButtonComponent
            className={TOOLBAR_KERNEL_NAME_CLASS}
            onClick={callback}
            tooltip={'Switch kernel'}
            label={sessionContext?.kernelDisplayName}
          />
        )}
      </UseSignal>
    );
  }

  /**
   * A toolbar item that displays kernel status.
   */
  export class KernelStatus extends Widget {
    /**
     * Construct a new kernel status widget.
     */
    constructor(sessionContext: ISessionContext) {
      super();
      this.addClass(TOOLBAR_KERNEL_STATUS_CLASS);
      this._onStatusChanged(sessionContext);
      sessionContext.statusChanged.connect(this._onStatusChanged, this);
    }

    /**
     * Handle a status on a kernel.
     */
    private _onStatusChanged(sessionContext: ISessionContext) {
      if (this.isDisposed) {
        return;
      }

      let icon: LabIcon;
      const connection_status = sessionContext.kernelConnectionStatus;

      if (connection_status === undefined) {
        icon = circleEmptyIcon;
      } else if (connection_status === 'connected') {
        icon = circleTickIcon;
      } else {
        icon = circleCrossIcon;
      }

      // set the icon
      icon.element({
        container: this.node,
        title: `Kernel ${Text.titleCase(sessionContext.kernelDisplayStatus)}`,

        stylesheet: 'toolbarButton'
      });
    }
  }
}
