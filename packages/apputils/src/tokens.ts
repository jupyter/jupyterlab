// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IChangedArgs } from '@jupyterlab/coreutils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Token } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { ISignal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import { ISessionContext } from './sessioncontext';

/**
 * An interface for the session context dialogs.
 */
export interface ISessionContextDialogs extends ISessionContext.IDialogs {}

/* tslint:disable */
/**
 * The session context dialogs token.
 */
export const ISessionContextDialogs = new Token<ISessionContext.IDialogs>(
  '@jupyterlab/apputils:ISessionContextDialogs'
);
/* tslint:enable */

/* tslint:disable */
/**
 * The theme manager token.
 */
export const IThemeManager = new Token<IThemeManager>(
  '@jupyterlab/apputils:IThemeManager'
);
/* tslint:enable */

/**
 * An interface for a theme manager.
 */
export interface IThemeManager {
  /**
   * Get the name of the current theme.
   */
  readonly theme: string | null;

  /**
   * The names of the registered themes.
   */
  readonly themes: ReadonlyArray<string>;

  /**
   * A signal fired when the application theme changes.
   */
  readonly themeChanged: ISignal<this, IChangedArgs<string, string | null>>;

  /**
   * Load a theme CSS file by path.
   *
   * @param path - The path of the file to load.
   */
  loadCSS(path: string): Promise<void>;

  /**
   * Register a theme with the theme manager.
   *
   * @param theme - The theme to register.
   *
   * @returns A disposable that can be used to unregister the theme.
   */
  register(theme: IThemeManager.ITheme): IDisposable;

  /**
   * Set the current theme.
   */
  setTheme(name: string): Promise<void>;

  /**
   * Test whether a given theme is light.
   */
  isLight(name: string): boolean;

  /**
   * Test whether a given theme styles scrollbars,
   * and if the user has scrollbar styling enabled.
   */
  themeScrollbars(name: string): boolean;

  /**
   * Get display name for theme.
   */
  getDisplayName(name: string): string;
}

/**
 * A namespace for the `IThemeManager` sub-types.
 */
export namespace IThemeManager {
  /**
   * An interface for a theme.
   */
  export interface ITheme {
    /**
     * The unique identifier name of the theme.
     */
    name: string;

    /**
     * The display name of the theme.
     */
    displayName?: string;

    /**
     * Whether the theme is light or dark. Downstream authors
     * of extensions can use this information to customize their
     * UI depending upon the current theme.
     */
    isLight: boolean;

    /**
     * Whether the theme includes styling for the scrollbar.
     * If set to false, this theme will leave the native scrollbar untouched.
     */
    themeScrollbars?: boolean;

    /**
     * Load the theme.
     *
     * @returns A promise that resolves when the theme has loaded.
     */
    load(): Promise<void>;

    /**
     * Unload the theme.
     *
     * @returns A promise that resolves when the theme has unloaded.
     */
    unload(): Promise<void>;
  }
}

/**
 * The sanitizer token.
 */
export const ISanitizer = new Token<ISanitizer>(
  '@jupyterlab/apputils:ISanitizer'
);

export interface ISanitizer {
  /**
   * Sanitize an HTML string.
   *
   * @param dirty - The dirty text.
   *
   * @param options - The optional sanitization options.
   *
   * @returns The sanitized string.
   */
  sanitize(dirty: string, options?: ISanitizer.IOptions): string;
}

/**
 * The namespace for `ISanitizer` related interfaces.
 */
export namespace ISanitizer {
  /**
   * The options used to sanitize.
   */
  export interface IOptions {
    /**
     * The allowed tags.
     */
    allowedTags?: string[];

    /**
     * The allowed attributes for a given tag.
     */
    allowedAttributes?: { [key: string]: string[] };

    /**
     * The allowed style values for a given tag.
     */
    allowedStyles?: { [key: string]: { [key: string]: RegExp[] } };
  }
}

/**
 * The namespace for `IToolbarWidgetRegistry` related interfaces
 */
export namespace ToolbarRegistry {
  /**
   * Interface of item to be inserted in a toolbar
   */
  export interface IToolbarItem {
    /**
     * Unique item name
     */
    name: string;
    /**
     * Toolbar widget
     */
    widget: Widget;
  }

  /**
   * Interface describing a toolbar item widget
   */
  export interface IWidget extends ISettingRegistry.IToolbarItem {}

  /**
   * Options to set up the toolbar widget registry
   */
  export interface IOptions {
    /**
     * Default toolbar widget factory
     *
     * The factory is receiving 3 arguments:
     * @param widgetFactory The widget factory name that creates the toolbar
     * @param widget The newly widget containing the toolbar
     * @param toolbarItem The toolbar item definition
     * @returns The widget to be inserted in the toolbar.
     */
    defaultFactory: (
      widgetFactory: string,
      widget: Widget,
      toolbarItem: IWidget
    ) => Widget;
  }
}

/**
 * Toolbar widget registry interface
 */
export interface IToolbarWidgetRegistry {
  /**
   * Default toolbar item factory
   */
  defaultFactory: (
    widgetFactory: string,
    widget: Widget,
    toolbarItem: ToolbarRegistry.IWidget
  ) => Widget;

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
  ): Widget;

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
  ): ((main: T) => Widget) | undefined;
}

/**
 * The toolbar registry token.
 */
export const IToolbarWidgetRegistry = new Token<IToolbarWidgetRegistry>(
  '@jupyterlab/apputils:IToolbarWidgetRegistry'
);
