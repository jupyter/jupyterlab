// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Clipboard,
  ICommandPalette,
  ISessionContextDialogs,
  sessionContextDialogs,
  WidgetTracker
} from '@jupyterlab/apputils';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { IConsoleTracker } from '@jupyterlab/console';
import { MarkdownCodeBlocks, PathExt } from '@jupyterlab/coreutils';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import { FileEditor } from '@jupyterlab/fileeditor';
import { ILauncher } from '@jupyterlab/launcher';
import {
  IEditMenu,
  IFileMenu,
  IMainMenu,
  IRunMenu,
  IViewMenu
} from '@jupyterlab/mainmenu';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { TranslationBundle } from '@jupyterlab/translation';
import {
  consoleIcon,
  copyIcon,
  cutIcon,
  LabIcon,
  markdownIcon,
  pasteIcon,
  redoIcon,
  textEditorIcon,
  undoIcon
} from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';
import {
  JSONObject,
  ReadonlyJSONObject,
  ReadonlyPartialJSONObject
} from '@lumino/coreutils';

/**
 * The command IDs used by the fileeditor plugin.
 */
export namespace CommandIDs {
  export const createNew = 'fileeditor:create-new';

  export const createNewMarkdown = 'fileeditor:create-new-markdown-file';

  export const changeFontSize = 'fileeditor:change-font-size';

  export const lineNumbers = 'fileeditor:toggle-line-numbers';

  export const lineWrap = 'fileeditor:toggle-line-wrap';

  export const changeTabs = 'fileeditor:change-tabs';

  export const matchBrackets = 'fileeditor:toggle-match-brackets';

  export const autoClosingBrackets = 'fileeditor:toggle-autoclosing-brackets';

  export const createConsole = 'fileeditor:create-console';

  export const replaceSelection = 'fileeditor:replace-selection';

  export const runCode = 'fileeditor:run-code';

  export const runAllCode = 'fileeditor:run-all';

  export const markdownPreview = 'fileeditor:markdown-preview';

  export const undo = 'fileeditor:undo';

  export const redo = 'fileeditor:redo';

  export const cut = 'fileeditor:cut';

  export const copy = 'fileeditor:copy';

  export const paste = 'fileeditor:paste';

  export const selectAll = 'fileeditor:select-all';

  export const showTrailingSpace = 'fileeditor:toggle-show-trailing-space';
}

export interface IFileTypeData extends ReadonlyJSONObject {
  fileExt: string;
  iconName: string;
  launcherLabel: string;
  paletteLabel: string;
  caption: string;
}

/**
 * The name of the factory that creates editor widgets.
 */
export const FACTORY = 'Editor';

let config: CodeEditor.IConfig = { ...CodeEditor.defaultConfig };

/**
 * A utility class for adding commands and menu items,
 * for use by the File Editor extension or other Editor extensions.
 */
export namespace Commands {
  /**
   * Accessor function that returns the createConsole function for use by Create Console commands
   */
  function getCreateConsoleFunction(
    commands: CommandRegistry
  ): (
    widget: IDocumentWidget<FileEditor>,
    args?: ReadonlyPartialJSONObject
  ) => Promise<void> {
    return async function createConsole(
      widget: IDocumentWidget<FileEditor>,
      args?: ReadonlyPartialJSONObject
    ): Promise<void> {
      const options = args || {};
      const console = await commands.execute('console:create', {
        activate: options['activate'],
        name: widget.context.contentsModel?.name,
        path: widget.context.path,
        preferredLanguage: widget.context.model.defaultKernelLanguage,
        ref: widget.id,
        insertMode: 'split-bottom'
      });

      widget.context.pathChanged.connect((sender, value) => {
        console.session.setPath(value);
        console.session.setName(widget.context.contentsModel?.name);
      });
    };
  }

  /**
   * Update the setting values.
   */
  export function updateSettings(
    settings: ISettingRegistry.ISettings,
    commands: CommandRegistry
  ): void {
    config = {
      ...CodeEditor.defaultConfig,
      ...(settings.get('editorConfig').composite as JSONObject)
    };

    // Trigger a refresh of the rendered commands
    commands.notifyCommandChanged();
  }

  /**
   * Update the settings of the current tracker instances.
   */
  export function updateTracker(
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>
  ): void {
    tracker.forEach(widget => {
      updateWidget(widget.content);
    });
  }

  /**
   * Update the settings of a widget.
   * Skip global settings for transient editor specific configs.
   */
  export function updateWidget(widget: FileEditor): void {
    const transientConfigs = ['lineNumbers', 'lineWrap', 'matchBrackets'];
    const editor = widget.editor;
    let editorOptions: any = {};
    Object.keys(config).forEach((key: keyof CodeEditor.IConfig) => {
      if (!transientConfigs.includes(key)) {
        editorOptions[key] = config[key];
      }
    });
    editor.setOptions(editorOptions);
  }

  /**
   * Wrapper function for adding the default File Editor commands
   */
  export function addCommands(
    commands: CommandRegistry,
    settingRegistry: ISettingRegistry,
    trans: TranslationBundle,
    id: string,
    isEnabled: () => boolean,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    browserFactory: IFileBrowserFactory
  ): void {
    // Add a command to change font size.
    addChangeFontSizeCommand(commands, settingRegistry, trans, id);

    addLineNumbersCommand(commands, settingRegistry, trans, id, isEnabled);

    addWordWrapCommand(commands, settingRegistry, trans, id, isEnabled);

    addChangeTabsCommand(commands, settingRegistry, trans, id);

    addMatchBracketsCommand(commands, settingRegistry, trans, id, isEnabled);

    addAutoClosingBracketsCommand(commands, settingRegistry, trans, id);

    addReplaceSelectionCommand(commands, tracker, trans, isEnabled);

    addCreateConsoleCommand(commands, tracker, trans, isEnabled);

    addRunCodeCommand(commands, tracker, trans, isEnabled);

    addRunAllCodeCommand(commands, tracker, trans, isEnabled);

    addMarkdownPreviewCommand(commands, tracker, trans);

    // Add a command for creating a new text file.
    addCreateNewCommand(commands, browserFactory, trans);

    // Add a command for creating a new Markdown file.
    addCreateNewMarkdownCommand(commands, browserFactory, trans);

    addUndoCommand(commands, tracker, trans, isEnabled);

    addRedoCommand(commands, tracker, trans, isEnabled);

    addCutCommand(commands, tracker, trans, isEnabled);

    addCopyCommand(commands, tracker, trans, isEnabled);

    addPasteCommand(commands, tracker, trans, isEnabled);

    addSelectAllCommand(commands, tracker, trans, isEnabled);

    addShowTrailingSpaceCommand(commands, settingRegistry, trans, id, isEnabled);
  }

  /**
   * Add a command to change font size for File Editor
   */
  export function addChangeFontSizeCommand(
    commands: CommandRegistry,
    settingRegistry: ISettingRegistry,
    trans: TranslationBundle,
    id: string
  ): void {
    commands.addCommand(CommandIDs.changeFontSize, {
      execute: args => {
        const delta = Number(args['delta']);
        if (Number.isNaN(delta)) {
          console.error(
            `${CommandIDs.changeFontSize}: delta arg must be a number`
          );
          return;
        }
        const style = window.getComputedStyle(document.documentElement);
        const cssSize = parseInt(
          style.getPropertyValue('--jp-code-font-size'),
          10
        );
        const currentSize = config.fontSize || cssSize;
        config.fontSize = currentSize + delta;
        return settingRegistry
          .set(id, 'editorConfig', (config as unknown) as JSONObject)
          .catch((reason: Error) => {
            console.error(`Failed to set ${id}: ${reason.message}`);
          });
      },
      label: args => {
        if ((args.delta ?? 0) > 0) {
          return args.isMenu
            ? trans.__('Increase Text Editor Font Size')
            : trans.__('Increase Font Size');
        } else {
          return args.isMenu
            ? trans.__('Decrease Text Editor Font Size')
            : trans.__('Decrease Font Size');
        }
      }
    });
  }

  /**
   * Add the Line Numbers command
   */
  export function addLineNumbersCommand(
    commands: CommandRegistry,
    settingRegistry: ISettingRegistry,
    trans: TranslationBundle,
    id: string,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.lineNumbers, {
      execute: () => {
        config.lineNumbers = !config.lineNumbers;
        return settingRegistry
          .set(id, 'editorConfig', (config as unknown) as JSONObject)
          .catch((reason: Error) => {
            console.error(`Failed to set ${id}: ${reason.message}`);
          });
      },
      isEnabled,
      isToggled: () => config.lineNumbers,
      label: trans.__('Line Numbers')
    });
  }

  /**
   * Add the Word Wrap command
   */
  export function addWordWrapCommand(
    commands: CommandRegistry,
    settingRegistry: ISettingRegistry,
    trans: TranslationBundle,
    id: string,
    isEnabled: () => boolean
  ): void {
    type wrappingMode = 'on' | 'off' | 'wordWrapColumn' | 'bounded';

    commands.addCommand(CommandIDs.lineWrap, {
      execute: args => {
        config.lineWrap = (args['mode'] as wrappingMode) || 'off';
        return settingRegistry
          .set(id, 'editorConfig', (config as unknown) as JSONObject)
          .catch((reason: Error) => {
            console.error(`Failed to set ${id}: ${reason.message}`);
          });
      },
      isEnabled,
      isToggled: args => {
        const lineWrap = (args['mode'] as wrappingMode) || 'off';
        return config.lineWrap === lineWrap;
      },
      label: trans.__('Word Wrap')
    });
  }

  /**
   * Add command for changing tabs size or type in File Editor
   */
  export function addChangeTabsCommand(
    commands: CommandRegistry,
    settingRegistry: ISettingRegistry,
    trans: TranslationBundle,
    id: string
  ): void {
    commands.addCommand(CommandIDs.changeTabs, {
      label: args => {
        if (args.insertSpaces) {
          return trans._n(
            'Spaces: %1',
            'Spaces: %1',
            (args.size as number) ?? 0
          );
        } else {
          return trans.__('Indent with Tab');
        }
      },
      execute: args => {
        config.tabSize = (args['size'] as number) || 4;
        config.insertSpaces = !!args['insertSpaces'];
        return settingRegistry
          .set(id, 'editorConfig', (config as unknown) as JSONObject)
          .catch((reason: Error) => {
            console.error(`Failed to set ${id}: ${reason.message}`);
          });
      },
      isToggled: args => {
        const insertSpaces = !!args['insertSpaces'];
        const size = (args['size'] as number) || 4;
        return config.insertSpaces === insertSpaces && config.tabSize === size;
      }
    });
  }

  /**
   * Add the Match Brackets command
   */
  export function addMatchBracketsCommand(
    commands: CommandRegistry,
    settingRegistry: ISettingRegistry,
    trans: TranslationBundle,
    id: string,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.matchBrackets, {
      execute: () => {
        config.matchBrackets = !config.matchBrackets;
        return settingRegistry
          .set(id, 'editorConfig', (config as unknown) as JSONObject)
          .catch((reason: Error) => {
            console.error(`Failed to set ${id}: ${reason.message}`);
          });
      },
      label: trans.__('Match Brackets'),
      isEnabled,
      isToggled: () => config.matchBrackets
    });
  }

  /**
   * Add the Auto Close Brackets for Text Editor command
   */
  export function addAutoClosingBracketsCommand(
    commands: CommandRegistry,
    settingRegistry: ISettingRegistry,
    trans: TranslationBundle,
    id: string
  ): void {
    commands.addCommand(CommandIDs.autoClosingBrackets, {
      execute: () => {
        config.autoClosingBrackets = !config.autoClosingBrackets;
        return settingRegistry
          .set(id, 'editorConfig', (config as unknown) as JSONObject)
          .catch((reason: Error) => {
            console.error(`Failed to set ${id}: ${reason.message}`);
          });
      },
      label: trans.__('Auto Close Brackets for Text Editor'),
      isToggled: () => config.autoClosingBrackets
    });
  }

  /**
   * Add the replace selection for text editor command
   */
  export function addReplaceSelectionCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.replaceSelection, {
      execute: args => {
        const text: string = (args['text'] as string) || '';
        const widget = tracker.currentWidget;
        if (!widget) {
          return;
        }
        widget.content.editor.replaceSelection?.(text);
      },
      isEnabled,
      label: trans.__('Replace Selection in Editor')
    });
  }

  /**
   * Add the Create Console for Editor command
   */
  export function addCreateConsoleCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.createConsole, {
      execute: args => {
        const widget = tracker.currentWidget;

        if (!widget) {
          return;
        }

        return getCreateConsoleFunction(commands)(widget, args);
      },
      isEnabled,
      icon: consoleIcon,
      label: trans.__('Create Console for Editor')
    });
  }

  /**
   * Add the Run Code command
   */
  export function addRunCodeCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.runCode, {
      execute: () => {
        // Run the appropriate code, taking into account a ```fenced``` code block.
        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return;
        }

        let code: string | undefined = '';
        const editor = widget.editor;
        const path = widget.context.path;
        const extension = PathExt.extname(path);
        const selection = editor.getSelection();
        const { start, end } = selection;
        let selected = start.column !== end.column || start.line !== end.line;

        if (selected) {
          // Get the selected code from the editor.
          const start = editor.getOffsetAt(selection.start);
          const end = editor.getOffsetAt(selection.end);

          code = editor.model.value.text.substring(start, end);
        } else if (MarkdownCodeBlocks.isMarkdown(extension)) {
          const { text } = editor.model.value;
          const blocks = MarkdownCodeBlocks.findMarkdownCodeBlocks(text);

          for (const block of blocks) {
            if (block.startLine <= start.line && start.line <= block.endLine) {
              code = block.code;
              selected = true;
              break;
            }
          }
        }

        if (!selected) {
          // no selection, submit whole line and advance
          code = editor.getLine(selection.start.line);
          const cursor = editor.getCursorPosition();
          if (cursor.line + 1 === editor.lineCount) {
            const text = editor.model.value.text;
            editor.model.value.text = text + '\n';
          }
          editor.setCursorPosition({
            line: cursor.line + 1,
            column: cursor.column
          });
        }

        const activate = false;
        if (code) {
          return commands.execute('console:inject', { activate, code, path });
        } else {
          return Promise.resolve(void 0);
        }
      },
      isEnabled,
      label: trans.__('Run Code')
    });
  }

  /**
   * Add the Run All Code command
   */
  export function addRunAllCodeCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.runAllCode, {
      execute: () => {
        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return;
        }

        let code = '';
        const editor = widget.editor;
        const text = editor.model.value.text;
        const path = widget.context.path;
        const extension = PathExt.extname(path);

        if (MarkdownCodeBlocks.isMarkdown(extension)) {
          // For Markdown files, run only code blocks.
          const blocks = MarkdownCodeBlocks.findMarkdownCodeBlocks(text);
          for (const block of blocks) {
            code += block.code;
          }
        } else {
          code = text;
        }

        const activate = false;
        if (code) {
          return commands.execute('console:inject', { activate, code, path });
        } else {
          return Promise.resolve(void 0);
        }
      },
      isEnabled,
      label: trans.__('Run All Code')
    });
  }

  /**
   * Add markdown preview command
   */
  export function addMarkdownPreviewCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle
  ): void {
    commands.addCommand(CommandIDs.markdownPreview, {
      execute: () => {
        const widget = tracker.currentWidget;
        if (!widget) {
          return;
        }
        const path = widget.context.path;
        return commands.execute('markdownviewer:open', {
          path,
          options: {
            mode: 'split-right'
          }
        });
      },
      isVisible: () => {
        const widget = tracker.currentWidget;
        return (
          (widget && PathExt.extname(widget.context.path) === '.md') || false
        );
      },
      icon: markdownIcon,
      label: trans.__('Show Markdown Preview')
    });
  }

  /**
   * Add undo command
   */
  export function addUndoCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.undo, {
      execute: () => {
        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return;
        }

        widget.editor.undo();
      },
      isEnabled: () => {
        if (!isEnabled()) {
          return false;
        }

        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return false;
        }
        // Ideally enable it when there are undo events stored
        // Reference issue #8590: Code mirror editor could expose the history of undo/redo events
        return true;
      },
      icon: undoIcon.bindprops({ stylesheet: 'menuItem' }),
      label: trans.__('Undo')
    });
  }

  /**
   * Add redo command
   */
  export function addRedoCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.redo, {
      execute: () => {
        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return;
        }

        widget.editor.redo();
      },
      isEnabled: () => {
        if (!isEnabled()) {
          return false;
        }

        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return false;
        }
        // Ideally enable it when there are redo events stored
        // Reference issue #8590: Code mirror editor could expose the history of undo/redo events
        return true;
      },
      icon: redoIcon.bindprops({ stylesheet: 'menuItem' }),
      label: trans.__('Redo')
    });
  }

  /**
   * Add cut command
   */
  export function addCutCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.cut, {
      execute: () => {
        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return;
        }

        const editor = widget.editor as CodeMirrorEditor;
        const text = getTextSelection(editor);

        Clipboard.copyToSystem(text);
        editor.replaceSelection && editor.replaceSelection('');
      },
      isEnabled: () => {
        if (!isEnabled()) {
          return false;
        }

        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return false;
        }

        // Enable command if there is a text selection in the editor
        return isSelected(widget.editor as CodeMirrorEditor);
      },
      icon: cutIcon.bindprops({ stylesheet: 'menuItem' }),
      label: trans.__('Cut')
    });
  }

  /**
   * Add copy command
   */
  export function addCopyCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.copy, {
      execute: () => {
        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return;
        }

        const editor = widget.editor as CodeMirrorEditor;
        const text = getTextSelection(editor);

        Clipboard.copyToSystem(text);
      },
      isEnabled: () => {
        if (!isEnabled()) {
          return false;
        }

        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return false;
        }

        // Enable command if there is a text selection in the editor
        return isSelected(widget.editor as CodeMirrorEditor);
      },
      icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
      label: trans.__('Copy')
    });
  }

  /**
   * Add paste command
   */
  export function addPasteCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.paste, {
      execute: async () => {
        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return;
        }

        const editor: CodeEditor.IEditor = widget.editor;

        // Get data from clipboard
        const clipboard = window.navigator.clipboard;
        const clipboardData: string = await clipboard.readText();

        if (clipboardData) {
          // Paste data to the editor
          editor.replaceSelection && editor.replaceSelection(clipboardData);
        }
      },
      isEnabled: () => Boolean(isEnabled() && tracker.currentWidget?.content),
      icon: pasteIcon.bindprops({ stylesheet: 'menuItem' }),
      label: trans.__('Paste')
    });
  }

  /**
   * Add select all command
   */
  export function addSelectAllCommand(
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.selectAll, {
      execute: () => {
        const widget = tracker.currentWidget?.content;

        if (!widget) {
          return;
        }

        const editor = widget.editor as CodeMirrorEditor;
        editor.execCommand('selectAll');
      },
      isEnabled: () => Boolean(isEnabled() && tracker.currentWidget?.content),
      label: trans.__('Select All')
    });
  }
  /**
   * Add show trailing space command
   */
  export function addShowTrailingSpaceCommand(
    commands: CommandRegistry,
    settingRegistry: ISettingRegistry,
    trans: TranslationBundle,
    id: string,
    isEnabled: () => boolean
  ): void {
    commands.addCommand(CommandIDs.showTrailingSpace, {
      execute: () => {
        config.showTrailingSpace = !config.showTrailingSpace;
        return settingRegistry
          .set(id, 'editorConfig', (config as unknown) as JSONObject)
          .catch((reason: Error) => {
            console.error(`Failed to set ${id}: ${reason.message}`);
          });
      },
      isEnabled,
      isToggled: () => config.showTrailingSpace,
      label: trans.__('Show Trailing Space')
    });
  }

  /**
   * Helper function to check if there is a text selection in the editor
   */
  function isSelected(editor: CodeMirrorEditor) {
    const selectionObj = editor.getSelection();
    const { start, end } = selectionObj;
    const selected = start.column !== end.column || start.line !== end.line;

    return selected;
  }

  /**
   * Helper function to get text selection from the editor
   */
  function getTextSelection(editor: CodeMirrorEditor) {
    const selectionObj = editor.getSelection();
    const start = editor.getOffsetAt(selectionObj.start);
    const end = editor.getOffsetAt(selectionObj.end);
    const text = editor.model.value.text.substring(start, end);

    return text;
  }

  /**
   * Function to create a new untitled text file, given the current working directory.
   */
  function createNew(
    commands: CommandRegistry,
    cwd: string,
    ext: string = 'txt'
  ) {
    return commands
      .execute('docmanager:new-untitled', {
        path: cwd,
        type: 'file',
        ext
      })
      .then(model => {
        return commands.execute('docmanager:open', {
          path: model.path,
          factory: FACTORY
        });
      });
  }

  /**
   * Add the New File command
   *
   * Defaults to Text/.txt if file type data is not specified
   */
  export function addCreateNewCommand(
    commands: CommandRegistry,
    browserFactory: IFileBrowserFactory,
    trans: TranslationBundle
  ): void {
    commands.addCommand(CommandIDs.createNew, {
      label: args => {
        if (args.isPalette) {
          return (args.paletteLabel as string) ?? trans.__('New Text File');
        }
        return (args.launcherLabel as string) ?? trans.__('Text File');
      },
      caption: args =>
        (args.caption as string) ?? trans.__('Create a new text file'),
      icon: args =>
        args.isPalette
          ? undefined
          : LabIcon.resolve({
              icon: (args.iconName as string) ?? textEditorIcon
            }),
      execute: args => {
        const cwd = args.cwd || browserFactory.defaultBrowser.model.path;
        return createNew(
          commands,
          cwd as string,
          (args.fileExt as string) ?? 'txt'
        );
      }
    });
  }

  /**
   * Add the New Markdown File command
   */
  export function addCreateNewMarkdownCommand(
    commands: CommandRegistry,
    browserFactory: IFileBrowserFactory,
    trans: TranslationBundle
  ): void {
    commands.addCommand(CommandIDs.createNewMarkdown, {
      label: args =>
        args['isPalette']
          ? trans.__('New Markdown File')
          : trans.__('Markdown File'),
      caption: trans.__('Create a new markdown file'),
      icon: args => (args['isPalette'] ? undefined : markdownIcon),
      execute: args => {
        const cwd = args['cwd'] || browserFactory.defaultBrowser.model.path;
        return createNew(commands, cwd as string, 'md');
      }
    });
  }

  /**
   * Wrapper function for adding the default launcher items for File Editor
   */
  export function addLauncherItems(
    launcher: ILauncher,
    trans: TranslationBundle
  ): void {
    addCreateNewToLauncher(launcher, trans);

    addCreateNewMarkdownToLauncher(launcher, trans);
  }

  /**
   * Add Create New Text File to the Launcher
   */
  export function addCreateNewToLauncher(
    launcher: ILauncher,
    trans: TranslationBundle
  ): void {
    launcher.add({
      command: CommandIDs.createNew,
      category: trans.__('Other'),
      rank: 1
    });
  }

  /**
   * Add Create New Markdown to the Launcher
   */
  export function addCreateNewMarkdownToLauncher(
    launcher: ILauncher,
    trans: TranslationBundle
  ): void {
    launcher.add({
      command: CommandIDs.createNewMarkdown,
      category: trans.__('Other'),
      rank: 2
    });
  }

  /**
   * Add ___ File items to the Launcher for common file types associated with available kernels
   */
  export function addKernelLanguageLauncherItems(
    launcher: ILauncher,
    trans: TranslationBundle,
    availableKernelFileTypes: Iterable<IFileTypeData>
  ): void {
    for (let ext of availableKernelFileTypes) {
      launcher.add({
        command: CommandIDs.createNew,
        category: trans.__('Other'),
        rank: 3,
        args: ext
      });
    }
  }

  /**
   * Wrapper function for adding the default items to the File Editor palette
   */
  export function addPaletteItems(
    palette: ICommandPalette,
    trans: TranslationBundle
  ): void {
    addChangeTabsCommandsToPalette(palette, trans);

    addCreateNewCommandToPalette(palette, trans);

    addCreateNewMarkdownCommandToPalette(palette, trans);

    addChangeFontSizeCommandsToPalette(palette, trans);
  }

  /**
   * Add commands to change the tab indentation to the File Editor palette
   */
  export function addChangeTabsCommandsToPalette(
    palette: ICommandPalette,
    trans: TranslationBundle
  ): void {
    const paletteCategory = trans.__('Text Editor');
    const args: JSONObject = {
      insertSpaces: false,
      size: 4
    };
    const command = CommandIDs.changeTabs;
    palette.addItem({ command, args, category: paletteCategory });

    for (const size of [1, 2, 4, 8]) {
      const args: JSONObject = {
        insertSpaces: true,
        size
      };
      palette.addItem({ command, args, category: paletteCategory });
    }
  }

  /**
   * Add a Create New File command to the File Editor palette
   */
  export function addCreateNewCommandToPalette(
    palette: ICommandPalette,
    trans: TranslationBundle
  ): void {
    const paletteCategory = trans.__('Text Editor');
    palette.addItem({
      command: CommandIDs.createNew,
      args: { isPalette: true },
      category: paletteCategory
    });
  }

  /**
   * Add a Create New Markdown command to the File Editor palette
   */
  export function addCreateNewMarkdownCommandToPalette(
    palette: ICommandPalette,
    trans: TranslationBundle
  ): void {
    const paletteCategory = trans.__('Text Editor');
    palette.addItem({
      command: CommandIDs.createNewMarkdown,
      args: { isPalette: true },
      category: paletteCategory
    });
  }

  /**
   * Add commands to change the font size to the File Editor palette
   */
  export function addChangeFontSizeCommandsToPalette(
    palette: ICommandPalette,
    trans: TranslationBundle
  ): void {
    const paletteCategory = trans.__('Text Editor');
    const command = CommandIDs.changeFontSize;

    let args = { delta: 1 };
    palette.addItem({ command, args, category: paletteCategory });

    args = { delta: -1 };
    palette.addItem({ command, args, category: paletteCategory });
  }

  /**
   * Add New ___ File commands to the File Editor palette for common file types associated with available kernels
   */
  export function addKernelLanguagePaletteItems(
    palette: ICommandPalette,
    trans: TranslationBundle,
    availableKernelFileTypes: Iterable<IFileTypeData>
  ): void {
    const paletteCategory = trans.__('Text Editor');
    for (let ext of availableKernelFileTypes) {
      palette.addItem({
        command: CommandIDs.createNew,
        args: { ...ext, isPalette: true },
        category: paletteCategory
      });
    }
  }

  /**
   * Wrapper function for adding the default menu items for File Editor
   */
  export function addMenuItems(
    menu: IMainMenu,
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle,
    consoleTracker: IConsoleTracker | null,
    sessionDialogs: ISessionContextDialogs | null
  ): void {
    // Add undo/redo hooks to the edit menu.
    addUndoRedoToEditMenu(menu, tracker);

    // Add editor view options.
    addEditorViewerToViewMenu(menu, tracker);

    // Add a console creator the the file menu.
    addConsoleCreatorToFileMenu(menu, commands, tracker, trans);

    // Add a code runner to the run menu.
    if (consoleTracker) {
      addCodeRunnersToRunMenu(
        menu,
        commands,
        tracker,
        consoleTracker,
        trans,
        sessionDialogs
      );
    }
  }

  /**
   * Add Create New ___ File commands to the File menu for common file types associated with available kernels
   */
  export function addKernelLanguageMenuItems(
    menu: IMainMenu,
    availableKernelFileTypes: Iterable<IFileTypeData>
  ): void {
    for (let ext of availableKernelFileTypes) {
      menu.fileMenu.newMenu.addItem({
        command: CommandIDs.createNew,
        args: ext,
        rank: 30
      });
    }
  }

  /**
   * Add File Editor undo and redo widgets to the Edit menu
   */
  export function addUndoRedoToEditMenu(
    menu: IMainMenu,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>
  ): void {
    menu.editMenu.undoers.add({
      tracker,
      undo: widget => {
        widget.content.editor.undo();
      },
      redo: widget => {
        widget.content.editor.redo();
      }
    } as IEditMenu.IUndoer<IDocumentWidget<FileEditor>>);
  }

  /**
   * Add a File Editor editor viewer to the View Menu
   */
  export function addEditorViewerToViewMenu(
    menu: IMainMenu,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>
  ): void {
    menu.viewMenu.editorViewers.add({
      tracker,
      toggleLineNumbers: widget => {
        const lineNumbers = !widget.content.editor.getOption('lineNumbers');
        widget.content.editor.setOption('lineNumbers', lineNumbers);
      },
      toggleWordWrap: widget => {
        const oldValue = widget.content.editor.getOption('lineWrap');
        const newValue = oldValue === 'off' ? 'on' : 'off';
        widget.content.editor.setOption('lineWrap', newValue);
      },
      toggleMatchBrackets: widget => {
        const matchBrackets = !widget.content.editor.getOption('matchBrackets');
        widget.content.editor.setOption('matchBrackets', matchBrackets);
      },
      lineNumbersToggled: widget =>
        widget.content.editor.getOption('lineNumbers'),
      wordWrapToggled: widget =>
        widget.content.editor.getOption('lineWrap') !== 'off',
      matchBracketsToggled: widget =>
        widget.content.editor.getOption('matchBrackets')
    } as IViewMenu.IEditorViewer<IDocumentWidget<FileEditor>>);
  }

  /**
   * Add a File Editor console creator to the File menu
   */
  export function addConsoleCreatorToFileMenu(
    menu: IMainMenu,
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    trans: TranslationBundle
  ): void {
    const createConsole: (
      widget: IDocumentWidget<FileEditor>
    ) => Promise<void> = getCreateConsoleFunction(commands);
    menu.fileMenu.consoleCreators.add({
      tracker,
      createConsoleLabel: (n: number) => trans.__('Create Console for Editor'),
      createConsole
    } as IFileMenu.IConsoleCreator<IDocumentWidget<FileEditor>>);
  }

  /**
   * Add a File Editor code runner to the Run menu
   */
  export function addCodeRunnersToRunMenu(
    menu: IMainMenu,
    commands: CommandRegistry,
    tracker: WidgetTracker<IDocumentWidget<FileEditor>>,
    consoleTracker: IConsoleTracker,
    trans: TranslationBundle,
    sessionDialogs: ISessionContextDialogs | null
  ): void {
    menu.runMenu.codeRunners.add({
      tracker,
      runLabel: (n: number) => trans.__('Run Code'),
      runAllLabel: (n: number) => trans.__('Run All Code'),
      restartAndRunAllLabel: (n: number) =>
        trans.__('Restart Kernel and Run All Code'),
      isEnabled: current =>
        !!consoleTracker.find(
          widget => widget.sessionContext.session?.path === current.context.path
        ),
      run: () => commands.execute(CommandIDs.runCode),
      runAll: () => commands.execute(CommandIDs.runAllCode),
      restartAndRunAll: current => {
        const widget = consoleTracker.find(
          widget => widget.sessionContext.session?.path === current.context.path
        );
        if (widget) {
          return (sessionDialogs || sessionContextDialogs)
            .restart(widget.sessionContext)
            .then(restarted => {
              if (restarted) {
                void commands.execute(CommandIDs.runAllCode);
              }
              return restarted;
            });
        }
      }
    } as IRunMenu.ICodeRunner<IDocumentWidget<FileEditor>>);
  }
}
