// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IIterator, find, map, some } from '@phosphor/algorithm';

import { CommandRegistry } from '@phosphor/commands';

import { Message, MessageLoop } from '@phosphor/messaging';

import { AttachedProperty } from '@phosphor/properties';

import { PanelLayout, Widget } from '@phosphor/widgets';

import { IClientSession } from './clientsession';

import { Styling } from './styling';

/**
 * The class name added to toolbars.
 */
const TOOLBAR_CLASS = 'jp-Toolbar';

/**
 * The class name added to toolbar items.
 */
const TOOLBAR_ITEM_CLASS = 'jp-Toolbar-item';

/**
 * The class name added to toolbar buttons.
 */
const TOOLBAR_BUTTON_CLASS = 'jp-Toolbar-button';

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
 * The class name added to a busy kernel indicator.
 */
const TOOLBAR_BUSY_CLASS = 'jp-FilledCircleIcon';

const TOOLBAR_IDLE_CLASS = 'jp-CircleIcon';

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
    let layout = this.layout as ToolbarLayout;
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
    let layout = this.layout as ToolbarLayout;
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
    let existing = find(this.names(), value => value === name);
    if (existing) {
      return false;
    }
    widget.addClass(TOOLBAR_ITEM_CLASS);
    let layout = this.layout as ToolbarLayout;
    layout.insertWidget(index, widget);
    Private.nameProperty.set(widget, name);
    return true;
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
        if (!this.node.contains(document.activeElement) && this.parent) {
          this.parent.activate();
        }
        break;
      default:
        break;
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
   * Create a toolbar item for a command or `null` if the command does not exist
   * in the registry.
   *
   * Notes:
   * If the command has an icon label it will be added to the button.
   * If there is no icon label, and no icon class, the main label will
   * be added.
   */
  export function createFromCommand(
    commands: CommandRegistry,
    id: string
  ): ToolbarButton | null {
    if (!commands.hasCommand(id)) {
      return null;
    }

    const button = new ToolbarButton({
      onClick: () => {
        commands.execute(id);
        button.node.blur();
      },
      className: Private.commandClassName(commands, id),
      tooltip: Private.commandTooltip(commands, id)
    });
    let oldClasses = Private.commandClassName(commands, id).split(/\s/);

    (button.node as HTMLButtonElement).disabled = !commands.isEnabled(id);
    // Private.setNodeContentFromCommand(button.node, commands, id);

    // Ensure that we pick up relevant changes to the command:
    function onChange(
      sender: CommandRegistry,
      args: CommandRegistry.ICommandChangedArgs
    ) {
      if (args.id !== id) {
        return; // Not our command
      }

      if (args.type === 'removed') {
        // Dispose of button
        button.dispose();
        return;
      }

      if (args.type !== 'changed') {
        return;
      }

      // Update all fields (onClick is already indirected)
      const newClasses = Private.commandClassName(sender, id).split(/\s/);

      for (let cls of oldClasses) {
        if (cls && newClasses.indexOf(cls) === -1) {
          (button.node.firstChild as HTMLElement).classList.remove(cls);
        }
      }
      for (let cls of newClasses) {
        if (cls && oldClasses.indexOf(cls) === -1) {
          (button.node.firstChild as HTMLElement).classList.add(cls);
        }
      }
      oldClasses = newClasses;
      button.node.title = Private.commandTooltip(sender, id);
      // Private.setNodeContentFromCommand(button.node, sender, id);
      (button.node as HTMLButtonElement).disabled = !sender.isEnabled(id);
    }
    commands.commandChanged.connect(onChange, button);

    return button;
  }

  /**
   * Create an interrupt toolbar item.
   */
  export function createInterruptButton(
    session: IClientSession
  ): ToolbarButton {
    return new ToolbarButton({
      className: 'jp-StopIcon jp-Icon jp-Icon-16',
      onClick: () => {
        if (session.kernel) {
          session.kernel.interrupt();
        }
      },
      tooltip: 'Interrupt the kernel'
    });
  }

  /**
   * Create a restart toolbar item.
   */
  export function createRestartButton(session: IClientSession): ToolbarButton {
    return new ToolbarButton({
      className: 'jp-RefreshIcon jp-Icon jp-Icon-16',
      onClick: () => {
        session.restart();
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
   * It will display the `'display_name`' of the current kernel,
   * or `'No Kernel!'` if there is no kernel.
   * It can handle a change in context or kernel.
   */
  export function createKernelNameItem(session: IClientSession): ToolbarButton {
    return new Private.KernelName(session);
  }

  /**
   * Create a kernel status indicator item.
   *
   * #### Notes
   * It show display a busy status if the kernel status is
   * not idle.
   * It will show the current status in the node title.
   * It can handle a change to the context or the kernel.
   */
  export function createKernelStatusItem(session: IClientSession): Widget {
    return new Private.KernelStatus(session);
  }
}

/**
 * A widget which acts as a button in a toolbar.
 */
export class ToolbarButton extends Widget {
  /**
   * Construct a new toolbar button.
   */
  constructor(options: ToolbarButton.IOptions = {}) {
    super({ node: Private.createToolbarButtonContent(options.className) });
    Styling.styleNodeByTag(this.node, 'button');
    this.addClass(TOOLBAR_BUTTON_CLASS);
    this._onClick = options.onClick || Private.noOp;

    // const classes = options.className
    //   ? options.className
    //       .trim()
    //       .replace(/\s{2,}/g, ' ')
    //       .split(/\s/)
    //   : null;

    // if (classes) {
    //   classes.forEach(name => {
    //     this.addClass(name);
    //   });
    // }

    this.node.title = options.tooltip || '';
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
        if ((event as MouseEvent).button === 0) {
          this._onClick();
        }
        break;
      default:
        break;
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

  private _onClick: () => void;
}

/**
 * A namespace for `ToolbarButton` statics.
 */
export namespace ToolbarButton {
  /**
   * The options used to construct a toolbar button.
   */
  export interface IOptions {
    /**
     * The callback for a click event.
     */
    onClick?: () => void;

    /**
     * The class name added to the button.
     */
    className?: string;

    /**
     * The tooltip added to the button node.
     */
    tooltip?: string;
  }
}

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * Create the DOM node for the ToolbarButton
   */
  export function createToolbarButtonContent(className?: string): HTMLElement {
    let b = document.createElement('button');
    let s = document.createElement('span');
    if (className) {
      s.className = className;
    }
    b.appendChild(s);
    return b;
  }

  /**
   * An attached property for the name of a toolbar item.
   */
  export const nameProperty = new AttachedProperty<Widget, string>({
    name: 'name',
    create: () => ''
  });

  /**
   * ToolbarButton tooltip formatter for a command.
   */
  export function commandTooltip(
    commands: CommandRegistry,
    id: string
  ): string {
    return commands.caption(id);
  }

  /**
   * A no-op function.
   */
  export function noOp() {
    /* no-op */
  }

  /**
   * Get the class names for a command based ToolBarButton
   */
  export function commandClassName(
    commands: CommandRegistry,
    id: string
  ): string {
    let name = commands.className(id);
    // Add the boolean state classes.
    if (commands.isToggled(id)) {
      name += ' p-mod-toggled';
    }
    if (!commands.isVisible(id)) {
      name += ' p-mod-hidden';
    }
    return (name += 'jp-Icon jp-Icon-16');
  }

  /**
   * Fill the node of a command based ToolBarButton.
   */
  export function setNodeContentFromCommand(
    node: HTMLElement,
    commands: CommandRegistry,
    id: string
  ): void {
    const iconClass = commands.iconClass(id);
    const iconLabel = commands.iconLabel(id);
    const label = commands.label(id);

    if (iconClass) {
      (node.firstChild as HTMLElement).className += ` ${iconClass}`;
      node.setAttribute('title', iconLabel || label);
    } else {
      node.innerText = label;
    }
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
   * A kernel name widget.
   */
  export class KernelName extends ToolbarButton {
    /**
     * Construct a new kernel name widget.
     */
    constructor(session: IClientSession) {
      super({
        className: TOOLBAR_KERNEL_NAME_CLASS,
        onClick: () => {
          session.selectKernel();
        },
        tooltip: 'Switch kernel'
      });
      this._onKernelChanged(session);
      session.kernelChanged.connect(this._onKernelChanged, this);
    }

    /**
     * Update the text of the kernel name item.
     */
    private _onKernelChanged(session: IClientSession): void {
      this.node.textContent = session.kernelDisplayName;
    }
  }

  /**
   * A toolbar item that displays kernel status.
   */
  export class KernelStatus extends Widget {
    /**
     * Construct a new kernel status widget.
     */
    constructor(session: IClientSession) {
      super();
      this.addClass(TOOLBAR_KERNEL_STATUS_CLASS);
      this._onStatusChanged(session);
      session.statusChanged.connect(this._onStatusChanged, this);
    }

    /**
     * Handle a status on a kernel.
     */
    private _onStatusChanged(session: IClientSession) {
      if (this.isDisposed) {
        return;
      }
      let status = session.status;
      this.toggleClass(TOOLBAR_IDLE_CLASS, status === 'idle');
      this.toggleClass(TOOLBAR_BUSY_CLASS, status !== 'idle');
      let title = 'Kernel ' + status[0].toUpperCase() + status.slice(1);
      this.node.title = title;
    }
  }
}
