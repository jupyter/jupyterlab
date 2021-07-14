// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { CodeEditor } from '@jupyterlab/codeeditor';
import {
  Completer,
  CompleterModel,
  CompletionHandler
} from '@jupyterlab/completer';
import { toArray } from '@lumino/algorithm';
import { JSONExt } from '@lumino/coreutils';

function makeState(text: string): Completer.ITextState {
  return {
    column: 0,
    lineHeight: 0,
    charWidth: 0,
    line: 0,
    coords: { left: 0, right: 0, top: 0, bottom: 0 } as CodeEditor.ICoordinate,
    text
  };
}

describe('completer/model', () => {
  describe('CompleterModel', () => {
    describe('#constructor()', () => {
      it('should create a completer model', () => {
        const model = new CompleterModel();
        expect(model).toBeInstanceOf(CompleterModel);
        expect(model.setCompletionItems).toBeDefined();
      });
    });

    describe('#stateChanged', () => {
      it('should signal when model options have changed', () => {
        const model = new CompleterModel();
        let called = 0;
        const listener = (sender: any, args: void) => {
          called++;
        };
        model.stateChanged.connect(listener);
        expect(called).toBe(0);
        model.setOptions(['foo']);
        expect(called).toBe(1);
        model.setOptions(['foo'], { foo: 'instance' });
        expect(called).toBe(2);
      });

      it('should signal when model items have changed', () => {
        let model = new CompleterModel();
        let called = 0;
        let listener = (sender: any, args: void) => {
          called++;
        };
        model.stateChanged.connect(listener);
        expect(called).toBe(0);
        model.setCompletionItems!([{ label: 'foo' }]);
        expect(called).toBe(1);
        model.setCompletionItems!([{ label: 'foo' }]);
        model.setCompletionItems!([{ label: 'foo' }, { label: 'bar' }]);
        expect(called).toBe(2);
      });

      it('should not signal when options have not changed', () => {
        const model = new CompleterModel();
        let called = 0;
        const listener = (sender: any, args: void) => {
          called++;
        };
        model.stateChanged.connect(listener);
        expect(called).toBe(0);
        model.setOptions(['foo']);
        model.setOptions(['foo']);
        expect(called).toBe(1);
        model.setOptions(['foo'], { foo: 'instance' });
        model.setOptions(['foo'], { foo: 'instance' });
        expect(called).toBe(2);
        model.setOptions([], {});
        model.setOptions([], {});
        expect(called).toBe(3);
      });

      it('should not signal when items have not changed', () => {
        let model = new CompleterModel();
        let called = 0;
        let listener = (sender: any, args: void) => {
          called++;
        };
        model.stateChanged.connect(listener);
        expect(called).toBe(0);
        model.setCompletionItems!([{ label: 'foo' }]);
        model.setCompletionItems!([{ label: 'foo' }]);
        expect(called).toBe(1);
        model.setCompletionItems!([{ label: 'foo' }, { label: 'bar' }]);
        model.setCompletionItems!([{ label: 'foo' }, { label: 'bar' }]);
        expect(called).toBe(2);
        model.setCompletionItems!([]);
        model.setCompletionItems!([]);
        expect(called).toBe(3);
      });

      it('should signal when original request changes', () => {
        const model = new CompleterModel();
        let called = 0;
        const listener = (sender: any, args: void) => {
          called++;
        };
        model.stateChanged.connect(listener);
        expect(called).toBe(0);
        model.original = makeState('foo');
        expect(called).toBe(1);
        model.original = null;
        expect(called).toBe(2);
      });

      it('should not signal when original request has not changed', () => {
        const model = new CompleterModel();
        let called = 0;
        const listener = (sender: any, args: void) => {
          called++;
        };
        model.stateChanged.connect(listener);
        expect(called).toBe(0);
        model.original = makeState('foo');
        model.original = makeState('foo');
        expect(called).toBe(1);
        model.original = null;
        model.original = null;
        expect(called).toBe(2);
      });

      it('should signal when current text changes', () => {
        const model = new CompleterModel();
        let called = 0;
        const currentValue = 'foo';
        const newValue = 'foob';
        const cursor: Completer.ICursorSpan = { start: 0, end: 0 };
        const request = makeState(currentValue);
        const change = makeState(newValue);
        const listener = (sender: any, args: void) => {
          called++;
        };
        model.stateChanged.connect(listener);
        expect(called).toBe(0);
        model.original = request;
        expect(called).toBe(1);
        model.cursor = cursor;
        model.current = change;
        expect(called).toBe(2);
        model.current = null;
        expect(called).toBe(3);
      });

      it('should not signal when current text is unchanged', () => {
        const model = new CompleterModel();
        let called = 0;
        const currentValue = 'foo';
        const newValue = 'foob';
        const cursor: Completer.ICursorSpan = { start: 0, end: 0 };
        const request = makeState(currentValue);
        const change = makeState(newValue);
        const listener = (sender: any, args: void) => {
          called++;
        };
        model.stateChanged.connect(listener);
        expect(called).toBe(0);
        model.original = request;
        expect(called).toBe(1);
        model.cursor = cursor;
        model.current = change;
        model.current = change;
        expect(called).toBe(2);
        model.current = null;
        model.current = null;
        expect(called).toBe(3);
      });
    });

    describe('#completionItems()', () => {
      it('should default to { items: [] }', () => {
        let model = new CompleterModel();
        let want: CompletionHandler.ICompletionItems = [];
        expect(model.completionItems!()).toEqual(want);
      });

      it('should return unmarked ICompletionItems if query is blank', () => {
        let model = new CompleterModel();
        let want: CompletionHandler.ICompletionItems = [
          { label: 'foo' },
          { label: 'bar' },
          { label: 'baz' }
        ];
        model.setCompletionItems!([
          { label: 'foo' },
          { label: 'bar' },
          { label: 'baz' }
        ]);
        expect(model.completionItems!()).toEqual(want);
      });

      it('should return a marked list of items if query is set', () => {
        let model = new CompleterModel();
        let want = '<mark>f</mark>oo';
        model.setCompletionItems!([
          { label: 'foo' },
          { label: 'bar' },
          { label: 'baz' }
        ]);
        model.query = 'f';
        expect(model.completionItems!().length).toEqual(1);
        expect(model.completionItems!()[0].label).toEqual(want);
      });

      it('should order list based on score', () => {
        const model = new CompleterModel();
        const want: CompletionHandler.ICompletionItems = [
          { insertText: 'qux', label: '<mark>qux</mark>' },
          { insertText: 'quux', label: '<mark>qu</mark>u<mark>x</mark>' }
        ];
        model.setCompletionItems!([
          { label: 'foo' },
          { label: 'bar' },
          { label: 'baz' },
          { label: 'quux' },
          { label: 'qux' }
        ]);
        model.query = 'qux';
        expect(model.completionItems!()).toEqual(want);
      });

      it('should break ties in score by locale sort', () => {
        const model = new CompleterModel();
        const want: CompletionHandler.ICompletionItems = [
          { insertText: 'quux', label: '<mark>qu</mark>ux' },
          { insertText: 'qux', label: '<mark>qu</mark>x' }
        ];
        model.setCompletionItems!([
          { label: 'foo' },
          { label: 'bar' },
          { label: 'baz' },
          { label: 'quux' },
          { label: 'qux' }
        ]);
        model.query = 'qu';
        expect(model.completionItems!()).toEqual(want);
      });

      it('should return { items: [] } if reset', () => {
        let model = new CompleterModel();
        let want: CompletionHandler.ICompletionItems = [];
        model.setCompletionItems!([
          { label: 'foo' },
          { label: 'bar' },
          { label: 'baz' }
        ]);
        model.reset();
        expect(model.completionItems!()).toEqual(want);
      });

      it('should escape HTML markup', () => {
        let model = new CompleterModel();
        let want: CompletionHandler.ICompletionItems = [
          {
            label: '&lt;foo&gt;&lt;/foo&gt;',
            insertText: '<foo></foo>'
          }
        ];
        model.setCompletionItems!([{ label: '<foo></foo>' }]);
        expect(model.completionItems!()).toEqual(want);
      });

      it('should escape HTML with matches markup', () => {
        let model = new CompleterModel();
        let want: CompletionHandler.ICompletionItems = [
          {
            label: '&lt;foo&gt;<mark>smi</mark>le&lt;/foo&gt;',
            insertText: '<foo>smile</foo>'
          }
        ];
        model.setCompletionItems!([{ label: '<foo>smile</foo>' }]);
        model.query = 'smi';
        expect(model.completionItems!()).toEqual(want);
      });
    });

    describe('#items()', () => {
      it('should return an unfiltered list of items if query is blank', () => {
        const model = new CompleterModel();
        const want: Completer.IItem[] = [
          { raw: 'foo', text: 'foo' },
          { raw: 'bar', text: 'bar' },
          { raw: 'baz', text: 'baz' }
        ];
        model.setOptions(['foo', 'bar', 'baz']);
        expect(toArray(model.items())).toEqual(want);
      });

      it('should return a filtered list of items if query is set', () => {
        const model = new CompleterModel();
        const want: Completer.IItem[] = [
          { raw: 'foo', text: '<mark>f</mark>oo' }
        ];
        model.setOptions(['foo', 'bar', 'baz']);
        model.query = 'f';
        expect(toArray(model.items())).toEqual(want);
      });

      it('should order list based on score', () => {
        const model = new CompleterModel();
        const want: Completer.IItem[] = [
          { raw: 'qux', text: '<mark>qux</mark>' },
          { raw: 'quux', text: '<mark>qu</mark>u<mark>x</mark>' }
        ];
        model.setOptions(['foo', 'bar', 'baz', 'quux', 'qux']);
        model.query = 'qux';
        expect(toArray(model.items())).toEqual(want);
      });

      it('should break ties in score by locale sort', () => {
        const model = new CompleterModel();
        const want: Completer.IItem[] = [
          { raw: 'quux', text: '<mark>qu</mark>ux' },
          { raw: 'qux', text: '<mark>qu</mark>x' }
        ];
        model.setOptions(['foo', 'bar', 'baz', 'qux', 'quux']);
        model.query = 'qu';
        expect(toArray(model.items())).toEqual(want);
      });

      it('should escape HTML markup', () => {
        let model = new CompleterModel();
        let want: Completer.IItem[] = [
          { raw: '<foo></foo>', text: '&lt;foo&gt;&lt;/foo&gt;' }
        ];
        model.setOptions(['<foo></foo>']);
        expect(toArray(model.items())).toEqual(want);
      });

      it('should escape HTML with matches markup', () => {
        let model = new CompleterModel();
        let want: Completer.IItem[] = [
          {
            raw: '<foo>smile</foo>',
            text: '&lt;foo&gt;<mark>smi</mark>le&lt;/foo&gt;'
          }
        ];
        model.setOptions(['<foo>smile</foo>']);
        model.query = 'smi';
        expect(toArray(model.items())).toEqual(want);
      });
    });

    describe('#options()', () => {
      it('should default to an empty iterator', () => {
        const model = new CompleterModel();
        expect(model.options().next()).toBeUndefined();
      });

      it('should return model options', () => {
        const model = new CompleterModel();
        const options = ['foo'];
        model.setOptions(options, {});
        expect(toArray(model.options())).not.toBe(options);
        expect(toArray(model.options())).toEqual(options);
      });

      it('should return the typeMap', () => {
        const model = new CompleterModel();
        const options = ['foo'];
        const typeMap = { foo: 'instance' };
        model.setOptions(options, typeMap);
        expect(JSONExt.deepEqual(model.typeMap(), typeMap)).toBeTruthy();
      });
    });

    describe('#original', () => {
      it('should default to null', () => {
        const model = new CompleterModel();
        expect(model.original).toBeNull();
      });

      it('should return the original request', () => {
        const model = new CompleterModel();
        const request = makeState('foo');
        model.original = request;
        expect(model.original).toBe(request);
      });
    });

    describe('#current', () => {
      it('should default to null', () => {
        const model = new CompleterModel();
        expect(model.current).toBeNull();
      });

      it('should initially equal the original request', () => {
        const model = new CompleterModel();
        const request = makeState('foo');
        model.original = request;
        expect(model.current).toBe(request);
      });

      it('should not set if original request is nonexistent', () => {
        const model = new CompleterModel();
        const currentValue = 'foo';
        const newValue = 'foob';
        const cursor: Completer.ICursorSpan = { start: 0, end: 0 };
        const request = makeState(currentValue);
        const change = makeState(newValue);
        model.current = change;
        expect(model.current).toBeNull();
        model.original = request;
        model.cursor = cursor;
        model.current = change;
        expect(model.current).toBe(change);
      });

      it('should not set if cursor is nonexistent', () => {
        const model = new CompleterModel();
        const currentValue = 'foo';
        const newValue = 'foob';
        const request = makeState(currentValue);
        const change = makeState(newValue);
        model.original = request;
        model.cursor = null;
        model.current = change;
        expect(model.current).not.toBe(change);
      });

      it('should reset model if change is shorter than original', () => {
        const model = new CompleterModel();
        const currentValue = 'foo';
        const newValue = 'fo';
        const cursor: Completer.ICursorSpan = { start: 0, end: 0 };
        const request = makeState(currentValue);
        const change = makeState(newValue);
        model.original = request;
        model.cursor = cursor;
        model.current = change;
        expect(model.current).toBeNull();
        expect(model.original).toBeNull();
        expect(model.options().next()).toBeUndefined();
      });
    });

    describe('#cursor', () => {
      it('should default to null', () => {
        const model = new CompleterModel();
        expect(model.cursor).toBeNull();
      });

      it('should not set if original request is nonexistent', () => {
        const model = new CompleterModel();
        const cursor: Completer.ICursorSpan = { start: 0, end: 0 };
        const request = makeState('foo');
        model.cursor = cursor;
        expect(model.cursor).toBeNull();
        model.original = request;
        model.cursor = cursor;
        expect(model.cursor).toBe(cursor);
      });
    });

    describe('#isDisposed', () => {
      it('should be true if model has been disposed', () => {
        const model = new CompleterModel();
        expect(model.isDisposed).toBe(false);
        model.dispose();
        expect(model.isDisposed).toBe(true);
      });
    });

    describe('#dispose()', () => {
      it('should dispose of the model resources', () => {
        const model = new CompleterModel();
        model.setOptions(['foo'], { foo: 'instance' });
        expect(model.isDisposed).toBe(false);
        model.dispose();
        expect(model.isDisposed).toBe(true);
      });

      it('should be safe to call multiple times', () => {
        const model = new CompleterModel();
        expect(model.isDisposed).toBe(false);
        model.dispose();
        model.dispose();
        expect(model.isDisposed).toBe(true);
      });
    });

    describe('#handleTextChange()', () => {
      it('should set current change value', () => {
        const model = new CompleterModel();
        const currentValue = 'foo';
        const newValue = 'foob';
        const cursor: Completer.ICursorSpan = { start: 0, end: 0 };
        const request = makeState(currentValue);
        const change = makeState(newValue);
        (change as any).column = 4;
        model.original = request;
        model.cursor = cursor;
        expect(model.current).toBe(request);
        model.handleTextChange(change);
        expect(model.current).toBe(change);
      });

      it('should reset if last char is whitespace && column < original', () => {
        const model = new CompleterModel();
        const currentValue = 'foo';
        const newValue = 'foo ';
        const request = makeState(currentValue);
        (request as any).column = 3;
        const change = makeState(newValue);
        (change as any).column = 0;
        model.original = request;
        expect(model.original).toBe(request);
        model.handleTextChange(change);
        expect(model.original).toBeNull();
      });
    });

    describe('#createPatch()', () => {
      it('should return a patch value', () => {
        const model = new CompleterModel();
        const patch = 'foobar';
        const want: Completer.IPatch = {
          start: 0,
          end: 3,
          value: patch
        };
        const cursor: Completer.ICursorSpan = { start: 0, end: 3 };
        model.original = makeState('foo');
        model.cursor = cursor;
        expect(model.createPatch(patch)).toEqual(want);
      });

      it('should return undefined if original request or cursor are null', () => {
        const model = new CompleterModel();
        expect(model.createPatch('foo')).toBeUndefined();
      });

      it('should handle line breaks in original value', () => {
        const model = new CompleterModel();
        const currentValue = 'foo\nbar';
        const patch = 'barbaz';
        const start = currentValue.length;
        const end = currentValue.length;
        const want: Completer.IPatch = {
          start,
          end,
          value: patch
        };
        const cursor: Completer.ICursorSpan = { start, end };
        model.original = makeState(currentValue);
        model.cursor = cursor;
        expect(model.createPatch(patch)).toEqual(want);
      });
    });
  });
});
