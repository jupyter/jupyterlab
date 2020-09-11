.. _developer-guide:

Developer Guide
---------------

The ``jupyterlab`` repository is a monorepo: it contains code for many
packages that are versioned and published independently.

.. toctree::
   :hidden:

   extension_dev
   extension_points
   contributing
   components
   ui_components
   documents
   notebook
   patterns
   css
   virtualdom
   ui_helpers
   terminology
   extension_tutorial
   extension_migration

In particular, there are many TypeScript packages and a single Python package.
The Python package contains server-side code, and also distributes
the bundled-and-compiled TypeScript code.

See the `Contributing Guidelines <https://github.com/jupyterlab/jupyterlab/blob/master/CONTRIBUTING.md>`__
for detailed developer installation instructions.

Directories
~~~~~~~~~~~

The repository contains a number of top-level directories, the contents of which
are described here.

Python package: ``jupyterlab/``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

This, along with the ``setup.py``, comprises the Python code for the project.
This includes the notebook server extension, JupyterLab's command line interface,
entrypoints, and Python tests.

It also contains the final built JavaScript assets which are distributed with
the Python package.


NPM packages: ``packages/``
^^^^^^^^^^^^^^^^^^^^^^^^^^^

This contains the many TypeScript sub-packages which are independently versioned
and published to ``npmjs.org``. These are compiled to JavaScript and bundled with
the Python package.

The bulk of JupyterLab's codebase resides in these packages.
A common pattern for the various components in JupyterLab is to have one package
that implements the component, and a second package postfixed with ``-extension``
that integrates that component with the rest of the application.
Inspection of the contents of this directory shows many such packages.

You can build these packages by running ``jlpm build:packages``.

Binder setup: ``binder/``
^^^^^^^^^^^^^^^^^^^^^^^^^

This contains an environment specification for ``repo2docker`` which allows
the repository to be tested on `mybinder.org <https://mybinder.org>`__.
This specification is developer focused.
For a more user-focused binder see the
`JupyterLab demo <https://mybinder.org/v2/gh/jupyterlab/jupyterlab-demo/master?urlpath=lab/tree/demo/Lorenz.ipynb>`__

Build utilities: ``builtutils/``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

An ``npm`` package that contains several utility scripts for managing
the JupyterLab build process.

You can build this package by running ``jlpm build:utils``.

Design: ``design/``
^^^^^^^^^^^^^^^^^^^

A directory containing a series of design documents motivating various
choices made in the course of building JupyterLab.

Development-Mode: ``dev_mode/``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

An application directory containing built JavaScript assets which are used
when developing the TypeScript sources. If you are running JupyterLab
in ``dev-mode``, you are serving the application out of this directory.

Documentation: ``docs/``
^^^^^^^^^^^^^^^^^^^^^^^^

This directory contains the Sphinx project for this documentation.
You can create an environment to build the documentation using ``conda create -f environment.yml``,
and you can build the documentation by running ``make html``.
The entry point to the built docs will then be in ``docs/build/index.html``.


Examples: ``examples/``
^^^^^^^^^^^^^^^^^^^^^^^

The ``examples/`` directory contains stand-alone examples of components,
such as a simple notebook on a page, a console, terminal, and a
file browser. The ``app`` example illustrates a simplified combination of
several of the components used in JupyterLab.

Jupyter Server Configuration: ``jupyter-config/``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

This directory contains metadata distributed with the Python package that
allows it to automatically enable the Jupyter server extension upon installation.


Utility Scripts: ``scripts/``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

This directory contains a series of utility scripts which are primarily used
in continuous integration testing for JupyterLab.


Testing: ``tests/``
^^^^^^^^^^^^^^^^^^^

Tests for the TypeScript packages in the ``packages/`` directory.
These test directories are themselves small ``npm`` packages which pull in the
TypeScript sources and exercise their APIs.

Test Utilities: ``testutils/``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

A small ``npm`` package which is aids in running the tests in ``tests/``.


TypeDoc Theming: ``typedoc-theme``
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

A small theme used to help render our
`TypeDoc <http://jupyterlab.github.io/jupyterlab/index.html>`__ documentation.
