// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ILabShell, LayoutRestorer } from '@jupyterlab/application';
import { WidgetTracker } from '@jupyterlab/apputils';
import { StateDB } from '@jupyterlab/statedb';
import { CommandRegistry } from '@lumino/commands';
import { PromiseDelegate } from '@lumino/coreutils';
import { Widget } from '@lumino/widgets';

describe('apputils', () => {
  describe('LayoutRestorer', () => {
    describe('#constructor()', () => {
      it('should construct a new layout restorer', () => {
        const restorer = new LayoutRestorer({
          connector: new StateDB(),
          first: Promise.resolve<void>(void 0),
          registry: new CommandRegistry()
        });
        expect(restorer).toBeInstanceOf(LayoutRestorer);
      });
    });

    describe('#restored', () => {
      it('should be a promise available right away', () => {
        const restorer = new LayoutRestorer({
          connector: new StateDB(),
          first: Promise.resolve<void>(void 0),
          registry: new CommandRegistry()
        });
        expect(restorer.restored).toBeInstanceOf(Promise);
      });

      it('should resolve when restorer is done', async () => {
        const ready = new PromiseDelegate<void>();
        const restorer = new LayoutRestorer({
          connector: new StateDB(),
          first: ready.promise,
          registry: new CommandRegistry()
        });
        const promise = restorer.restored;
        ready.resolve(void 0);
        await promise;
      });
    });

    describe('#add()', () => {
      it('should add a widget in the main area to be tracked by the restorer', async () => {
        const ready = new PromiseDelegate<void>();
        const restorer = new LayoutRestorer({
          connector: new StateDB(),
          first: ready.promise,
          registry: new CommandRegistry()
        });
        const currentWidget = new Widget();
        const dehydrated: ILabShell.ILayout = {
          mainArea: { currentWidget, dock: null },
          downArea: { currentWidget: null, widgets: null, size: null },
          leftArea: {
            collapsed: true,
            currentWidget: null,
            widgets: null,
            visible: false
          },
          rightArea: {
            collapsed: true,
            currentWidget: null,
            widgets: null,
            visible: false
          },
          relativeSizes: null
        };
        restorer.add(currentWidget, 'test-one');
        ready.resolve(void 0);
        await restorer.restored;
        await restorer.save(dehydrated);
        const layout = await restorer.fetch();
        expect(layout.mainArea?.currentWidget).toBe(currentWidget);
      });

      it('should add a widget in the down area to be tracked by the restorer', async () => {
        const ready = new PromiseDelegate<void>();
        const restorer = new LayoutRestorer({
          connector: new StateDB(),
          first: ready.promise,
          registry: new CommandRegistry()
        });
        const currentWidget = new Widget();
        const dehydrated: ILabShell.ILayout = {
          mainArea: { currentWidget: null, dock: null },
          downArea: { currentWidget, widgets: null, size: null },
          leftArea: {
            collapsed: true,
            currentWidget: null,
            widgets: null,
            visible: false
          },
          rightArea: {
            collapsed: true,
            currentWidget: null,
            widgets: null,
            visible: false
          },
          relativeSizes: null
        };
        restorer.add(currentWidget, 'test-one');
        ready.resolve(void 0);
        await restorer.restored;
        await restorer.save(dehydrated);
        const layout = await restorer.fetch();
        expect(layout.downArea?.currentWidget).toBe(currentWidget);
      });
    });

    describe('#fetch()', () => {
      it('should always return a value', async () => {
        const restorer = new LayoutRestorer({
          connector: new StateDB(),
          first: Promise.resolve(void 0),
          registry: new CommandRegistry()
        });
        const layout = await restorer.fetch();
        expect(layout).not.toBe(null);
      });

      it('should fetch saved data', async () => {
        const ready = new PromiseDelegate<void>();
        const restorer = new LayoutRestorer({
          connector: new StateDB(),
          first: ready.promise,
          registry: new CommandRegistry()
        });
        const currentWidget = new Widget();
        // The `fresh` attribute is only here to check against the return value.
        const dehydrated: ILabShell.ILayout = {
          fresh: false,
          mainArea: { currentWidget: null, dock: null },
          downArea: { currentWidget: null, widgets: null, size: 0 },
          leftArea: {
            currentWidget,
            collapsed: true,
            widgets: [currentWidget],
            visible: true
          },
          rightArea: {
            collapsed: true,
            currentWidget: null,
            widgets: null,
            visible: false
          },
          relativeSizes: null
        };
        restorer.add(currentWidget, 'test-one');
        ready.resolve(void 0);
        await restorer.restored;
        await restorer.save(dehydrated);
        const layout = await restorer.fetch();
        expect(layout).toEqual(dehydrated);
      });
    });

    describe('#restore()', () => {
      it('should restore the widgets in a tracker', async () => {
        const tracker = new WidgetTracker({ namespace: 'foo-widget' });
        const registry = new CommandRegistry();
        const state = new StateDB();
        const ready = new PromiseDelegate<void>();
        const restorer = new LayoutRestorer({
          connector: state,
          first: ready.promise,
          registry
        });
        let called = false;
        const key = `${tracker.namespace}:${tracker.namespace}`;

        registry.addCommand(tracker.namespace, {
          execute: () => {
            called = true;
          }
        });
        await state.save(key, { data: null });
        ready.resolve(undefined);
        await restorer.restore(tracker, {
          name: () => tracker.namespace,
          command: tracker.namespace
        });
        await restorer.restored;
        expect(called).toBe(true);
      });
    });

    describe('#save()', () => {
      it('should not run before `first` promise', async () => {
        const restorer = new LayoutRestorer({
          connector: new StateDB(),
          first: new Promise(() => {
            // no op
          }),
          registry: new CommandRegistry()
        });
        const dehydrated: ILabShell.ILayout = {
          mainArea: { currentWidget: null, dock: null },
          downArea: { currentWidget: null, widgets: null, size: null },
          leftArea: {
            currentWidget: null,
            collapsed: true,
            widgets: null,
            visible: false
          },
          rightArea: {
            collapsed: true,
            currentWidget: null,
            widgets: null,
            visible: false
          },
          relativeSizes: null
        };

        await expect(restorer.save(dehydrated)).rejects.toBe(
          'save() was called prematurely.'
        );
      });

      it('should save data', async () => {
        const ready = new PromiseDelegate<void>();
        const restorer = new LayoutRestorer({
          connector: new StateDB(),
          first: ready.promise,
          registry: new CommandRegistry()
        });
        const currentWidget = new Widget();
        // The `fresh` attribute is only here to check against the return value.
        const dehydrated: ILabShell.ILayout = {
          fresh: false,
          mainArea: { currentWidget: null, dock: null },
          downArea: { currentWidget: null, widgets: null, size: 0 },
          leftArea: {
            currentWidget,
            collapsed: true,
            widgets: [currentWidget],
            visible: true
          },
          rightArea: {
            collapsed: true,
            currentWidget: null,
            widgets: null,
            visible: false
          },
          relativeSizes: null
        };
        restorer.add(currentWidget, 'test-one');
        ready.resolve(void 0);
        await restorer.restored;
        await restorer.save(dehydrated);
        const layout = await restorer.fetch();
        expect(layout).toEqual(dehydrated);
      });
    });
  });
});
