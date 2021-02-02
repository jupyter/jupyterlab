#!/usr/bin/env python
# coding: utf-8

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.
from os.path import join as pjoin
import json
import os
import sys

# Our own imports
from jupyter_packaging import (
    create_cmdclass, get_version,
    command_for_func, combine_commands, install_npm, run,
    skip_npm, which, log
)

from setuptools import setup, find_packages
from setuptools.command.develop import develop


HERE = os.path.abspath(os.path.dirname(__file__))


NAME = 'jupyterlab'
DESCRIPTION = 'The JupyterLab server extension.'

with open(pjoin(HERE, 'README.md')) as fid:
    LONG_DESCRIPTION = fid.read()


data_files_spec = [
    ('share/jupyter/lab/static', '%s/static' % NAME, '**'),
    ('share/jupyter/lab/schemas', '%s/schemas' % NAME, '**'),
    ('share/jupyter/lab/themes', '%s/themes' % NAME, '**'),
    ('etc/jupyter/jupyter_server_config.d',
     'jupyter-config/jupyter_server_config.d', 'jupyterlab.json'),
    ('etc/jupyter/jupyter_notebook_config.d',
     'jupyter-config/jupyter_notebook_config.d', 'jupyterlab.json'),
]

package_data_spec = dict()
package_data_spec[NAME] = [
    'staging/*', 'staging/templates/*', 'staging/.yarnrc',
    'static/**', 'tests/mock_packages/**', 'themes/**', 'schemas/**', '*.js'
]


def exclude(filename):
    """Exclude JavaScript map files"""
    return filename.endswith('.js.map')

staging = pjoin(HERE, NAME, 'staging')
npm = ['node', pjoin(staging, 'yarn.js')]
VERSION = get_version('%s/_version.py' % NAME)


def check_assets():
    from packaging.version import Version

    # Representative files that should exist after a successful build
    targets = [
        'static/package.json',
        'schemas/@jupyterlab/shortcuts-extension/shortcuts.json',
        'themes/@jupyterlab/theme-light-extension/index.css'
    ]

    for t in targets:
        if not os.path.exists(pjoin(HERE, NAME, t)):
            msg = ('Missing file: %s, `build:prod` script did not complete '
                   'successfully' % t)
            raise ValueError(msg)

    if 'sdist' not in sys.argv and 'bdist_wheel' not in sys.argv:
        return

    target = pjoin(HERE, NAME, 'static', 'package.json')
    with open(target) as fid:
        version = json.load(fid)['jupyterlab']['version']

    if Version(version) != Version(VERSION):
        raise ValueError('Version mismatch, please run `build:update`')


cmdclass = create_cmdclass('jsdeps', data_files_spec=data_files_spec,
                           package_data_spec=package_data_spec, exclude=exclude)
cmdclass['jsdeps'] = combine_commands(
    install_npm(build_cmd='build:prod', path=staging, source_dir=staging,
                build_dir=pjoin(HERE, NAME, 'static'), npm=npm),
    command_for_func(check_assets)
)


class JupyterlabDevelop(develop):
    """A custom develop command that runs yarn"""

    def run(self):
        if not skip_npm:
            if not which('node'):
                error_message = """
Please install nodejs and npm before continuing installation.
nodejs may be installed using conda or directly from: https://nodejs.org/
"""
                log.error(error_message)
                return
            run(npm, cwd=HERE)
        develop.run(self)


# Use default develop - we can ensure core mode later if needed.
cmdclass['develop'] = JupyterlabDevelop


setup_args = dict(
    name=NAME,
    description=DESCRIPTION,
    long_description=LONG_DESCRIPTION,
    long_description_content_type='text/markdown',
    version=VERSION,
    packages=find_packages(),
    cmdclass=cmdclass,
    author='Jupyter Development Team',
    author_email='jupyter@googlegroups.com',
    url='http://jupyter.org',
    license='BSD',
    platforms='Linux, Mac OS X, Windows',
    keywords=['ipython', 'jupyter', 'Web'],
    python_requires=">=3.6",
    classifiers=[
        'Development Status :: 5 - Production/Stable',
        'Intended Audience :: Developers',
        'Intended Audience :: System Administrators',
        'Intended Audience :: Science/Research',
        'License :: OSI Approved :: BSD License',
        'Programming Language :: Python',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.6',
        'Programming Language :: Python :: 3.7',
        'Programming Language :: Python :: 3.8',
    ],
)


setup_args['install_requires'] = [
    'ipython',
    'packaging',
    'tornado>=6.1.0',
    'jupyter_core',
    'jupyterlab_server~=2.0',
    'jupyter_server~=1.2',
    'nbclassic~=0.2',
    'jinja2>=2.10'
]


setup_args['extras_require'] = {
    'test': [
        'pytest>=6.0',
        'pytest-cov',
        'pytest-console-scripts',
        'pytest-check-links',
        'jupyterlab_server[test]~=2.0',
        'requests',
        'wheel',
        'virtualenv'
    ],
    'test:sys_platform == "win32"': ['nose-exclude'],
    'docs': [
        'jsx-lexer',
        'recommonmark',
        'sphinx',
        'sphinx_rtd_theme',
        'sphinx-copybutton'
    ],
}


setup_args['package_data'] = package_data_spec
setup_args['include_package_data'] = True
setup_args['python_requires'] = '>=3.6'

# Force entrypoints with setuptools (needed for Windows, unconditional
# because of wheels)
setup_args['entry_points'] = {
    'console_scripts': [
        'jupyter-lab = jupyterlab.labapp:main',
        'jupyter-labextension = jupyterlab.labextensions:main',
        'jupyter-labhub = jupyterlab.labhubapp:main',
        'jlpm = jupyterlab.jlpmapp:main',
        'jupyter-display = jupyterlab.displayapp:main',
        'jupyter-open = jupyterlab.openapp:main'
    ]
}


if __name__ == '__main__':
    setup(**setup_args)
