"""
Copyright (c) Jupyter Development Team.
Distributed under the terms of the Modified BSD License.
"""
import os
from jinja2 import FileSystemLoader

try:
    from notebook.notebookapp import NotebookApp as ServerApp
    from notebook.base.handlers import IPythonHandler as JupyterHandler, FileFindHandler
except ImportError:
    from jupyter_server.serverapp import ServerApp
    from jupyter_server.base.handlers import JupyterHandler, FileFindHandler

from traitlets import Unicode


HERE = os.path.dirname(__file__)
LOADER = FileSystemLoader(HERE)


class ExampleHander(JupyterHandler):
    """Handle requests between the main app page and notebook server."""

    def get(self):
        """Get the main page for the application's interface."""
        return self.write(self.render_template("index.html",
            static=self.static_url, base_url=self.base_url,
            token=self.settings['token']))

    def get_template(self, name):
        return LOADER.load(self.settings['jinja2_env'], name)


class ExampleApp(ServerApp):
    """A notebook app that runs the example."""

    default_url = Unicode('/example')

    def start(self):
        handlers = [
            (r'/example/?', ExampleHander),
            (r"/example/(.*)", FileFindHandler,
                {'path': os.path.join(HERE, 'build')}),
        ]
        self.web_app.add_handlers(".*$", handlers)
        super(ExampleApp, self).start()


if __name__ == '__main__':
    ExampleApp.launch_instance()
