// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { isValidFileName } from '@jupyterlab/docmanager';
import { DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import {
  classes,
  DockPanelSvg,
  LabIcon,
  TabPanelSvg
} from '@jupyterlab/ui-components';
import { ArrayExt, find, IIterator, iter, toArray } from '@lumino/algorithm';
import { PromiseDelegate, Token } from '@lumino/coreutils';
import { IMessageHandler, Message, MessageLoop } from '@lumino/messaging';
import { Debouncer } from '@lumino/polling';
import { ISignal, Signal } from '@lumino/signaling';
import {
  BoxLayout,
  BoxPanel,
  DockLayout,
  DockPanel,
  FocusTracker,
  Panel,
  SplitPanel,
  StackedPanel,
  TabBar,
  TabPanel,
  Title,
  Widget
} from '@lumino/widgets';
import { JupyterFrontEnd } from './frontend';

/**
 * The class name added to AppShell instances.
 */
const APPLICATION_SHELL_CLASS = 'jp-LabShell';

/**
 * The class name added to side bar instances.
 */
const SIDEBAR_CLASS = 'jp-SideBar';

/**
 * The class name added to the current widget's title.
 */
const CURRENT_CLASS = 'jp-mod-current';

/**
 * The class name added to the active widget's title.
 */
const ACTIVE_CLASS = 'jp-mod-active';

/**
 * The default rank of items added to a sidebar.
 */
const DEFAULT_RANK = 900;

const ACTIVITY_CLASS = 'jp-Activity';

/**
 * The JupyterLab application shell token.
 */
export const ILabShell = new Token<ILabShell>(
  '@jupyterlab/application:ILabShell'
);

/**
 * The JupyterLab application shell interface.
 */
export interface ILabShell extends LabShell {}

/**
 * The namespace for `ILabShell` type information.
 */
export namespace ILabShell {
  /**
   * The areas of the application shell where widgets can reside.
   */
  export type Area =
    | 'main'
    | 'header'
    | 'top'
    | 'menu'
    | 'left'
    | 'right'
    | 'bottom'
    | 'down';

  /**
   * The restorable description of an area within the main dock panel.
   */
  export type AreaConfig = DockLayout.AreaConfig;

  /**
   * An options object for creating a lab shell object.
   */
  export type IOptions = {
    /**
     * The application language translator.
     */
    translator?: ITranslator;
  };

  /**
   * An arguments object for the changed signals.
   */
  export type IChangedArgs = FocusTracker.IChangedArgs<Widget>;

  /**
   * The args for the current path change signal.
   */
  export interface ICurrentPathChangedArgs {
    /**
     * The new value of the tree path, not including '/tree'.
     */
    oldValue: string;

    /**
     * The old value of the tree path, not including '/tree'.
     */
    newValue: string;
  }

  /**
   * A description of the application's user interface layout.
   */
  export interface ILayout {
    /**
     * Indicates whether fetched session restore data was actually retrieved
     * from the state database or whether it is a fresh blank slate.
     *
     * #### Notes
     * This attribute is only relevant when the layout data is retrieved via a
     * `fetch` call. If it is set when being passed into `save`, it will be
     * ignored.
     */
    readonly fresh?: boolean;

    /**
     * The main area of the user interface.
     */
    readonly mainArea: IMainArea | null;

    /**
     * The down area of the user interface.
     */
    readonly downArea: IDownArea | null;

    /**
     * The left area of the user interface.
     */
    readonly leftArea: ISideArea | null;

    /**
     * The right area of the user interface.
     */
    readonly rightArea: ISideArea | null;

    /**
     * The relatives sizes of the areas of the user interface.
     */
    readonly relativeSizes: number[] | null;
  }

  /**
   * The restorable description of the main application area.
   */
  export interface IMainArea {
    /**
     * The current widget that has application focus.
     */
    readonly currentWidget: Widget | null;

    /**
     * The contents of the main application dock panel.
     */
    readonly dock: DockLayout.ILayoutConfig | null;
  }

  export interface IDownArea {
    /**
     * The current widget that has down area focus.
     */
    readonly currentWidget: Widget | null;

    /**
     * The collection of widgets held by the panel.
     */
    readonly widgets: Array<Widget> | null;

    /**
     * Vertical relative size of the down area
     *
     * The main area will take the rest of the height
     */
    readonly size: number | null;
  }

  /**
   * The restorable description of a sidebar in the user interface.
   */
  export interface ISideArea {
    /**
     * A flag denoting whether the sidebar has been collapsed.
     */
    readonly collapsed: boolean;

    /**
     * The current widget that has side area focus.
     */
    readonly currentWidget: Widget | null;

    /**
     * A flag denoting whether the side tab bar is visible.
     */
    readonly visible: boolean;

    /**
     * The collection of widgets held by the sidebar.
     */
    readonly widgets: Array<Widget> | null;
  }
}

/**
 * The application shell for JupyterLab.
 */
export class LabShell extends Widget implements JupyterFrontEnd.IShell {
  /**
   * Construct a new application shell.
   */
  constructor(options?: ILabShell.IOptions) {
    super();
    this.addClass(APPLICATION_SHELL_CLASS);
    this.id = 'main';

    const trans = ((options && options.translator) || nullTranslator).load(
      'jupyterlab'
    );
    const headerPanel = (this._headerPanel = new BoxPanel());
    const menuHandler = (this._menuHandler = new Private.PanelHandler());
    menuHandler.panel.node.setAttribute('role', 'navigation');
    menuHandler.panel.node.setAttribute('aria-label', trans.__('main'));
    const topHandler = (this._topHandler = new Private.PanelHandler());
    topHandler.panel.node.setAttribute('role', 'banner');
    const bottomPanel = (this._bottomPanel = new BoxPanel());
    bottomPanel.node.setAttribute('role', 'contentinfo');
    const hboxPanel = new BoxPanel();
    const vsplitPanel = (this._vsplitPanel = new Private.RestorableSplitPanel());
    const dockPanel = (this._dockPanel = new DockPanelSvg());
    MessageLoop.installMessageHook(dockPanel, this._dockChildHook);

    const hsplitPanel = (this._hsplitPanel = new Private.RestorableSplitPanel());
    const downPanel = (this._downPanel = new TabPanelSvg({
      tabsMovable: true
    }));
    const leftHandler = (this._leftHandler = new Private.SideBarHandler());
    const rightHandler = (this._rightHandler = new Private.SideBarHandler());
    const rootLayout = new BoxLayout();

    headerPanel.id = 'jp-header-panel';
    menuHandler.panel.id = 'jp-menu-panel';
    topHandler.panel.id = 'jp-top-panel';
    bottomPanel.id = 'jp-bottom-panel';
    hboxPanel.id = 'jp-main-content-panel';
    vsplitPanel.id = 'jp-main-vsplit-panel';
    dockPanel.id = 'jp-main-dock-panel';
    hsplitPanel.id = 'jp-main-split-panel';
    downPanel.id = 'jp-down-stack';

    leftHandler.sideBar.addClass(SIDEBAR_CLASS);
    leftHandler.sideBar.addClass('jp-mod-left');
    leftHandler.sideBar.node.setAttribute(
      'aria-label',
      trans.__('main sidebar')
    );
    leftHandler.sideBar.contentNode.setAttribute(
      'aria-label',
      trans.__('main sidebar')
    );
    leftHandler.sideBar.node.setAttribute('role', 'complementary');
    leftHandler.stackedPanel.id = 'jp-left-stack';

    rightHandler.sideBar.addClass(SIDEBAR_CLASS);
    rightHandler.sideBar.addClass('jp-mod-right');
    rightHandler.sideBar.node.setAttribute(
      'aria-label',
      trans.__('alternate sidebar')
    );
    rightHandler.sideBar.contentNode.setAttribute(
      'aria-label',
      trans.__('alternate sidebar')
    );
    rightHandler.sideBar.node.setAttribute('role', 'complementary');
    rightHandler.stackedPanel.id = 'jp-right-stack';

    dockPanel.node.setAttribute('role', 'main');

    hboxPanel.spacing = 0;
    vsplitPanel.spacing = 1;
    dockPanel.spacing = 5;
    hsplitPanel.spacing = 1;

    headerPanel.direction = 'top-to-bottom';
    vsplitPanel.orientation = 'vertical';
    hboxPanel.direction = 'left-to-right';
    hsplitPanel.orientation = 'horizontal';
    bottomPanel.direction = 'bottom-to-top';

    SplitPanel.setStretch(leftHandler.stackedPanel, 0);
    SplitPanel.setStretch(downPanel, 0);
    SplitPanel.setStretch(dockPanel, 1);
    SplitPanel.setStretch(rightHandler.stackedPanel, 0);

    BoxPanel.setStretch(leftHandler.sideBar, 0);
    BoxPanel.setStretch(hsplitPanel, 1);
    BoxPanel.setStretch(rightHandler.sideBar, 0);

    SplitPanel.setStretch(vsplitPanel, 1);

    hsplitPanel.addWidget(leftHandler.stackedPanel);
    hsplitPanel.addWidget(dockPanel);
    hsplitPanel.addWidget(rightHandler.stackedPanel);

    vsplitPanel.addWidget(hsplitPanel);
    vsplitPanel.addWidget(downPanel);

    hboxPanel.addWidget(leftHandler.sideBar);
    hboxPanel.addWidget(vsplitPanel);
    hboxPanel.addWidget(rightHandler.sideBar);

    rootLayout.direction = 'top-to-bottom';
    rootLayout.spacing = 0; // TODO make this configurable?
    // Use relative sizing to set the width of the side panels.
    // This will still respect the min-size of children widget in the stacked
    // panel. The default sizes will be overwritten during layout restoration.
    vsplitPanel.setRelativeSizes([3, 1]);
    hsplitPanel.setRelativeSizes([1, 2.5, 1]);

    BoxLayout.setStretch(headerPanel, 0);
    BoxLayout.setStretch(menuHandler.panel, 0);
    BoxLayout.setStretch(topHandler.panel, 0);
    BoxLayout.setStretch(hboxPanel, 1);
    BoxLayout.setStretch(bottomPanel, 0);

    rootLayout.addWidget(headerPanel);
    rootLayout.addWidget(topHandler.panel);
    rootLayout.addWidget(hboxPanel);
    rootLayout.addWidget(bottomPanel);

    // initially hiding header and bottom panel when no elements inside,
    this._headerPanel.hide();
    this._bottomPanel.hide();
    this._downPanel.hide();

    this.layout = rootLayout;

    // Connect change listeners.
    this._tracker.currentChanged.connect(this._onCurrentChanged, this);
    this._tracker.activeChanged.connect(this._onActiveChanged, this);

    // Connect main layout change listener.
    this._dockPanel.layoutModified.connect(this._onLayoutModified, this);

    // Connect vsplit layout change listener
    this._vsplitPanel.updated.connect(this._onLayoutModified, this);

    // Connect down panel change listeners
    this._downPanel.currentChanged.connect(this._onLayoutModified, this);
    this._downPanel.tabBar.tabMoved.connect(this._onTabPanelChanged, this);
    this._downPanel.stackedPanel.widgetRemoved.connect(
      this._onTabPanelChanged,
      this
    );

    // Catch current changed events on the side handlers.
    this._leftHandler.updated.connect(this._onLayoutModified, this);
    this._rightHandler.updated.connect(this._onLayoutModified, this);

    // Catch update events on the horizontal split panel
    this._hsplitPanel.updated.connect(this._onLayoutModified, this);

    // Setup single-document-mode title bar
    const titleWidgetHandler = (this._titleWidgetHandler = new Private.TitleWidgetHandler(
      this
    ));
    this.add(titleWidgetHandler.titleWidget, 'top', { rank: 100 });

    if (this._dockPanel.mode === 'multiple-document') {
      this._topHandler.addWidget(this._menuHandler.panel, 100);
      titleWidgetHandler.hide();
    } else {
      rootLayout.insertWidget(2, this._menuHandler.panel);
    }

    // Skip Links
    const skipLinkWidget = (this._skipLinkWidget = new Private.SkipLinkWidget(
      this
    ));

    this.add(skipLinkWidget, 'top', { rank: 0 });
    this._skipLinkWidget.show();

    // Wire up signals to update the title panel of the simple interface mode to
    // follow the title of this.currentWidget
    this.currentChanged.connect((sender, args) => {
      let newValue = args.newValue;
      let oldValue = args.oldValue;

      // Stop watching the title of the previously current widget
      if (oldValue) {
        oldValue.title.changed.disconnect(this._updateTitlePanelTitle, this);
      }

      // Start watching the title of the new current widget
      if (newValue) {
        newValue.title.changed.connect(this._updateTitlePanelTitle, this);
        this._updateTitlePanelTitle();
      }

      if (newValue && newValue instanceof DocumentWidget) {
        newValue.context.pathChanged.connect(this._updateCurrentPath, this);
      }
      this._updateCurrentPath();
    });
  }

  /**
   * A signal emitted when main area's active focus changes.
   */
  get activeChanged(): ISignal<this, ILabShell.IChangedArgs> {
    return this._activeChanged;
  }

  /**
   * The active widget in the shell's main area.
   */
  get activeWidget(): Widget | null {
    return this._tracker.activeWidget;
  }

  /**
   * A signal emitted when main area's current focus changes.
   */
  get currentChanged(): ISignal<this, ILabShell.IChangedArgs> {
    return this._currentChanged;
  }

  /**
   * A signal emitted when the shell/dock panel change modes (single/multiple document).
   */
  get modeChanged(): ISignal<this, DockPanel.Mode> {
    return this._modeChanged;
  }

  /**
   * A signal emitted when the path of the current document changes.
   *
   * This also fires when the current document itself changes.
   */
  get currentPathChanged(): ISignal<this, ILabShell.ICurrentPathChangedArgs> {
    return this._currentPathChanged;
  }

  /**
   * The current widget in the shell's main area.
   */
  get currentWidget(): Widget | null {
    return this._tracker.currentWidget;
  }

  /**
   * A signal emitted when the main area's layout is modified.
   */
  get layoutModified(): ISignal<this, void> {
    return this._layoutModified;
  }

  /**
   * Whether the left area is collapsed.
   */
  get leftCollapsed(): boolean {
    return !this._leftHandler.sideBar.currentTitle;
  }

  /**
   * Whether the left area is collapsed.
   */
  get rightCollapsed(): boolean {
    return !this._rightHandler.sideBar.currentTitle;
  }

  /**
   * Whether JupyterLab is in presentation mode with the
   * `jp-mod-presentationMode` CSS class.
   */
  get presentationMode(): boolean {
    return this.hasClass('jp-mod-presentationMode');
  }

  /**
   * Enable/disable presentation mode (`jp-mod-presentationMode` CSS class) with
   * a boolean.
   */
  set presentationMode(value: boolean) {
    this.toggleClass('jp-mod-presentationMode', value);
  }

  /**
   * The main dock area's user interface mode.
   */
  get mode(): DockPanel.Mode {
    return this._dockPanel.mode;
  }
  set mode(mode: DockPanel.Mode) {
    const dock = this._dockPanel;
    if (mode === dock.mode) {
      return;
    }

    const applicationCurrentWidget = this.currentWidget;

    // Toggle back to multiple document mode.
    dock.mode = mode;

    if (mode === 'single-document') {
      this._cachedLayout = dock.saveLayout();

      // In case the active widget in the dock panel is *not* the active widget
      // of the application, defer to the application.
      if (this.currentWidget) {
        dock.activateWidget(this.currentWidget);
      }

      // Adjust menu and title
      (this.layout as BoxLayout).insertWidget(2, this._menuHandler.panel);
      this._titleWidgetHandler.show();
      this._updateTitlePanelTitle();
    } else {
      // Cache a reference to every widget currently in the dock panel.
      const widgets = toArray(dock.widgets());

      // Restore the original layout.
      if (this._cachedLayout) {
        // Remove any disposed widgets in the cached layout and restore.
        Private.normalizeAreaConfig(dock, this._cachedLayout.main);
        dock.restoreLayout(this._cachedLayout);
        this._cachedLayout = null;
      }

      // Add any widgets created during single document mode, which have
      // subsequently been removed from the dock panel after the multiple document
      // layout has been restored. If the widget has add options cached for
      // the widget (i.e., if it has been placed with respect to another widget),
      // then take that into account.
      widgets.forEach(widget => {
        if (!widget.parent) {
          this._addToMainArea(widget, {
            ...this._mainOptionsCache.get(widget),
            activate: false
          });
        }
      });
      this._mainOptionsCache.clear();

      // In case the active widget in the dock panel is *not* the active widget
      // of the application, defer to the application.
      if (applicationCurrentWidget) {
        dock.activateWidget(applicationCurrentWidget);
      }

      // Adjust menu and title
      this.add(this._menuHandler.panel, 'top', { rank: 100 });
      // this._topHandler.addWidget(this._menuHandler.panel, 100)
      this._titleWidgetHandler.hide();
    }

    // Set the mode data attribute on the applications shell node.
    this.node.dataset.shellMode = mode;

    this._downPanel.fit();
    // Emit the mode changed signal
    this._modeChanged.emit(mode);
  }

  /**
   * Promise that resolves when state is first restored, returning layout
   * description.
   */
  get restored(): Promise<ILabShell.ILayout> {
    return this._restored.promise;
  }

  /**
   * Activate a widget in its area.
   */
  activateById(id: string): void {
    if (this._leftHandler.has(id)) {
      this._leftHandler.activate(id);
      return;
    }

    if (this._rightHandler.has(id)) {
      this._rightHandler.activate(id);
      return;
    }

    const tabIndex = this._downPanel.tabBar.titles.findIndex(
      title => title.owner.id === id
    );
    if (tabIndex >= 0) {
      this._downPanel.currentIndex = tabIndex;
      return;
    }

    const dock = this._dockPanel;
    const widget = find(dock.widgets(), value => value.id === id);

    if (widget) {
      dock.activateWidget(widget);
    }
  }

  /*
   * Activate the next Tab in the active TabBar.
   */
  activateNextTab(): void {
    const current = this._currentTabBar();
    if (!current) {
      return;
    }

    const ci = current.currentIndex;
    if (ci === -1) {
      return;
    }

    if (ci < current.titles.length - 1) {
      current.currentIndex += 1;
      if (current.currentTitle) {
        current.currentTitle.owner.activate();
      }
      return;
    }

    if (ci === current.titles.length - 1) {
      const nextBar = this._adjacentBar('next');
      if (nextBar) {
        nextBar.currentIndex = 0;
        if (nextBar.currentTitle) {
          nextBar.currentTitle.owner.activate();
        }
      }
    }
  }

  /*
   * Activate the previous Tab in the active TabBar.
   */
  activatePreviousTab(): void {
    const current = this._currentTabBar();
    if (!current) {
      return;
    }

    const ci = current.currentIndex;
    if (ci === -1) {
      return;
    }

    if (ci > 0) {
      current.currentIndex -= 1;
      if (current.currentTitle) {
        current.currentTitle.owner.activate();
      }
      return;
    }

    if (ci === 0) {
      const prevBar = this._adjacentBar('previous');
      if (prevBar) {
        const len = prevBar.titles.length;
        prevBar.currentIndex = len - 1;
        if (prevBar.currentTitle) {
          prevBar.currentTitle.owner.activate();
        }
      }
    }
  }

  /*
   * Activate the next TabBar.
   */
  activateNextTabBar(): void {
    const nextBar = this._adjacentBar('next');
    if (nextBar) {
      if (nextBar.currentTitle) {
        nextBar.currentTitle.owner.activate();
      }
    }
  }

  /*
   * Activate the next TabBar.
   */
  activatePreviousTabBar(): void {
    const nextBar = this._adjacentBar('previous');
    if (nextBar) {
      if (nextBar.currentTitle) {
        nextBar.currentTitle.owner.activate();
      }
    }
  }

  add(
    widget: Widget,
    area: ILabShell.Area = 'main',
    options?: DocumentRegistry.IOpenOptions
  ): void {
    switch (area || 'main') {
      case 'bottom':
        return this._addToBottomArea(widget, options);
      case 'down':
        return this._addToDownArea(widget, options);
      case 'header':
        return this._addToHeaderArea(widget, options);
      case 'left':
        return this._addToLeftArea(widget, options);
      case 'main':
        return this._addToMainArea(widget, options);
      case 'menu':
        return this._addToMenuArea(widget, options);
      case 'right':
        return this._addToRightArea(widget, options);
      case 'top':
        return this._addToTopArea(widget, options);
      default:
        throw new Error(`Invalid area: ${area}`);
    }
  }

  /**
   * Collapse the left area.
   */
  collapseLeft(): void {
    this._leftHandler.collapse();
    this._onLayoutModified();
  }

  /**
   * Collapse the right area.
   */
  collapseRight(): void {
    this._rightHandler.collapse();
    this._onLayoutModified();
  }

  /**
   * Dispose the shell.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._layoutDebouncer.dispose();
    this._titleWidgetHandler.dispose();
    super.dispose();
  }

  /**
   * Expand the left area.
   *
   * #### Notes
   * This will open the most recently used tab,
   * or the first tab if there is no most recently used.
   */
  expandLeft(): void {
    this._leftHandler.expand();
    this._onLayoutModified();
  }

  /**
   * Expand the right area.
   *
   * #### Notes
   * This will open the most recently used tab,
   * or the first tab if there is no most recently used.
   */
  expandRight(): void {
    this._rightHandler.expand();
    this._onLayoutModified();
  }

  /**
   * Close all widgets in the main and down area.
   */
  closeAll(): void {
    // Make a copy of all the widget in the dock panel (using `toArray()`)
    // before removing them because removing them while iterating through them
    // modifies the underlying data of the iterator.
    toArray(this._dockPanel.widgets()).forEach(widget => widget.close());

    this._downPanel.stackedPanel.widgets.forEach(widget => widget.close());
  }

  /**
   * Whether an side tab bar is visible or not.
   *
   * @param side Sidebar of interest
   * @returns Side tab bar visibility
   */
  isSideTabBarVisible(side: 'left' | 'right'): boolean {
    switch (side) {
      case 'left':
        return this._leftHandler.isVisible;
      case 'right':
        return this._rightHandler.isVisible;
    }
  }

  /**
   * True if the given area is empty.
   */
  isEmpty(area: ILabShell.Area): boolean {
    switch (area) {
      case 'bottom':
        return this._bottomPanel.widgets.length === 0;
      case 'down':
        return this._downPanel.stackedPanel.widgets.length === 0;
      case 'header':
        return this._headerPanel.widgets.length === 0;
      case 'left':
        return this._leftHandler.stackedPanel.widgets.length === 0;
      case 'main':
        return this._dockPanel.isEmpty;
      case 'menu':
        return this._menuHandler.panel.widgets.length === 0;
      case 'right':
        return this._rightHandler.stackedPanel.widgets.length === 0;
      case 'top':
        return this._topHandler.panel.widgets.length === 0;
      default:
        return true;
    }
  }

  /**
   * Restore the layout state for the application shell.
   */
  restoreLayout(mode: DockPanel.Mode, layout: ILabShell.ILayout): void {
    const { mainArea, downArea, leftArea, rightArea, relativeSizes } = layout;
    // Rehydrate the main area.
    if (mainArea) {
      const { currentWidget, dock } = mainArea;

      if (dock) {
        this._dockPanel.restoreLayout(dock);
      }
      if (mode) {
        this.mode = mode;
      }
      if (currentWidget) {
        this.activateById(currentWidget.id);
      }
    } else {
      // This is needed when loading in an empty workspace in single doc mode
      if (mode) {
        this.mode = mode;
      }
    }

    // Rehydrate the down area
    if (downArea) {
      const { currentWidget, widgets, size } = downArea;

      const widgetIds = widgets?.map(widget => widget.id) ?? [];
      // Remove absent widgets
      this._downPanel.tabBar.titles
        .filter(title => !widgetIds.includes(title.owner.id))
        .map(title => title.owner.close());
      // Add new widgets
      const titleIds = this._downPanel.tabBar.titles.map(
        title => title.owner.id
      );
      widgets
        ?.filter(widget => !titleIds.includes(widget.id))
        .map(widget => this._downPanel.addWidget(widget));
      // Reorder tabs
      while (
        !ArrayExt.shallowEqual(
          widgetIds,
          this._downPanel.tabBar.titles.map(title => title.owner.id)
        )
      ) {
        this._downPanel.tabBar.titles.forEach((title, index) => {
          const position = widgetIds.findIndex(id => title.owner.id == id);
          if (position >= 0 && position != index) {
            this._downPanel.tabBar.insertTab(position, title);
          }
        });
      }

      if (currentWidget) {
        const index = this._downPanel.stackedPanel.widgets.findIndex(
          widget => widget.id === currentWidget.id
        );
        if (index) {
          this._downPanel.currentIndex = index;
          this._downPanel.currentWidget?.activate();
        }
      }

      if (size && size > 0.0) {
        this._vsplitPanel.setRelativeSizes([1.0 - size, size]);
      } else {
        // Close all tabs and hide the panel
        this._downPanel.stackedPanel.widgets.forEach(widget => widget.close());
        this._downPanel.hide();
      }
    }

    // Rehydrate the left area.
    if (leftArea) {
      this._leftHandler.rehydrate(leftArea);
    } else {
      if (mode === 'single-document') {
        this.collapseLeft();
      }
    }

    // Rehydrate the right area.
    if (rightArea) {
      this._rightHandler.rehydrate(rightArea);
    } else {
      if (mode === 'single-document') {
        this.collapseRight();
      }
    }

    // Restore the relative sizes.
    if (relativeSizes) {
      this._hsplitPanel.setRelativeSizes(relativeSizes);
    }

    if (!this._isRestored) {
      // Make sure all messages in the queue are finished before notifying
      // any extensions that are waiting for the promise that guarantees the
      // application state has been restored.
      MessageLoop.flush();
      this._restored.resolve(layout);
    }
  }

  /**
   * Save the dehydrated state of the application shell.
   */
  saveLayout(): ILabShell.ILayout {
    // If the application is in single document mode, use the cached layout if
    // available. Otherwise, default to querying the dock panel for layout.
    const layout = {
      mainArea: {
        currentWidget: this._tracker.currentWidget,
        dock:
          this.mode === 'single-document'
            ? this._cachedLayout || this._dockPanel.saveLayout()
            : this._dockPanel.saveLayout()
      },
      downArea: {
        currentWidget: this._downPanel.currentWidget,
        widgets: toArray(this._downPanel.stackedPanel.widgets),
        size: this._vsplitPanel.relativeSizes()[1]
      },
      leftArea: this._leftHandler.dehydrate(),
      rightArea: this._rightHandler.dehydrate(),
      relativeSizes: this._hsplitPanel.relativeSizes()
    };

    return layout;
  }

  /**
   * Toggle side tab bar visibility
   *
   * @param side Sidebar of interest
   */
  toggleSideTabBarVisibility(side: 'right' | 'left'): void {
    if (side === 'right') {
      if (this._rightHandler.isVisible) {
        this._rightHandler.hide();
      } else {
        this._rightHandler.show();
      }
    } else {
      if (this._leftHandler.isVisible) {
        this._leftHandler.hide();
      } else {
        this._leftHandler.show();
      }
    }
  }

  /**
   * Returns the widgets for an application area.
   */
  widgets(area?: ILabShell.Area): IIterator<Widget> {
    switch (area ?? 'main') {
      case 'main':
        return this._dockPanel.widgets();
      case 'left':
        return iter(this._leftHandler.sideBar.titles.map(t => t.owner));
      case 'right':
        return iter(this._rightHandler.sideBar.titles.map(t => t.owner));
      case 'header':
        return this._headerPanel.children();
      case 'top':
        return this._topHandler.panel.children();
      case 'menu':
        return this._menuHandler.panel.children();
      case 'bottom':
        return this._bottomPanel.children();
      default:
        throw new Error(`Invalid area: ${area}`);
    }
  }

  /**
   * Handle `after-attach` messages for the application shell.
   */
  protected onAfterAttach(msg: Message): void {
    this.node.dataset.shellMode = this.mode;
  }

  /**
   * Update the title panel title based on the title of the current widget.
   */
  private _updateTitlePanelTitle() {
    let current = this.currentWidget;
    const inputElement = this._titleWidgetHandler.titleWidget.node
      .children[0] as HTMLInputElement;
    inputElement.value = current ? current.title.label : '';
    inputElement.title = current ? current.title.caption : '';
  }

  /**
   * The path of the current widget changed, fire the _currentPathChanged signal.
   */
  private _updateCurrentPath() {
    let current = this.currentWidget;
    let newValue = '';
    if (current && current instanceof DocumentWidget) {
      newValue = current.context.path;
    }
    this._currentPathChanged.emit({
      newValue: newValue,
      oldValue: this._currentPath
    });
    this._currentPath = newValue;
  }

  /**
   * Add a widget to the left content area.
   *
   * #### Notes
   * Widgets must have a unique `id` property, which will be used as the DOM id.
   */
  private _addToLeftArea(
    widget: Widget,
    options?: DocumentRegistry.IOpenOptions
  ): void {
    if (!widget.id) {
      console.error('Widgets added to app shell must have unique id property.');
      return;
    }
    options = options || this._sideOptionsCache.get(widget) || {};
    this._sideOptionsCache.set(widget, options);
    const rank = 'rank' in options ? options.rank : DEFAULT_RANK;
    this._leftHandler.addWidget(widget, rank!);
    this._onLayoutModified();
  }

  /**
   * Add a widget to the main content area.
   *
   * #### Notes
   * Widgets must have a unique `id` property, which will be used as the DOM id.
   * All widgets added to the main area should be disposed after removal
   * (disposal before removal will remove the widget automatically).
   *
   * In the options, `ref` defaults to `null`, `mode` defaults to `'tab-after'`,
   * and `activate` defaults to `true`.
   */
  private _addToMainArea(
    widget: Widget,
    options?: DocumentRegistry.IOpenOptions
  ): void {
    if (!widget.id) {
      console.error('Widgets added to app shell must have unique id property.');
      return;
    }

    options = options || {};

    const dock = this._dockPanel;
    const mode = options.mode || 'tab-after';
    let ref: Widget | null = this.currentWidget;

    if (options.ref) {
      ref = find(dock.widgets(), value => value.id === options!.ref!) || null;
    }

    const { title } = widget;
    // Add widget ID to tab so that we can get a handle on the tab's widget
    // (for context menu support)
    title.dataset = { ...title.dataset, id: widget.id };

    if (title.icon instanceof LabIcon) {
      // bind an appropriate style to the icon
      title.icon = title.icon.bindprops({
        stylesheet: 'mainAreaTab'
      });
    } else if (typeof title.icon === 'string' || !title.icon) {
      // add some classes to help with displaying css background imgs
      title.iconClass = classes(title.iconClass, 'jp-Icon');
    }

    dock.addWidget(widget, { mode, ref });

    // The dock panel doesn't account for placement information while
    // in single document mode, so upon rehydrating any widgets that were
    // added will not be in the correct place. Cache the placement information
    // here so that we can later rehydrate correctly.
    if (dock.mode === 'single-document') {
      this._mainOptionsCache.set(widget, options);
    }

    if (options.activate !== false) {
      dock.activateWidget(widget);
    }
  }

  /**
   * Add a widget to the right content area.
   *
   * #### Notes
   * Widgets must have a unique `id` property, which will be used as the DOM id.
   */
  private _addToRightArea(
    widget: Widget,
    options?: DocumentRegistry.IOpenOptions
  ): void {
    if (!widget.id) {
      console.error('Widgets added to app shell must have unique id property.');
      return;
    }
    options = options || this._sideOptionsCache.get(widget) || {};

    const rank = 'rank' in options ? options.rank : DEFAULT_RANK;

    this._sideOptionsCache.set(widget, options);
    this._rightHandler.addWidget(widget, rank!);
    this._onLayoutModified();
  }

  /**
   * Add a widget to the top content area.
   *
   * #### Notes
   * Widgets must have a unique `id` property, which will be used as the DOM id.
   */
  private _addToTopArea(
    widget: Widget,
    options?: DocumentRegistry.IOpenOptions
  ): void {
    if (!widget.id) {
      console.error('Widgets added to app shell must have unique id property.');
      return;
    }
    options = options || {};
    const rank = options.rank ?? DEFAULT_RANK;
    this._topHandler.addWidget(widget, rank);
    this._onLayoutModified();
    if (this._topHandler.panel.isHidden) {
      this._topHandler.panel.show();
    }
  }

  /**
   * Add a widget to the title content area.
   *
   * #### Notes
   * Widgets must have a unique `id` property, which will be used as the DOM id.
   */
  private _addToMenuArea(
    widget: Widget,
    options?: DocumentRegistry.IOpenOptions
  ): void {
    if (!widget.id) {
      console.error('Widgets added to app shell must have unique id property.');
      return;
    }
    options = options || {};
    const rank = options.rank ?? DEFAULT_RANK;
    this._menuHandler.addWidget(widget, rank);
    this._onLayoutModified();
    if (this._menuHandler.panel.isHidden) {
      this._menuHandler.panel.show();
    }
  }

  /**
   * Add a widget to the header content area.
   *
   * #### Notes
   * Widgets must have a unique `id` property, which will be used as the DOM id.
   */
  private _addToHeaderArea(
    widget: Widget,
    options?: DocumentRegistry.IOpenOptions
  ): void {
    if (!widget.id) {
      console.error('Widgets added to app shell must have unique id property.');
      return;
    }
    // Temporary: widgets are added to the panel in order of insertion.
    this._headerPanel.addWidget(widget);
    this._onLayoutModified();

    if (this._headerPanel.isHidden) {
      this._headerPanel.show();
    }
  }
  /**
   * Add a widget to the bottom content area.
   *
   * #### Notes
   * Widgets must have a unique `id` property, which will be used as the DOM id.
   */
  private _addToBottomArea(
    widget: Widget,
    options?: DocumentRegistry.IOpenOptions
  ): void {
    if (!widget.id) {
      console.error('Widgets added to app shell must have unique id property.');
      return;
    }
    // Temporary: widgets are added to the panel in order of insertion.
    this._bottomPanel.addWidget(widget);
    this._onLayoutModified();

    if (this._bottomPanel.isHidden) {
      this._bottomPanel.show();
    }
  }

  private _addToDownArea(
    widget: Widget,
    options?: DocumentRegistry.IOpenOptions
  ): void {
    if (!widget.id) {
      console.error('Widgets added to app shell must have unique id property.');
      return;
    }

    options = options || {};

    const { title } = widget;
    // Add widget ID to tab so that we can get a handle on the tab's widget
    // (for context menu support)
    title.dataset = { ...title.dataset, id: widget.id };

    if (title.icon instanceof LabIcon) {
      // bind an appropriate style to the icon
      title.icon = title.icon.bindprops({
        stylesheet: 'mainAreaTab'
      });
    } else if (typeof title.icon === 'string' || !title.icon) {
      // add some classes to help with displaying css background imgs
      title.iconClass = classes(title.iconClass, 'jp-Icon');
    }

    this._downPanel.addWidget(widget);
    this._onLayoutModified();

    if (this._downPanel.isHidden) {
      this._downPanel.show();
    }
  }

  /*
   * Return the tab bar adjacent to the current TabBar or `null`.
   */
  private _adjacentBar(direction: 'next' | 'previous'): TabBar<Widget> | null {
    const current = this._currentTabBar();
    if (!current) {
      return null;
    }

    const bars = toArray(this._dockPanel.tabBars());
    const len = bars.length;
    const index = bars.indexOf(current);

    if (direction === 'previous') {
      return index > 0 ? bars[index - 1] : index === 0 ? bars[len - 1] : null;
    }

    // Otherwise, direction is 'next'.
    return index < len - 1
      ? bars[index + 1]
      : index === len - 1
      ? bars[0]
      : null;
  }

  /*
   * Return the TabBar that has the currently active Widget or null.
   */
  private _currentTabBar(): TabBar<Widget> | null {
    const current = this._tracker.currentWidget;
    if (!current) {
      return null;
    }

    const title = current.title;
    const bars = this._dockPanel.tabBars();
    return find(bars, bar => bar.titles.indexOf(title) > -1) || null;
  }

  /**
   * Handle a change to the dock area active widget.
   */
  private _onActiveChanged(
    sender: any,
    args: FocusTracker.IChangedArgs<Widget>
  ): void {
    if (args.newValue) {
      args.newValue.title.className += ` ${ACTIVE_CLASS}`;
    }
    if (args.oldValue) {
      args.oldValue.title.className = args.oldValue.title.className.replace(
        ACTIVE_CLASS,
        ''
      );
    }
    this._activeChanged.emit(args);
  }

  /**
   * Handle a change to the dock area current widget.
   */
  private _onCurrentChanged(
    sender: any,
    args: FocusTracker.IChangedArgs<Widget>
  ): void {
    if (args.newValue) {
      args.newValue.title.className += ` ${CURRENT_CLASS}`;
    }
    if (args.oldValue) {
      args.oldValue.title.className = args.oldValue.title.className.replace(
        CURRENT_CLASS,
        ''
      );
    }
    this._currentChanged.emit(args);
    this._onLayoutModified();
  }

  /**
   * Handle a change on the down panel widgets
   */
  private _onTabPanelChanged(): void {
    if (this._downPanel.stackedPanel.widgets.length === 0) {
      this._downPanel.hide();
    }
    this._onLayoutModified();
  }

  /**
   * Handle a change to the layout.
   */
  private _onLayoutModified(): void {
    void this._layoutDebouncer.invoke();
  }

  /**
   * A message hook for child add/remove messages on the main area dock panel.
   */
  private _dockChildHook = (
    handler: IMessageHandler,
    msg: Message
  ): boolean => {
    switch (msg.type) {
      case 'child-added':
        (msg as Widget.ChildMessage).child.addClass(ACTIVITY_CLASS);
        this._tracker.add((msg as Widget.ChildMessage).child);
        break;
      case 'child-removed':
        (msg as Widget.ChildMessage).child.removeClass(ACTIVITY_CLASS);
        this._tracker.remove((msg as Widget.ChildMessage).child);
        break;
      default:
        break;
    }
    return true;
  };

  private _activeChanged = new Signal<this, ILabShell.IChangedArgs>(this);
  private _cachedLayout: DockLayout.ILayoutConfig | null = null;
  private _currentChanged = new Signal<this, ILabShell.IChangedArgs>(this);
  private _currentPath = '';
  private _currentPathChanged = new Signal<
    this,
    ILabShell.ICurrentPathChangedArgs
  >(this);
  private _modeChanged = new Signal<this, DockPanel.Mode>(this);
  private _dockPanel: DockPanel;
  private _downPanel: TabPanel;
  private _isRestored = false;
  private _layoutModified = new Signal<this, void>(this);
  private _layoutDebouncer = new Debouncer(() => {
    this._layoutModified.emit(undefined);
  }, 0);
  private _leftHandler: Private.SideBarHandler;
  private _restored = new PromiseDelegate<ILabShell.ILayout>();
  private _rightHandler: Private.SideBarHandler;
  private _tracker = new FocusTracker<Widget>();
  private _headerPanel: Panel;
  private _hsplitPanel: Private.RestorableSplitPanel;
  private _vsplitPanel: Private.RestorableSplitPanel;
  private _topHandler: Private.PanelHandler;
  private _menuHandler: Private.PanelHandler;
  private _skipLinkWidget: Private.SkipLinkWidget;
  private _titleWidgetHandler: Private.TitleWidgetHandler;
  private _bottomPanel: Panel;
  private _mainOptionsCache = new Map<Widget, DocumentRegistry.IOpenOptions>();
  private _sideOptionsCache = new Map<Widget, DocumentRegistry.IOpenOptions>();
}

namespace Private {
  /**
   * An object which holds a widget and its sort rank.
   */
  export interface IRankItem {
    /**
     * The widget for the item.
     */
    widget: Widget;

    /**
     * The sort rank of the widget.
     */
    rank: number;
  }

  /**
   * A less-than comparison function for side bar rank items.
   */
  export function itemCmp(first: IRankItem, second: IRankItem): number {
    return first.rank - second.rank;
  }

  /**
   * Removes widgets that have been disposed from an area config, mutates area.
   */
  export function normalizeAreaConfig(
    parent: DockPanel,
    area?: DockLayout.AreaConfig | null
  ): void {
    if (!area) {
      return;
    }
    if (area.type === 'tab-area') {
      area.widgets = area.widgets.filter(
        widget => !widget.isDisposed && widget.parent === parent
      ) as Widget[];
      return;
    }
    area.children.forEach(child => {
      normalizeAreaConfig(parent, child);
    });
  }

  /**
   * A class which manages a panel and sorts its widgets by rank.
   */
  export class PanelHandler {
    constructor() {
      MessageLoop.installMessageHook(this._panel, this._panelChildHook);
    }

    /**
     * Get the panel managed by the handler.
     */
    get panel(): Panel {
      return this._panel;
    }

    /**
     * Add a widget to the panel.
     *
     * If the widget is already added, it will be moved.
     */
    addWidget(widget: Widget, rank: number): void {
      widget.parent = null;
      const item = { widget, rank };
      const index = ArrayExt.upperBound(this._items, item, Private.itemCmp);
      ArrayExt.insert(this._items, index, item);
      this._panel.insertWidget(index, widget);
    }

    /**
     * A message hook for child add/remove messages on the main area dock panel.
     */
    private _panelChildHook = (
      handler: IMessageHandler,
      msg: Message
    ): boolean => {
      switch (msg.type) {
        case 'child-added':
          {
            const widget = (msg as Widget.ChildMessage).child;
            // If we already know about this widget, we're done
            if (this._items.find(v => v.widget === widget)) {
              break;
            }

            // Otherwise, add to the end by default
            const rank = this._items[this._items.length - 1].rank;
            this._items.push({ widget, rank });
          }
          break;
        case 'child-removed':
          {
            const widget = (msg as Widget.ChildMessage).child;
            ArrayExt.removeFirstWhere(this._items, v => v.widget === widget);
          }
          break;
        default:
          break;
      }
      return true;
    };

    private _items = new Array<Private.IRankItem>();
    private _panel = new Panel();
  }

  /**
   * A class which manages a side bar and related stacked panel.
   */
  export class SideBarHandler {
    /**
     * Construct a new side bar handler.
     */
    constructor() {
      this._sideBar = new TabBar<Widget>({
        insertBehavior: 'none',
        removeBehavior: 'none',
        allowDeselect: true,
        orientation: 'vertical'
      });
      this._stackedPanel = new StackedPanel();
      this._sideBar.hide();
      this._stackedPanel.hide();
      this._lastCurrent = null;
      this._sideBar.currentChanged.connect(this._onCurrentChanged, this);
      this._sideBar.tabActivateRequested.connect(
        this._onTabActivateRequested,
        this
      );
      this._stackedPanel.widgetRemoved.connect(this._onWidgetRemoved, this);
    }

    /**
     * Whether the side bar is visible
     */
    get isVisible(): boolean {
      return this._sideBar.isVisible;
    }

    /**
     * Get the tab bar managed by the handler.
     */
    get sideBar(): TabBar<Widget> {
      return this._sideBar;
    }

    /**
     * Get the stacked panel managed by the handler
     */
    get stackedPanel(): StackedPanel {
      return this._stackedPanel;
    }

    /**
     * Signal fires when the stack panel or the sidebar changes
     */
    get updated(): ISignal<SideBarHandler, void> {
      return this._updated;
    }

    /**
     * Expand the sidebar.
     *
     * #### Notes
     * This will open the most recently used tab, or the first tab
     * if there is no most recently used.
     */
    expand(): void {
      const previous =
        this._lastCurrent || (this._items.length > 0 && this._items[0].widget);
      if (previous) {
        this.activate(previous.id);
      }
    }

    /**
     * Activate a widget residing in the side bar by ID.
     *
     * @param id - The widget's unique ID.
     */
    activate(id: string): void {
      const widget = this._findWidgetByID(id);
      if (widget) {
        this._sideBar.currentTitle = widget.title;
        widget.activate();
      }
    }

    /**
     * Test whether the sidebar has the given widget by id.
     */
    has(id: string): boolean {
      return this._findWidgetByID(id) !== null;
    }

    /**
     * Collapse the sidebar so no items are expanded.
     */
    collapse(): void {
      this._sideBar.currentTitle = null;
    }

    /**
     * Add a widget and its title to the stacked panel and side bar.
     *
     * If the widget is already added, it will be moved.
     */
    addWidget(widget: Widget, rank: number): void {
      widget.parent = null;
      widget.hide();
      const item = { widget, rank };
      const index = this._findInsertIndex(item);
      ArrayExt.insert(this._items, index, item);
      this._stackedPanel.insertWidget(index, widget);
      const title = this._sideBar.insertTab(index, widget.title);
      // Store the parent id in the title dataset
      // in order to dispatch click events to the right widget.
      title.dataset = { id: widget.id };

      if (title.icon instanceof LabIcon) {
        // bind an appropriate style to the icon
        title.icon = title.icon.bindprops({
          stylesheet: 'sideBar'
        });
      } else if (typeof title.icon === 'string' || !title.icon) {
        // add some classes to help with displaying css background imgs
        title.iconClass = classes(title.iconClass, 'jp-Icon', 'jp-Icon-20');
      }

      this._refreshVisibility();
    }

    /**
     * Dehydrate the side bar data.
     */
    dehydrate(): ILabShell.ISideArea {
      const collapsed = this._sideBar.currentTitle === null;
      const widgets = toArray(this._stackedPanel.widgets);
      const currentWidget = widgets[this._sideBar.currentIndex];
      return {
        collapsed,
        currentWidget,
        visible: !this._isHiddenByUser,
        widgets
      };
    }

    /**
     * Rehydrate the side bar.
     */
    rehydrate(data: ILabShell.ISideArea): void {
      if (data.currentWidget) {
        this.activate(data.currentWidget.id);
      }
      if (data.collapsed) {
        this.collapse();
      }
      if (!data.visible) {
        this.hide();
      }
    }

    /**
     * Hide the side bar even if it contains widgets
     */
    hide(): void {
      this._isHiddenByUser = true;
      this._refreshVisibility();
    }

    /**
     * Show the side bar if it contains widgets
     */
    show(): void {
      this._isHiddenByUser = false;
      this._refreshVisibility();
    }

    /**
     * Find the insertion index for a rank item.
     */
    private _findInsertIndex(item: Private.IRankItem): number {
      return ArrayExt.upperBound(this._items, item, Private.itemCmp);
    }

    /**
     * Find the index of the item with the given widget, or `-1`.
     */
    private _findWidgetIndex(widget: Widget): number {
      return ArrayExt.findFirstIndex(this._items, i => i.widget === widget);
    }

    /**
     * Find the widget which owns the given title, or `null`.
     */
    private _findWidgetByTitle(title: Title<Widget>): Widget | null {
      const item = find(this._items, value => value.widget.title === title);
      return item ? item.widget : null;
    }

    /**
     * Find the widget with the given id, or `null`.
     */
    private _findWidgetByID(id: string): Widget | null {
      const item = find(this._items, value => value.widget.id === id);
      return item ? item.widget : null;
    }

    /**
     * Refresh the visibility of the side bar and stacked panel.
     */
    private _refreshVisibility(): void {
      this._stackedPanel.setHidden(this._sideBar.currentTitle === null);
      this._sideBar.setHidden(
        this._isHiddenByUser || this._sideBar.titles.length === 0
      );
      this._updated.emit();
    }

    /**
     * Handle the `currentChanged` signal from the sidebar.
     */
    private _onCurrentChanged(
      sender: TabBar<Widget>,
      args: TabBar.ICurrentChangedArgs<Widget>
    ): void {
      const oldWidget = args.previousTitle
        ? this._findWidgetByTitle(args.previousTitle)
        : null;
      const newWidget = args.currentTitle
        ? this._findWidgetByTitle(args.currentTitle)
        : null;
      if (oldWidget) {
        oldWidget.hide();
      }
      if (newWidget) {
        newWidget.show();
      }
      this._lastCurrent = newWidget || oldWidget;
      this._refreshVisibility();
    }

    /**
     * Handle a `tabActivateRequest` signal from the sidebar.
     */
    private _onTabActivateRequested(
      sender: TabBar<Widget>,
      args: TabBar.ITabActivateRequestedArgs<Widget>
    ): void {
      args.title.owner.activate();
    }

    /*
     * Handle the `widgetRemoved` signal from the stacked panel.
     */
    private _onWidgetRemoved(sender: StackedPanel, widget: Widget): void {
      if (widget === this._lastCurrent) {
        this._lastCurrent = null;
      }
      ArrayExt.removeAt(this._items, this._findWidgetIndex(widget));
      this._sideBar.removeTab(widget.title);
      this._refreshVisibility();
    }

    private _isHiddenByUser = false;
    private _items = new Array<Private.IRankItem>();
    private _sideBar: TabBar<Widget>;
    private _stackedPanel: StackedPanel;
    private _lastCurrent: Widget | null;
    private _updated: Signal<SideBarHandler, void> = new Signal(this);
  }

  export class SkipLinkWidget extends Widget {
    /**
     * Construct a new skipLink widget.
     */
    constructor(shell: ILabShell) {
      super();
      this.addClass('jp-skiplink');
      this.id = 'jp-skiplink';
      this._shell = shell;
      this._createSkipLink('Skip to left side bar');
    }

    handleEvent(event: Event): void {
      switch (event.type) {
        case 'click':
          this._focusLeftSideBar();
          break;
      }
    }

    /**
     * Handle `after-attach` messages for the widget.
     */
    protected onAfterAttach(msg: Message): void {
      super.onAfterAttach(msg);
      this.node.addEventListener('click', this);
    }

    /**
     * A message handler invoked on a `'before-detach'`
     * message
     */
    protected onBeforeDetach(msg: Message): void {
      this.node.removeEventListener('click', this);
      super.onBeforeDetach(msg);
    }

    private _focusLeftSideBar() {
      this._shell.expandLeft();
    }
    private _shell: ILabShell;

    private _createSkipLink(skipLinkText: string): void {
      const skipLink = document.createElement('a');
      skipLink.href = '#';
      skipLink.tabIndex = 1;
      skipLink.text = skipLinkText;
      skipLink.className = 'skip-link';
      this.node.appendChild(skipLink);
    }
  }

  export class TitleWidgetHandler {
    /**
     * Construct a new title widget handler.
     */
    constructor(shell: ILabShell) {
      this._shell = shell;
      const titleWidget = (this._titleWidget = new Widget());
      titleWidget.id = 'jp-title-panel-title';
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.addEventListener('keyup', this);
      titleInput.addEventListener('click', this);
      titleInput.addEventListener('blur', this);

      titleWidget.node.appendChild(titleInput);
    }

    handleEvent(event: Event): void {
      switch (event.type) {
        case 'keyup':
          void this._evtKeyUp(event as KeyboardEvent);
          break;
        case 'click':
          this._evtClick(event as MouseEvent);
          break;
        case 'blur':
          this._selected = false;
          break;
      }
    }

    /**
     * Handle `keyup` events on the handler.
     */
    private async _evtKeyUp(event: KeyboardEvent): Promise<void> {
      if (event.key == 'Enter') {
        const widget = this._shell.currentWidget;
        if (widget instanceof DocumentWidget) {
          const oldName = widget.context.path.split('/').pop()!;
          const inputElement = this.titleWidget.node
            .children[0] as HTMLInputElement;
          const newName = inputElement.value;
          inputElement.blur();
          if (newName !== oldName && isValidFileName(newName)) {
            await widget.context.rename(newName);
          } else {
            inputElement.value = oldName;
          }
        }
      }
    }

    /**
     * Handle `click` events on the handler.
     */
    private _evtClick(event: MouseEvent): void {
      // only handle primary button clicks
      if (event.button !== 0 || this._selected) {
        return;
      }

      const currentWidget = this._shell.currentWidget;
      const inputElement = this.titleWidget.node
        .children[0] as HTMLInputElement;
      if (currentWidget == null || !(currentWidget instanceof DocumentWidget)) {
        inputElement.readOnly = true;
        return;
      } else {
        inputElement.removeAttribute('readOnly');
      }

      event.preventDefault();
      event.stopPropagation();

      this._selected = true;

      const selectEnd = inputElement.value.indexOf('.');
      if (selectEnd === -1) {
        inputElement.select();
      } else {
        inputElement.setSelectionRange(0, selectEnd);
      }
    }

    /**
     * Get the input element managed by the handler.
     */
    get titleWidget(): Widget {
      return this._titleWidget;
    }

    /**
     * Dispose of the handler and the resources it holds.
     */
    dispose(): void {
      if (this.isDisposed) {
        return;
      }
      this._isDisposed = true;
      this._titleWidget.node.removeEventListener('keyup', this);
      this._titleWidget.node.removeEventListener('click', this);
      this._titleWidget.node.removeEventListener('blur', this);
      this._titleWidget.dispose();
    }

    /**
     * Hide the title widget.
     */
    hide(): void {
      this._titleWidget.hide();
    }

    /**
     * Show the title widget.
     */
    show(): void {
      this._titleWidget.show();
    }

    /**
     * Test whether the handler has been disposed.
     */
    get isDisposed(): boolean {
      return this._isDisposed;
    }

    private _titleWidget: Widget;
    private _shell: ILabShell;
    private _isDisposed: boolean = false;
    private _selected: boolean = false;
  }

  export class RestorableSplitPanel extends SplitPanel {
    updated: Signal<RestorableSplitPanel, void>;

    constructor(options: SplitPanel.IOptions = {}) {
      super(options);
      this.updated = new Signal(this);
    }

    /**
     * Emit 'updated' signal on 'update' requests.
     */
    protected onUpdateRequest(msg: Message): void {
      super.onUpdateRequest(msg);
      this.updated.emit();
    }
  }
}
