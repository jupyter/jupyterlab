/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

import { ReadonlyJSONObject } from '@lumino/coreutils';

import { Message } from '@lumino/messaging';

import { Widget } from '@lumino/widgets';

import * as renderers from './renderers';

/**
 * A common base class for mime renderers.
 */
export abstract class RenderedCommon extends Widget
  implements IRenderMime.IRenderer {
  /**
   * Construct a new rendered common widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super();
    this.mimeType = options.mimeType;
    this.sanitizer = options.sanitizer;
    this.resolver = options.resolver;
    this.linkHandler = options.linkHandler;
    this.latexTypesetter = options.latexTypesetter;
    this.markdownParser = options.markdownParser;
    this.node.dataset['mimeType'] = this.mimeType;
  }

  /**
   * The mimetype being rendered.
   */
  readonly mimeType: string;

  /**
   * The sanitizer used to sanitize untrusted html inputs.
   */
  readonly sanitizer: IRenderMime.ISanitizer;

  /**
   * The resolver object.
   */
  readonly resolver: IRenderMime.IResolver | null;

  /**
   * The link handler.
   */
  readonly linkHandler: IRenderMime.ILinkHandler | null;

  /**
   * The latexTypesetter.
   */
  readonly latexTypesetter: IRenderMime.ILatexTypesetter;

  /**
   * The markdownParser.
   */
  readonly markdownParser: IRenderMime.IMarkdownParser;

  /**
   * Render a mime model.
   *
   * @param model - The mime model to render.
   *
   * @returns A promise which resolves when rendering is complete.
   *
   * #### Notes
   * If the DOM node for this widget already has content, it is emptied
   * before rendering. Subclasses that do not want this behavior
   * (if, for instance, they are using DOM diffing), should override
   * this method and not call `super.renderModel()`.
   */
  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    // TODO compare model against old model for early bail?

    // Empty any existing content in the node from previous renders
    while (this.node.firstChild) {
      this.node.removeChild(this.node.firstChild);
    }

    // Toggle the trusted class on the widget.
    this.toggleClass('jp-mod-trusted', model.trusted);

    // Render the actual content.
    await this.render(model);

    // Handle the fragment identifier if given.
    const { fragment } = model.metadata;
    if (fragment) {
      this.setFragment(fragment as string);
    }
  }

  /**
   * Render the mime model.
   *
   * @param model - The mime model to render.
   *
   * @returns A promise which resolves when rendering is complete.
   */
  abstract render(model: IRenderMime.IMimeModel): Promise<void>;

  /**
   * Set the URI fragment identifier.
   *
   * @param fragment - The URI fragment identifier.
   */
  protected setFragment(fragment: string) {
    /* no-op */
  }
}

/**
 * A common base class for HTML mime renderers.
 */
export abstract class RenderedHTMLCommon extends RenderedCommon {
  /**
   * Construct a new rendered HTML common widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super(options);
    this.addClass('jp-RenderedHTMLCommon');
  }

  setFragment(fragment: string) {
    let el;
    try {
      el = this.node.querySelector(fragment);
    } catch (error) {
      console.warn('Unable to set URI fragment identifier.', error);
    }
    if (el) {
      el.scrollIntoView();
    }
  }
}

/**
 * A mime renderer for displaying HTML and math.
 */
export class RenderedHTML extends RenderedHTMLCommon {
  /**
   * Construct a new rendered HTML widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super(options);
    this.addClass('jp-RenderedHTML');
  }

  /**
   * Render a mime model.
   *
   * @param model - The mime model to render.
   *
   * @returns A promise which resolves when rendering is complete.
   */
  render(model: IRenderMime.IMimeModel): Promise<void> {
    return renderers.renderHTML({
      host: this.node,
      source: String(model.data[this.mimeType]),
      trusted: model.trusted,
      resolver: this.resolver,
      sanitizer: this.sanitizer,
      linkHandler: this.linkHandler,
      shouldTypeset: this.isAttached,
      latexTypesetter: this.latexTypesetter
    });
  }

  /**
   * A message handler invoked on an `'after-attach'` message.
   */
  onAfterAttach(msg: Message): void {
    if (this.latexTypesetter) {
      this.latexTypesetter.typeset(this.node);
    }
  }
}

/**
 * A mime renderer for displaying LaTeX output.
 */
export class RenderedLatex extends RenderedCommon {
  /**
   * Construct a new rendered LaTeX widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super(options);
    this.addClass('jp-RenderedLatex');
  }

  /**
   * Render a mime model.
   *
   * @param model - The mime model to render.
   *
   * @returns A promise which resolves when rendering is complete.
   */
  render(model: IRenderMime.IMimeModel): Promise<void> {
    return renderers.renderLatex({
      host: this.node,
      source: String(model.data[this.mimeType]),
      shouldTypeset: this.isAttached,
      latexTypesetter: this.latexTypesetter
    });
  }

  /**
   * A message handler invoked on an `'after-attach'` message.
   */
  onAfterAttach(msg: Message): void {
    if (this.latexTypesetter) {
      this.latexTypesetter.typeset(this.node);
    }
  }
}

/**
 * A mime renderer for displaying images.
 */
export class RenderedImage extends RenderedCommon {
  /**
   * Construct a new rendered image widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super(options);
    this.addClass('jp-RenderedImage');
  }

  /**
   * Render a mime model.
   *
   * @param model - The mime model to render.
   *
   * @returns A promise which resolves when rendering is complete.
   */
  render(model: IRenderMime.IMimeModel): Promise<void> {
    let metadata = model.metadata[this.mimeType] as ReadonlyJSONObject;
    return renderers.renderImage({
      host: this.node,
      mimeType: this.mimeType,
      source: String(model.data[this.mimeType]),
      width: metadata && (metadata.width as number | undefined),
      height: metadata && (metadata.height as number | undefined),
      needsBackground: model.metadata['needs_background'] as string | undefined,
      unconfined: metadata && (metadata.unconfined as boolean | undefined)
    });
  }
}

/**
 * A mime renderer for displaying Markdown with embedded latex.
 */
export class RenderedMarkdown extends RenderedHTMLCommon {
  /**
   * Construct a new rendered markdown widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super(options);
    this.addClass('jp-RenderedMarkdown');
  }

  /**
   * Render a mime model.
   *
   * @param model - The mime model to render.
   *
   * @returns A promise which resolves when rendering is complete.
   */
  render(model: IRenderMime.IMimeModel): Promise<void> {
    return renderers.renderMarkdown({
      host: this.node,
      source: String(model.data[this.mimeType]),
      trusted: model.trusted,
      resolver: this.resolver,
      sanitizer: this.sanitizer,
      linkHandler: this.linkHandler,
      shouldTypeset: this.isAttached,
      latexTypesetter: this.latexTypesetter,
      markdownParser: this.markdownParser
    });
  }

  /**
   * A message handler invoked on an `'after-attach'` message.
   */
  onAfterAttach(msg: Message): void {
    if (this.latexTypesetter) {
      this.latexTypesetter.typeset(this.node);
    }
  }
}

/**
 * A widget for displaying SVG content.
 */
export class RenderedSVG extends RenderedCommon {
  /**
   * Construct a new rendered SVG widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super(options);
    this.addClass('jp-RenderedSVG');
  }

  /**
   * Render a mime model.
   *
   * @param model - The mime model to render.
   *
   * @returns A promise which resolves when rendering is complete.
   */
  render(model: IRenderMime.IMimeModel): Promise<void> {
    let metadata = model.metadata[this.mimeType] as ReadonlyJSONObject;
    return renderers.renderSVG({
      host: this.node,
      source: String(model.data[this.mimeType]),
      trusted: model.trusted,
      unconfined: metadata && (metadata.unconfined as boolean | undefined)
    });
  }

  /**
   * A message handler invoked on an `'after-attach'` message.
   */
  onAfterAttach(msg: Message): void {
    if (this.latexTypesetter) {
      this.latexTypesetter.typeset(this.node);
    }
  }
}

/**
 * A widget for displaying plain text and console text.
 */
export class RenderedText extends RenderedCommon {
  /**
   * Construct a new rendered text widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super(options);
    this.addClass('jp-RenderedText');
  }

  /**
   * Render a mime model.
   *
   * @param model - The mime model to render.
   *
   * @returns A promise which resolves when rendering is complete.
   */
  render(model: IRenderMime.IMimeModel): Promise<void> {
    return renderers.renderText({
      host: this.node,
      sanitizer: this.sanitizer,
      source: String(model.data[this.mimeType])
    });
  }
}

/**
 * A widget for displaying deprecated JavaScript output.
 */
export class RenderedJavaScript extends RenderedCommon {
  /**
   * Construct a new rendered text widget.
   *
   * @param options - The options for initializing the widget.
   */
  constructor(options: IRenderMime.IRendererOptions) {
    super(options);
    this.addClass('jp-RenderedJavaScript');
  }

  /**
   * Render a mime model.
   *
   * @param model - The mime model to render.
   *
   * @returns A promise which resolves when rendering is complete.
   */
  render(model: IRenderMime.IMimeModel): Promise<void> {
    return renderers.renderText({
      host: this.node,
      sanitizer: this.sanitizer,
      source: 'JavaScript output is disabled in JupyterLab'
    });
  }
}
