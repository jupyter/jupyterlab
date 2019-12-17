/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
import { ReadonlyJSONObject } from '@lumino/coreutils';

import { Widget } from '@lumino/widgets';

/**
 * A namespace for rendermime associated interfaces.
 */
export namespace IRenderMime {
  /**
   * A model for mime data.
   */
  export interface IMimeModel {
    /**
     * Whether the data in the model is trusted.
     */
    readonly trusted: boolean;

    /**
     * The data associated with the model.
     */
    readonly data: ReadonlyJSONObject;

    /**
     * The metadata associated with the model.
     *
     * Among others, it can include an attribute named `fragment`
     * that stores a URI fragment identifier for the MIME resource.
     */
    readonly metadata: ReadonlyJSONObject;

    /**
     * Set the data associated with the model.
     *
     * #### Notes
     * Calling this function may trigger an asynchronous operation
     * that could cause the renderer to be rendered with a new model
     * containing the new data.
     */
    setData(options: IMimeModel.ISetDataOptions): void;
  }

  /**
   * The namespace for IMimeModel associated interfaces.
   */
  export namespace IMimeModel {
    /**
     * The options used to update a mime model.
     */
    export interface ISetDataOptions {
      /**
       * The new data object.
       */
      data?: ReadonlyJSONObject;

      /**
       * The new metadata object.
       */
      metadata?: ReadonlyJSONObject;
    }
  }

  /**
   * A toolbar item.
   */
  export interface IToolbarItem {
    name: string;
    widget: Widget;
  }

  /**
   * The options used to initialize a document widget factory.
   *
   * This interface is intended to be used by mime renderer extensions
   * to define a document opener that uses its renderer factory.
   */
  export interface IDocumentWidgetFactoryOptions {
    /**
     * The name of the widget to display in dialogs.
     */
    readonly name: string;

    /**
     * The name of the document model type.
     */
    readonly modelName?: string;

    /**
     * The primary file type of the widget.
     */
    readonly primaryFileType: string;

    /**
     * The file types the widget can view.
     */
    readonly fileTypes: ReadonlyArray<string>;

    /**
     * The file types for which the factory should be the default.
     */
    readonly defaultFor?: ReadonlyArray<string>;

    /**
     * The file types for which the factory should be the default for rendering,
     * if that is different than the default factory (which may be for editing)
     * If undefined, then it will fall back on the default file type.
     */
    readonly defaultRendered?: ReadonlyArray<string>;

    /**
     * A function returning a list of toolbar items to add to the toolbar.
     */
    readonly toolbarFactory?: (widget: IRenderer) => IToolbarItem[];
  }

  /**
   * A file type to associate with the renderer.
   */
  export interface IFileType {
    /**
     * The name of the file type.
     */
    readonly name: string;

    /**
     * The mime types associated the file type.
     */
    readonly mimeTypes: ReadonlyArray<string>;

    /**
     * The extensions of the file type (e.g. `".txt"`).  Can be a compound
     * extension (e.g. `".table.json`).
     */
    readonly extensions: ReadonlyArray<string>;

    /**
     * An optional display name for the file type.
     */
    readonly displayName?: string;

    /**
     * An optional pattern for a file name (e.g. `^Dockerfile$`).
     */
    readonly pattern?: string;

    /**
     * The icon class name for the file type.
     */
    readonly iconClass?: string;

    /**
     * The icon label for the file type.
     */
    readonly iconLabel?: string;

    /**
     * The file format for the file type ('text', 'base64', or 'json').
     */
    readonly fileFormat?: string;
  }

  /**
   * An interface for using a RenderMime.IRenderer for output and read-only documents.
   */
  export interface IExtension {
    /**
     * The ID of the extension.
     *
     * #### Notes
     * The convention for extension IDs in JupyterLab is the full NPM package
     * name followed by a colon and a unique string token, e.g.
     * `'@jupyterlab/apputils-extension:settings'` or `'foo-extension:bar'`.
     */
    readonly id: string;

    /**
     * A renderer factory to be registered to render the MIME type.
     */
    readonly rendererFactory: IRendererFactory;

    /**
     * The rank passed to `RenderMime.addFactory`.  If not given,
     * defaults to the `defaultRank` of the factory.
     */
    readonly rank?: number;

    /**
     * The timeout after user activity to re-render the data.
     */
    readonly renderTimeout?: number;

    /**
     * Preferred data type from the model.  Defaults to `string`.
     */
    readonly dataType?: 'string' | 'json';

    /**
     * The options used to open a document with the renderer factory.
     */
    readonly documentWidgetFactoryOptions?:
      | IDocumentWidgetFactoryOptions
      | ReadonlyArray<IDocumentWidgetFactoryOptions>;

    /**
     * The optional file type associated with the extension.
     */
    readonly fileTypes?: ReadonlyArray<IFileType>;
  }

  /**
   * The interface for a module that exports an extension or extensions as
   * the default value.
   */
  export interface IExtensionModule {
    /**
     * The default export.
     */
    readonly default: IExtension | ReadonlyArray<IExtension>;
  }

  /**
   * A widget which displays the contents of a mime model.
   */
  export interface IRenderer extends Widget {
    /**
     * Render a mime model.
     *
     * @param model - The mime model to render.
     *
     * @returns A promise which resolves when rendering is complete.
     *
     * #### Notes
     * This method may be called multiple times during the lifetime
     * of the widget to update it if and when new data is available.
     */
    renderModel(model: IMimeModel): Promise<void>;
  }

  /**
   * The interface for a renderer factory.
   */
  export interface IRendererFactory {
    /**
     * Whether the factory is a "safe" factory.
     *
     * #### Notes
     * A "safe" factory produces renderer widgets which can render
     * untrusted model data in a usable way. *All* renderers must
     * handle untrusted data safely, but some may simply failover
     * with a "Run cell to view output" message. A "safe" renderer
     * is an indication that its sanitized output will be useful.
     */
    readonly safe: boolean;

    /**
     * The mime types handled by this factory.
     */
    readonly mimeTypes: ReadonlyArray<string>;

    /**
     * The default rank of the factory.  If not given, defaults to 100.
     */
    readonly defaultRank?: number;

    /**
     * Create a renderer which displays the mime data.
     *
     * @param options - The options used to render the data.
     */
    createRenderer(options: IRendererOptions): IRenderer;
  }

  /**
   * The options used to create a renderer.
   */
  export interface IRendererOptions {
    /**
     * The preferred mimeType to render.
     */
    mimeType: string;

    /**
     * The html sanitizer.
     */
    sanitizer: ISanitizer;

    /**
     * An optional url resolver.
     */
    resolver: IResolver | null;

    /**
     * An optional link handler.
     */
    linkHandler: ILinkHandler | null;

    /**
     * The LaTeX typesetter.
     */
    latexTypesetter: ILatexTypesetter | null;

    /**
     * The Markdown parser.
     */
    markdownParser: IMarkdownParser | null;
  }

  /**
   * An object that handles html sanitization.
   */
  export interface ISanitizer {
    /**
     * Sanitize an HTML string.
     */
    sanitize(dirty: string): string;
  }

  /**
   * An object that handles links on a node.
   */
  export interface ILinkHandler {
    /**
     * Add the link handler to the node.
     *
     * @param node: the anchor node for which to handle the link.
     *
     * @param path: the path to open when the link is clicked.
     *
     * @param id: an optional element id to scroll to when the path is opened.
     */
    handleLink(node: HTMLElement, path: string, id?: string): void;
  }

  /**
   * An object that resolves relative URLs.
   */
  export interface IResolver {
    /**
     * Resolve a relative url to an absolute url path.
     */
    resolveUrl(url: string): Promise<string>;

    /**
     * Get the download url for a given absolute url path.
     *
     * #### Notes
     * This URL may include a query parameter.
     */
    getDownloadUrl(url: string): Promise<string>;

    /**
     * Whether the URL should be handled by the resolver
     * or not.
     *
     * #### Notes
     * This is similar to the `isLocal` check in `URLExt`,
     * but can also perform additional checks on whether the
     * resolver should handle a given URL.
     */
    isLocal?: (url: string) => boolean;
  }

  /**
   * The interface for a LaTeX typesetter.
   */
  export interface ILatexTypesetter {
    /**
     * Typeset a DOM element.
     *
     * @param element - the DOM element to typeset. The typesetting may
     *   happen synchronously or asynchronously.
     *
     * #### Notes
     * The application-wide rendermime object has a settable
     * `latexTypesetter` property which is used wherever LaTeX
     * typesetting is required. Extensions wishing to provide their
     * own typesetter may replace that on the global `lab.rendermime`.
     */
    typeset(element: HTMLElement): void;
  }

  /**
   * The interface for a Markdown parser.
   */
  export interface IMarkdownParser {
    /**
     * Render a markdown source.
     *
     * @param source - The string to render.
     * @returns - A promise of the string.
     *
     * #### Notes
     * The application-wide rendermime object has a settable
     * `markdownParser` property which is used wherever markdown parsing
     * is required. Extensions wishing to provide their own markdown
     * parser may replace that on the global `lab.rendermime`.
     */
    render(source: string): Promise<string>;
  }
}
