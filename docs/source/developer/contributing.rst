Contributing to JupyterLab
==========================

If you're reading this section, you're probably interested in
contributing to JupyterLab. Welcome and thanks for your interest in
contributing!

Please take a look at the Contributor documentation, familiarize
yourself with using JupyterLab, and introduce yourself to the community
(on the mailing list or discourse) and share what area of the project
you are interested in working on. Please also see the Jupyter `Community
Guides <https://jupyter.readthedocs.io/en/latest/community/content-community.html>`__.

We have labeled some issues as `good first
issue <https://github.com/jupyterlab/jupyterlab/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22>`__
or `help
wanted <https://github.com/jupyterlab/jupyterlab/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22>`__
that we believe are good examples of small, self-contained changes. We
encourage those that are new to the code base to implement and/or ask
questions about these issues.

If you believe you’ve found a security vulnerability in JupyterLab or
any Jupyter project, please report it to security@ipython.org. If you
prefer to encrypt your security reports, you can use `this PGP public
key <https://raw.githubusercontent.com/jupyter/notebook/master/docs/source/ipython_security.asc>`__.

.. contents:: Table of contents
    :local:
    :depth: 1

General Guidelines for Contributing
------------------------------------

For general documentation about contributing to Jupyter projects, see
the `Project Jupyter Contributor
Documentation <https://jupyter.readthedocs.io/en/latest/contributing/content-contributor.html>`__
and `Code of
Conduct <https://github.com/jupyter/governance/blob/master/conduct/code_of_conduct.md>`__.

All source code is written in
`TypeScript <http://www.typescriptlang.org/Handbook>`__. See the `Style
Guide <https://github.com/jupyterlab/jupyterlab/wiki/TypeScript-Style-Guide>`__.

All source code is formatted using `prettier <https://prettier.io>`__.
When code is modified and committed, all staged files will be
automatically formatted using pre-commit git hooks (with help from the
`lint-staged <https://github.com/okonet/lint-staged>`__ and
`husky <https://github.com/typicode/husky>`__ libraries). The benefit of
using a code formatter like prettier is that it removes the topic of
code style from the conversation when reviewing pull requests, thereby
speeding up the review process.

You may also use the prettier npm script (e.g. ``npm run prettier`` or
``yarn prettier`` or ``jlpm prettier``) to format the entire code base.
We recommend installing a prettier extension for your code editor and
configuring it to format your code with a keyboard shortcut or
automatically on save.

Submitting a Pull Request Contribution
--------------------------------------

Generally, an issue should be opened describing a piece of proposed work
and the issues it solves before a pull request is opened.

Issue Management
^^^^^^^^^^^^^^^^

Opening an issue lets community members participate in the design
discussion, makes others aware of work being done, and sets the stage
for a fruitful community interaction. A pull request should reference
the issue it is addressing. Once the pull request is merged, the issue
related to it will also be closed. If there is additional discussion
around implementation the issue may be re-opened. Once 30 days have
passed with no additional discussion, the `lock
bot <https://github.com/apps/lock>`__ will lock the issue. If additional
discussion is desired, or if the pull request doesn't fully address the
locked issue, please open a new issue referencing the locked issue.

Tag Issues with Labels
^^^^^^^^^^^^^^^^^^^^^^

Users without the commit rights to the JupyterLab repository can tag
issues with labels using the ``@meeseeksdev`` bot. For example: To apply
the label ``foo`` and ``bar baz`` to an issue, comment
``@meeseeksdev tag foo "bar baz"`` on the issue.

Contributing from within the browser
------------------------------------
Using the https://github.com web interface - documented
`here <https://docs.github.com/en/free-pro-team@latest/github>`__ - you
can create and propose a change purely within your browser.

Using `Binder <https://mybinder.org>`__, you can test the current master branch and your
changes within the browser as well. We recommend you have at least 8 GB of RAM for this.
To build and launch an instance of the latest JupyterLab master, open
`this link <https://mybinder.org/v2/gh/jupyterlab/jupyterlab/master?urlpath=lab-dev/>`__
in a new tab. The build takes about 7 minutes to complete.

To test your own branch hosted on GitHub, enter it on https://mybinder.org.
If everything goes right, filling out the form takes about 2 minutes, and the build should take
about 7 minutes again.

Setting up a local development environment
------------------------------------------
This section explains how to set up a local development environment. We assume you use GNU/Linux,
Mac OS X, or Windows Subsystem for Linux.

Installing Node.js and jlpm
^^^^^^^^^^^^^^^^^^^^^^^^^^^

Building JupyterLab from its GitHub source code requires Node.js. The
development version requires Node.js version 12+, as defined in the
``engines`` specification in
`dev_mode/package.json <https://github.com/jupyterlab/jupyterlab/blob/master/dev_mode/package.json>`__.

If you use ``conda``, you can get it with:

.. code:: bash

   conda install -c conda-forge 'nodejs'

If you use `Homebrew <http://brew.sh>`__ on Mac OS X:

.. code:: bash

   brew install node

You can also use the installer from the `Node.js <https://nodejs.org>`__
website.

To check which version of Node.js is installed:

.. code:: bash

   node -v

Installing JupyterLab
---------------------

If you use ``conda``, you may also want to install ``nb_conda_kernels`` to have a kernel
option for different `conda
environments <https://docs.conda.io/projects/conda/en/latest/user-guide/tasks/manage-environments.html>`__

.. code:: bash

   conda install -c conda-forge nb_conda_kernels

Fork the JupyterLab
`repository <https://github.com/jupyterlab/jupyterlab>`__.

Then use the following steps:

.. code:: bash

   git clone https://github.com/<your-github-username>/jupyterlab.git
   cd jupyterlab
   pip install -e .
   jlpm install
   jlpm run build  # Build the dev mode assets (optional)
   jlpm run build:core  # Build the core mode assets (optional)
   jupyter lab build  # Build the app dir assets (optional)

Notes:

-  A few of the scripts will run "python". If your target python is
   called something else (such as "python3") then parts of the build
   will fail. You may wish to build in a conda environment, or make an
   alias.
-  Some of the packages used in the development environment require
   Python 3.0 or higher. If you encounter an ImportError during the
   installation, make sure Python 3.0+ is installed. Also, try using the
   Python 3.0+ version of ``pip`` or ``pip3 install -e .`` command to
   install JupyterLab from the forked repository.
-  The ``jlpm`` command is a JupyterLab-provided, locked version of the
   `yarn <https://yarnpkg.com/en>`__ package manager. If you have
   ``yarn`` installed already, you can use the ``yarn`` command when
   developing, and it will use the local version of ``yarn`` in
   ``jupyterlab/yarn.js`` when run in the repository or a built
   application directory.
-  If you decide to use the ``jlpm`` command and encounter the
   ``jlpm: command not found`` error, try adding the user-level bin
   directory to your ``PATH`` environment variable. You already
   installed ``jlpm`` along with JupyterLab in the previous command, but
   ``jlpm`` might not be accessible due to ``PATH`` environment variable
   related issues. If you are using a Unix derivative (FreeBSD, GNU /
   Linux, OS X), you can achieve this by using
   ``export PATH="$HOME/.local/bin:$PATH"`` command.
-  At times, it may be necessary to clean your local repo with the
   command ``npm run clean:slate``. This will clean the repository, and
   re-install and rebuild.
-  If ``pip`` gives a ``VersionConflict`` error, it usually means that
   the installed version of ``jupyterlab_server`` is out of date. Run
   ``pip install --upgrade jupyterlab_server`` to get the latest
   version.
-  To install JupyterLab in isolation for a single conda/virtual
   environment, you can add the ``--sys-prefix`` flag to the extension
   activation above; this will tie the installation to the
   ``sys.prefix`` location of your environment, without writing anything
   in your user-wide settings area (which are visible to all your envs):
-  You can run ``jlpm run build:dev:prod`` to build more accurate
   sourcemaps that show the original Typescript code when debugging.
   However, it takes a bit longer to build the sources, so is used only
   to build for production by default.

If you are using a version of Jupyter Notebook earlier than 5.3, then
you must also run the following command to enable the JupyterLab server
extension:

.. code:: bash

   jupyter serverextension enable --py --sys-prefix jupyterlab

For installation instructions to write documentation, please see
`Writing Documentation <#writing-documentation>`__

Run JupyterLab
^^^^^^^^^^^^^^

Start JupyterLab in development mode:

.. code:: bash

   jupyter lab --dev-mode

Development mode ensures that you are running the JavaScript assets that
are built in the dev-installed Python package. Note that when running in
dev mode, extensions will not be activated by default.

When running in dev mode, a red stripe will appear at the top of the
page; this is to indicate running an unreleased version.

If you want to change the TypeScript code and rebuild on the fly
(needs page refresh after each rebuild):

.. code:: bash

   jupyter lab --dev-mode --watch

Build and Run the Tests
^^^^^^^^^^^^^^^^^^^^^^^

.. code:: bash

   jlpm run build:testutils
   jlpm test

You can run tests for an individual package by changing to the
appropriate package folder:

.. code:: bash

   cd packages/notebook
   jlpm run build:test
   jlpm test

We use ``jest`` for all tests, so standard ``jest`` workflows apply.
Tests can be debugged in either VSCode or Chrome. It can help to add an
``it.only`` to a specific test when debugging. All of the ``test*``
scripts in each package accept ``jest`` `cli
options <https://jestjs.io/docs/en/cli.html>`__.

VSCode Debugging
""""""""""""""""

To debug in VSCode, open a package folder in VSCode. We provide a launch
configuration in each package folder. In a terminal, run
``jlpm test:debug:watch``. In VSCode, select "Attach to Jest" from the
"Run" sidebar to begin debugging. See `VSCode docs on
debugging <https://code.visualstudio.com/docs/editor/debugging>`__ for
more details.

Chrome Debugging
""""""""""""""""

To debug in Chrome, run ``jlpm test:debug:watch`` in the terminal. Open
Chrome and go to ``chrome://inspect/``. Select the remote device and
begin debugging.

Testing Utilities
"""""""""""""""""

There are some helper functions in ``testutils`` (which is a public npm
package called ``@jupyterlab/testutils``) that are used by many of the
tests.

For tests that rely on ``@jupyterlab/services`` (starting kernels,
interacting with files, etc.), there are two options. If a simple
interaction is needed, the ``Mock`` namespace exposed by ``testutils``
has a number of mock implementations (see ``testutils/src/mock.ts``). If
a full server interaction is required, use the ``JupyterServer`` class.

We have a helper function called ``testEmission`` to help with writing
tests that use ``Lumino`` signals, as well as a ``framePromise``
function to get a ``Promise`` for a ``requestAnimationFrame``. We
sometimes have to set a sentinel value inside a ``Promise`` and then
check that the sentinel was set if we need a promise to run without
blocking.

Performance Testing
-------------------

If you are making a change that might affect how long it takes to load
JupyterLab in the browser, we recommend doing some performance testing
using `Lighthouse <https://github.com/GoogleChrome/lighthouse>`__. It
let's you easily compute a number of metrics, like page load time, for
the site.

To use it, first build JupyterLab in dev mode:

.. code:: bash

   jlpm run build:dev

Then, start JupyterLab using the dev build:

.. code:: bash

   jupyter lab --dev --NotebookApp.token=''  --no-browser

Now run Lighthouse against this local server and show the results:

.. code:: bash

   jlpm run lighthouse --view

.. image:: ../images/lighthouse.png

Using throttling
^^^^^^^^^^^^^^^^

Lighthouse recommends using the system level
`comcast <https://github.com/tylertreat/comcast>`__ tool to throttle
your network connection and emulate different scenarios. To use it,
first install that tool using ``go``:

.. code:: bash

   go get github.com/tylertreat/comcast

Then, before you run Lighthouse, enable the throttling (this requires
sudo):

.. code:: bash

   run lighthouse:throttling:start

This enables the "WIFI (good)" preset of comcast, which should emulate
loading JupyterLab over a local network.

Then run the lighthouse tests:

.. code:: bash

   jlpm run lighthouse [...]

Then disable the throttling after you are done:

.. code:: bash

   jlpm run lighthouse:throttling:stop

Comparing results
^^^^^^^^^^^^^^^^^

Performance results are usually only useful in comparison to other
results. For that reason, we have included a comparison script that can
take two lighthouse results and show the changes between them.

Let's say we want to compare the results of the production build of
JupyterLab with the normal build. The production build minifies all the
JavaScript, so should load a bit faster.

First, we build JupyterLab normally, start it up, profile it and save
the results:

.. code:: bash

   jlpm build:dev
   jupyter lab --dev --NotebookApp.token='' --no-browser

   # in new window
   jlpm run lighthouse --output json --output-path normal.json

Then rebuild with the production build and retest:

.. code:: bash

   jlpm run build:dev:prod
   jupyter lab --dev --NotebookApp.token='' --no-browser

   # in new window
   jlpm run lighthouse --output json --output-path prod.json

Now we can use compare the two outputs:

.. code:: bash

   jlpm run lighthouse:compare normal.json prod.json

This gives us a report of the relative differences between the audits in
the two reports:

.. admonition:: Resulting Output

   ``normal.json`` -> ``prod.json``

   | **First Contentful Paint**
   | - -62% Δ
   | - 1.9 s -> 0.7 s
   | - First Contentful Paint marks the time at which the first text or
     image is painted. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/first-contentful-paint>`__.

   | **First Meaningful Paint**
   | - -50% Δ
   | - 2.5 s -> 1.3 s
   | - First Meaningful Paint measures when the primary content of a
     page is visible. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/first-meaningful-paint>`__.

   | **Speed Index**
   | - -48% Δ
   | - 2.6 s -> 1.3 s
   | - Speed Index shows how quickly the contents of a page are visibly
     populated. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/speed-index>`__.

   | **Estimated Input Latency**
   | - 0% Δ
   | - 20 ms -> 20 ms
   | - Estimated Input Latency is an estimate of how long your app takes
     to respond to user input, in milliseconds, during the busiest 5s
     window of page load. If your latency is higher than 50 ms, users
     may perceive your app as laggy. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/estimated-input-latency>`__.

   | **Max Potential First Input Delay**
   | - 9% Δ
   | - 200 ms -> 210 ms
   | - The maximum potential First Input Delay that your users could
     experience is the duration, in milliseconds, of the longest task.
     `Learn
     more <https://developers.google.com/web/updates/2018/05/first-input-delay>`__.

   | **First CPU Idle**
   | - -50% Δ
   | - 2.5 s -> 1.3 s
   | - First CPU Idle marks the first time at which the page's main
     thread is quiet enough to handle input. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/first-interactive>`__.

   | **Time to Interactive**
   | - -52% Δ
   | - 2.5 s -> 1.2 s
   | - Time to interactive is the amount of time it takes for the page
     to become fully interactive. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/consistently-interactive>`__.

   | **Avoid multiple page redirects**
   | - -2% Δ
   | - Potential savings of 10 ms -> Potential savings of 10 ms
   | - Redirects introduce additional delays before the page can be
     loaded. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/redirects>`__.

   | **Minimize main-thread work**
   | - -54% Δ
   | - 2.1 s -> 1.0 s
   | - Consider reducing the time spent parsing, compiling and executing
     JS. You may find delivering smaller JS payloads helps with this.

   | **JavaScript execution time**
   | - -49% Δ
   | - 1.1 s -> 0.6 s
   | - Consider reducing the time spent parsing, compiling, and
     executing JS. You may find delivering smaller JS payloads helps
     with this. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/bootup>`__.

   | **Preload key requests**
   | - -100% Δ
   | - Potential savings of 240 ms ->
   | - Consider using <link rel=preload> to prioritize fetching
     resources that are currently requested later in page load. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/preload>`__.

   | **Uses efficient cache policy on static assets**
   | - 0% Δ
   | - 1 resource found -> 1 resource found
   | - A long cache lifetime can speed up repeat visits to your page.
     `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/cache-policy>`__.

   | **Avoid enormous network payloads**
   | - -86% Δ
   | - Total size was 30,131 KB -> Total size was 4,294 KB
   | - Large network payloads cost users real money and are highly
     correlated with long load times. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/network-payloads>`__.

   | **Minify JavaScript**
   | - -100% Δ
   | - Potential savings of 23,041 KB ->
   | - Minifying JavaScript files can reduce payload sizes and script
     parse time. `Learn
     more <https://developers.google.com/speed/docs/insights/MinifyResources>`__.

   | **Enable text compression**
   | - -86% Δ
   | - Potential savings of 23,088 KB -> Potential savings of 3,112 KB
   | - Text-based resources should be served with compression (gzip,
     deflate or brotli) to minimize total network bytes. `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/text-compression>`__.

   | **Avoid an excessive DOM size**
   | - 0% Δ
   | - 1,268 elements -> 1,268 elements
   | - Browser engineers recommend pages contain fewer than ~1,500 DOM
     elements. The sweet spot is a tree depth < 32 elements and fewer
     than 60 children/parent element. A large DOM can increase memory
     usage, cause longer `style
     calculations <https://developers.google.com/web/fundamentals/performance/rendering/reduce-the-scope-and-complexity-of-style-calculations>`__,
     and produce costly `layout
     reflows <https://developers.google.com/speed/articles/reflow>`__.
     `Learn
     more <https://developers.google.com/web/tools/lighthouse/audits/dom-size>`__.

Visual Regression and UI Tests
------------------------------

As part of JupyterLab CI workflows, UI tests are run with visual regression checks. `Galata <https://github.com/jupyterlab/galata>`__ is used for UI testing. Galata provides a high level API to control and inspect JupyterLab UI programmatically, testing tools and CLI to manage tests and other tasks.

UI tests are run for each commit into JupyterLab project in PRs or direct commits. Code changes can sometimes cause UI tests to fail for various reasons. After each test run, Galata generates a user friendly test result report which can be used to inspect failing UI tests. Result report shows the failure reason, call-stack up to the failure and detailed information on visual regression issues. For visual regression errors, reference image and test capture image, along with diff image generated during comparison are provided in the report. You can use these information to debug failing tests. Galata test report can be downloaded from GitHub Actions page for a UI test run. Test artifact is named ``ui-test-output`` and once you extract it, you can access the report by opening ``test/report/index.html`` in a browser window.

Main reasons for UI test failures are:

1. **A visual regression caused by code changes**:

   Sometimes unintentional UI changes are introduced by modifications to project source code. Goal of visual regression testing is to detect this kind of UI changes. If your PR / commit is causing visual regression, then debug and fix the regression caused. You can locally run and debug the UI tests to fix the visual regression. Follow the instructions in steps 5-7 of ``Adding a new UI test suite guide`` in `UI Testing documentation <https://github.com/jupyterlab/jupyterlab/blob/master/ui-tests/README.md#adding-a-new-ui-test-suite>`__ to locally debug and fix UI tests. Once you have a fix, you can push the change to your GitHub branch and test with GitHub actions.

2. **An intended update to user interface**:

   If your code change is introducing an update to UI which causes existing UI Tests to fail, then you will need to update reference image(s) for the failing tests. In order to do that, simply go to GitHub Actions page for the failed test and download test artifacts. It will contain test captures in directory ``test/screenshots``. You can copy the capture for the failed test and paste into reference screenshots directory in JupyterLab source code, replacing the failing test's reference capture. Reference captures are located in ``ui-tests/reference-output/screenshots`` in JupyterLab source code.

For more information on UI Testing, please read the `UI Testing developer documentation <.https://github.com/jupyterlab/jupyterlab/blob/master/ui-tests/README.md>`__ and `Galata documentation <https://github.com/jupyterlab/galata/blob/main/README.md>`__.

Good Practices for Integration tests
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Here are some good practices to follow when writing integration tests:

- Don't compare multiple screenshots in the same test; if the first comparison breaks, it will require running multiple times the CI workflow to fix all tests.

Contributing to the debugger front-end
--------------------------------------

To make changes to the debugger extension, a kernel with support for debugging is required.

Check out the user documentation to learn how to install such kernel: :ref:`debugger`.

Then refresh the page and the debugger sidebar should appear in the right area.

The Debugger Adapter Protocol
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The following diagram illustrates the types of messages sent between the JupyterLab extension and the kernel.

.. image:: ./debugger_protocol_diagram.png

Inspecting Debug Messages in VS Code
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Inspecting the debug messages in VS Code can be useful to understand when debug requests are made (for example triggered by a UI action), and to compare the behavior of the JupyterLab debugger with the Python debugger in VS Code.

The first step is to create a test file and a debug configuration (``launch.json``):

.. image:: ./debugger_launch_configuration.png

.. code:: json

   {
      "version": "0.2.0",
      "configurations": [
         {
            "name": "Python: Current File",
            "type": "python",
            "request": "launch",
            "program": "${file}",
            "console": "integratedTerminal",
            "env": { "DEBUGPY_LOG_DIR": "/path/to/logs/folder" }
         }
      ]
   }

Then start the debugger:

.. image:: ./debugger_vscode_start.png

The content of the log file looks like this:

.. code:: bash

   ...

   D00000.032: IDE --> {
                  "command": "initialize",
                  "arguments": {
                     "clientID": "vscode",
                     "clientName": "Visual Studio Code",
                     "adapterID": "python",
                     "pathFormat": "path",
                     "linesStartAt1": true,
                     "columnsStartAt1": true,
                     "supportsVariableType": true,
                     "supportsVariablePaging": true,
                     "supportsRunInTerminalRequest": true,
                     "locale": "en-us"
                  },
                  "type": "request",
                  "seq": 1
               }

   ...

With:

- ``IDE`` = VS Code
- ``PYD`` = pydev debugger
- Messages follow the `DAP <https://microsoft.github.io/debug-adapter-protocol/specification>`_

References
^^^^^^^^^^

- Dump cell and state restoration: https://github.com/jupyterlab/debugger/issues/52
- Protocol Overview: https://microsoft.github.io/debug-adapter-protocol/overview
- Specification: https://microsoft.github.io/debug-adapter-protocol/specification


Build and run the stand-alone examples
--------------------------------------

To install and build the examples in the ``examples`` directory:

.. code:: bash

   jlpm run build:examples

To run a specific example, change to the examples directory (i.e.
``examples/filebrowser``) and enter:

.. code:: bash

   python main.py

Debugging in the Browser
------------------------

All methods of building JupyterLab produce source maps. The source maps
should be available in the source files view of your browser's
development tools under the ``webpack://`` header.

When running JupyterLab normally, expand the ``~`` header to see the
source maps for individual packages.

When running in ``--dev-mode``, the core packages are available under
``packages/``, while the third party libraries are available under
``~``. Note: it is recommended to use ``jupyter lab --watch --dev-mode``
while debugging.

When running a test, the packages will be available at the top level
(e.g. ``application/src``), and the current set of test files available
under ``/src``. Note: it is recommended to use ``jlpm run watch`` in the
test folder while debugging test options. See
`above <#build-and-run-the-tests>`__ for more info.

--------------

High level Architecture
-----------------------

The JupyterLab application is made up of two major parts:

-  an npm package
-  a Jupyter server extension (Python package)

Each part is named ``jupyterlab``. The :ref:`developer tutorial
documentation <developer-guide>`
provides additional architecture information.

The NPM Packages
----------------

The repository consists of many npm packages that are managed using the
lerna build tool. The npm package source files are in the ``packages/``
subdirectory.

Build the NPM Packages from Source
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code:: bash

   git clone https://github.com/jupyterlab/jupyterlab.git
   cd jupyterlab
   pip install -e .
   jlpm
   jlpm run build:packages

**Rebuild**

.. code:: bash

   jlpm run clean
   jlpm run build:packages

Writing Documentation
---------------------

Documentation is written in Markdown and reStructuredText. In
particular, the documentation on our Read the Docs page is written in
reStructuredText. To ensure that the Read the Docs page builds, you'll
need to install the documentation dependencies with ``conda``:

.. code:: bash

   conda env create -f docs/environment.yml

.. code:: bash

   conda activate jupyterlab_documentation


To test the docs run:

.. code:: bash

   py.test --check-links -k .md . || py.test --check-links -k .md --lf .

The Read the Docs pages can be built using ``make``:

.. code:: bash

   cd docs
   make html

Or with ``jlpm``:

.. code:: bash

   jlpm run docs

Writing Style
^^^^^^^^^^^^^

-  The documentation should be written in the second person, referring
   to the reader as "you" and not using the first person plural "we."
   The author of the documentation is not sitting next to the user, so
   using "we" can lead to frustration when things don't work as
   expected.
-  Avoid words that trivialize using JupyterLab such as "simply" or
   "just." Tasks that developers find simple or easy may not be for
   users.
-  Write in the active tense, so "drag the notebook cells..." rather
   than "notebook cells can be dragged..."
-  The beginning of each section should begin with a short (1-2
   sentence) high-level description of the topic, feature or component.
-  Use "enable" rather than "allow" to indicate what JupyterLab makes
   possible for users. Using "allow" connotes that we are giving them
   permission, whereas "enable" connotes empowerment.

User Interface Naming Conventions
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Documents, Files, and Activities
""""""""""""""""""""""""""""""""

Files are referred to as either files or documents, depending on the
context.

Documents are more human centered. If human viewing, interpretation,
interaction is an important part of the experience, it is a document in
that context. For example, notebooks and markdown files will often be
referring to as documents unless referring to the file-ness aspect of it
(e.g., the notebook filename).

Files are used in a less human-focused context. For example, we refer to
files in relation to a file system or file name.

Activities can be either a document or another UI panel that is not file
backed, such as terminals, consoles or the inspector. An open document
or file is an activity in that it is represented by a panel that you can
interact with.

Element Names
"""""""""""""

-  The generic content area of a tabbed UI is a panel, but prefer to
   refer to the more specific name, such as “File browser.” Tab bars
   have tabs which toggle panels.
-  The menu bar contains menu items, which have their own submenus.
-  The main work area can be referred to as the work area when the name
   is unambiguous.
-  When describing elements in the UI, colloquial names are preferred
   (e.g., “File browser” instead of “Files panel”).

The majority of names are written in lower case. These names include:

-  tab
-  panel
-  menu bar
-  sidebar
-  file
-  document
-  activity
-  tab bar
-  main work area
-  file browser
-  command palette
-  cell inspector
-  code console

The following sections of the user interface should be in title case,
directly quoting a word in the UI:

-  Activity Bar
-  File menu
-  Files tab
-  Running panel
-  Tabs panel
-  Simple Interface mode

The capitalized words match the label of the UI element the user is
clicking on because there does not exist a good colloquial name for the
tool, such as “file browser” or “command palette”.

See :ref:`interface` for descriptions of elements in the UI.

The Jupyter Server Extension
----------------------------

The Jupyter server extension source files are in the jupyterlab/
subdirectory. To use this extension, make sure the Jupyter Notebook
server version 4.3 or later is installed.

Build the JupyterLab server extension
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

When you make a change to JupyterLab npm package source files, run:

.. code:: bash

   jlpm run build

to build the changes, and then refresh your browser to see the changes.

To have the system build after each source file change, run:

.. code:: bash

   jupyter lab --dev-mode --watch

Build Utilities
---------------

There is a range of build utilities for maintaining the repository. To
get a suggested version for a library use
``jlpm run get:dependency foo``. To update the version of a library
across the repo use ``jlpm run update:dependency foo ^latest``. To
remove an unwanted dependency use ``jlpm run remove:dependency foo``.

The key utility is ``jlpm run integrity``, which ensures the integrity
of the packages in the repo. It will:

-  Ensure the core package version dependencies match everywhere.
-  Ensure imported packages match dependencies.
-  Ensure a consistent version of all packages.
-  Manage the meta package.

The ``packages/metapackage`` package is used to build all of the
TypeScript in the repository at once, instead of 50+ individual builds.

The integrity script also allows you to automatically add a dependency
for a package by importing from it in the TypeScript file, and then
running: ``jlpm run integrity`` from the repo root.

We also have scripts for creating and removing packages in
``packages/``, ``jlpm run create:package`` and
``jlpm run remove:package``. When creating a package, if it is meant to
be included in the core bundle, add the
``jupyterlab: { coreDependency: true }`` metadata to the
``package.json``. Packages with ``extension`` or ``mimeExtension``
metadata are considered to be a core dependency unless they are
explicitly marked otherwise.

Testing Changes to External Packages
------------------------------------

Linking/Unlinking Packages to JupyterLab
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

If you want to make changes to one of JupyterLab's external packages
(for example, `Lumino <https://github.com/jupyterlab/lumino>`__ and test
them out against your copy of JupyterLab, you can easily do so using the
``link`` command:

1. Make your changes and then build the external package
2. Register a link to the modified external package

   -  navigate to the external package dir and run ``jlpm link``

3. Link JupyterLab to modded package

   -  navigate to top level of your JupyterLab repo, then run
      ``jlpm link "<package-of-interest>"``

You can then (re)build JupyterLab (eg ``jlpm run build``) and your
changes should be picked up by the build.

To restore JupyterLab to its original state, you use the ``unlink``
command:

1. Unlink JupyterLab and modded package

   -  navigate to top level of your JupyterLab repo, then run
      ``jlpm unlink "<package-of-interest>"``

2. Reinstall original version of the external package in JupyterLab

   -  run ``jlpm install --check-files``

You can then (re)build JupyterLab and everything should be back to
default.

Possible Linking Pitfalls
^^^^^^^^^^^^^^^^^^^^^^^^^

If you're working on an external project with more than one package,
you'll probably have to link in your copies of every package in the
project, including those you made no changes to. Failing to do so may
cause issues relating to duplication of shared state.

Specifically, when working with Lumino, you'll probably have to link
your copy of the ``"@lumino/messaging"`` package (in addition to
whatever packages you actually made changes to). This is due to
potential duplication of objects contained in the ``MessageLoop``
namespace provided by the ``messaging`` package.

Keyboard Shortcuts
------------------

Typeset keyboard shortcuts as follows:

-  Monospace typeface, with spaces between individual keys:
   ``Shift Enter``.
-  For modifiers, use the platform independent word describing key:
   ``Shift``.
-  For the ``Accel`` key use the phrase: ``Command/Ctrl``.
-  Don’t use platform specific icons for modifier keys, as they are
   difficult to display in a platform specific way on Sphinx/RTD.

Screenshots and Animations
--------------------------

Our documentation should contain screenshots and animations that
illustrate and demonstrate the software. Here are some guidelines for
preparing them:

-  Make sure the screenshot does not contain copyrighted material
   (preferable), or the license is allowed in our documentation and
   clearly stated.
-  If taking a png screenshot, use the Firefox or Chrome developer tools
   to do the following:

   -  set the browser viewport to 1280x720 pixels
   -  set the device pixel ratio to 1:1 (i.e., non-hidpi, non-retina)
   -  screenshot the entire *viewport* using the browser developer
      tools. Screenshots should not include any browser elements such as
      the browser address bar, browser title bar, etc., and should not
      contain any desktop background.

-  If creating a movie, adjust the settings as above (1280x720 viewport
   resolution, non-hidpi) and use a screen capture utility of your
   choice to capture just the browser viewport.
-  For PNGs, reduce their size using ``pngquant --speed 1 <filename>``.
   The resulting filename will have ``-fs8`` appended, so make sure to
   rename it and use the resulting file. Commit the optimized png file
   to the main repository. Each png file should be no more than a few
   hundred kilobytes.
-  For movies, upload them to the IPython/Jupyter YouTube channel and
   add them to the
   `jupyterlab-media <https://github.com/jupyterlab/jupyterlab-media>`__
   repository. To embed a movie in the documentation, use the
   ``www.youtube-nocookie.com`` website, which can be found by clicking
   on the 'privacy-enhanced' embedding option in the Share dialog on
   YouTube. Add the following parameters the end of the URL
   ``?rel=0&amp;showinfo=0``. This disables the video title and related
   video suggestions.
-  Screenshots or animations should be preceded by a sentence describing
   the content, such as "To open a file, double-click on its name in the
   File Browser:".
-  We have custom CSS that will add box shadows, and proper sizing of
   screenshots and embedded YouTube videos. See examples in the
   documentation for how to embed these assets.

To help us organize screenshots and animations, please name the files
with a prefix that matches the names of the source file in which they
are used:

   ::

      sourcefile.rst
      sourcefile_filebrowser.png
      sourcefile_editmenu.png

This will help us to keep track of the images as documentation content
evolves.

Notes
-----

-  By default, the application will load from the JupyterLab staging
   directory (default is ``<sys-prefix>/share/jupyter/lab/build``. If
   you wish to run the core application in
   ``<git root>/jupyterlab/build``, run ``jupyter lab --core-mode``.
   This is the core application that will be shipped.
-  If working with extensions, see the :ref:`extension documentation <developer_extensions>`.
-  The npm modules are fully compatible with Node/Babel/ES6/ES5. Simply
   omit the type declarations when using a language other than
   TypeScript.
