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
  get defaultFactory(): ToolbarRegistry.WidgetFactory {
    return this._defaultFactory;
  }
  set defaultFactory(factory: ToolbarRegistry.WidgetFactory) {
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
    const namespace = this._widgets.get(widgetFactory);
    const factory = namespace?.get(toolbarItem.name) ?? this._defaultFactory;
    return factory(widgetFactory, widget, toolbarItem);
  }

  /**
   * Register a new toolbar item factory
   *
   * @param widgetFactory The widget factory name that creates the toolbar
   * @param toolbarItemName The unique toolbar item
   * @param factory The factory function
   * @returns The previously defined factory
   */
  registerFactory(
    widgetFactory: string,
    toolbarItemName: string,
    factory: ToolbarRegistry.WidgetFactory
  ): ToolbarRegistry.WidgetFactory | undefined {
    let namespace = this._widgets.get(widgetFactory);
    const oldFactory = namespace?.get(toolbarItemName);
    if (!namespace) {
      namespace = new Map<string, ToolbarRegistry.WidgetFactory>();
      this._widgets.set(widgetFactory, namespace);
    }
    namespace.set(toolbarItemName, factory);
    return oldFactory;
  }

  protected _defaultFactory: ToolbarRegistry.WidgetFactory;
  protected _widgets: Map<
    string,
    Map<string, ToolbarRegistry.WidgetFactory>
  > = new Map<string, Map<string, ToolbarRegistry.WidgetFactory>>();
}

/**
 * Create the default toolbar item widget factory
 *
 * @param commands Application commands registry
 * @returns Default factory
 */
export function createDefaultFactory(
  commands: CommandRegistry
): ToolbarRegistry.WidgetFactory {
  return (
    widgetFactory: string,
    widget: Widget,
    toolbarItem: ToolbarRegistry.IWidget
  ) => {
    switch (toolbarItem.type) {
      case 'command':
        return new CommandToolbarButton({
          commands,
          id: toolbarItem.command ?? '',
          args: { ...toolbarItem.args, toolbar: true }
        });
      case 'spacer':
        return Toolbar.createSpacerItem();
      default:
        return new Widget();
    }
  };
}
