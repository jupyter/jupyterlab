/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import { Token, ReadonlyJSONObject } from '@lumino/coreutils';

import { ISanitizer } from '@jupyterlab/apputils';

import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

import { MimeModel } from './mimemodel';

/* tslint:disable */
/**
 * The rendermime token.
 */
export const IRenderMimeRegistry = new Token<IRenderMimeRegistry>(
  '@jupyterlab/rendermime:IRenderMimeRegistry'
);

export interface IRenderMimeRegistry {
  /**
   * The sanitizer used by the rendermime instance.
   */
  readonly sanitizer: ISanitizer;

  /**
   * The object used to resolve relative urls for the rendermime instance.
   */
  readonly resolver: IRenderMime.IResolver | null;

  /**
   * The object used to handle path opening links.
   */
  readonly linkHandler: IRenderMime.ILinkHandler | null;

  /**
   * The LaTeX typesetter for the rendermime.
   */
  readonly latexTypesetter: IRenderMime.ILatexTypesetter | null;

  /**
   * The Markdown parser for the rendermime.
   */
  readonly markdownParser: IRenderMime.IMarkdownParser | null;

  /**
   * The ordered list of mimeTypes.
   */
  readonly mimeTypes: ReadonlyArray<string>;

  /**
   * Find the preferred mime type for a mime bundle.
   *
   * @param bundle - The bundle of mime data.
   *
   * @param safe - How to consider safe/unsafe factories. If 'ensure',
   *   it will only consider safe factories. If 'any', any factory will be
   *   considered. If 'prefer', unsafe factories will be considered, but
   *   only after the safe options have been exhausted.
   *
   * @returns The preferred mime type from the available factories,
   *   or `undefined` if the mime type cannot be rendered.
   */
  preferredMimeType(
    bundle: ReadonlyJSONObject,
    safe?: 'ensure' | 'prefer' | 'any'
  ): string | undefined;

  /**
   * Create a renderer for a mime type.
   *
   * @param mimeType - The mime type of interest.
   *
   * @returns A new renderer for the given mime type.
   *
   * @throws An error if no factory exists for the mime type.
   */
  createRenderer(mimeType: string): IRenderMime.IRenderer;

  /**
   * Create a new mime model.  This is a convenience method.
   *
   * @options - The options used to create the model.
   *
   * @returns A new mime model.
   */
  createModel(options?: MimeModel.IOptions): MimeModel;

  /**
   * Create a clone of this rendermime instance.
   *
   * @param options - The options for configuring the clone.
   *
   * @returns A new independent clone of the rendermime.
   */
  clone(options?: IRenderMimeRegistry.ICloneOptions): IRenderMimeRegistry;

  /**
   * Get the renderer factory registered for a mime type.
   *
   * @param mimeType - The mime type of interest.
   *
   * @returns The factory for the mime type, or `undefined`.
   */
  getFactory(mimeType: string): IRenderMime.IRendererFactory | undefined;

  /**
   * Add a renderer factory to the rendermime.
   *
   * @param factory - The renderer factory of interest.
   *
   * @param rank - The rank of the renderer. A lower rank indicates
   *   a higher priority for rendering. If not given, the rank will
   *   defer to the `defaultRank` of the factory.  If no `defaultRank`
   *   is given, it will default to 100.
   *
   * #### Notes
   * The renderer will replace an existing renderer for the given
   * mimeType.
   */
  addFactory(factory: IRenderMime.IRendererFactory, rank?: number): void;

  /**
   * Remove a mime type.
   *
   * @param mimeType - The mime type of interest.
   */
  removeMimeType(mimeType: string): void;

  /**
   * Get the rank for a given mime type.
   *
   * @param mimeType - The mime type of interest.
   *
   * @returns The rank of the mime type or undefined.
   */
  getRank(mimeType: string): number | undefined;

  /**
   * Set the rank of a given mime type.
   *
   * @param mimeType - The mime type of interest.
   *
   * @param rank - The new rank to assign.
   *
   * #### Notes
   * This is a no-op if the mime type is not registered.
   */
  setRank(mimeType: string, rank: number): void;
}

export namespace IRenderMimeRegistry {
  /**
   * The options used to clone a rendermime instance.
   */
  export interface ICloneOptions {
    /**
     * The new sanitizer used to sanitize untrusted html inputs.
     */
    sanitizer?: IRenderMime.ISanitizer;

    /**
     * The new resolver object.
     */
    resolver?: IRenderMime.IResolver;

    /**
     * The new path handler.
     */
    linkHandler?: IRenderMime.ILinkHandler;

    /**
     * The new LaTeX typesetter.
     */
    latexTypesetter?: IRenderMime.ILatexTypesetter;

    /**
     * The new Markdown parser.
     */
    markdownParser?: IRenderMime.IMarkdownParser;
  }
}

/* tslint:enable */

/* tslint:disable */
/**
 * The latex typesetter token.
 */
export const ILatexTypesetter = new Token<IRenderMime.ILatexTypesetter>(
  '@jupyterlab/rendermime:ILatexTypesetter'
);

export interface ILatexTypesetter extends IRenderMime.ILatexTypesetter {}

export const IMarkdownParser = new Token<IRenderMime.IMarkdownParser>(
  '@jupyterlab/rendermime:IMarkdownParser'
);

export interface IMarkdownParser extends IRenderMime.IMarkdownParser {}
/* tslint:enable */
