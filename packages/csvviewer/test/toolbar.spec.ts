// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Widget } from '@lumino/widgets';
import { simulate } from 'simulate-event';
import { CSVDelimiter, CSVViewer } from '../src';

const DELIMITERS = [',', ';', '\t'];

describe('csvviewer/toolbar', () => {
  let delimiter = DELIMITERS[0];
  const mockViewer: jest.Mock<CSVViewer> = jest.fn().mockImplementation(() => {
    return {
      delimiter
    };
  });

  beforeEach(() => {
    delimiter = DELIMITERS[0];
  });

  describe('CSVDelimiter', () => {
    describe('#constructor()', () => {
      it('should instantiate a `CSVDelimiter` toolbar widget', () => {
        const widget = new CSVDelimiter({ widget: mockViewer() });
        expect(widget).toBeInstanceOf(CSVDelimiter);
        expect(Array.from(widget.node.classList)).toEqual(
          expect.arrayContaining(['jp-CSVDelimiter'])
        );
        widget.dispose();
      });

      it('should allow pre-selecting the delimiter', () => {
        const wanted = (delimiter = DELIMITERS[DELIMITERS.length - 1]);
        const widget = new CSVDelimiter({ widget: mockViewer() });
        expect(widget.selectNode.value).toBe(wanted);
        widget.dispose();
      });
    });

    describe('#delimiterChanged', () => {
      it('should emit a value when the dropdown value changes', () => {
        const widget = new CSVDelimiter({ widget: mockViewer() });
        let delimiterTest = '';
        const index = DELIMITERS.length - 1;
        const wanted = DELIMITERS[index];
        widget.delimiterChanged.connect((s, value) => {
          delimiterTest = value;
        });
        Widget.attach(widget, document.body);
        widget.selectNode.selectedIndex = index;
        simulate(widget.selectNode, 'change');
        expect(delimiterTest).toBe(wanted);
        widget.dispose();
      });
    });

    describe('#handleEvent', () => {
      it('should change the delimiter', () => {
        const viewer = mockViewer();
        const widget = new CSVDelimiter({ widget: viewer });
        const wanted = DELIMITERS[1];
        widget.selectNode.value = wanted;
        widget.handleEvent({ type: 'change' } as any);
        expect(viewer.delimiter).toBe(wanted);
        widget.dispose();
      });
    });

    describe('#selectNode', () => {
      it('should return the delimiter dropdown select tag', () => {
        const widget = new CSVDelimiter({ widget: mockViewer() });
        expect(widget.selectNode.tagName.toLowerCase()).toBe('select');
        widget.dispose();
      });
    });

    describe('#dispose()', () => {
      it('should dispose of the resources held by the widget', () => {
        const widget = new CSVDelimiter({ widget: mockViewer() });
        expect(widget.isDisposed).toBe(false);
        widget.dispose();
        expect(widget.isDisposed).toBe(true);
      });

      it('should be safe to call multiple times', () => {
        const widget = new CSVDelimiter({ widget: mockViewer() });
        expect(widget.isDisposed).toBe(false);
        widget.dispose();
        widget.dispose();
        expect(widget.isDisposed).toBe(true);
      });
    });
  });
});
