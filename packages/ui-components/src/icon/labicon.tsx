// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { UUID } from '@lumino/coreutils';
import { Signal } from '@lumino/signaling';
import { ElementAttrs, VirtualElement, VirtualNode } from '@lumino/virtualdom';
import React from 'react';
import ReactDOM from 'react-dom';

import { LabIconStyle } from '../style';
import { getReactAttrs, classes } from '../utils';

import badSvgstr from '../../style/debug/bad.svg';
import blankSvgstr from '../../style/debug/blank.svg';
import refreshSvgstr from '../../style/icons/toolbar/refresh.svg';

export class LabIcon implements LabIcon.ILabIcon, VirtualElement.IRenderer {
  /** *********
   * statics *
   ***********/

  /**
   * Remove any rendered icon from the element that contains it
   *
   * @param container - a DOM node into which an icon was
   * previously rendered
   *
   * @returns the cleaned container
   */
  static remove(container: HTMLElement) {
    // clean up all children
    while (container.firstChild) {
      container.firstChild.remove();
    }

    // remove all classes
    container.className = '';

    return container;
  }

  /**
   * Resolve an icon name or a {name, svgstr} pair into an
   * actual LabIcon.
   *
   * @param icon - either a string with the name of an existing icon
   * or an object with {name: string, svgstr: string} fields.
   *
   * @returns a LabIcon instance
   */
  static resolve({ icon }: { icon: LabIcon.IResolvable }): LabIcon {
    if (icon instanceof LabIcon) {
      // icon already is a LabIcon; nothing to do here
      return icon;
    }

    if (typeof icon === 'string') {
      // do a dynamic lookup of existing icon by name
      const resolved = LabIcon._instances.get(icon);
      if (resolved) {
        return resolved;
      }

      // lookup failed
      if (LabIcon._debug) {
        // fail noisily
        console.warn(
          `Lookup failed for icon, creating loading icon. icon: ${icon}`
        );
      }

      // no matching icon currently registered, create a new loading icon
      // TODO: find better icon (maybe animate?) for loading icon
      return new LabIcon({ name: icon, svgstr: refreshSvgstr, _loading: true });
    }

    // icon was provided as a non-LabIcon {name, svgstr} pair, communicating
    // an intention to create a new icon
    return new LabIcon(icon);
  }

  /**
   * Resolve an icon name or a {name, svgstr} pair into a DOM element.
   * If icon arg is undefined, the function will fall back to trying to render
   * the icon as a CSS background image, via the iconClass arg.
   * If both icon and iconClass are undefined, this function will return
   * an empty div.
   *
   * @param icon - optional, either a string with the name of an existing icon
   * or an object with {name: string, svgstr: string} fields
   *
   * @param iconClass - optional, if the icon arg is not set, the iconClass arg
   * should be a CSS class associated with an existing CSS background-image
   *
   * @deprecated fallback - don't use, optional, a LabIcon instance that will
   * be used if neither icon nor iconClass are defined
   *
   * @param props - any additional args are passed though to the element method
   * of the resolved icon on render
   *
   * @returns a DOM node with the resolved icon rendered into it
   */
  static resolveElement({
    icon,
    iconClass,
    fallback,
    ...props
  }: Partial<LabIcon.IResolverProps> & LabIcon.IProps) {
    if (!Private.isResolvable(icon)) {
      if (!iconClass && fallback) {
        // if neither icon nor iconClass are defined/resolvable, use fallback
        return fallback.element(props);
      }

      // set the icon's class to iconClass plus props.className
      props.className = classes(iconClass, props.className);
      // render icon as css background image, assuming one is set on iconClass
      return Private.blankElement(props);
    }

    return LabIcon.resolve({ icon }).element(props);
  }

  /**
   * Resolve an icon name or a {name, svgstr} pair into a React component.
   * If icon arg is undefined, the function will fall back to trying to render
   * the icon as a CSS background image, via the iconClass arg.
   * If both icon and iconClass are undefined, the returned component
   * will simply render an empty div.
   *
   * @param icon - optional, either a string with the name of an existing icon
   * or an object with {name: string, svgstr: string} fields
   *
   * @param iconClass - optional, if the icon arg is not set, the iconClass arg
   * should be a CSS class associated with an existing CSS background-image
   *
   * @deprecated fallback - don't use, optional, a LabIcon instance that will
   * be used if neither icon nor iconClass are defined
   *
   * @param props - any additional args are passed though to the React component
   * of the resolved icon on render
   *
   * @returns a React component that will render the resolved icon
   */
  static resolveReact({
    icon,
    iconClass,
    fallback,
    ...props
  }: Partial<LabIcon.IResolverProps> & LabIcon.IReactProps) {
    if (!Private.isResolvable(icon)) {
      if (!iconClass && fallback) {
        // if neither icon nor iconClass are defined/resolvable, use fallback
        return <fallback.react {...props} />;
      }

      // set the icon's class to iconClass plus props.className
      props.className = classes(iconClass, props.className);
      // render icon as css background image, assuming one is set on iconClass
      return <Private.blankReact {...props} />;
    }

    const resolved = LabIcon.resolve({ icon });
    return <resolved.react {...props} />;
  }

  /**
   * Resolve a {name, svgstr} pair into an actual svg node.
   */
  static resolveSvg({ name, svgstr }: LabIcon.IIcon): HTMLElement | null {
    const svgDoc = new DOMParser().parseFromString(
      Private.svgstrShim(svgstr),
      'image/svg+xml'
    );

    const svgError = svgDoc.querySelector('parsererror');

    // structure of error element varies by browser, search at top level
    if (svgError) {
      // parse failed, svgElement will be an error box
      const errmsg = `SVG HTML was malformed for LabIcon instance.\nname: ${name}, svgstr: ${svgstr}`;
      if (LabIcon._debug) {
        // fail noisily, render the error box
        console.error(errmsg);
        return svgError as HTMLElement;
      } else {
        // bad svg is always a real error, fail silently but warn
        console.warn(errmsg);
        return null;
      }
    } else {
      // parse succeeded
      return svgDoc.documentElement;
    }
  }

  /**
   * Toggle icon debug from off-to-on, or vice-versa.
   *
   * @param debug - optional boolean to force debug on or off
   */
  static toggleDebug(debug?: boolean) {
    LabIcon._debug = debug ?? !LabIcon._debug;
  }

  private static _debug: boolean = false;
  private static _instances = new Map<string, LabIcon>();

  /** *********
   * members *
   ***********/

  constructor({
    name,
    svgstr,
    render,
    unrender,
    _loading = false
  }: LabIcon.IOptions & { _loading?: boolean }) {
    if (!(name && svgstr)) {
      // sanity check failed
      console.error(
        `When defining a new LabIcon, name and svgstr must both be non-empty strings. name: ${name}, svgstr: ${svgstr}`
      );
      return badIcon;
    }

    // currently this needs to be set early, before checks for existing icons
    this._loading = _loading;

    // check to see if this is a redefinition of an existing icon
    if (LabIcon._instances.has(name)) {
      // fetch the existing icon, replace its svg, then return it
      const icon = LabIcon._instances.get(name)!;
      if (this._loading) {
        // replace the placeholder svg in icon
        icon.svgstr = svgstr;
        this._loading = false;
        return icon;
      } else {
        // already loaded icon svg exists; replace it and warn
        // TODO: need to see if this warning is useful or just noisy
        console.warn(
          `Redefining previously loaded icon svgstr. name: ${name}, svgstrOld: ${icon.svgstr}, svgstr: ${svgstr}`
        );
        icon.svgstr = svgstr;
        return icon;
      }
    }

    this.name = name;
    this.react = this._initReact(name);
    this.svgstr = svgstr;

    // setup custom render/unrender methods, if passed in
    this._initRender({ render, unrender });

    LabIcon._instances.set(this.name, this);
  }

  /**
   * Get a view of this icon that is bound to the specified icon/style props
   *
   * @param optional icon/style props (same as args for .element
   * and .react methods). These will be bound to the resulting view
   *
   * @returns a view of this LabIcon instance
   */
  bindprops(props?: LabIcon.IProps) {
    const view = Object.create(this);
    view._props = props;
    view.react = view._initReact(view.name + '_bind');
    return view;
  }

  /**
   * Create an icon as a DOM element
   *
   * @param className - a string that will be used as the class
   * of the container element. Overrides any existing class
   *
   * @param container - a preexisting DOM element that
   * will be used as the container for the svg element
   *
   * @param label - text that will be displayed adjacent
   * to the icon
   *
   * @param title - a tooltip for the icon
   *
   * @param tag - if container is not explicitly
   * provided, this tag will be used when creating the container
   *
   * @param stylesheet - optional string naming a builtin icon
   * stylesheet, for example 'menuItem' or `statusBar`. Can also be an
   * object defining a custom icon stylesheet, or a list of builtin
   * stylesheet names and/or custom stylesheet objects. If array,
   * the given stylesheets will be merged.
   *
   *   See @jupyterlab/ui-components/src/style/icon.ts for details
   *
   * @param elementPosition - optional position for the inner svg element
   *
   * @param elementSize - optional size for the inner svg element.
   * Set to 'normal' to get a standard 16px x 16px icon
   *
   * @param ...elementCSS - all additional args are treated as
   * overrides for the CSS props applied to the inner svg element
   *
   * @returns A DOM element that contains an (inline) svg element
   * that displays an icon
   */
  element(props: LabIcon.IProps = {}): HTMLElement {
    let {
      className,
      container,
      label,
      title,
      tag = 'div',
      ...styleProps
    }: LabIcon.IProps = { ...this._props, ...props };

    // check if icon element is already set
    const maybeSvgElement = container?.firstChild as HTMLElement;
    if (
      maybeSvgElement?.dataset?.iconId === this._uuid &&
      container?.title === title &&
      container?.textContent === label &&
      container?.tagName === tag
    ) {
      // return the existing icon element
      return maybeSvgElement;
    }

    // ensure that svg html is valid
    if (!this.svgElement) {
      // bail if failing silently, return blank element
      return document.createElement('div');
    }

    let returnSvgElement = true;
    if (container) {
      // take ownership by removing any existing children
      while (container.firstChild) {
        container.firstChild.remove();
      }
    } else {
      // create a container if needed
      container = document.createElement(tag);

      returnSvgElement = false;
    }
    if (label != null) {
      container.textContent = label;
    }
    Private.initContainer({ container, className, styleProps, title });

    // add the svg node to the container
    const svgElement = this.svgElement.cloneNode(true) as HTMLElement;
    container.appendChild(svgElement);

    return returnSvgElement ? svgElement : container;
  }

  render(container: HTMLElement, options?: LabIcon.IRendererOptions): void {
    let label = options?.children?.[0];
    // narrow type of label
    if (typeof label !== 'string') {
      label = undefined;
    }

    this.element({
      container,
      label,
      ...options?.props
    });
  }

  protected get svgElement(): HTMLElement | null {
    if (this._svgElement === undefined) {
      this._svgElement = this._initSvg({ uuid: this._uuid });
    }

    return this._svgElement;
  }

  protected get svgInnerHTML(): string | null {
    if (this._svgInnerHTML === undefined) {
      if (this.svgElement === null) {
        // the svg element resolved to null, mark this null too
        this._svgInnerHTML = null;
      } else {
        this._svgInnerHTML = this.svgElement.innerHTML;
      }
    }

    return this._svgInnerHTML;
  }

  protected get svgReactAttrs(): any | null {
    if (this._svgReactAttrs === undefined) {
      if (this.svgElement === null) {
        // the svg element resolved to null, mark this null too
        this._svgReactAttrs = null;
      } else {
        this._svgReactAttrs = getReactAttrs(this.svgElement, {
          ignore: ['data-icon-id']
        });
      }
    }

    return this._svgReactAttrs;
  }

  get svgstr() {
    return this._svgstr;
  }

  set svgstr(svgstr: string) {
    this._svgstr = svgstr;

    // associate a new unique id with this particular svgstr
    const uuid = UUID.uuid4();
    const uuidOld = this._uuid;
    this._uuid = uuid;

    // empty the svg parsing intermediates cache
    this._svgElement = undefined;
    this._svgInnerHTML = undefined;
    this._svgReactAttrs = undefined;

    // update icon elements created using .element method
    document
      .querySelectorAll(`[data-icon-id="${uuidOld}"]`)
      .forEach(oldSvgElement => {
        if (this.svgElement) {
          oldSvgElement.replaceWith(this.svgElement.cloneNode(true));
        }
      });

    // trigger update of icon elements created using other methods
    this._svgReplaced.emit();
  }

  unrender?(container: HTMLElement, options?: LabIcon.IRendererOptions): void;

  protected _initReact(displayName: string) {
    const component = React.forwardRef(
      (props: LabIcon.IProps = {}, ref: LabIcon.IReactRef) => {
        const {
          className,
          container,
          label,
          title,
          tag = 'div',
          ...styleProps
        }: LabIcon.IProps = { ...this._props, ...props };

        // set up component state via useState hook
        const [, setId] = React.useState(this._uuid);

        // subscribe to svg replacement via useEffect hook
        React.useEffect(() => {
          const onSvgReplaced = () => {
            setId(this._uuid);
          };

          this._svgReplaced.connect(onSvgReplaced);

          // specify cleanup callback as hook return
          return () => {
            this._svgReplaced.disconnect(onSvgReplaced);
          };
        });

        // make it so that tag can be used as a jsx component
        const Tag = tag;

        // ensure that svg html is valid
        if (!(this.svgInnerHTML && this.svgReactAttrs)) {
          // bail if failing silently
          return <></>;
        }

        const svgComponent = (
          <svg
            {...this.svgReactAttrs}
            dangerouslySetInnerHTML={{ __html: this.svgInnerHTML }}
            ref={ref}
          />
        );

        if (container) {
          Private.initContainer({ container, className, styleProps, title });

          return (
            <React.Fragment>
              {svgComponent}
              {label}
            </React.Fragment>
          );
        } else {
          return (
            <Tag
              className={classes(
                className,
                LabIconStyle.styleClass(styleProps)
              )}
            >
              {svgComponent}
              {label}
            </Tag>
          );
        }
      }
    );

    component.displayName = `LabIcon_${displayName}`;
    return component;
  }

  protected _initRender({
    render,
    unrender
  }: Partial<VirtualElement.IRenderer>) {
    if (render) {
      this.render = render;
      if (unrender) {
        this.unrender = unrender;
      }
    } else if (unrender) {
      console.warn(
        'In _initRender, ignoring unrender arg since render is undefined'
      );
    }
  }

  protected _initSvg({
    title,
    uuid
  }: { title?: string; uuid?: string } = {}): HTMLElement | null {
    const svgElement = LabIcon.resolveSvg(this);

    if (!svgElement) {
      // bail on null svg element
      return svgElement;
    }

    if (svgElement.tagName !== 'parsererror') {
      // svgElement is an actual svg node, augment it
      svgElement.dataset.icon = this.name;

      if (uuid) {
        svgElement.dataset.iconId = uuid;
      }

      if (title) {
        Private.setTitleSvg(svgElement, title);
      }
    }

    return svgElement;
  }

  readonly name: string;

  /**
   * A React component that will create the icon.
   *
   * @param className - a string that will be used as the class
   * of the container element. Overrides any existing class
   *
   * @param container - a preexisting DOM element that
   * will be used as the container for the svg element
   *
   * @param label - text that will be displayed adjacent
   * to the icon
   *
   * @param title - a tooltip for the icon
   *
   * @param tag - if container is not explicitly
   * provided, this tag will be used when creating the container
   *
   * @param stylesheet - optional string naming a builtin icon
   * stylesheet, for example 'menuItem' or `statusBar`. Can also be an
   * object defining a custom icon stylesheet, or a list of builtin
   * stylesheet names and/or custom stylesheet objects. If array,
   * the given stylesheets will be merged.
   *
   *   See @jupyterlab/ui-components/src/style/icon.ts for details
   *
   * @param elementPosition - optional position for the inner svg element
   *
   * @param elementSize - optional size for the inner svg element.
   * Set to 'normal' to get a standard 16px x 16px icon
   *
   * @param ...elementCSS - all additional args are treated as
   * overrides for the CSS props applied to the inner svg element
   *
   * @param ref - forwarded to the ref prop of the icon's svg element
   */
  readonly react: LabIcon.IReact;

  protected _className: string;
  protected _loading: boolean;
  protected _props: LabIcon.IProps = {};
  protected _svgReplaced = new Signal<this, void>(this);
  protected _svgstr: string;
  protected _uuid: string;

  /**
   * Cache for svg parsing intermediates
   *   - undefined: the cache has not yet been populated
   *   - null: a valid, but empty, value
   */
  protected _svgElement: HTMLElement | null | undefined = undefined;
  protected _svgInnerHTML: string | null | undefined = undefined;
  protected _svgReactAttrs: any | null | undefined = undefined;
}

/**
 * A namespace for LabIcon statics.
 */
export namespace LabIcon {
  /** ***********
   * interfaces *
   *************/

  /**
   * The simplest possible interface for defining a generic icon.
   */
  export interface IIcon {
    /**
     * The name of the icon. By convention, the icon name will be namespaced
     * as so:
     *
     *     "pkg-name:icon-name"
     */
    readonly name: string;

    /**
     * A string containing the raw contents of an svg file.
     */
    svgstr: string;
  }

  export interface IRendererOptions {
    attrs?: ElementAttrs;
    children?: ReadonlyArray<VirtualNode>;
    props?: IProps;
  }

  /**
   * The ILabIcon interface. Outside of this interface the actual
   * implementation of LabIcon may vary
   */
  export interface ILabIcon extends IIcon, VirtualElement.IRenderer {}

  /**
   * Interface defining the parameters to be passed to the LabIcon
   * constructor
   */
  export interface IOptions extends IIcon, Partial<VirtualElement.IRenderer> {}

  /**
   * The input props for creating a new LabIcon
   */
  export interface IProps extends LabIconStyle.IProps {
    /**
     * Extra classNames. Used in addition to the typestyle className to
     * set the className of the icon's outermost container node
     */
    className?: string;

    /**
     * The icon's outermost node, which acts as a container for the actual
     * svg node. If container is not supplied, it will be created
     */
    container?: HTMLElement;

    /**
     * Optional text label that will be added as a sibling to the icon's
     * svg node
     */
    label?: string;

    /**
     * HTML element tag used to create the icon's outermost container node,
     * if no container is passed in
     */
    tag?: 'div' | 'span';

    /**
     * Optional title that will be set on the icon's outermost container node
     */
    title?: string;
  }

  export interface IResolverProps {
    icon?: IMaybeResolvable;
    iconClass?: string;
    fallback?: LabIcon;
  }

  /** ******
   * types *
   *********/

  /**
   * A type that can be resolved to a LabIcon instance.
   */
  export type IResolvable =
    | string
    | (IIcon & Partial<VirtualElement.IRenderer>);

  /**
   * A type that maybe can be resolved to a LabIcon instance.
   */
  export type IMaybeResolvable =
    | IResolvable
    | VirtualElement.IRenderer
    | undefined;

  /**
   * The type of the svg node ref that can be passed into icon React components
   */
  export type IReactRef = React.RefObject<SVGElement>;

  /**
   * The properties that can be passed into the React component stored in
   * the .react field of a LabIcon.
   */
  export type IReactProps = IProps & React.RefAttributes<SVGElement>;

  /**
   * The complete type of the React component stored in the .react
   * field of a LabIcon.
   */
  export type IReact = React.ForwardRefExoticComponent<IReactProps>;
}

namespace Private {
  export function blankElement({
    className = '',
    container,
    label,
    title,
    tag = 'div',
    ...styleProps
  }: LabIcon.IProps): HTMLElement {
    if (container?.className === className) {
      // nothing needs doing, return the icon node
      return container;
    }

    if (container) {
      // take ownership by removing any existing children
      while (container.firstChild) {
        container.firstChild.remove();
      }
    } else {
      // create a container if needed
      container = document.createElement(tag);
    }
    if (label != null) {
      container.textContent = label;
    }
    Private.initContainer({ container, className, styleProps, title });

    return container;
  }

  export const blankReact = React.forwardRef(
    (
      {
        className = '',
        container,
        label,
        title,
        tag = 'div',
        ...styleProps
      }: LabIcon.IProps,
      ref: LabIcon.IReactRef
    ) => {
      // make it so that tag can be used as a jsx component
      const Tag = tag;

      if (container) {
        initContainer({ container, className, styleProps, title });

        return <></>;
      } else {
        // if ref is defined, we create a blank svg node and point ref to it
        return (
          <Tag
            className={classes(className, LabIconStyle.styleClass(styleProps))}
          >
            {ref && blankIcon.react({ ref })}
            {label}
          </Tag>
        );
      }
    }
  );
  blankReact.displayName = 'BlankReact';

  export function initContainer({
    container,

    className,
    styleProps,
    title
  }: {
    container: HTMLElement;
    className?: string;
    styleProps?: LabIconStyle.IProps;
    title?: string;
  }): string {
    if (title != null) {
      container.title = title;
    }
    const styleClass = LabIconStyle.styleClass(styleProps);

    if (className != null) {
      // override the container class with explicitly passed-in class + style class
      const classResolved = classes(className, styleClass);
      container.className = classResolved;
      return classResolved;
    } else if (styleClass) {
      // add the style class to the container class
      container.classList.add(styleClass);
      return styleClass;
    } else {
      return '';
    }
  }

  export function isResolvable(
    icon: LabIcon.IMaybeResolvable
  ): icon is LabIcon.IResolvable {
    return !!(
      icon &&
      (typeof icon === 'string' ||
        ((icon as LabIcon.IIcon).name && (icon as LabIcon.IIcon).svgstr))
    );
  }

  export function setTitleSvg(svgNode: HTMLElement, title: string): void {
    // add a title node to the top level svg node
    const titleNodes = svgNode.getElementsByTagName('title');
    if (titleNodes.length) {
      titleNodes[0].textContent = title;
    } else {
      const titleNode = document.createElement('title');
      titleNode.textContent = title;
      svgNode.appendChild(titleNode);
    }
  }

  /**
   * A shim for svgstrs loaded using any loader other than raw-loader.
   * This function assumes that svgstr will look like one of:
   *
   * - the raw contents of an .svg file:
   *   <svg...</svg>
   *
   * - a data URL:
   *   data:[<mediatype>][;base64],<svg...</svg>
   *
   * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
   */
  export function svgstrShim(svgstr: string, strict: boolean = true): string {
    // decode any uri escaping, condense leading/lagging whitespace,
    // then match to raw svg string
    const [, base64, raw] = decodeURIComponent(svgstr)
      .replace(/>\s*\n\s*</g, '><')
      .replace(/\s*\n\s*/g, ' ')
      .match(
        strict
          ? // match based on data url schema
            /^(?:data:.*?(;base64)?,)?(.*)/
          : // match based on open of svg tag
            /(?:(base64).*)?(<svg.*)/
      )!;

    // decode from base64, if needed
    return base64 ? atob(raw) : raw;
  }

  /**
   * TODO: figure out story for independent Renderers.
   * Base implementation of IRenderer.
   */
  export class Renderer implements VirtualElement.IRenderer {
    constructor(
      protected _icon: LabIcon,
      protected _rendererOptions?: LabIcon.IRendererOptions
    ) {}

    // eslint-disable-next-line
    render(container: HTMLElement, options?: LabIcon.IRendererOptions): void {}
    unrender?(container: HTMLElement, options?: LabIcon.IRendererOptions): void;
  }

  /**
   * TODO: figure out story for independent Renderers.
   * Implementation of IRenderer that creates the icon svg node
   * as a DOM element.
   */
  export class ElementRenderer extends Renderer {
    render(container: HTMLElement, options?: LabIcon.IRendererOptions): void {
      let label = options?.children?.[0];
      // narrow type of label
      if (typeof label !== 'string') {
        label = undefined;
      }

      this._icon.element({
        container,
        label,
        ...this._rendererOptions?.props,
        ...options?.props
      });
    }
  }

  /**
   * TODO: figure out story for independent Renderers.
   * Implementation of IRenderer that creates the icon svg node
   * as a React component.
   */
  export class ReactRenderer extends Renderer {
    render(container: HTMLElement, options?: LabIcon.IRendererOptions): void {
      let label = options?.children?.[0];
      // narrow type of label
      if (typeof label !== 'string') {
        label = undefined;
      }

      ReactDOM.render(
        <this._icon.react
          container={container}
          label={label}
          {...{ ...this._rendererOptions?.props, ...options?.props }}
        />,
        container
      );
    }

    unrender(container: HTMLElement): void {
      ReactDOM.unmountComponentAtNode(container);
    }
  }
}

// need to be at the bottom since constructor depends on Private
export const badIcon = new LabIcon({
  name: 'ui-components:bad',
  svgstr: badSvgstr
});
export const blankIcon = new LabIcon({
  name: 'ui-components:blank',
  svgstr: blankSvgstr
});
