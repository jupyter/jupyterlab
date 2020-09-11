.. _interface:

User Guide
----------

JupyterLab provides flexible building blocks for interactive,
exploratory computing. While JupyterLab has many features found in
traditional integrated development environments (IDEs), it remains
focused on interactive, exploratory computing.

.. toctree::
   :hidden:

   urls
   files
   file_editor
   notebook
   code_console
   terminal
   running
   commands
   documents_kernels
   file_formats
   extensions
   jupyterhub
   export

The JupyterLab interface consists of a :ref:`main work area <main-area>`
containing tabs of documents and activities, a collapsible :ref:`left sidebar
<left-sidebar>`, and a :ref:`menu bar <menu-bar>`. The left sidebar contains a
:ref:`file browser <working-with-files>`, the :ref:`list of running kernels and
terminals <running>`, the :ref:`command palette <commands>`, the :ref:`notebook
cell tools inspector <notebook>`, and the :ref:`tabs list <tabs>`.

.. image:: images/interface_jupyterlab.png
   :align: center
   :class: jp-screenshot

JupyterLab sessions always reside in a :ref:`workspace <url-workspaces-ui>`.
Workspaces contain the state of JupyterLab: the files that are currently open,
the layout of the application areas and tabs, etc.
Workspaces can be saved on the server with
:ref:`named workspace URLs <url-workspaces-ui>`.
To learn more about URLs in Jupyterlab, visit :ref:`urls`.


.. _menu-bar:

Menu Bar
~~~~~~~~

The menu bar at the top of JupyterLab has top-level menus that expose
actions available in JupyterLab with their keyboard shortcuts. The
default menus are:

-  **File**: actions related to files and directories
-  **Edit**: actions related to editing documents and other activities
-  **View**: actions that alter the appearance of JupyterLab
-  **Run**: actions for running code in different activities such as
   notebooks and code consoles
-  **Kernel**: actions for managing kernels, which are separate processes
   for running code
-  **Tabs**: a list of the open documents and activities in the dock panel
-  **Settings**: common settings and an advanced settings editor
-  **Help**: a list of JupyterLab and kernel help links

:ref:`JupyterLab extensions <user_extensions>` can also create new top-level menus in the menu
bar.

.. _left-sidebar:

Left Sidebar
~~~~~~~~~~~~

The left sidebar contains a number of commonly-used tabs, such as a file
browser, a list of running kernels and terminals, the command palette,
and a list of tabs in the main work area:

.. image:: images/interface_left.png
   :align: center
   :class: jp-screenshot

.. _left-sidebar-toggle:

The left sidebar can be collapsed or expanded by selecting "Show Left Sidebar"
in the View menu or by clicking on the active sidebar tab:


.. raw:: html

  <div class="jp-youtube-video">
     <iframe src="https://www.youtube-nocookie.com/embed/PlJGecfetek?rel=0&amp;showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
  </div>

JupyterLab extensions can add additional panels to the left sidebar.

.. _main-area:

Main Work Area
~~~~~~~~~~~~~~

.. _main-area-vid:

The main work area in JupyterLab enables you to arrange documents (notebooks,
text files, etc.) and other activities (terminals, code consoles, etc.) into
panels of tabs that can be resized or subdivided. Drag a tab to the center of a
tab panel to move the tab to the panel. Subdivide a tab panel by dragging a tab to
the left, right, top, or bottom of the panel:

.. raw:: html

  <div class="jp-youtube-video">
    <iframe src="https://www.youtube-nocookie.com/embed/Ka8qS7CO1XQ?rel=0&amp;showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
  </div>

The work area has a single current activity. The tab for the current activity is
marked with a colored top border (blue by default).

.. _tabs:

Tabs and Single-Document Mode
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The Tabs panel in the left sidebar lists the open documents or
activities in the main work area:

.. image:: images/interface_tabs.png
   :align: center
   :class: jp-screenshot

The same information is also available in the Tabs menu:

.. image:: images/interface_tabs_menu.png
   :align: center
   :class: jp-screenshot

.. _tabs-singledocument:

It is often useful to focus on a single document or activity without closing
other tabs in the main work area. Single-document mode enable this, while making
it simple to return to your multi-activity layout in the main work area.
Toggle single-document mode using the View menu:

.. raw:: html

  <div class="jp-youtube-video">
    <iframe src="https://www.youtube-nocookie.com/embed/DO7NOenMQC0?rel=0&amp;showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
  </div>

When you leave single-document mode, the original layout of the main
area is restored.

Context Menus
~~~~~~~~~~~~~

.. _context-menus-rightclick:

Many parts of JupyterLab, such as notebooks, text files, code consoles,
and tabs, have context menus that can be accessed by right-clicking on
the element:

.. raw:: html

  <div class="jp-youtube-video">
    <iframe src="https://www.youtube-nocookie.com/embed/y30fs6kg6fc?rel=0&amp;showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
  </div>

.. _context-menus-shiftrightclick:

The browser’s native context menu can be accessed by holding down
``Shift`` and right-clicking:

.. raw:: html

  <div class="jp-youtube-video">
    <iframe src="https://www.youtube-nocookie.com/embed/XPPWW-7WJ40?rel=0&amp;showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
  </div>

.. _shortcuts:

Keyboard Shortcuts
~~~~~~~~~~~~~~~~~~

.. _shortcuts-settings:

As in the classic Notebook, you can navigate the user interface through keyboard
shortcuts. You can find and customize the current list of keyboard shortcuts by
selecting the Advanced Settings Editor item in the Settings menu, then selecting
Keyboard Shortcuts in the Settings tab.

.. raw:: html

    <div class="jp-youtube-video">
       <iframe src="https://www.youtube-nocookie.com/embed/rhW3kAExCik?rel=0&amp;showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
    </div>

.. _editor-keymaps:

You can also customize the :ref:`text editor <file-editor>` to use vim, emacs, or Sublime Text
keyboard maps by using the Text Editor Key Map submenu in the Settings
menu:

.. raw:: html

    <div class="jp-youtube-video">
       <iframe src="https://www.youtube-nocookie.com/embed/COheO7sA4-U?rel=0&amp;showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
    </div>
