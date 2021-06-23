import { ISettingRegistry, SettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator, TranslationBundle } from '@jupyterlab/translation';
import { JSONExt } from '@lumino/coreutils';
import { Dialog, showDialog } from '../dialog';

async function displayInformation(trans: TranslationBundle): Promise<void> {
  const result = await showDialog({
    title: trans.__('Information'),
    body: trans.__(
      'Toolbar customization has changed. You will need to reload JupyterLab to see the changes.'
    ),
    buttons: [
      Dialog.cancelButton(),
      Dialog.okButton({ label: trans.__('Reload') })
    ]
  });

  if (result.button.accept) {
    location.reload();
  }
}

export async function getToolbarItems(
  registry: ISettingRegistry,
  factoryName: string,
  pluginId: string,
  translator: ITranslator,
  propertyId: string = 'toolbar'
): Promise<ISettingRegistry.IToolbarItem[]> {
  const trans = translator.load('jupyterlab');
  let canonical: ISettingRegistry.ISchema | null;
  let loaded: { [name: string]: ISettingRegistry.IToolbarItem[] } = {};

  /**
   * Populate the plugin's schema defaults.
   *
   * We keep track of disabled entries in case the plugin is loaded
   * after the menu initialization.
   */
  function populate(schema: ISettingRegistry.ISchema) {
    loaded = {};
    schema.properties![propertyId].default = Object.keys(registry.plugins)
      .map(plugin => {
        const items =
          (registry.plugins[plugin]!.schema['jupyter.lab.toolbars'] ?? {})[
            factoryName
          ] ?? [];
        loaded[plugin] = items;
        return items;
      })
      .concat([
        (schema['jupyter.lab.toolbars'] ?? {})[factoryName] ?? [],
        schema.properties![propertyId].default as any[]
      ])
      .reduceRight(
        (
          acc: ISettingRegistry.IToolbarItem[],
          val: ISettingRegistry.IToolbarItem[]
        ) => SettingRegistry.reconcileToolbarItems(acc, val, true),
        []
      )! // flatten one level
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  }

  // Transform the plugin object to return different schema than the default.
  registry.transform(pluginId, {
    compose: plugin => {
      // Only override the canonical schema the first time.
      if (!canonical) {
        canonical = JSONExt.deepCopy(plugin.schema);
        populate(canonical);
      }

      const defaults =
        ((canonical.properties ?? {})[propertyId] ?? {}).default ?? [];
      const user: { [k: string]: ISettingRegistry.IToolbarItem[] } = {};
      user[propertyId] =
        (plugin.data.user[propertyId] as ISettingRegistry.IToolbarItem[]) ?? [];
      const composite: { [k: string]: ISettingRegistry.IToolbarItem[] } = {};
      composite[propertyId] =
        SettingRegistry.reconcileToolbarItems(
          defaults as ISettingRegistry.IToolbarItem[],
          user[propertyId] as ISettingRegistry.IToolbarItem[],
          false
        ) ?? [];

      plugin.data = { composite, user };

      return plugin;
    },
    fetch: plugin => {
      // Only override the canonical schema the first time.
      if (!canonical) {
        canonical = JSONExt.deepCopy(plugin.schema);
        populate(canonical);
      }

      return {
        data: plugin.data,
        id: plugin.id,
        raw: plugin.raw,
        schema: canonical,
        version: plugin.version
      };
    }
  });

  // Repopulate the canonical variable after the setting registry has
  // preloaded all initial plugins.
  canonical = null;

  const settings = await registry.load(pluginId);

  const toolbarItems: ISettingRegistry.IToolbarItem[] =
    JSONExt.deepCopy(settings.composite[propertyId] as any) ?? [];

  settings.changed.connect(() => {
    // TODO
    // As extension may change the context menu through API,
    // prompt the user to reload if the menu has been updated.
    const newItems = (settings.composite[propertyId] as any) ?? [];
    if (!JSONExt.deepEqual(toolbarItems, newItems)) {
      void displayInformation(trans);
    }
  });

  registry.pluginChanged.connect(async (sender, plugin) => {
    // TODO
    if (plugin !== pluginId) {
      // If the plugin changed its menu.
      const oldItems = loaded[plugin] ?? [];
      const newItems =
        (registry.plugins[plugin]!.schema['jupyter.lab.toolbars'] ?? {})[
          factoryName
        ] ?? [];
      if (!JSONExt.deepEqual(oldItems, newItems)) {
        //   if (loaded[plugin]) {
        //     // The plugin has changed, request the user to reload the UI
        await displayInformation(trans);
        //   } else {
        //     // The plugin was not yet loaded when the menu was built => update the menu
        //     loaded[plugin] = JSONExt.deepCopy(newItems);
        //     // Merge potential disabled state
        //     const toAdd =
        //       SettingRegistry.reconcileItems(
        //         newItems,
        //         toolbarItems,
        //         false,
        //         false
        //       ) ?? [];
        //     SettingRegistry.filterDisabledItems(toAdd).forEach(item => {
        //       MenuFactory.addContextItem(item, contextMenu, menuFactory);
        //     });
        //   }
      }
    }
  });

  return toolbarItems;
}
