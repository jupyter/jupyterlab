import CodeMirror from 'codemirror';
import { INotebookTracker } from '@jupyterlab/notebook';
import { MarkdownCell } from '@jupyterlab/cells';
import { CommandRegistry } from '@lumino/commands';
import { IDisposable } from '@lumino/disposable';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';

export async function setupKeymap(
  keyMap: string,
  commands: CommandRegistry,
  notebookTracker: INotebookTracker,
  removeKeymaps: IDisposable[]
): Promise<IDisposable[]> {
  // remove keymaps to make sure we don't mess with user Shortcuts
  removeKeymaps.forEach(element => {
    element.dispose();
  });
  let keymapRemoval: IDisposable[] = [];
  if (keyMap === 'vim') {
    // This setup for vim in the notebook is derived from extension built by
    // members of the community
    // https://github.com/lambdalisue/jupyter-vim-binding (Jupyter notebook)
    // https://github.com/jwkvam/jupyterlab-vim (JupyterLab 0.x + 1.x)
    // https://github.com/axelfahy/jupyterlab-vim (JupyterLab 2.x)

    // @ts-expect-error
    await import('codemirror/keymap/vim.js');
    const vim = (CodeMirror as any).Vim;
    vim.defineMotion(
      'moveByLinesOrCell',
      (cm: any, head: any, motionArgs: any, vim: any) => {
        let cur = head;
        let endCh = cur.ch;
        let currentCell = notebookTracker.activeCell;
        // TODO: these references will be undefined
        // Depending what our last motion was, we may want to do different
        // things. If our last motion was moving vertically, we want to
        // preserve the HPos from our last horizontal move.  If our last motion
        // was going to the end of a line, moving vertically we should go to
        // the end of the line, etc.
        switch (vim.lastMotion) {
          case 'moveByLines':
          case 'moveByDisplayLines':
          case 'moveByScroll':
          case 'moveToColumn':
          case 'moveToEol':
          // JUPYTER PATCH: add our custom method to the motion cases
          // eslint-disable-next-line no-fallthrough
          case 'moveByLinesOrCell':
            endCh = vim.lastHPos;
            break;
          default:
            vim.lastHPos = endCh;
        }
        let repeat = motionArgs.repeat + (motionArgs.repeatOffset || 0);
        let line = motionArgs.forward ? cur.line + repeat : cur.line - repeat;
        let first = cm.firstLine();
        let last = cm.lastLine();
        // Vim cancels linewise motions that start on an edge and move beyond
        // that edge. It does not cancel motions that do not start on an edge.

        // JUPYTER PATCH BEGIN
        // here we insert the jumps to the next cells
        if (line < first || line > last) {
          // var currentCell = ns.notebook.get_selected_cell();
          // var currentCell = tracker.activeCell;
          // var key = '';
          if (currentCell?.model.type === 'markdown') {
            (currentCell as MarkdownCell).rendered = true;
          }
          if (motionArgs.forward) {
            void commands.execute('notebook:move-cursor-down');
          } else {
            void commands.execute('notebook:move-cursor-up');
          }
          return;
        }
        vim.lastHSPos = cm.charCoords(CodeMirror.Pos(line, endCh), 'div').left;
        return (CodeMirror as any).Pos(line, endCh);
      }
    );
    vim.mapCommand(
      'k',
      'motion',
      'moveByLinesOrCell',
      { forward: false, linewise: true },
      { context: 'normal' }
    );
    vim.mapCommand(
      'j',
      'motion',
      'moveByLinesOrCell',
      { forward: true, linewise: true },
      { context: 'normal' }
    );
    CodeMirror.prototype.save = () => {
      void commands.execute('docmanager:save');
    };
    vim.defineEx('quit', 'q', function (cm: any) {
      void commands.execute('notebook:enter-command-mode');
    });
    vim.defineAction('splitCell', (cm: any, actionArgs: any) => {
      void commands.execute('notebook:split-cell-at-cursor');
    });
    vim.mapCommand('-', 'action', 'splitCell', {}, { extra: 'normal' });
    keymapRemoval = [
      commands.addKeyBinding({
        selector: '.jp-Notebook.jp-mod-editMode',
        keys: ['Ctrl J'],
        command: 'notebook:move-cursor-down'
      }),
      commands.addKeyBinding({
        selector: '.jp-Notebook.jp-mod-editMode',
        keys: ['Ctrl K'],
        command: 'notebook:move-cursor-up'
      }),
      commands.addCommand('codemirror:leave-vim-insert-mode', {
        label: 'Leave VIM Insert Mode',
        execute: args => {
          const activeCell = notebookTracker.activeCell;
          if (activeCell) {
            let editor = activeCell.editor as CodeMirrorEditor;
            (CodeMirror as any).Vim.handleKey(editor.editor, '<Esc>');
          }
        }
      }),
      commands.addKeyBinding({
        selector: '.jp-Notebook.jp-mod-editMode',
        keys: ['Escape'],
        command: 'codemirror:leave-vim-insert-mode'
      }),
      commands.addKeyBinding({
        selector: '.jp-Notebook.jp-mod-editMode',
        keys: ['Shift Escape'],
        command: 'notebook:enter-command-mode'
      })
    ];
    return keymapRemoval;
  } else if (keyMap === 'sublime') {
    // The setup for sublime in the notebook is taken from
    // https://github.com/ryantam626/jupyterlab_sublime
    function editorExec(id: string) {
      (notebookTracker.activeCell
        ?.editor as CodeMirrorEditor).editor.execCommand(id);
    }
    keymapRemoval = [
      // Manage Escape collision
      // TODO: Check if use has Escape set for command mode
      commands.addCommand('sublime:exit-editor', {
        execute: () => {
          editorExec('singleSelectionTop');
          void commands.execute('notebook:enter-command-mode');
        },
        label: 'Exit Editor'
      }),
      commands.addKeyBinding({
        command: 'sublime:exit-editor',
        keys: ['Escape'],
        selector: '.CodeMirror-focused'
      }),

      // Manage Ctrl-/ collision
      commands.addCommand('sublime:toggle-comment-indented', {
        execute: () => {
          editorExec('toggleCommentIndented');
        },
        label: 'Split selection by line'
      }),
      commands.addKeyBinding({
        command: 'sublime:toggle-comment-indented',
        keys: ['Accel /'],
        selector: '.CodeMirror-focused'
      }),

      // Manage Shift-Tab collision
      commands.addCommand('sublime:indent-less-slash-tooltip', {
        execute: () => {
          if (
            !this.tracker.activeCell.editor.host.classList.contains(
              'jp-mod-completer-enabled'
            )
          ) {
            editorExec('indentLess');
          } else {
            void commands.execute('tooltip:launch-notebook');
          }
        },
        label: 'Indent less or tooltip'
      }),
      commands.addKeyBinding({
        command: 'sublime:indent-less-slash-tooltip',
        keys: ['Shift Tab'],
        selector: '.CodeMirror-focused'
      }),

      // Manage Shift-Ctr-L collision
      commands.addCommand('sublime:split-selection-by-lLine', {
        execute: () => {
          editorExec('splitSelectionByLine');
        },
        label: 'Split selection by line'
      }),
      commands.addKeyBinding({
        command: 'sublime:split-selection-by-lLine',
        keys: ['Accel Shift L'],
        selector: '.CodeMirror-focused'
      }),

      // Manage Ctrl-M collision
      commands.addCommand('sublime:go-to-bracket', {
        execute: () => {
          editorExec('goToBracket');
        },
        label: 'Go to bracket'
      }),
      commands.addKeyBinding({
        command: 'sublime:go-to-bracket',
        keys: ['Ctrl M'],
        selector: '.CodeMirror-focused'
      }),

      // Manage Shift-Ctrl-D collision
      commands.addCommand('sublime:duplicate-line', {
        execute: () => {
          editorExec('duplicateLine');
        },
        label: 'Duplicate line'
      }),
      commands.addKeyBinding({
        command: 'sublime:duplicate-line',
        keys: ['Accel Shift D'],
        selector: '.CodeMirror-focused'
      }),

      // Repurpose Ctrl-Up
      commands.addCommand('sublime:add-cursor-to-prev-line', {
        execute: () => {
          editorExec('addCursorToPrevLine');
        },
        label: 'Add cursor to previous line'
      }),
      commands.addKeyBinding({
        command: 'sublime:add-cursor-to-prev-line',
        keys: ['Ctrl ArrowUp'],
        selector: '.CodeMirror-focused'
      }),

      // Repurpose Ctrl-Down
      commands.addCommand('sublime:add-cursor-to-next-line', {
        execute: () => {
          editorExec('addCursorToNextLine');
        },
        label: 'Add cursor to next line'
      }),
      commands.addKeyBinding({
        command: 'sublime:add-cursor-to-next-line',
        keys: ['Ctrl ArrowDown'],
        selector: '.CodeMirror-focused'
      })
    ];
    return keymapRemoval;
  } else {
    return keymapRemoval;
  }
}
