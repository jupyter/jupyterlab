// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module debugger-extension
 */

import {
  ILabShell,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  ICommandPalette,
  IThemeManager,
  MainAreaWidget,
  WidgetTracker
} from '@jupyterlab/apputils';
import { IEditorServices } from '@jupyterlab/codeeditor';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { ConsolePanel, IConsoleTracker } from '@jupyterlab/console';
import { PageConfig, PathExt } from '@jupyterlab/coreutils';
import {
  Debugger,
  IDebugger,
  IDebuggerConfig,
  IDebuggerHandler,
  IDebuggerSidebar,
  IDebuggerSources
} from '@jupyterlab/debugger';
import { DocumentWidget } from '@jupyterlab/docregistry';
import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';
import { ILoggerRegistry } from '@jupyterlab/logconsole';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import {
  standardRendererFactories as initialFactories,
  IRenderMimeRegistry,
  RenderMimeRegistry
} from '@jupyterlab/rendermime';
import { Session } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';

/**
 * A plugin that provides visual debugging support for consoles.
 */
const consoles: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/debugger-extension:consoles',
  autoStart: true,
  requires: [IDebugger, IConsoleTracker],
  optional: [ILabShell],
  activate: (
    app: JupyterFrontEnd,
    debug: IDebugger,
    consoleTracker: IConsoleTracker,
    labShell: ILabShell | null
  ) => {
    const handler = new Debugger.Handler({
      type: 'console',
      shell: app.shell,
      service: debug
    });

    const updateHandlerAndCommands = async (
      widget: ConsolePanel
    ): Promise<void> => {
      const { sessionContext } = widget;
      await sessionContext.ready;
      await handler.updateContext(widget, sessionContext);
      app.commands.notifyCommandChanged();
    };

    if (labShell) {
      labShell.currentChanged.connect(async (_, update) => {
        const widget = update.newValue;
        if (!(widget instanceof ConsolePanel)) {
          return;
        }
        await updateHandlerAndCommands(widget);
      });
      return;
    }

    consoleTracker.currentChanged.connect(async (_, consolePanel) => {
      if (consolePanel) {
        void updateHandlerAndCommands(consolePanel);
      }
    });
  }
};

/**
 * A plugin that provides visual debugging support for file editors.
 */
const files: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/debugger-extension:files',
  autoStart: true,
  requires: [IDebugger, IEditorTracker],
  optional: [ILabShell],
  activate: (
    app: JupyterFrontEnd,
    debug: IDebugger,
    editorTracker: IEditorTracker,
    labShell: ILabShell | null
  ) => {
    const handler = new Debugger.Handler({
      type: 'file',
      shell: app.shell,
      service: debug
    });

    const activeSessions: {
      [id: string]: Session.ISessionConnection;
    } = {};

    const updateHandlerAndCommands = async (
      widget: DocumentWidget
    ): Promise<void> => {
      const sessions = app.serviceManager.sessions;
      try {
        const model = await sessions.findByPath(widget.context.path);
        if (!model) {
          return;
        }
        let session = activeSessions[model.id];
        if (!session) {
          // Use `connectTo` only if the session does not exist.
          // `connectTo` sends a kernel_info_request on the shell
          // channel, which blocks the debug session restore when waiting
          // for the kernel to be ready
          session = sessions.connectTo({ model });
          activeSessions[model.id] = session;
        }
        await handler.update(widget, session);
        app.commands.notifyCommandChanged();
      } catch {
        return;
      }
    };

    if (labShell) {
      labShell.currentChanged.connect(async (_, update) => {
        const widget = update.newValue;
        if (!(widget instanceof DocumentWidget)) {
          return;
        }

        const content = widget.content;
        if (!(content instanceof FileEditor)) {
          return;
        }
        await updateHandlerAndCommands(widget);
      });
    }

    editorTracker.currentChanged.connect(async (_, documentWidget) => {
      await updateHandlerAndCommands(
        (documentWidget as unknown) as DocumentWidget
      );
    });
  }
};

/**
 * A plugin that provides visual debugging support for notebooks.
 */
const notebooks: JupyterFrontEndPlugin<IDebugger.IHandler> = {
  id: '@jupyterlab/debugger-extension:notebooks',
  autoStart: true,
  provides: IDebuggerHandler,
  requires: [IDebugger, INotebookTracker],
  optional: [ILabShell],
  activate: (
    app: JupyterFrontEnd,
    service: IDebugger,
    notebookTracker: INotebookTracker,
    labShell: ILabShell | null
  ):  Debugger.Handler => {
    const handler = new Debugger.Handler({
      type: 'notebook',
      shell: app.shell,
      service
    });
    const updateHandlerAndCommands = async (
      widget: NotebookPanel
    ): Promise<void> => {
      const { sessionContext } = widget;
      await sessionContext.ready;
      await handler.updateContext(widget, sessionContext);
      app.commands.notifyCommandChanged();
    };

    if (labShell) {
      labShell.currentChanged.connect(async (_, update) => {
        const widget = update.newValue;
        if (!(widget instanceof NotebookPanel)) {
          return;
        }
        await updateHandlerAndCommands(widget);
      });
    } else {
      notebookTracker.currentChanged.connect(
        async (_, notebookPanel: NotebookPanel) => {
          await updateHandlerAndCommands(notebookPanel);
        }
      );
    }

    return handler
  }
};

/**
 * A plugin that provides a debugger service.
 */
const service: JupyterFrontEndPlugin<IDebugger> = {
  id: '@jupyterlab/debugger-extension:service',
  autoStart: true,
  provides: IDebugger,
  requires: [IDebuggerConfig],
  optional: [IDebuggerSources],
  activate: (
    app: JupyterFrontEnd,
    config: IDebugger.IConfig,
    debuggerSources: IDebugger.ISources | null
  ) =>
    new Debugger.Service({
      config,
      debuggerSources,
      specsManager: app.serviceManager.kernelspecs
    })
};

/**
 * A plugin that provides a configuration with hash method.
 */
const configuration: JupyterFrontEndPlugin<IDebugger.IConfig> = {
  id: '@jupyterlab/debugger-extension:config',
  provides: IDebuggerConfig,
  autoStart: true,
  activate: () => new Debugger.Config()
};

/**
 * A plugin that provides source/editor functionality for debugging.
 */
const sources: JupyterFrontEndPlugin<IDebugger.ISources> = {
  id: '@jupyterlab/debugger-extension:sources',
  autoStart: true,
  provides: IDebuggerSources,
  requires: [IDebuggerConfig, IEditorServices],
  optional: [INotebookTracker, IConsoleTracker, IEditorTracker],
  activate: (
    app: JupyterFrontEnd,
    config: IDebugger.IConfig,
    editorServices: IEditorServices,
    notebookTracker: INotebookTracker | null,
    consoleTracker: IConsoleTracker | null,
    editorTracker: IEditorTracker | null
  ): IDebugger.ISources => {
    return new Debugger.Sources({
      config,
      shell: app.shell,
      editorServices,
      notebookTracker,
      consoleTracker,
      editorTracker
    });
  }
};
/*
 * A plugin to open detailed views for variables.
 */
const variables: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/debugger-extension:variables',
  autoStart: true,
  requires: [IDebugger, IDebuggerHandler, ITranslator, IRenderMimeRegistry, IDebuggerSidebar],
  optional: [IThemeManager],
  activate: (
    app: JupyterFrontEnd,
    service: IDebugger,
    handler: Debugger.Handler,
    translator: ITranslator,
    rendermime: IRenderMimeRegistry,
    sidebar: IDebugger.ISidebar,
    themeManager: IThemeManager | null
  ) => {
    const trans = translator.load('jupyterlab');
    const { commands, shell } = app;
    const tracker = new WidgetTracker<MainAreaWidget<Debugger.VariablesGrid>>({
      namespace: 'debugger/inspect-variable'
    });
    const trackerMime = new WidgetTracker<Debugger.VariableRenderer>({
      namespace: 'debugger/render-variable'
    });
    const CommandIDs = Debugger.CommandIDs;

    // Add commands
    commands.addCommand(CommandIDs.inspectVariable, {
      label: trans.__('Inspect Variable'),
      caption: trans.__('Inspect Variable'),
      isEnabled: args =>
        !!service.session?.isStarted &&
        (args.variableReference ??
          sidebar.variables.latestSelection?.variablesReference ??
          0) > 0,
      execute: async args => {
        let { variableReference, name } = args as {
          variableReference?: number;
          name?: string;
        };

        if (!variableReference) {
          variableReference =
            sidebar.variables.latestSelection?.variablesReference;
        }
        if (!name) {
          name = sidebar.variables.latestSelection?.name;
        }

        const id = `jp-debugger-variable-${name}`;
        if (
          !name ||
          !variableReference ||
          tracker.find(widget => widget.id === id)
        ) {
          return;
        }

        const variables = await service.inspectVariable(
          variableReference as number
        );
        if (!variables || variables.length === 0) {
          return;
        }

        const model = service.model.variables;
        const widget = new MainAreaWidget<Debugger.VariablesGrid>({
          content: new Debugger.VariablesGrid({
            model,
            commands,
            scopes: [{ name, variables }],
            themeManager
          })
        });
        widget.addClass('jp-DebuggerVariables');
        widget.id = id;
        widget.title.icon = Debugger.Icons.variableIcon;
        widget.title.label = `${service.session?.connection?.name} - ${name}`;
        void tracker.add(widget);
        const disposeWidget = () => {
          widget.dispose();
          model.changed.disconnect(disposeWidget);
        };
        model.changed.connect(disposeWidget);
        shell.add(widget, 'main', {
          mode: tracker.currentWidget ? 'split-right' : 'split-bottom',
          activate: false
        });
      }
    });

    commands.addCommand(CommandIDs.renderMimeVariable, {
      label: trans.__('Render Variable'),
      caption: trans.__('Render Variable according to its mime type'),
      isEnabled: () => !!service.session?.isStarted,
      isVisible: () => service.model.hasRichVariableRendering,
      execute: args => {
        let { name, frameId } = args as {
          frameId?: number;
          name?: string;
        };

        if (!name) {
          name = sidebar.variables.latestSelection?.name;
        }
        if (!frameId) {
          frameId = service.model.callstack.frame?.id;
        }

        const activeWidget = handler.activeWidget
        let activeRendermime : IRenderMimeRegistry = rendermime

        if(activeWidget instanceof NotebookPanel ){
          activeRendermime = activeWidget.content.rendermime
        }
        
        const id = `jp-debugger-variable-mime-${name}`;
        if (
          !name || // Name is mandatory
          trackerMime.find(widget => widget.id === id) || // Widget already exists
          (!frameId && service.hasStoppedThreads()) // frame id missing on breakpoint
        ) {
          return;
        }

        const widget = new Debugger.VariableRenderer({
          dataLoader: service.inspectRichVariable(name, frameId),
          rendermime: activeRendermime
        });
        widget.addClass('jp-DebuggerVariables');
        widget.id = id;
        widget.title.icon = Debugger.Icons.variableIcon;
        widget.title.label = `${service.session?.connection?.name} - ${name}`;
        void trackerMime.add(widget);
        const disposeWidget = () => {
          widget.dispose();
          service.model.variables.changed.disconnect(disposeWidget);
        };
        service.model.variables.changed.connect(disposeWidget);
        shell.add(widget, 'main', {
          mode: trackerMime.currentWidget ? 'split-right' : 'split-bottom',
          activate: false
        });
      }
    });
  }
};

/**
 * Debugger sidebar provider plugin.
 */
const sidebar: JupyterFrontEndPlugin<IDebugger.ISidebar> = {
  id: '@jupyterlab/debugger-extension:sidebar',
  provides: IDebuggerSidebar,
  requires: [IDebugger, IEditorServices, ITranslator],
  optional: [IThemeManager, ISettingRegistry],
  autoStart: true,
  activate: async (
    app: JupyterFrontEnd,
    service: IDebugger,
    editorServices: IEditorServices,
    translator: ITranslator,
    themeManager: IThemeManager | null,
    settingRegistry: ISettingRegistry | null
  ): Promise<IDebugger.ISidebar> => {
    const { commands } = app;
    const CommandIDs = Debugger.CommandIDs;

    const callstackCommands = {
      registry: commands,
      continue: CommandIDs.debugContinue,
      terminate: CommandIDs.terminate,
      next: CommandIDs.next,
      stepIn: CommandIDs.stepIn,
      stepOut: CommandIDs.stepOut,
      evaluate: CommandIDs.evaluate
    };

    const sidebar = new Debugger.Sidebar({
      service,
      callstackCommands,
      editorServices,
      themeManager,
      translator
    });

    if (settingRegistry) {
      const setting = await settingRegistry.load(main.id);
      const updateSettings = (): void => {
        const filters = setting.get('variableFilters').composite as {
          [key: string]: string[];
        };
        const kernel = service.session?.connection?.kernel?.name ?? '';
        if (kernel && filters[kernel]) {
          sidebar.variables.filter = new Set<string>(filters[kernel]);
        }
      };
      updateSettings();
      setting.changed.connect(updateSettings);
      service.sessionChanged.connect(updateSettings);
    }

    return sidebar;
  }
};

/**
 * The main debugger UI plugin.
 */
const main: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/debugger-extension:main',
  requires: [IDebugger, IDebuggerSidebar, IEditorServices, ITranslator],
  optional: [
    ICommandPalette,
    IDebuggerSources,
    ILabShell,
    ILayoutRestorer,
    ILoggerRegistry
  ],
  autoStart: true,
  activate: async (
    app: JupyterFrontEnd,
    service: IDebugger,
    sidebar: IDebugger.ISidebar,
    editorServices: IEditorServices,
    translator: ITranslator,
    palette: ICommandPalette | null,
    debuggerSources: IDebugger.ISources | null,
    labShell: ILabShell | null,
    restorer: ILayoutRestorer | null,
    loggerRegistry: ILoggerRegistry | null
  ): Promise<void> => {
    const trans = translator.load('jupyterlab');
    const { commands, contextMenu, shell, serviceManager } = app;
    const { kernelspecs } = serviceManager;
    const CommandIDs = Debugger.CommandIDs;

    // First check if there is a PageConfig override for the extension visibility
    const alwaysShowDebuggerExtension =
      PageConfig.getOption('alwaysShowDebuggerExtension').toLowerCase() ===
      'true';
    if (!alwaysShowDebuggerExtension) {
      // hide the debugger sidebar if no kernel with support for debugging is available
      await kernelspecs.ready;
      const specs = kernelspecs.specs?.kernelspecs;
      if (!specs) {
        return;
      }
      const enabled = Object.keys(specs).some(
        name => !!(specs[name]?.metadata?.['debugger'] ?? false)
      );
      if (!enabled) {
        return;
      }
    }

    // get the mime type of the kernel language for the current debug session
    const getMimeType = async (): Promise<string> => {
      const kernel = service.session?.connection?.kernel;
      if (!kernel) {
        return '';
      }
      const info = (await kernel.info).language_info;
      const name = info.name;
      const mimeType =
        editorServices?.mimeTypeService.getMimeTypeByLanguage({ name }) ?? '';
      return mimeType;
    };

    const rendermime = new RenderMimeRegistry({ initialFactories });

    commands.addCommand(CommandIDs.evaluate, {
      label: trans.__('Evaluate Code'),
      caption: trans.__('Evaluate Code'),
      icon: Debugger.Icons.evaluateIcon,
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        const mimeType = await getMimeType();
        const result = await Debugger.Dialogs.getCode({
          title: trans.__('Evaluate Code'),
          okLabel: trans.__('Evaluate'),
          cancelLabel: trans.__('Cancel'),
          mimeType,
          rendermime
        });
        const code = result.value;
        if (!result.button.accept || !code) {
          return;
        }
        const reply = await service.evaluate(code);
        if (reply) {
          const data = reply.result;
          const path = service?.session?.connection?.path;
          const logger = path ? loggerRegistry?.getLogger?.(path) : undefined;

          if (logger) {
            // print to log console of the notebook currently being debugged
            logger.log({ type: 'text', data, level: logger.level });
          } else {
            // fallback to printing to devtools console
            console.debug(data);
          }
        }
      }
    });

    commands.addCommand(CommandIDs.debugContinue, {
      label: trans.__('Continue'),
      caption: trans.__('Continue'),
      icon: Debugger.Icons.continueIcon,
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.continue();
        commands.notifyCommandChanged();
      }
    });

    commands.addCommand(CommandIDs.terminate, {
      label: trans.__('Terminate'),
      caption: trans.__('Terminate'),
      icon: Debugger.Icons.terminateIcon,
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.restart();
        commands.notifyCommandChanged();
      }
    });

    commands.addCommand(CommandIDs.next, {
      label: trans.__('Next'),
      caption: trans.__('Next'),
      icon: Debugger.Icons.stepOverIcon,
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.next();
      }
    });

    commands.addCommand(CommandIDs.stepIn, {
      label: trans.__('Step In'),
      caption: trans.__('Step In'),
      icon: Debugger.Icons.stepIntoIcon,
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.stepIn();
      }
    });

    commands.addCommand(CommandIDs.stepOut, {
      label: trans.__('Step Out'),
      caption: trans.__('Step Out'),
      icon: Debugger.Icons.stepOutIcon,
      isEnabled: () => {
        return service.hasStoppedThreads();
      },
      execute: async () => {
        await service.stepOut();
      }
    });

    service.eventMessage.connect((_, event): void => {
      commands.notifyCommandChanged();
      if (labShell && event.event === 'initialized') {
        labShell.activateById(sidebar.id);
      }
    });

    service.sessionChanged.connect(_ => {
      commands.notifyCommandChanged();
    });

    if (restorer) {
      restorer.add(sidebar, 'debugger-sidebar');
    }

    sidebar.node.setAttribute('role', 'region');
    sidebar.node.setAttribute('aria-label', trans.__('Debugger section'));

    shell.add(sidebar, 'right');

    contextMenu.addItem({
      command: CommandIDs.inspectVariable,
      selector: '.jp-DebuggerVariables-body .jp-DebuggerVariables-grid'
    });

    contextMenu.addItem({
      command: CommandIDs.renderMimeVariable,
      selector: '.jp-DebuggerVariables-body'
    });

    if (palette) {
      const category = trans.__('Debugger');
      [
        CommandIDs.debugContinue,
        CommandIDs.terminate,
        CommandIDs.next,
        CommandIDs.stepIn,
        CommandIDs.stepOut,
        CommandIDs.evaluate
      ].forEach(command => {
        palette.addItem({ command, category });
      });
    }

    if (debuggerSources) {
      const { model } = service;
      const readOnlyEditorFactory = new Debugger.ReadOnlyEditorFactory({
        editorServices
      });

      const onCurrentFrameChanged = (
        _: IDebugger.Model.ICallstack,
        frame: IDebugger.IStackFrame
      ): void => {
        debuggerSources
          .find({
            focus: true,
            kernel: service.session?.connection?.kernel?.name ?? '',
            path: service.session?.connection?.path ?? '',
            source: frame?.source?.path ?? ''
          })
          .forEach(editor => {
            requestAnimationFrame(() => {
              Debugger.EditorHandler.showCurrentLine(editor, frame.line);
            });
          });
      };

      const onCurrentSourceOpened = (
        _: IDebugger.Model.ISources | null,
        source: IDebugger.Source,
        breakpoint?: IDebugger.IBreakpoint
      ): void => {
        if (!source) {
          return;
        }
        const { content, mimeType, path } = source;
        const results = debuggerSources.find({
          focus: true,
          kernel: service.session?.connection?.kernel?.name ?? '',
          path: service.session?.connection?.path ?? '',
          source: path
        });
        if (results.length > 0) {
          if (breakpoint && typeof breakpoint.line !== 'undefined') {
            results.forEach(editor => {
              if (editor instanceof CodeMirrorEditor) {
                (editor as CodeMirrorEditor).scrollIntoViewCentered({
                  line: (breakpoint.line as number) - 1,
                  ch: breakpoint.column || 0
                });
              } else {
                editor.revealPosition({
                  line: (breakpoint.line as number) - 1,
                  column: breakpoint.column || 0
                });
              }
            });
          }
          return;
        }
        const editorWrapper = readOnlyEditorFactory.createNewEditor({
          content,
          mimeType,
          path
        });
        const editor = editorWrapper.editor;
        const editorHandler = new Debugger.EditorHandler({
          debuggerService: service,
          editor,
          path
        });
        editorWrapper.disposed.connect(() => editorHandler.dispose());

        debuggerSources.open({
          label: PathExt.basename(path),
          caption: path,
          editorWrapper
        });

        const frame = service.model.callstack.frame;
        if (frame) {
          Debugger.EditorHandler.showCurrentLine(editor, frame.line);
        }
      };

      model.callstack.currentFrameChanged.connect(onCurrentFrameChanged);
      model.sources.currentSourceOpened.connect(onCurrentSourceOpened);
      model.breakpoints.clicked.connect(async (_, breakpoint) => {
        const path = breakpoint.source?.path;
        const source = await service.getSource({
          sourceReference: 0,
          path
        });
        onCurrentSourceOpened(null, source, breakpoint);
      });
    }
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  service,
  consoles,
  files,
  notebooks,
  variables,
  sidebar,
  main,
  sources,
  configuration
];

export default plugins;
