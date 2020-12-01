// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
import { Property } from 'csstype';

export default {
  hoverColor: 'var(--jp-layout-color3)',
  hoverCursor: 'pointer',
  clickColor: 'var(--jp-brand-color1)',
  backgroundColor: 'var(--jp-layout-color2)',
  height: '24px',
  fontSize: 'var(--jp-ui-font-size1)',
  fontFamily: 'var(--jp-ui-font-family)',
  textColor: 'var(--jp-ui-font-color1)',
  textClickColor: 'white',
  itemMargin: '2px',
  itemPadding: '6px',
  statusBarPadding: '10px',
  interItemHalfSpacing: '2px', // this amount accounts for half the spacing between items
  whiteSpace: 'nowrap' as Property.WhiteSpace,
  textOverflow: 'ellipsis'
};
