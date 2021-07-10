/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { WidgetTracker } from '@jupyterlab/apputils';
import { IDataConnector, IRestorer } from '@jupyterlab/statedb';
import { CommandRegistry } from '@lumino/commands';
import {
  JSONExt,
  JSONObject,
  PartialJSONObject,
  PromiseDelegate,
  ReadonlyPartialJSONObject,
  ReadonlyPartialJSONValue,
  Token
} from '@lumino/coreutils';
import { AttachedProperty } from '@lumino/properties';
import { DockPanel, Widget } from '@lumino/widgets';
import { ILabShell } from './shell';

/**
 * The layout restorer token.
 */
export const ILayoutRestorer = new Token<ILayoutRestorer>(
  '@jupyterlab/application:ILayoutRestorer'
);

/**
 * A static class that restores the widgets of the application when it reloads.
 */
export interface ILayoutRestorer extends IRestorer {
  /**
   * A promise resolved when the layout restorer is ready to receive signals.
   */
  restored: Promise<void>;

  /**
   * Add a widget to be tracked by the layout restorer.
   */
  add(widget: Widget, name: string): void;

  /**
   * Restore the widgets of a particular widget tracker.
   *
   * @param tracker - The widget tracker whose widgets will be restored.
   *
   * @param options - The restoration options.
   */
  restore<T extends Widget>(
    tracker: WidgetTracker<T>,
    options: IRestorer.IOptions<T>
  ): Promise<any>;
}

/**
 * The data connector key for restorer data.
 */
const KEY = 'layout-restorer:data';

/**
 * The default implementation of a layout restorer.
 *
 * #### Notes
 * The lifecycle for state restoration is subtle. The sequence of events is:
 *
 * 1. The layout restorer plugin is instantiated and makes a `fetch` call to
 *    the data connector that stores the layout restoration data. The `fetch`
 *    call returns a promise that resolves in step 6, below.
 *
 * 2. Other plugins that care about state restoration require the layout
 *    restorer as a dependency.
 *
 * 3. As each load-time plugin initializes (which happens before the front-end
 *    application has `started`), it instructs the layout restorer whether
 *    the restorer ought to `restore` its widgets by passing in its widget
 *    tracker.
 *    Alternatively, a plugin that does not require its own widget tracker
 *    (because perhaps it only creates a single widget, like a command palette),
 *    can simply `add` its widget along with a persistent unique name to the
 *    layout restorer so that its layout state can be restored when the lab
 *    application restores.
 *
 * 4. After all the load-time plugins have finished initializing, the front-end
 *    application `started` promise will resolve. This is the `first`
 *    promise that the layout restorer waits for. By this point, all of the
 *    plugins that care about restoration will have instructed the layout
 *    restorer to `restore` their widget trackers.
 *
 * 5. The layout restorer will then instruct each plugin's widget tracker
 *    to restore its state and reinstantiate whichever widgets it wants. The
 *    tracker returns a promise to the layout restorer that resolves when it
 *    has completed restoring the tracked widgets it cares about.
 *
 * 6. As each widget tracker finishes restoring the widget instances it cares
 *    about, it resolves the promise that was returned to the layout restorer
 *    (in step 5). After all of the promises that the restorer is awaiting have
 *    settled, the restorer then resolves the outstanding `fetch` promise
 *    (from step 1) and hands off a layout state object to the application
 *    shell's `restoreLayout` method for restoration.
 *
 * 7. Once the application shell has finished restoring the layout, the
 *    JupyterLab application's `restored` promise is resolved.
 *
 * Of particular note are steps 5 and 6: since data restoration of plugins
 * is accomplished by executing commands, the command that is used to restore
 * the data of each plugin must return a promise that only resolves when the
 * widget has been created and added to the plugin's widget tracker.
 */
export class LayoutRestorer implements ILayoutRestorer {
  /**
   * Create a layout restorer.
   */
  constructor(options: LayoutRestorer.IOptions) {
    this._connector = options.connector;
    this._first = options.first;
    this._registry = options.registry;

    void this._first
      .then(() => {
        this._firstDone = true;
      })
      .then(() => Promise.all(this._promises))
      .then(() => {
        this._promisesDone = true;

        // Release the tracker set.
        this._trackers.clear();
      })
      .then(() => {
        this._restored.resolve(void 0);
      });
  }

  /**
   * A promise resolved when the layout restorer is ready to receive signals.
   */
  get restored(): Promise<void> {
    return this._restored.promise;
  }

  /**
   * Add a widget to be tracked by the layout restorer.
   */
  add(widget: Widget, name: string): void {
    Private.nameProperty.set(widget, name);
    this._widgets.set(name, widget);
    widget.disposed.connect(this._onWidgetDisposed, this);
  }

  /**
   * Fetch the layout state for the application.
   *
   * #### Notes
   * Fetching the layout relies on all widget restoration to be complete, so
   * calls to `fetch` are guaranteed to return after restoration is complete.
   */
  async fetch(): Promise<ILabShell.ILayout> {
    const blank: ILabShell.ILayout = {
      fresh: true,
      mainArea: null,
      downArea: null,
      leftArea: null,
      rightArea: null,
      relativeSizes: null
    };
    const layout = this._connector.fetch(KEY);

    try {
      const [data] = await Promise.all([layout, this.restored]);

      if (!data) {
        return blank;
      }

      const {
        main,
        down,
        left,
        right,
        relativeSizes
      } = data as Private.ILayout;

      // If any data exists, then this is not a fresh session.
      const fresh = false;

      // Rehydrate main area.
      const mainArea = this._rehydrateMainArea(main);

      // Rehydrate down area.
      const downArea = this._rehydrateDownArea(down);

      // Rehydrate left area.
      const leftArea = this._rehydrateSideArea(left);

      // Rehydrate right area.
      const rightArea = this._rehydrateSideArea(right);

      return {
        fresh,
        mainArea,
        downArea,
        leftArea,
        rightArea,
        relativeSizes: relativeSizes || null
      };
    } catch (error) {
      return blank;
    }
  }

  /**
   * Restore the widgets of a particular widget tracker.
   *
   * @param tracker - The widget tracker whose widgets will be restored.
   *
   * @param options - The restoration options.
   */
  restore(
    tracker: WidgetTracker,
    options: IRestorer.IOptions<Widget>
  ): Promise<any> {
    const warning = 'restore() can only be called before `first` has resolved.';

    if (this._firstDone) {
      console.warn(warning);
      return Promise.reject(warning);
    }

    const { namespace } = tracker;
    if (this._trackers.has(namespace)) {
      const warning = `A tracker namespaced ${namespace} was already restored.`;
      console.warn(warning);
      return Promise.reject(warning);
    }

    const { args, command, name, when } = options;

    // Add the tracker to the private trackers collection.
    this._trackers.add(namespace);

    // Whenever a new widget is added to the tracker, record its name.
    tracker.widgetAdded.connect((_, widget) => {
      const widgetName = name(widget);
      if (widgetName) {
        this.add(widget, `${namespace}:${widgetName}`);
      }
    }, this);

    // Whenever a widget is updated, get its new name.
    tracker.widgetUpdated.connect((_, widget) => {
      const widgetName = name(widget);
      if (widgetName) {
        const name = `${namespace}:${widgetName}`;
        Private.nameProperty.set(widget, name);
        this._widgets.set(name, widget);
      }
    });

    const first = this._first;
    const promise = tracker
      .restore({
        args: args || (() => JSONExt.emptyObject),
        command,
        connector: this._connector,
        name,
        registry: this._registry,
        when: when ? [first].concat(when) : first
      })
      .catch(error => {
        console.error(error);
      });

    this._promises.push(promise);
    return promise;
  }

  /**
   * Save the layout state for the application.
   */
  save(data: ILabShell.ILayout): Promise<void> {
    // If there are promises that are unresolved, bail.
    if (!this._promisesDone) {
      const warning = 'save() was called prematurely.';
      console.warn(warning);
      return Promise.reject(warning);
    }

    const dehydrated: Private.ILayout = {};
    dehydrated.main = this._dehydrateMainArea(data.mainArea);
    dehydrated.down = this._dehydrateDownArea(data.downArea);
    dehydrated.left = this._dehydrateSideArea(data.leftArea);
    dehydrated.right = this._dehydrateSideArea(data.rightArea);
    dehydrated.relativeSizes = data.relativeSizes;

    return this._connector.save(KEY, dehydrated);
  }

  /**
   * Dehydrate a main area description into a serializable object.
   */
  private _dehydrateMainArea(
    area: ILabShell.IMainArea | null
  ): Private.IMainArea | null {
    if (!area) {
      return null;
    }
    return Private.serializeMain(area);
  }

  /**
   * Rehydrate a serialized main area description object.
   *
   * #### Notes
   * This function consumes data that can become corrupted, so it uses type
   * coercion to guarantee the dehydrated object is safely processed.
   */
  private _rehydrateMainArea(
    area?: Private.IMainArea | null
  ): ILabShell.IMainArea | null {
    if (!area) {
      return null;
    }
    return Private.deserializeMain(area, this._widgets);
  }

  /**
   * Dehydrate a down area description into a serializable object.
   */
  private _dehydrateDownArea(
    area: ILabShell.IDownArea | null
  ): Private.IDownArea | null {
    if (!area) {
      return null;
    }

    const dehydrated: Private.IDownArea = {
      size: area.size
    };

    if (area.currentWidget) {
      const current = Private.nameProperty.get(area.currentWidget);
      if (current) {
        dehydrated.current = current;
      }
    }

    if (area.widgets) {
      dehydrated.widgets = area.widgets
        .map(widget => Private.nameProperty.get(widget))
        .filter(name => !!name);
    }

    return dehydrated;
  }

  /**
   * Rehydrate a serialized side area description object.
   *
   * #### Notes
   * This function consumes data that can become corrupted, so it uses type
   * coercion to guarantee the dehydrated object is safely processed.
   */
  private _rehydrateDownArea(
    area?: Private.IDownArea | null
  ): ILabShell.IDownArea | null {
    if (!area) {
      return { currentWidget: null, size: 0.0, widgets: null };
    }

    const internal = this._widgets;
    const currentWidget =
      area.current && internal.has(`${area.current}`)
        ? internal.get(`${area.current}`)
        : null;
    const widgets = !Array.isArray(area.widgets)
      ? null
      : area.widgets
          .map(name =>
            internal.has(`${name}`) ? internal.get(`${name}`) : null
          )
          .filter(widget => !!widget);
    return {
      currentWidget: currentWidget!,
      size: area.size ?? 0.0,
      widgets: widgets as Widget[] | null
    };
  }

  /**
   * Dehydrate a side area description into a serializable object.
   */
  private _dehydrateSideArea(
    area?: ILabShell.ISideArea | null
  ): Private.ISideArea | null {
    if (!area) {
      return null;
    }
    const dehydrated: Private.ISideArea = {
      collapsed: area.collapsed,
      visible: area.visible
    };
    if (area.currentWidget) {
      const current = Private.nameProperty.get(area.currentWidget);
      if (current) {
        dehydrated.current = current;
      }
    }
    if (area.widgets) {
      dehydrated.widgets = area.widgets
        .map(widget => Private.nameProperty.get(widget))
        .filter(name => !!name);
    }
    return dehydrated;
  }

  /**
   * Rehydrate a serialized side area description object.
   *
   * #### Notes
   * This function consumes data that can become corrupted, so it uses type
   * coercion to guarantee the dehydrated object is safely processed.
   */
  private _rehydrateSideArea(
    area?: Private.ISideArea | null
  ): ILabShell.ISideArea {
    if (!area) {
      return {
        collapsed: true,
        currentWidget: null,
        visible: true,
        widgets: null
      };
    }
    const internal = this._widgets;
    const collapsed = area.collapsed ?? false;
    const currentWidget =
      area.current && internal.has(`${area.current}`)
        ? internal.get(`${area.current}`)
        : null;
    const widgets = !Array.isArray(area.widgets)
      ? null
      : area.widgets
          .map(name =>
            internal.has(`${name}`) ? internal.get(`${name}`) : null
          )
          .filter(widget => !!widget);
    return {
      collapsed,
      currentWidget: currentWidget!,
      widgets: widgets as Widget[] | null,
      visible: area.visible ?? true
    };
  }

  /**
   * Handle a widget disposal.
   */
  private _onWidgetDisposed(widget: Widget): void {
    const name = Private.nameProperty.get(widget);
    this._widgets.delete(name);
  }

  private _connector: IDataConnector<ReadonlyPartialJSONValue>;
  private _first: Promise<any>;
  private _firstDone = false;
  private _promisesDone = false;
  private _promises: Promise<any>[] = [];
  private _restored = new PromiseDelegate<void>();
  private _registry: CommandRegistry;
  private _trackers = new Set<string>();
  private _widgets = new Map<string, Widget>();
}

/**
 * A namespace for `LayoutRestorer` statics.
 */
export namespace LayoutRestorer {
  /**
   * The configuration options for layout restorer instantiation.
   */
  export interface IOptions {
    /**
     * The data connector used for layout saving and fetching.
     */
    connector: IDataConnector<ReadonlyPartialJSONValue>;

    /**
     * The initial promise that has to be resolved before restoration.
     *
     * #### Notes
     * This promise should equal the JupyterLab application `started` notifier.
     */
    first: Promise<any>;

    /**
     * The application command registry.
     */
    registry: CommandRegistry;
  }
}

/*
 * A namespace for private data.
 */
namespace Private {
  /**
   * The dehydrated state of the application layout.
   *
   * #### Notes
   * This format is JSON serializable and saved with the data connector.
   * It is meant to be a data structure can translate into a `LabShell.ILayout`
   * data structure for consumption by the application shell.
   */
  export interface ILayout extends PartialJSONObject {
    /**
     * The main area of the user interface.
     */
    main?: IMainArea | null;

    /**
     * The down area of the user interface
     */
    down?: IDownArea | null;

    /**
     * The left area of the user interface.
     */
    left?: ISideArea | null;

    /**
     * The right area of the user interface.
     */
    right?: ISideArea | null;

    /**
     * The relatives sizes of the areas of the user interface.
     */
    relativeSizes?: number[] | null;
  }

  /**
   * The restorable description of the main application area.
   */
  export interface IMainArea extends PartialJSONObject {
    /**
     * The current widget that has application focus.
     */
    current?: string | null;

    /**
     * The main application dock panel.
     */
    dock?: ISplitArea | ITabArea | null;

    /**
     * The document mode (i.e., multiple/single) of the main dock panel.
     */
    mode?: DockPanel.Mode | null;
  }

  /**
   * The restorable description of a sidebar in the user interface.
   */
  export interface ISideArea extends PartialJSONObject {
    /**
     * A flag denoting whether the sidebar has been collapsed.
     */
    collapsed?: boolean | null;

    /**
     * The current widget that has side area focus.
     */
    current?: string | null;

    /**
     * A flag denoting whether the side tab bar is visible.
     */
    visible?: boolean | null;

    /**
     * The collection of widgets held by the sidebar.
     */
    widgets?: Array<string> | null;
  }

  /**
   * The restorable description of a tab area in the user interface.
   */
  export interface ITabArea extends JSONObject {
    /**
     * The type indicator of the serialized tab area.
     */
    type: 'tab-area';

    /**
     * The widgets in the tab area.
     */
    widgets: Array<string> | null;

    /**
     * The index of the selected tab.
     */
    currentIndex: number;
  }

  /**
   * The restorable description of a split area in the user interface.
   */
  export interface ISplitArea extends JSONObject {
    /**
     * The type indicator of the serialized split area.
     */
    type: 'split-area';

    /**
     * The orientation of the split area.
     */
    orientation: 'horizontal' | 'vertical';

    /**
     * The children in the split area.
     */
    children: Array<ITabArea | ISplitArea> | null;

    /**
     * The sizes of the children.
     */
    sizes: Array<number>;
  }

  /**
   * The restorable description of the down area in the user interface
   */
  export interface IDownArea extends PartialJSONObject {
    /**
     * The current widget that has application focus.
     */
    current?: string | null;

    /**
     * Vertical relative size of the down area
     *
     * The main area will take the rest of the height
     */
    size?: number | null;

    /**
     * The widgets in the down area.
     */
    widgets?: Array<string> | null;
  }

  /**
   * An attached property for a widget's ID in the serialized restore data.
   */
  export const nameProperty = new AttachedProperty<Widget, string>({
    name: 'name',
    create: owner => ''
  });

  /**
   * Serialize individual areas within the main area.
   */
  function serializeArea(
    area: ILabShell.AreaConfig | null
  ): ITabArea | ISplitArea | null {
    if (!area || !area.type) {
      return null;
    }

    if (area.type === 'tab-area') {
      return {
        type: 'tab-area',
        currentIndex: area.currentIndex,
        widgets: area.widgets
          .map(widget => nameProperty.get(widget))
          .filter(name => !!name)
      };
    }

    return {
      type: 'split-area',
      orientation: area.orientation,
      sizes: area.sizes,
      children: area.children
        .map(serializeArea)
        .filter(area => !!area) as Array<ITabArea | ISplitArea>
    };
  }

  /**
   * Return a dehydrated, serializable version of the main dock panel.
   */
  export function serializeMain(area: ILabShell.IMainArea): IMainArea {
    const dehydrated: IMainArea = {
      dock: (area && area.dock && serializeArea(area.dock.main)) || null
    };
    if (area) {
      if (area.currentWidget) {
        const current = Private.nameProperty.get(area.currentWidget);
        if (current) {
          dehydrated.current = current;
        }
      }
    }
    return dehydrated;
  }

  /**
   * Deserialize individual areas within the main area.
   *
   * #### Notes
   * Because this data comes from a potentially unreliable foreign source, it is
   * typed as a `JSONObject`; but the actual expected type is:
   * `ITabArea | ISplitArea`.
   *
   * For fault tolerance, types are manually checked in deserialization.
   */
  function deserializeArea(
    area: JSONObject,
    names: Map<string, Widget>
  ): ILabShell.AreaConfig | null {
    if (!area) {
      return null;
    }

    // Because this data is saved to a foreign data source, its type safety is
    // not guaranteed when it is retrieved, so exhaustive checks are necessary.
    const type = ((area as any).type as string) || 'unknown';
    if (type === 'unknown' || (type !== 'tab-area' && type !== 'split-area')) {
      console.warn(`Attempted to deserialize unknown type: ${type}`);
      return null;
    }

    if (type === 'tab-area') {
      const { currentIndex, widgets } = area as ITabArea;
      const hydrated: ILabShell.AreaConfig = {
        type: 'tab-area',
        currentIndex: currentIndex || 0,
        widgets:
          (widgets &&
            (widgets
              .map(widget => names.get(widget))
              .filter(widget => !!widget) as Widget[])) ||
          []
      };

      // Make sure the current index is within bounds.
      if (hydrated.currentIndex > hydrated.widgets.length - 1) {
        hydrated.currentIndex = 0;
      }

      return hydrated;
    }

    const { orientation, sizes, children } = area as ISplitArea;
    const hydrated: ILabShell.AreaConfig = {
      type: 'split-area',
      orientation: orientation,
      sizes: sizes || [],
      children:
        (children &&
          (children
            .map(child => deserializeArea(child, names))
            .filter(widget => !!widget) as ILabShell.AreaConfig[])) ||
        []
    };

    return hydrated;
  }

  /**
   * Return the hydrated version of the main dock panel, ready to restore.
   *
   * #### Notes
   * Because this data comes from a potentially unreliable foreign source, it is
   * typed as a `JSONObject`; but the actual expected type is: `IMainArea`.
   *
   * For fault tolerance, types are manually checked in deserialization.
   */
  export function deserializeMain(
    area: ReadonlyPartialJSONObject,
    names: Map<string, Widget>
  ): ILabShell.IMainArea | null {
    if (!area) {
      return null;
    }

    const name = (area as any).current || null;
    const dock = (area as any).dock || null;

    return {
      currentWidget: (name && names.has(name) && names.get(name)) || null,
      dock: dock ? { main: deserializeArea(dock, names) } : null
    };
  }
}
