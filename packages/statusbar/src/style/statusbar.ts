// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { textItem } from './text';
import { style } from 'typestyle/lib';
import vars from './variables';
import { rightToLeft, leftToRight, centeredFlex } from './layout';

const itemPadding = {
  paddingLeft: vars.itemPadding,
  paddingRight: vars.itemPadding
};

const interactiveHover = {
  $nest: {
    '&:hover': {
      backgroundColor: vars.hoverColor,
      cursor: vars.hoverCursor
    }
  }
};

const clicked = {
  backgroundColor: vars.clickColor,
  $nest: {
    ['.' + textItem]: {
      color: vars.textClickColor
    }
  }
};

export const statusBar = style(
  {
    background: vars.backgroundColor,
    minHeight: vars.height,
    justifyContent: 'space-between',
    paddingLeft: vars.statusBarPadding,
    paddingRight: vars.statusBarPadding
  },
  centeredFlex
);

export const side = style(centeredFlex);

export const leftSide = style(leftToRight);

export const rightSide = style(rightToLeft);

export const item = style(
  {
    maxHeight: vars.height,
    marginLeft: vars.itemMargin,
    marginRight: vars.itemMargin,
    height: vars.height,
    whiteSpace: vars.whiteSpace,
    textOverflow: vars.textOverflow,
    color: vars.textColor
  },
  itemPadding
);

export const clickedItem = style(clicked);
export const interactiveItem = style(interactiveHover);

export const noUserSelect = style({
  userSelect: 'none'
});
