// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { LabIcon } from '@jupyterlab/ui-components';

import closeAllSvgStr from '../style/icons/close-all.svg';
import stepIntoSvgStr from '../style/icons/step-into.svg';
import stepOutSvgStr from '../style/icons/step-out.svg';
import stepOverSvgStr from '../style/icons/step-over.svg';
import variableSvgStr from '../style/icons/variable.svg';
import pauseSvgStr from '../style/icons/pause.svg';
import viewBreakpointSvgStr from '../style/icons/view-breakpoint.svg';

export {
  runIcon as continueIcon,
  stopIcon as terminateIcon
} from '@jupyterlab/ui-components';

export const closeAllIcon = new LabIcon({
  name: 'debugger:close-all',
  svgstr: closeAllSvgStr
});

export const pauseOnExceptionsIcon = new LabIcon({
  name: 'debugger:pause',
  svgstr: pauseSvgStr
});

export const stepIntoIcon = new LabIcon({
  name: 'debugger:step-into',
  svgstr: stepIntoSvgStr
});

export const stepOverIcon = new LabIcon({
  name: 'debugger:step-over',
  svgstr: stepOverSvgStr
});

export const stepOutIcon = new LabIcon({
  name: 'debugger:step-out',
  svgstr: stepOutSvgStr
});

export const variableIcon = new LabIcon({
  name: 'debugger:variable',
  svgstr: variableSvgStr
});

export const viewBreakpointIcon = new LabIcon({
  name: 'debugger:view-breakpoint',
  svgstr: viewBreakpointSvgStr
});
