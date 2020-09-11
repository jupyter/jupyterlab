.. _overview:

Getting Started
---------------

JupyterLab is a next-generation web-based user interface for Project Jupyter.

.. toctree::
   :hidden:

   installation
   starting
   issue
   faq
   changelog

.. image:: ../user/images/interface_jupyterlab.png
   :align: center
   :class: jp-screenshot

JupyterLab enables you to work with documents and activities such as
:ref:`Jupyter notebooks <notebook>`, text editors, terminals, and custom
components in a flexible, integrated, and extensible manner. For a demonstration
of JupyterLab and its features, you can view this video:

.. raw:: html

  <div class="jp-youtube-video">
    <iframe src="https://www.youtube-nocookie.com/embed/A5YyoCKxEOU?rel=0&amp;showinfo=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
  </div>

You can :ref:`arrange <interface>` multiple documents and activities side by side in the
work area using tabs and splitters. Documents and activities integrate with each
other, enabling new workflows for interactive computing, for example:

-  :ref:`code-console` provide transient scratchpads for running code
   interactively, with full support for rich output. A code console can be
   linked to a notebook kernel as a computation log from the notebook, for
   example.
-  :ref:`Kernel-backed documents <kernel-backed-documents>` enable code in any
   text file (Markdown, Python, R, LaTeX, etc.) to be run interactively in any
   Jupyter kernel.
-  Notebook cell outputs can be :ref:`mirrored into their own tab <cell-output-mirror>`,
   side by side with the notebook, enabling simple dashboards with interactive controls
   backed by a kernel.
-  Multiple views of documents with different editors or viewers enable live
   editing of documents reflected in other viewers. For example, it is easy to
   have live preview of :ref:`markdown`, :ref:`csv`, or :ref:`vega-lite` documents.

JupyterLab also offers a unified model for viewing and handling data formats.
JupyterLab understands many file formats (images, CSV, JSON, Markdown, PDF,
Vega, Vega-Lite, etc.) and can also display rich kernel output in these formats.
See :ref:`file-and-output-formats` for more information.

To navigate the user interface, JupyterLab offers :ref:`customizable keyboard
shortcuts <shortcuts>` and the ability to use :ref:`key maps <editor-keymaps>`
from vim, emacs, and Sublime Text in the text editor.

JupyterLab :ref:`extensions <user_extensions>` can customize or enhance any part
of JupyterLab, including new themes, file editors, and custom components.

JupyterLab is served from the same `server
<https://jupyter-notebook.readthedocs.io/en/stable/>`__ and uses the same
`notebook document format <https://nbformat.readthedocs.io/en/latest/>`__ as the
classic Jupyter Notebook.

.. _releases:

JupyterLab Releases
~~~~~~~~~~~~~~~~~~~

Since JupyterLab 0.32 (February 2018), the releases of JupyterLab are suitable
for general daily use by both Jupyter novices and users experienced with the
Classic Notebook interface. As of the 1.0 release (June 2019), it is
additionally ready for extension writers who wish to further customize the
JupyterLab experience for others. Please review the :ref:`changelog` for
detailed descriptions of each release.

The extension developer API is evolving, and we also are currently iterating on UI/UX improvements.
We appreciate feedback on our `GitHub issues page <https://github.com/jupyterlab/jupyterlab/issues>`__
as we evolve towards a stable extension development API.

JupyterLab will eventually replace the classic Jupyter Notebook.
Throughout this transition, the same notebook document format will be supported by both the classic Notebook and JupyterLab.
