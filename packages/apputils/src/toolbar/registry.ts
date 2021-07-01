import { LabIcon } from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';
import { Widget } from '@lumino/widgets';
import { IToolbarWidgetRegistry, ToolbarRegistry } from '../tokens';
import { CommandToolbarButton, Toolbar } from './widget';

/**
 * Concrete implementation of IToolbarWidgetRegistry interface
 */
export class ToolbarWidgetRegistry implements IToolbarWidgetRegistry {
  constructor(options: ToolbarRegistry.IOptions) {
    this._defaultFactory = options.defaultFactory;
  }

  /**
   * Default toolbar item factory
   */
  get defaultFactory(): (
    widgetFactory: string,
    widget: Widget,
    toolbarItem: ToolbarRegistry.IWidget
  ) => Widget {
    return this._defaultFactory;
  }
  set defaultFactory(
    factory: (
      widgetFactory: string,
      widget: Widget,
      toolbarItem: ToolbarRegistry.IWidget
    ) => Widget
  ) {
    this._defaultFactory = factory;
  }

  /**
   * Create a toolbar item widget
   *
   * @param widgetFactory The widget factory name that creates the toolbar
   * @param widget The newly widget containing the toolbar
   * @param toolbarItem The toolbar item definition
   * @returns The widget to be inserted in the toolbar.
   */
  createWidget(
    widgetFactory: string,
    widget: Widget,
    toolbarItem: ToolbarRegistry.IWidget
  ): Widget {
    const factory = this._widgets.get(widgetFactory)?.get(toolbarItem.name);
    return factory
      ? factory(widget)
      : this._defaultFactory(widgetFactory, widget, toolbarItem);
  }

  /**
   * Register a new toolbar item factory
   *
   * @param widgetFactory The widget factory name that creates the toolbar
   * @param toolbarItemName The unique toolbar item
   * @param factory The factory function that receives the widget containing the toolbar and returns the toolbar widget.
   * @returns The previously defined factory
   */
  registerFactory<T extends Widget = Widget>(
    widgetFactory: string,
    toolbarItemName: string,
    factory: (main: T) => Widget
  ): ((main: T) => Widget) | undefined {
    let namespace = this._widgets.get(widgetFactory);
    const oldFactory = namespace?.get(toolbarItemName);
    if (!namespace) {
      namespace = new Map<string, (main: Widget) => Widget>();
      this._widgets.set(widgetFactory, namespace);
    }
    namespace.set(toolbarItemName, factory);
    return oldFactory;
  }

  protected _defaultFactory: (
    widgetFactory: string,
    widget: Widget,
    toolbarItem: ToolbarRegistry.IWidget
  ) => Widget;
  protected _widgets: Map<
    string,
    Map<string, (main: Widget) => Widget>
  > = new Map<string, Map<string, (main: Widget) => Widget>>();
}

/**
 * Create the default toolbar item widget factory
 *
 * @param commands Application commands registry
 * @returns Default factory
 */
export function createDefaultFactory(
  commands: CommandRegistry
): (
  widgetFactory: string,
  widget: Widget,
  toolbarItem: ToolbarRegistry.IWidget
) => Widget {
  return (
    widgetFactory: string,
    widget: Widget,
    toolbarItem: ToolbarRegistry.IWidget
  ) => {
    switch (toolbarItem.type ?? 'command') {
      case 'command':
        return new CommandToolbarButton({
          commands,
          id: toolbarItem.command ?? '',
          args: { toolbar: true, ...toolbarItem.args },
          icon: toolbarItem.icon
            ? LabIcon.resolve({ icon: toolbarItem.icon })
            : undefined,
          label: toolbarItem.label ?? ''
        });
      case 'spacer':
        return Toolbar.createSpacerItem();
      default:
        return new Widget();
    }
  };
}
