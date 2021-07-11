.. _developer-extension-points:

Common Extension Points
=======================

Most of the component parts of JupyterLab are designed to be extensible,
and they provide services that can be requested in extensions via tokens.
A list of common core tokens that extension authors can request is given in :ref:`core_tokens`.

Following the list of core tokens is a guide for using some of JupyterLab's most commonly-used extension points.
However, it is not an exhaustive account of how to extend the application components,
and more detailed descriptions of their public APIs may be found in the
`JupyterLab <../api/index.html>`__ and
`Lumino <http://jupyterlab.github.io/lumino/index.html>`__ API documentation.

.. contents:: Table of contents
    :local:
    :depth: 1

.. _core_tokens:

Core Tokens
-----------

The core packages of JupyterLab provide many services for plugins. The tokens
for these services are listed here, along with short descriptions of when you
might want to use the services in your extensions.

- ``@jupyterlab/application:IConnectionLost``: A service for invoking the dialog shown
  when JupyterLab has lost its connection to the server. Use this if, for some reason,
  you want to bring up the "connection lost" dialog under new circumstances.
- ``@jupyterlab/application:IInfo``: A service providing metadata about the current
  application, including disabled extensions and whether dev mode is enabled.
- ``@jupyterlab/application:IPaths``: A service providing information about various
  URLs and server paths for the current application. Use this service if you want to
  assemble URLs to use the JupyterLab REST API.
- ``@jupyterlab/application:ILabStatus``: A service for interacting with the application busy/dirty
  status. Use this if you want to set the application "busy" favicon, or to set
  the application "dirty" status, which asks the user for confirmation before leaving the application page.
- ``@jupyterlab/application:ILabShell``: A service for interacting with the JupyterLab shell.
  The top-level ``application`` object also has a reference to the shell, but it has a restricted
  interface in order to be agnostic to different shell implementations on the application.
  Use this to get more detailed information about currently active widgets and layout state.
- ``@jupyterlab/application:ILayoutRestorer``: A service providing application layout
  restoration functionality. Use this to have your activities restored across
  page loads.
- ``@jupyterlab/application:IMimeDocumentTracker``: A widget tracker for documents
  rendered using a mime renderer extension. Use this if you want to list and interact
  with documents rendered by such extensions.
- ``@jupyterlab/application:IRouter``: The URL router used by the application.
  Use this to add custom URL-routing for your extension (e.g., to invoke
  a command if the user navigates to a sub-path).
- ``@jupyterlab/apputils:ICommandPalette``: A service for the application command palette
  in the left panel. Use this to add commands to the palette.
- ``@jupyterlab/apputils:ISplashScreen``: A service for the splash screen for the application.
  Use this if you want to show the splash screen for your own purposes.
- ``@jupyterlab/apputils:IThemeManager``: A service for the theme manager for the application. This is used primarily in theme extensions to register new themes.
- ``@jupyterlab/apputils:IToolbarWidgetRegistry``: A registry for toolbar widgets. Require this
  if you want to build the toolbar dynamically from a data definition (stored in settings for example).
- ``@jupyterlab/apputils:IWindowResolver``: A service for a window resolver for the
  application. JupyterLab workspaces are given a name, which are determined using
  the window resolver. Require this if you want to use the name of the current workspace.
- ``@jupyterlab/codeeditor:IEditorServices``: A service for the text editor provider
  for the application. Use this to create new text editors and host them in your
  UI elements.
- ``@jupyterlab/completer:ICompletionManager``: A service for the completion manager
  for the application. Use this to allow your extension to invoke a completer.
- ``@jupyterlab/console:IConsoleTracker``: A widget tracker for code consoles.
  Use this if you want to be able to iterate over and interact with code consoles
  created by the application.
- ``@jupyterlab/console:IContentFactory``: A factory object that creates new code
  consoles. Use this if you want to create and host code consoles in your own UI elements.
- ``@jupyterlab/docmanager:IDocumentManager``: A service for the manager for all
  documents used by the application. Use this if you want to open and close documents,
  create and delete files, and otherwise interact with the file system.
- ``@jupyterlab/docprovider:IDocumentProviderFactory``: A factory object that creates new providers for
  shared documents. Use this if you want to create a provider for a new shared document.
- ``@jupyterlab/documentsearch:ISearchProviderRegistry``: A service for a registry of search
  providers for the application. Plugins can register their UI elements with this registry
  to provide find/replace support.
- ``@jupyterlab/filebrowser:IFileBrowserFactory``: A factory object that creates file browsers.
  Use this if you want to create your own file browser (e.g., for a custom storage backend),
  or to interact with other file browsers that have been created by extensions.
- ``@jupyterlab/fileeditor:IEditorTracker``: A widget tracker for file editors.
  Use this if you want to be able to iterate over and interact with file editors
  created by the application.
- ``@jupyterlab/htmlviewer:IHTMLViewerTracker``: A widget tracker for rendered HTML documents.
  Use this if you want to be able to iterate over and interact with HTML documents
  viewed by the application.
- ``@jupyterlab/imageviewer:IImageTracker``: A widget tracker for images.
  Use this if you want to be able to iterate over and interact with images
  viewed by the application.
- ``@jupyterlab/inspector:IInspector``: A service for adding contextual help to widgets (visible using "Show Contextual Help" from the Help menu).
  Use this to hook into the contextual help system in your extension.
- ``@jupyterlab/launcher:ILauncher``: A service for the application activity launcher.
  Use this to add your extension activities to the launcher panel.
- ``@jupyterlab/mainmenu:IMainMenu``: A service for the main menu bar for the application.
  Use this if you want to add your own menu items or provide implementations for standardized menu items for specific activities.
- ``@jupyterlab/markdownviewer:IMarkdownViewerTracker``: A widget tracker for markdown
  document viewers. Use this if you want to iterate over and interact with rendered markdown documents.
- ``@jupyterlab/notebook:INotebookTools``: A service for the ``Notebook Tools`` panel in the
  right sidebar. Use this to add your own functionality to the panel.
- ``@jupyterlab/notebook:IContentFactory``: A factory object that creates new notebooks.
  Use this if you want to create and host notebooks in your own UI elements.
- ``@jupyterlab/notebook:INotebookTracker``: A widget tracker for notebooks.
  Use this if you want to be able to iterate over and interact with notebooks
  created by the application.
- ``@jupyterlab/rendermime:IRenderMimeRegistry``: A service for the rendermime registry
  for the application. Use this to create renderers for various mime-types in your extension. Many times it will be easier to create a `mime renderer extension <#mime-renderer-extensions>`__ rather than using this service directly.
- ``@jupyterlab/rendermime:ILatexTypesetter``: A service for the LaTeX typesetter for the
  application. Use this if you want to typeset math in your extension.
- ``@jupyterlab/settingeditor:ISettingEditorTracker``: A widget tracker for setting editors.
  Use this if you want to be able to iterate over and interact with setting editors
  created by the application.
- ``@jupyterlab/settingregistry:ISettingRegistry``: A service for the JupyterLab settings system.
  Use this if you want to store settings for your application.
  See :ref:`schemaDir` for more information.
- ``@jupyterlab/statedb:IStateDB``: A service for the JupyterLab state database.
  Use this if you want to store data that will persist across page loads.
  See `state database <#state-database>`__ for more information.
- ``@jupyterlab/statusbar:IStatusBar``: A service for the status bar on the application.
  Use this if you want to add new status bar items.
- ``@jupyterlab/terminal:ITerminalTracker``: A widget tracker for terminals.
  Use this if you want to be able to iterate over and interact with terminals
  created by the application.
- ``@jupyterlab/tooltip:ITooltipManager``: A service for the tooltip manager for the application.
  Use this to allow your extension to invoke a tooltip.
- ``@jupyterlab/vdom:IVDOMTracker``: A widget tracker for virtual DOM (VDOM) documents.
  Use this to iterate over and interact with VDOM document instances created by the application.



Commands
--------

Add a Command to the Command Registry
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Perhaps the most common way to add functionality to JupyterLab is via commands.
These are lightweight objects that include a function to execute combined with
additional metadata, including how they are labeled and when they are to be enabled.
The application has a single command registry, keyed by string command IDs,
to which you can add your custom commands.

The commands added to the command registry can then be used to populate
several of the JupyterLab user interface elements, including menus and the launcher.

Here is a sample block of code that adds a command to the application (given by ``app``):

.. code:: typescript

    const commandID = 'my-command';
    let toggled = false;

    app.commands.addCommand(commandID, {
      label: 'My Cool Command',
      isEnabled: () => true,
      isVisible: () => true,
      isToggled: () => toggled,
      iconClass: 'some-css-icon-class',
      execute: () => {
        console.log(`Executed ${commandID}`);
        toggled = !toggled;
    });

This example adds a new command, which, when triggered, calls the ``execute`` function.
``isEnabled`` indicates whether the command is enabled, and determines whether renderings of it are greyed out.
``isToggled`` indicates whether to render a check mark next to the command.
``isVisible`` indicates whether to render the command at all.
``iconClass`` specifies a CSS class which can be used to display an icon next to renderings of the command.

Each of ``isEnabled``, ``isToggled``, and ``isVisible`` can be either
a boolean value or a function that returns a boolean value, in case you want
to do some logic in order to determine those conditions.

Likewise, each of ``label`` and ``iconClass`` can be either
a string value or a function that returns a string value.

There are several more options which can be passed into the command registry when
adding new commands. These are documented
`here <http://jupyterlab.github.io/lumino/commands/interfaces/commandregistry.icommandoptions.html>`__.

After a command has been added to the application command registry
you can add them to various places in the application user interface,
where they will be rendered using the metadata you provided.

For example, you can add a button to the Notebook toolbar to run the command with the ``CommandToolbarButtonComponent``.

Add a Command to the Command Palette
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

In order to add an existing, registered command to the command palette, you need to request the
``ICommandPalette`` token in your extension.
Here is an example showing how to add a command to the command palette (given by ``palette``):

.. code:: typescript

    palette.addItem({
      command: commandID,
      category: 'my-category',
      args: {}
    });

The command ID is the same ID that you used when registering the command.
You must also provide a ``category``, which determines the subheading of
the command palette in which to render the command.
It can be a preexisting category (e.g., ``'notebook'``), or a new one of your own choosing.

The ``args`` are a JSON object that will be passed into your command's functions at render/execute time.
You can use these to customize the behavior of your command depending on how it is invoked.
For instance, you can pass in ``args: { isPalette: true }``.
Your command ``label`` function can then check the ``args`` it is provided for ``isPalette``,
and return a different label in that case.
This can be useful to make a single command flexible enough to work in multiple contexts.


Context Menu
------------

JupyterLab has an application-wide context menu available as
``app.contextMenu``. The application context menu is shown when the user right-clicks,
and is populated with menu items that are most relevant to the thing that the user clicked.

The context menu system determines which items to show based on
`CSS selectors <https://developer.mozilla.org/en-US/docs/Learn/CSS/Introduction_to_CSS/Selectors>`__.
It propagates up the DOM tree and tests whether a given HTML element
matches the CSS selector provided by a given command.

Items can be added in the context menu in two ways:

1. Using the settings - this is the preferred way as they are configurable by the user.
2. Using the API - this is for advanced cases like dynamic menu or semantic items.

Here is an example showing how to add a command to the application context
menu using the settings.


.. code:: json

    {
      "jupyter.lab.menus": {
      "context": [
        {
          "command": "my-command",
          "selector": ".jp-Notebook",
          "rank": 500
        }
      ]
    }

In this example, the command with id ``my-command`` is shown whenever the user
right-clicks on a DOM element matching ``.jp-Notebook`` (that is to say, a notebook).
The selector can be any valid CSS selector, and may target your own UI elements, or existing ones.
A list of CSS selectors currently used by context menu commands is given in :ref:`css-selectors`.

Item must follow this definition:

.. literalinclude:: ../snippets/packages/settingregistry/src/plugin-schema.json
   :language: json
   :lines: 21-39

where ``menuItem`` definition is:

.. literalinclude:: ../snippets/packages/settingregistry/src/plugin-schema.json
   :language: json
   :lines: 119-157


The same example using the API is shown below. See the Lumino `docs
<https://jupyterlab.github.io/lumino/widgets/interfaces/contextmenu.iitemoptions.html>`__
for the item creation options.

.. code:: typescript

    app.contextMenu.addItem({
      command: commandID,
      selector: '.jp-Notebook'
    })

If you don't want JupyterLab's custom context menu to appear for your element, because you have
your own right click behavior that you want to trigger, you can add the `data-jp-suppress-context-menu` data attribute
to any node to have it and its children not trigger it.

For example, if you are building a custom React element, it would look like this:

.. code::

    function MyElement(props: {}) {
      return (
        <div data-jp-suppress-context-menu>
          <p>Hi</p>
          <p onContextMenu={() => {console.log("right clicked")}}>There</p>
        </div>
      )
    }


Alternatively, you can use a 'contextmenu' event listener and
call ``event.stopPropagation`` to prevent the application context menu
handler from being called (it is listening in the bubble phase on the
``document``). At this point you could show your own Lumino
`contextMenu <https://jupyterlab.github.io/lumino/widgets/classes/contextmenu.html>`__,
or simply stop propagation and let the system context menu be shown.
This would look something like the following in a ``Widget`` subclass:

.. code:: javascript

    // In `onAfterAttach()`
    this.node.addEventListener('contextmenu', this);

    // In `handleEvent()`
    case 'contextmenu':
      event.stopPropagation();

.. _copy_shareable_link:

Copy Shareable Link
-------------------

The file browser provides a context menu item "Copy Shareable Link". The
desired behavior will vary by deployment and the users it serves. The file
browser supports overriding the behavior of this item.

.. code:: typescript

   import {
     IFileBrowserFactory
   } from '@jupyterlab/filebrowser';

   import {
     JupyterFrontEnd, JupyterFrontEndPlugin
   } from '@jupyterlab/application';


   const shareFile: JupyterFrontEndPlugin<void> = {
     activate: activateShareFile,
     id: commandID,
     requires: [IFileBrowserFactory],
     autoStart: true
   };

   function activateShareFile(
     app: JupyterFrontEnd,
     factory: IFileBrowserFactory
   ): void {
     const { commands } = app;
     const { tracker } = factory;

     commands.addCommand('filebrowser:share-main', {
       execute: () => {
         const widget = tracker.currentWidget;
         if (!widget) {
           return;
         }
         const path = encodeURI(widget.selectedItems().next().path);
         // Do something with path.
       },
       isVisible: () =>
         tracker.currentWidget &&
         toArray(tracker.currentWidget.selectedItems()).length === 1,
       iconClass: 'jp-MaterialIcon jp-LinkIcon',
       label: 'Copy Shareable Link'
     });
   }

Note that an extension providing a replacement plugin like this must either :ref:`automatically disable <disabledExtensions>` the replaced core plugin or the user must disable the core plugin manually:

.. code-block:: bash

   jupyter labextension disable @jupyterlab/filebrowser-extension:share-file


Icons
-----

See :ref:`ui_components`


Keyboard Shortcuts
------------------

There are two ways of adding keyboard shortcuts in JupyterLab.
If you don't want the shortcuts to be user-configurable,
you can add them directly to the application command registry:

.. code:: typescript

    app.commands.addKeyBinding({
      command: commandID,
      args: {},
      keys: ['Accel T'],
      selector: '.jp-Notebook'
    });

In this example ``my-command`` command is mapped to ``Accel T``,
where ``Accel`` corresponds to ``Cmd`` on a Mac and ``Ctrl`` on Windows and Linux computers.

The behavior for keyboard shortcuts is very similar to that of the context menu:
the shortcut handler propagates up the DOM tree from the focused element
and tests each element against the registered selectors. If a match is found,
then that command is executed with the provided ``args``.
Full documentation for the options for ``addKeyBinding`` can be found
`here <http://jupyterlab.github.io/lumino/commands/interfaces/commandregistry.ikeybindingoptions.html>`__.

JupyterLab also provides integration with its settings system for keyboard shortcuts.
Your extension can provide a settings schema with a ``jupyter.lab.shortcuts`` key,
declaring default keyboard shortcuts for a command:

.. code:: json

    {
      "jupyter.lab.shortcuts": [
        {
          "command": "my-command",
          "keys": ["Accel T"],
          "selector": ".jp-mod-searchable"
        }
      ]
    }

Shortcuts added to the settings system will be editable by users.


Launcher
--------

As with menus, keyboard shortcuts, and the command palette, new items can be added
to the application launcher via commands.
You can do this by requesting the ``ILauncher`` token in your extension:

.. code:: typescript

    launcher.add({
      command: commandID,
      category: 'Other',
      rank: 0
    });

In addition to providing a command ID, you also provide a category in which to put your item,
(e.g. 'Notebook', or 'Other'), as well as a rank to determine its position among other items.

.. _shell:

Jupyter Front-End Shell
-----------------------

The Jupyter front-end
`shell <../api/interfaces/application.jupyterfrontend.ishell.html>`__
is used to add and interact with content in the application. The ``IShell``
interface provides an ``add()`` method for adding widgets to the application.
In JupyterLab, the application shell consists of:

-  A ``top`` area for things like top-level toolbars and information.
-  A ``menu`` area for top-level menus, which is collapsed into the ``top`` area in multiple-document mode and put below it in single-document mode.
-  ``left`` and ``right`` sidebar areas for collapsible content.
-  A ``main`` work area for user activity.
-  A ``down`` area for information content; like log console, contextual help.
-  A ``bottom`` area for things like status bars.
-  A ``header`` area for custom elements.


Left/Right Areas
^^^^^^^^^^^^^^^^

The left and right sidebar areas of JupyterLab are intended to host more persistent user interface
elements than the main area. That being said, extension authors are free to add whatever
components they like to these areas. The outermost-level of the object that you add is expected
to be a Lumino ``Widget``, but that can host any content you like (such as React components).

As an example, the following code executes an application command to a terminal widget
and then adds the terminal to the right area:

.. code:: typescript

  app.commands
    .execute('terminal:create-new')
    .then((terminal: WidgetModuleType.Terminal) => {
      app.shell.add(terminal, 'right');
    });

You can use a numeric rank to control the ordering of the left and right tabs:

.. code:: typescript

  app.shell.add(terminal, 'left', {rank: 600});

The recommended ranges for this rank are:

* 0-500: reserved for first-party JupyterLab extensions.
* 501-899: reserved for third-party extensions.
* 900: The default rank if none is specified.
* 1000: The JupyterLab extension manager.

.. _mainmenu:

Main Menu
---------

There are two ways to extend JupyterLab's main menu.

1. Using the settings - this is the preferred way as they are configurable by the user.
2. Using the API - this is for advanced cases like dynamic menu or semantic items.

Settings-defined menu
^^^^^^^^^^^^^^^^^^^^^

JupyterLab provides integration with its settings system for menu definitions.
Your extension can provide a settings schema with a ``jupyter.lab.menus`` key,
declaring default menus. You don't need to set anything in the TypeScript code
(except the command definitions).

To add a new menu with your extension command:

.. code:: json

    {
      "jupyter.lab.menus": {
      "main": [
        {
          "id": "jp-mainmenu-myextension",
          "label": "My Menu",
          "items": [
            {
              "command": "my-command",
              "rank": 500
            }
          ],
          "rank": 100
        }
      ]
    }

The menu item label will be set with the command label. For menus (and
submenus), the label needs to be set explicitly with the ``label``
property.

Menu and item have a ``rank`` that will determine the elements order.


To add a new entry in an existing menu:

.. code:: json

    {
      "jupyter.lab.menus": {
      "main": [
        {
          "id": "jp-mainmenu-file",
          "items": [
            {
              "command": "my-command",
              "rank": 500
            }
          ]
        }
      ]
    }

Here is the list of default menu ids:

- File menu: ``jp-mainmenu-file``

  * New file submenu: ``jp-mainmenu-file-new``

- Edit menu: ``jp-mainmenu-edit``
- View menu: ``jp-mainmenu-view``
- Run menu: ``jp-mainmenu-run``
- Kernel menu: ``jp-mainmenu-kernel``
- Tabs menu: ``jp-mainmenu-tabs``
- Settings menu: ``jp-mainmenu-settings``
- Help menu: ``jp-mainmenu-help``

The default main menu is defined in the ``mainmenu-extension`` package settings.

A menu must respect the following schema:

.. literalinclude:: ../snippets/packages/settingregistry/src/plugin-schema.json
   :language: json
   :lines: 72-118

And an item must follow:

.. literalinclude:: ../snippets/packages/settingregistry/src/plugin-schema.json
   :language: json
   :lines: 119-157

Menus added to the settings system will be editable by users using the ``mainmenu-extension``
settings. In particular, they can be disabled at the item or the menu level by setting the
property ``disabled`` to ``true``.

API-defined menu
^^^^^^^^^^^^^^^^

To use the API, you should request the ``IMainMenu`` token for your extension.

There are three main ways to extend:

1. You can add your own menu to the menu bar.
2. You can add new commands to the existing menus.
3. You can register your extension with one of the existing semantic menu items.

Adding a New Menu
~~~~~~~~~~~~~~~~~

To add a new menu to the menu bar, you need to create a new
`Lumino menu <https://jupyterlab.github.io/lumino/widgets/classes/menu.html>`__.

You can then add commands to the menu in a similar way to the command palette,
and add that menu to the main menu bar:

.. code:: typescript

    const menu = new Menu({ commands: app.commands });
    menu.addItem({
      command: commandID,
      args: {},
    });

    mainMenu.addMenu(menu, { rank: 40 });

As with the command palette, you can optionally pass in ``args`` to customize the
rendering and execution behavior of the command in the menu context.


Adding a New Command to an Existing Menu
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

In many cases you will want to add your commands to the existing JupyterLab menus
rather than creating a separate menu for your extension.
Because the top-level JupyterLab menus are shared among many extensions,
the API for adding items is slightly different.
In this case, you provide a list of commands and a rank,
and these commands will be displayed together in a separate group within an existing menu.

For instance, to add a command group with ``firstCommandID`` and ``secondCommandID``
to the File menu, you would do the following:

.. code:: typescript

    mainMenu.fileMenu.addGroup([
      {
        command: firstCommandID,
      },
      {
        command: secondCommandID,
      }
    ], 40 /* rank */);


Registering a Semantic Menu Item
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

There are some commands in the JupyterLab menu system that are considered
common and important enough that they are treated differently.

For instance, we anticipate that many activities may want to provide a command
to close themselves and perform some cleanup operation (like closing a console and shutting down its kernel).
Rather than having a proliferation of similar menu items for this common operation
of "closing-and-cleanup", we provide a single command that can adapt itself to this use case,
which we term a "semantic menu item".
For this example, it is the File Menu ``closeAndCleaners`` set.

Here is an example of using the ``closeAndCleaners`` semantic menu item:

.. code:: typescript

    mainMenu.fileMenu.closeAndCleaners.add({
      tracker,
      action: 'Shutdown',
      name: 'My Activity',
      closeAndCleanup: current => {
        current.close();
        return current.shutdown();
      }
    });

In this example, ``tracker`` is a :ref:`widget-tracker`, which allows the menu
item to determine whether to delegate the menu command to your activity,
``name`` is a name given to your activity in the menu label,
``action`` is a verb given to the cleanup operation in the menu label,
and ``closeAndCleanup`` is the actual function that performs the cleanup operation.
So if the current application activity is held in the ``tracker``,
then the menu item will show ``Shutdown My Activity``, and delegate to the
``closeAndCleanup`` function that was provided.

More examples for how to register semantic menu items are found throughout the JupyterLab code base.
The available semantic menu items are:

- ``IEditMenu.IUndoer``: an activity that knows how to undo and redo.
- ``IEditMenu.IClearer``: an activity that knows how to clear its content.
- ``IEditMenu.IGoToLiner``: an activity that knows how to jump to a given line.
- ``IFileMenu.ICloseAndCleaner``: an activity that knows how to close and clean up after itself.
- ``IFileMenu.IConsoleCreator``: an activity that knows how to create an attached code console for itself.
- ``IHelpMenu.IKernelUser``: an activity that knows how to get a related kernel session.
- ``IKernelMenu.IKernelUser``: an activity that can perform various kernel-related operations.
- ``IRunMenu.ICodeRunner``: an activity that can run code from its content.
- ``IViewMenu.IEditorViewer``: an activity that knows how to set various view-related options on a text editor that it owns.


Status Bar
----------

JupyterLab's status bar is intended to show small pieces of contextual information.
Like the left and right areas, it only expects a Lumino ``Widget``,
which might contain any kind of content. Since the status bar has limited space,
you should endeavor to only add small widgets to it.

The following example shows how to place a status item that displays the current
"busy" status for the application. This information is available from the ``ILabStatus``
token, which we reference by a variable named ``labStatus``.
We place the ``statusWidget`` in the middle of the status bar.
When the ``labStatus`` busy state changes, we update the text content of the
``statusWidget`` to reflect that.

.. code:: typescript

    const statusWidget = new Widget();
    labStatus.busySignal.connect(() => {
      statusWidget.node.textContent = labStatus.isBusy ? 'Busy' : 'Idle';
    });
    statusBar.registerStatusItem('lab-status', {
      align: 'middle',
      item: statusWidget
    });

.. _widget-tracker:


Toolbar Registry
----------------

JupyterLab provides an infrastructure to define and customize toolbar widgets of ``DocumentWidget`` s
from the settings, which is similar to that defining the context menu and the main menu
bar. A typical example is the notebook toolbar as in the snippet below:

.. code:: typescript

   function activatePlugin(
     app: JupyterFrontEnd,
     // ...
     toolbarRegistry: IToolbarWidgetRegistry | null,
     settingRegistry: ISettingRegistry | null
   ): NotebookWidgetFactory.IFactory {
     const { commands } = app;
     let toolbarFactory:
       | ((widget: NotebookPanel) => DocumentRegistry.IToolbarItem[])
       | undefined;
   
     // Register notebook toolbar widgets
     if (toolbarRegistry) {
       toolbarRegistry.registerFactory<NotebookPanel>(FACTORY, 'cellType', panel =>
         ToolbarItems.createCellTypeItem(panel, translator)
       );
       
       toolbarRegistry.registerFactory<NotebookPanel>(
         FACTORY,
         'kernelStatus',
         panel => Toolbar.createKernelStatusItem(panel.sessionContext, translator)
       );
       // etc... 
     
       if (settingRegistry) {
         // Create the factory
         toolbarFactory = createToolbarFactory(
           toolbarRegistry,
           settingRegistry,
           // Factory name
           FACTORY,
           // Setting id in which the toolbar items are defined
           '@jupyterlab/notebook-extension:panel',
           translator
         );
       }
     }
   
     const factory = new NotebookWidgetFactory({
       name: FACTORY,
       fileTypes: ['notebook'],
       modelName: 'notebook',
       defaultFor: ['notebook'],
       // ...
       toolbarFactory,
       translator: translator
     });
     app.docRegistry.addWidgetFactory(factory);

The registry ``registerFactory`` method allows an extension to provide special widget for a unique pair 
(factory name, toolbar item name). Then the helper ``createToolbarFactory`` can be used to extract the
toolbar definition from the settings and build the factory to pass to the widget factory.

The default toolbar items can be defined across multiple extensions by providing an entry in the ``"jupyter.lab.toolbars"``
mapping. For example for the notebook panel:

.. code:: js
 
   "jupyter.lab.toolbars": {
     "Notebook": [ // Factory name
       // Item with non-default widget - it must be registered within an extension
       { 
         "name": "save", // Unique toolbar item name
         "rank": 10 // Item rank
       },
       // Item with default button widget triggering a command
       { "name": "insert", "command": "notebook:insert-cell-below", "rank": 20 },
       { "name": "cut", "command": "notebook:cut-cell", "rank": 21 },
       { "name": "copy", "command": "notebook:copy-cell", "rank": 22 },
       { "name": "paste", "command": "notebook:paste-cell-below", "rank": 23 },
       { "name": "run", "command": "runmenu:run", "rank": 30 },
       { "name": "interrupt", "command": "kernelmenu:interrupt", "rank": 31 },
       { "name": "restart", "command": "kernelmenu:restart", "rank": 32 },
       {
         "name": "restart-and-run",
         "command": "runmenu:restart-and-run-all",
         "rank": 33
       },
       { "name": "cellType", "rank": 40 },
       // Horizontal spacer widget
       { "name": "spacer", "type": "spacer", "rank": 100 },
       { "name": "kernelName", "rank": 1000 },
       { "name": "kernelStatus", "rank": 1001 }
     ]
   },
   "jupyter.lab.transform": true,
   "properties": {
     "toolbar": {
       "title": "Notebook panel toolbar items",
       "items": {
         "$ref": "#/definitions/toolbarItem"
       },
       "type": "array",
       "default": []
     }
   }


The settings registry will merge those definitions from settings schema with any
user-provided overrides (customizations) transparently and save them under the
``toolbar`` property in the final settings object. The ``toolbar`` list will be used to
create the toolbar. Both the source settings schema and the final settings object
are identified by the plugin ID passed to ``createToolbarFactory``. The user can
customize the toolbar by adding new items or overriding existing ones (like
providing a different rank or adding ``"disabled": true`` to remove the item).

.. note::

   You need to set ``jupyter.lab.transform`` to ``true`` in the plugin id that will gather all items.


Widget Tracker
--------------

Often extensions will want to interact with documents and activities created by other extensions.
For instance, an extension may want to inject some text into a notebook cell,
or set a custom keymap, or close all documents of a certain type.
Actions like these are typically done by widget trackers.
Extensions keep track of instances of their activities in ``WidgetTrackers``,
which are then provided as tokens so that other extensions may request them.

For instance, if you want to interact with notebooks, you should request the ``INotebookTracker`` token.
You can then use this tracker to iterate over, filter, and search all open notebooks.
You can also use it to be notified via signals when notebooks are added and removed from the tracker.

Widget tracker tokens are provided for many activities in JupyterLab, including
notebooks, consoles, text files, mime documents, and terminals.
If you are adding your own activities to JupyterLab, you might consider providing
a ``WidgetTracker`` token of your own, so that other extensions can make use of it.


State Database
--------------

The state database can be accessed by importing ``IStateDB`` from
``@jupyterlab/statedb`` and adding it to the list of ``requires`` for
a plugin:

.. code:: typescript

    const id = 'foo-extension:IFoo';

    const IFoo = new Token<IFoo>(id);

    interface IFoo {}

    class Foo implements IFoo {}

    const plugin: JupyterFrontEndPlugin<IFoo> = {
      id,
      autoStart: true,
      requires: [IStateDB],
      provides: IFoo,
      activate: (app: JupyterFrontEnd, state: IStateDB): IFoo => {
        const foo = new Foo();
        const key = `${id}:some-attribute`;

        // Load the saved plugin state and apply it once the app
        // has finished restoring its former layout.
        Promise.all([state.fetch(key), app.restored])
          .then(([saved]) => { /* Update `foo` with `saved`. */ });

        // Fulfill the plugin contract by returning an `IFoo`.
        return foo;
      }
    };
