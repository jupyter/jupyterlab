// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  DefaultSchemaValidator,
  ISettingRegistry,
  SettingRegistry,
  Settings
} from '@jupyterlab/settingregistry';
import { StateDB } from '@jupyterlab/statedb';
import { signalToPromise } from '@jupyterlab/testutils';
import { JSONObject } from '@lumino/coreutils';

class TestConnector extends StateDB {
  schemas: { [key: string]: ISettingRegistry.ISchema } = {};

  async fetch(id: string): Promise<ISettingRegistry.IPlugin | undefined> {
    const fetched = await super.fetch(id);
    if (!fetched && !this.schemas[id]) {
      return undefined;
    }

    const schema: ISettingRegistry.ISchema = this.schemas[id] || {
      type: 'object'
    };
    const composite = {};
    const user = {};
    const raw = (fetched as string) || '{ }';
    const version = 'test';
    return { id, data: { composite, user }, raw, schema, version };
  }

  async list(): Promise<any> {
    return Promise.reject('list method not implemented');
  }
}

describe('@jupyterlab/settingregistry', () => {
  describe('DefaultSchemaValidator', () => {
    describe('#constructor()', () => {
      it('should create a new schema validator', () => {
        const validator = new DefaultSchemaValidator();

        expect(validator).toBeInstanceOf(DefaultSchemaValidator);
      });
    });

    describe('#validateData()', () => {
      it('should validate data against a schema', () => {
        const id = 'foo';
        const validator = new DefaultSchemaValidator();
        const schema: ISettingRegistry.ISchema = {
          additionalProperties: false,
          properties: {
            bar: { type: 'string' }
          },
          type: 'object'
        };
        const composite = {};
        const user = {};
        const raw = '{ "bar": "baz" }';
        const version = 'test';
        const plugin = { id, data: { composite, user }, raw, schema, version };
        const errors = validator.validateData(plugin);

        expect(errors).toBe(null);
      });

      it('should return errors if the data fails to validate', () => {
        const id = 'foo';
        const validator = new DefaultSchemaValidator();
        const schema: ISettingRegistry.ISchema = {
          additionalProperties: false,
          properties: {
            bar: { type: 'string' }
          },
          type: 'object'
        };
        const composite = {};
        const user = {};
        const raw = '{ "baz": "qux" }';
        const version = 'test';
        const plugin = { id, data: { composite, user }, raw, schema, version };
        const errors = validator.validateData(plugin);

        expect(errors).not.toBe(null);
      });

      it('should populate the composite data', () => {
        const id = 'foo';
        const validator = new DefaultSchemaValidator();
        const schema: ISettingRegistry.ISchema = {
          additionalProperties: false,
          properties: {
            bar: { type: 'string', default: 'baz' }
          },
          type: 'object'
        };
        const composite = {} as JSONObject;
        const user = {} as JSONObject;
        const raw = '{ }';
        const version = 'test';
        const plugin = { id, data: { composite, user }, raw, schema, version };
        const errors = validator.validateData(plugin);

        expect(errors).toBe(null);
        expect(plugin.data.user.bar).toBeUndefined();
        expect(plugin.data.composite.bar).toBe(schema.properties!.bar.default);
      });
    });
  });

  describe('SettingRegistry', () => {
    const connector = new TestConnector();
    const timeout = 500;
    let registry: SettingRegistry;

    afterEach(() => {
      connector.schemas = {};
      return connector.clear();
    });

    beforeEach(() => {
      registry = new SettingRegistry({ connector, timeout });
    });

    describe('#constructor()', () => {
      it('should create a new setting registry', () => {
        expect(registry).toBeInstanceOf(SettingRegistry);
      });
    });

    describe('#pluginChanged', () => {
      it('should emit when a plugin changes', async () => {
        const id = 'foo';
        const key = 'bar';
        const value = 'baz';

        connector.schemas[id] = { type: 'object' };
        let called = false;
        registry.pluginChanged.connect((sender: any, plugin: string) => {
          expect(id).toBe(plugin);
          called = true;
        });
        await registry.load(id);
        await registry.set(id, key, value);
        expect(called).toBe(true);
      });
    });

    describe('#plugins', () => {
      it('should return a list of registered plugins in registry', async () => {
        const one = 'foo';
        const two = 'bar';

        expect(Object.keys(registry.plugins)).toHaveLength(0);
        connector.schemas[one] = { type: 'object' };
        connector.schemas[two] = { type: 'object' };
        await registry.load(one);
        expect(Object.keys(registry.plugins)).toHaveLength(1);
        await registry.load(two);
        expect(Object.keys(registry.plugins)).toHaveLength(2);
      });
    });

    describe('#get()', () => {
      it('should get a setting item from a loaded plugin', async () => {
        const id = 'foo';
        const key = 'bar';
        const value = 'baz';

        connector.schemas[id] = { type: 'object' };
        await connector.save(id, JSON.stringify({ [key]: value }));
        (await registry.load(id)) as Settings;
        const saved = await registry.get(id, key);
        expect(saved.user).toBe(value);
      });

      it('should get a setting item from a plugin that is not loaded', async () => {
        const id = 'alpha';
        const key = 'beta';
        const value = 'gamma';

        connector.schemas[id] = { type: 'object' };
        await connector.save(id, JSON.stringify({ [key]: value }));
        const saved = await registry.get(id, key);
        expect(saved.composite).toBe(value);
      });

      it('should use schema default if user data not available', async () => {
        const id = 'alpha';
        const key = 'beta';
        const value = 'gamma';
        const schema: ISettingRegistry.ISchema = (connector.schemas[id] = {
          type: 'object',
          properties: {
            [key]: {
              type: typeof value as ISettingRegistry.Primitive,
              default: value
            }
          }
        });

        const saved = await registry.get(id, key);
        expect(saved.composite).toBe(schema.properties![key].default);
        expect(saved.composite).not.toBe(saved.user);
      });

      it('should let user value override schema default', async () => {
        const id = 'alpha';
        const key = 'beta';
        const value = 'gamma';
        const schema: ISettingRegistry.ISchema = (connector.schemas[id] = {
          type: 'object',
          properties: {
            [key]: {
              type: typeof value as ISettingRegistry.Primitive,
              default: 'delta'
            }
          }
        });

        await connector.save(id, JSON.stringify({ [key]: value }));
        const saved = await registry.get(id, key);
        expect(saved.composite).toBe(value);
        expect(saved.user).toBe(value);
        expect(saved.composite).not.toBe(schema.properties![key].default);
        expect(saved.user).not.toBe(schema.properties![key].default);
      });

      it('should reject if a plugin does not exist', async () => {
        let failed = false;
        try {
          await registry.get('foo', 'bar');
        } catch (e) {
          failed = true;
        }
        expect(failed).toBe(true);
      });

      it('should resolve `undefined` if a key does not exist', async () => {
        const id = 'foo';
        const key = 'bar';

        connector.schemas[id] = { type: 'object' };

        const saved = await registry.get(id, key);
        expect(saved.composite).toBeUndefined();
        expect(saved.user).toBeUndefined();
      });
    });

    describe('#load()', () => {
      it(`should resolve a registered plugin's settings`, async () => {
        const id = 'foo';

        expect(Object.keys(registry.plugins)).toHaveLength(0);
        connector.schemas[id] = { type: 'object' };
        const settings = (await registry.load(id)) as Settings;
        expect(settings.id).toBe(id);
      });

      it(`should reject if a plugin transformation times out`, async () => {
        const id = 'foo';
        let failed = false;

        connector.schemas[id] = {
          'jupyter.lab.transform': true,
          type: 'object'
        };

        try {
          await registry.load(id);
        } catch (e) {
          failed = true;
        }
        expect(failed).toBe(true);
      });

      it('should reject if a plugin does not exist', async () => {
        let failed = false;
        try {
          await registry.load('foo');
        } catch (e) {
          failed = true;
        }
        expect(failed).toBe(true);
      });
    });

    describe('#reload()', () => {
      it(`should load a registered plugin's settings`, async () => {
        const id = 'foo';

        expect(Object.keys(registry.plugins)).toHaveLength(0);
        connector.schemas[id] = { type: 'object' };
        const settings = await registry.reload(id);
        expect(settings.id).toBe(id);
      });

      it(`should replace a registered plugin's settings`, async () => {
        const id = 'foo';
        const first = 'Foo';
        const second = 'Bar';

        expect(Object.keys(registry.plugins)).toHaveLength(0);
        connector.schemas[id] = { type: 'object', title: first };
        let settings = await registry.reload(id);
        expect(settings.schema.title).toBe(first);
        await Promise.resolve(undefined);
        connector.schemas[id].title = second;
        settings = await registry.reload(id);
        expect(settings.schema.title).toBe(second);
      });

      it('should reject if a plugin does not exist', async () => {
        let failed = false;
        try {
          await registry.reload('foo');
        } catch (e) {
          failed = true;
        }
        expect(failed).toBe(true);
      });
    });

    describe('#transform()', () => {
      it(`should transform a plugin during the fetch phase`, async () => {
        const id = 'foo';
        const version = 'transform-test';

        expect(Object.keys(registry.plugins)).toHaveLength(0);
        connector.schemas[id] = {
          'jupyter.lab.transform': true,
          type: 'object'
        };
        registry.transform(id, {
          fetch: plugin => {
            plugin.version = version;
            return plugin;
          }
        });
        expect((await registry.load(id)).version).toBe(version);
      });

      it(`should transform a plugin during the compose phase`, async () => {
        const id = 'foo';
        const composite = { a: 1 };

        expect(Object.keys(registry.plugins)).toHaveLength(0);
        connector.schemas[id] = {
          'jupyter.lab.transform': true,
          type: 'object'
        };
        registry.transform(id, {
          compose: plugin => {
            plugin.data = { user: plugin.data.user, composite };
            return plugin;
          }
        });
        expect((await registry.load(id)).composite).toEqual(composite);
      });

      it(`should disallow a transform that changes the plugin ID`, async () => {
        const id = 'foo';
        let failed = false;

        expect(Object.keys(registry.plugins)).toHaveLength(0);
        connector.schemas[id] = {
          'jupyter.lab.transform': true,
          type: 'object'
        };
        registry.transform(id, {
          compose: plugin => {
            plugin.id = 'bar';
            return plugin;
          }
        });
        try {
          await registry.load(id);
        } catch (e) {
          failed = true;
        }
        expect(failed).toBe(true);
      });
    });
  });

  describe('reconcileMenus', () => {
    it('should merge menu tree', () => {
      const a: ISettingRegistry.IMenu[] = [
        {
          id: '1',
          items: [{ command: 'a' }]
        },
        {
          id: '2',
          items: [{ command: 'b' }]
        },
        {
          id: '4',
          items: [
            {
              type: 'submenu',
              submenu: {
                id: 'sub',
                items: [{ command: 'sub-1' }]
              }
            }
          ]
        }
      ];
      const b: ISettingRegistry.IMenu[] = [
        {
          id: '2',
          items: [
            { command: 'b', disabled: true },
            { command: 'b', args: { input: 'hello' } },
            { command: 'b', args: { input: 'world' } },
            { command: 'c' }
          ]
        },
        {
          id: '3',
          items: [{ command: 'd' }]
        },
        {
          id: '4',
          items: [
            {
              type: 'submenu',
              submenu: {
                id: 'sub',
                items: [
                  { command: 'sub-1', disabled: true },
                  { command: 'sub-2' }
                ]
              }
            }
          ]
        }
      ];

      const merged = SettingRegistry.reconcileMenus(a, b);
      expect(merged).toHaveLength(4);
      expect(merged[0].id).toEqual('1');
      expect(merged[0].items).toHaveLength(1);
      expect(merged[1].id).toEqual('2');
      expect(merged[1].items).toHaveLength(4);
      expect(merged[1].items![0].command).toEqual('b');
      expect(merged[1].items![0].args).toBeUndefined();
      expect(merged[1].items![0].disabled).toEqual(true);
      expect(merged[1].items![1].command).toEqual('b');
      expect(merged[1].items![1].args?.input).toEqual('hello');
      expect(merged[1].items![2].command).toEqual('b');
      expect(merged[1].items![2].args?.input).toEqual('world');
      expect(merged[2].id).toEqual('4');
      expect(merged[2].items).toHaveLength(1);
      expect(merged[2].items![0].submenu?.items).toHaveLength(2);
      expect(merged[2].items![0].submenu?.items![0].command).toEqual('sub-1');
      expect(merged[2].items![0].submenu?.items![0].disabled).toEqual(true);
      expect(merged[3].id).toEqual('3');
      expect(merged[3].items).toHaveLength(1);
    });

    it('should merge menu tree without adding new items', () => {
      const a: ISettingRegistry.IMenu[] = [
        {
          id: '1',
          items: [{ command: 'a' }]
        },
        {
          id: '2',
          items: [{ command: 'b' }]
        },
        {
          id: '4',
          items: [
            {
              type: 'submenu',
              submenu: {
                id: 'sub',
                items: [{ command: 'sub-1' }]
              }
            }
          ]
        }
      ];
      const b: ISettingRegistry.IMenu[] = [
        {
          id: '2',
          items: [
            { command: 'b', disabled: true },
            { command: 'b', args: { input: 'hello' } },
            { command: 'b', args: { input: 'world' } },
            { command: 'c' }
          ]
        },
        {
          id: '3',
          items: [{ command: 'd' }]
        },
        {
          id: '4',
          items: [
            {
              type: 'submenu',
              submenu: {
                id: 'sub',
                items: [
                  { command: 'sub-1', disabled: true },
                  { command: 'sub-2' }
                ]
              }
            }
          ],
          disabled: true
        }
      ];

      const merged = SettingRegistry.reconcileMenus(a, b, false, false);
      expect(merged).toHaveLength(3);
      expect(merged![0].id).toEqual('1');
      expect(merged![0].items).toHaveLength(1);
      expect(merged![1].id).toEqual('2');
      expect(merged![1].items).toHaveLength(1);
      expect(merged[1].items![0].command).toEqual('b');
      expect(merged[1].items![0].args).toBeUndefined();
      expect(merged[1].items![0].disabled).toEqual(true);
      expect(merged[2].id).toEqual('4');
      expect(merged[2].items).toHaveLength(1);
      expect(merged[2].items![0].submenu?.items).toHaveLength(1);
      expect(merged[2].items![0].submenu?.items![0].command).toEqual('sub-1');
      expect(merged[2].items![0].submenu?.items![0].disabled).toEqual(true);
      expect(merged[2].disabled).toEqual(true);
    });
  });

  describe('reconcileItems', () => {
    it('should merge items list', () => {
      const a: ISettingRegistry.IContextMenuItem[] = [
        { command: 'a', selector: '.a' },
        { command: 'b', selector: '.b' },
        {
          type: 'submenu',
          submenu: {
            id: 'sub',
            items: [{ command: 'sub-1' }]
          },
          selector: '.sub'
        }
      ];
      const b: ISettingRegistry.IContextMenuItem[] = [
        { command: 'b', selector: '.b', disabled: true },
        { command: 'b', selector: '.bb' },
        { command: 'b', selector: '.b1', args: { input: 'hello' } },
        { command: 'b', selector: '.b2', args: { input: 'world' } },
        { command: 'c', selector: '.c' },
        { command: 'd', selector: '.d' },
        {
          type: 'submenu',
          submenu: {
            id: 'sub',
            items: [{ command: 'sub-1', disabled: true }, { command: 'sub-2' }]
          },
          selector: '.s'
        }
      ];

      const merged = SettingRegistry.reconcileItems(a, b);
      expect(merged).toHaveLength(8);
      expect(merged![1].command).toEqual('b');
      expect(merged![1].selector).toEqual('.b');
      expect(merged![1].disabled).toEqual(true);
      expect(merged![2].submenu?.items).toHaveLength(2);
      expect(merged![3].command).toEqual('b');
      expect(merged![3].selector).toEqual('.bb');
      expect(merged![4].command).toEqual('b');
      expect(merged![4].args?.input).toEqual('hello');
      expect(merged![5].command).toEqual('b');
      expect(merged![5].args?.input).toEqual('world');
    });

    it('should merge items list without adding new ones', () => {
      const a: ISettingRegistry.IContextMenuItem[] = [
        { command: 'a', selector: '.a' },
        { command: 'b', selector: '.b' },
        {
          type: 'submenu',
          submenu: {
            id: 'sub',
            items: [{ command: 'sub-1' }]
          },
          selector: '.sub'
        }
      ];
      const b: ISettingRegistry.IContextMenuItem[] = [
        { command: 'b', selector: '.b', disabled: true },
        { command: 'b', selector: '.b1', args: { input: 'hello' } },
        { command: 'b', selector: '.b2', args: { input: 'world' } },
        { command: 'c', selector: '.c' },
        { command: 'd', selector: '.d' },
        {
          type: 'submenu',
          submenu: {
            id: 'sub',
            items: [{ command: 'sub-1', disabled: true }, { command: 'sub-2' }]
          },
          selector: '.s'
        }
      ];

      const merged = SettingRegistry.reconcileItems(a, b, false, false);
      expect(merged).toHaveLength(3);
      expect(merged![1].command).toEqual('b');
      expect(merged![1].selector).toEqual('.b');
      expect(merged![1].disabled).toEqual(true);
      expect(merged![2].submenu?.items).toHaveLength(1);
      expect(merged![2].submenu?.items![0].command).toEqual('sub-1');
      expect(merged![2].submenu?.items![0].disabled).toEqual(true);
    });
  });

  describe('reconcileToolbarItems', () => {
    it('should merge toolbar items list', () => {
      const a: ISettingRegistry.IToolbarItem[] = [
        { name: 'a' },
        { name: 'b', command: 'command-b' }
      ];
      const b: ISettingRegistry.IToolbarItem[] = [
        { name: 'b', disabled: true },
        { name: 'c', type: 'spacer' },
        { name: 'd', command: 'command-d' }
      ];

      const merged = SettingRegistry.reconcileToolbarItems(a, b);
      expect(merged).toHaveLength(4);
      expect(merged![0].name).toEqual('a');
      expect(merged![1].name).toEqual('b');
      expect(merged![1].disabled).toEqual(true);
      expect(merged![2].name).toEqual('c');
      expect(merged![2].type).toEqual('spacer');
      expect(merged![3].name).toEqual('d');
    });
  });

  describe('filterDisabledItems', () => {
    it('should remove disabled menu item', () => {
      const a: ISettingRegistry.IContextMenuItem[] = [
        { command: 'a', selector: '.a' },
        { type: 'separator', selector: '.a' },
        { command: 'b', disabled: true, selector: '.a' },
        {
          type: 'submenu',
          submenu: {
            id: 'sub',
            items: [{ command: 'sub-1', disabled: true }, { command: 'sub-2' }]
          },
          selector: '.s'
        }
      ];

      const filtered = SettingRegistry.filterDisabledItems(a);
      expect(filtered).toHaveLength(3);
      expect(filtered[0]?.command).toEqual('a');
      expect(filtered[1]?.type).toEqual('separator');
      expect(filtered[2]?.type).toEqual('submenu');
      expect(filtered[2]?.submenu?.items).toHaveLength(1);
      expect(filtered[2]?.submenu?.items![0].command).toEqual('sub-2');
    });
  });

  describe('Settings', () => {
    const connector = new TestConnector();
    let registry: SettingRegistry;
    let settings: Settings | null;

    afterEach(() => {
      if (settings) {
        settings.dispose();
        settings = null;
      }
      connector.schemas = {};
      return connector.clear();
    });

    beforeEach(() => {
      registry = new SettingRegistry({ connector });
    });

    describe('#constructor()', () => {
      it('should create a new settings object for a plugin', () => {
        const id = 'alpha';
        const data = { composite: {}, user: {} };
        const schema: ISettingRegistry.ISchema = { type: 'object' };
        const raw = '{ }';
        const version = 'test';
        const plugin = { id, data, raw, schema, version };

        settings = new Settings({ plugin, registry });
        expect(settings).toBeInstanceOf(Settings);
      });
    });

    describe('#changed', () => {
      it('should emit when a plugin changes', async () => {
        const id = 'alpha';
        const schema: ISettingRegistry.ISchema = { type: 'object' };

        connector.schemas[id] = schema;
        settings = (await registry.load(id)) as Settings;
        const promise = signalToPromise(settings.changed);
        await settings.set('foo', 'bar');
        await expect(promise).resolves.toContain(settings);
      });
    });

    describe('#composite', () => {
      it('should contain the merged user and default data', async () => {
        const id = 'alpha';
        const key = 'beta';
        const value = 'gamma';
        const schema: ISettingRegistry.ISchema = (connector.schemas[id] = {
          type: 'object',
          properties: {
            [key]: {
              type: typeof value as ISettingRegistry.Primitive,
              default: value
            }
          }
        });

        connector.schemas[id] = schema;
        settings = (await registry.load(id)) as Settings;
        expect(settings.composite[key]).toBe(value);
      });

      it('should privilege user data', async () => {
        const id = 'alpha';
        const key = 'beta';
        const value = 'gamma';
        const schema: ISettingRegistry.ISchema = (connector.schemas[id] = {
          type: 'object',
          properties: {
            [key]: {
              type: typeof value as ISettingRegistry.Primitive,
              default: 'delta'
            }
          }
        });

        connector.schemas[id] = schema;
        settings = (await registry.load(id)) as Settings;
        await settings.set(key, value);
        expect(settings.composite[key]).toBe(value);
      });
    });

    describe('#id', () => {
      it('should expose the plugin ID', () => {
        const id = 'alpha';
        const data = { composite: {}, user: {} };
        const schema: ISettingRegistry.ISchema = { type: 'object' };
        const raw = '{ }';
        const version = 'test';
        const plugin = { id, data, raw, schema, version };

        settings = new Settings({ plugin, registry });
        expect(settings.id).toBe(id);
      });
    });

    describe('#isDisposed', () => {
      it('should test whether the settings object is disposed', () => {
        const id = 'alpha';
        const data = { composite: {}, user: {} };
        const schema: ISettingRegistry.ISchema = { type: 'object' };
        const raw = '{ }';
        const version = 'test';
        const plugin = { id, data, raw, schema, version };

        settings = new Settings({ plugin, registry });
        expect(settings.isDisposed).toBe(false);
        settings.dispose();
        expect(settings.isDisposed).toBe(true);
      });
    });

    describe('#schema', () => {
      it('should expose the plugin schema', async () => {
        const id = 'alpha';
        const schema: ISettingRegistry.ISchema = { type: 'object' };

        connector.schemas[id] = schema;
        settings = (await registry.load(id)) as Settings;
        expect(settings.schema).toEqual(schema);
      });
    });

    describe('#user', () => {
      it('should privilege user data', async () => {
        const id = 'alpha';
        const key = 'beta';
        const value = 'gamma';
        const schema: ISettingRegistry.ISchema = (connector.schemas[id] = {
          type: 'object',
          properties: {
            [key]: {
              type: typeof value as ISettingRegistry.Primitive,
              default: 'delta'
            }
          }
        });

        connector.schemas[id] = schema;
        settings = (await registry.load(id)) as Settings;
        await settings.set(key, value);
        expect(settings.user[key]).toBe(value);
      });
    });

    describe('#registry', () => {
      it('should expose the setting registry', () => {
        const id = 'alpha';
        const data = { composite: {}, user: {} };
        const schema: ISettingRegistry.ISchema = { type: 'object' };
        const raw = '{ }';
        const version = 'test';
        const plugin = { id, data, raw, schema, version };

        settings = new Settings({ plugin, registry });
        expect(settings.registry).toBe(registry);
      });
    });

    describe('#dispose()', () => {
      it('should dispose the settings object', () => {
        const id = 'alpha';
        const data = { composite: {}, user: {} };
        const schema: ISettingRegistry.ISchema = { type: 'object' };
        const raw = '{ }';
        const version = 'test';
        const plugin = { id, data, raw, schema, version };

        settings = new Settings({ plugin, registry });
        expect(settings.isDisposed).toBe(false);
        settings.dispose();
        expect(settings.isDisposed).toBe(true);
      });
    });

    describe('#default()', () => {
      it('should return a fully extrapolated schema default', async () => {
        const id = 'omicron';
        const defaults = {
          foo: 'one',
          bar: 100,
          baz: {
            qux: 'two',
            quux: 'three',
            quuz: {
              corge: { grault: 200 }
            }
          }
        };

        connector.schemas[id] = {
          type: 'object',
          properties: {
            foo: { type: 'string', default: defaults.foo },
            bar: { type: 'number', default: defaults.bar },
            baz: {
              type: 'object',
              default: {},
              properties: {
                qux: { type: 'string', default: defaults.baz.qux },
                quux: { type: 'string', default: defaults.baz.quux },
                quuz: {
                  type: 'object',
                  default: {},
                  properties: {
                    corge: {
                      type: 'object',
                      default: {},
                      properties: {
                        grault: {
                          type: 'number',
                          default: defaults.baz.quuz.corge.grault
                        }
                      }
                    }
                  }
                }
              }
            },
            'nonexistent-default': { type: 'string' }
          }
        };
        settings = (await registry.load(id)) as Settings;
        expect(settings.default('nonexistent-key')).toBeUndefined();
        expect(settings.default('foo')).toBe(defaults.foo);
        expect(settings.default('bar')).toBe(defaults.bar);
        expect(settings.default('baz')).toEqual(defaults.baz);
        expect(settings.default('nonexistent-default')).toBeUndefined();
      });
    });

    describe('#get()', () => {
      it('should get a setting item', async () => {
        const id = 'foo';
        const key = 'bar';
        const value = 'baz';

        connector.schemas[id] = { type: 'object' };
        await connector.save(id, JSON.stringify({ [key]: value }));
        settings = (await registry.load(id)) as Settings;
        const saved = settings.get(key);
        expect(saved.user).toBe(value);
      });

      it('should use schema default if user data not available', async () => {
        const id = 'alpha';
        const key = 'beta';
        const value = 'gamma';
        const schema: ISettingRegistry.ISchema = (connector.schemas[id] = {
          type: 'object',
          properties: {
            [key]: {
              type: typeof value as ISettingRegistry.Primitive,
              default: value
            }
          }
        });

        settings = (await registry.load(id)) as Settings;
        const saved = settings.get(key);

        expect(saved.composite).toBe(schema.properties![key].default);
        expect(saved.composite).not.toBe(saved.user);
      });

      it('should let user value override schema default', async () => {
        const id = 'alpha';
        const key = 'beta';
        const value = 'gamma';
        const schema: ISettingRegistry.ISchema = (connector.schemas[id] = {
          type: 'object',
          properties: {
            [key]: {
              type: typeof value as ISettingRegistry.Primitive,
              default: 'delta'
            }
          }
        });

        await connector.save(id, JSON.stringify({ [key]: value }));
        settings = (await registry.load(id)) as Settings;
        const saved = settings.get(key);
        expect(saved.composite).toBe(value);
        expect(saved.user).toBe(value);
        expect(saved.composite).not.toBe(schema.properties![key].default);
        expect(saved.user).not.toBe(schema.properties![key].default);
      });

      it('should be `undefined` if a key does not exist', async () => {
        const id = 'foo';
        const key = 'bar';

        connector.schemas[id] = { type: 'object' };

        settings = (await registry.load(id)) as Settings;
        const saved = settings.get(key);
        expect(saved.composite).toBeUndefined();
        expect(saved.user).toBeUndefined();
      });
    });

    describe('#remove()', () => {
      it('should remove a setting item', async () => {
        const id = 'foo';
        const key = 'bar';
        const value = 'baz';

        connector.schemas[id] = { type: 'object' };
        await connector.save(id, JSON.stringify({ [key]: value }));
        settings = (await registry.load(id)) as Settings;
        let saved = settings.get(key);
        expect(saved.user).toBe(value);
        await settings.remove(key);
        saved = settings.get(key);
        expect(saved.composite).toBeUndefined();
        expect(saved.user).toBeUndefined();
      });
    });

    describe('#save()', () => {
      it('should save user setting data', async () => {
        const id = 'foo';
        const one = 'one';
        const two = 'two';

        connector.schemas[id] = { type: 'object' };
        settings = (await registry.load(id)) as Settings;
        await settings.save(JSON.stringify({ one, two }));
        let saved = settings.get('one');
        expect(saved.composite).toBe(one);
        expect(saved.user).toBe(one);

        saved = settings.get('two');

        expect(saved.composite).toBe(two);
        expect(saved.user).toBe(two);
      });
    });

    describe('#set()', () => {
      it('should set a user setting item', async () => {
        const id = 'foo';
        const one = 'one';

        connector.schemas[id] = { type: 'object' };
        settings = (await registry.load(id)) as Settings;
        await settings.set('one', one);
        const saved = settings.get('one');
        expect(saved.composite).toBe(one);
        expect(saved.user).toBe(one);
      });
    });
  });
});
