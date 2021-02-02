import sys, os
import base64
import json
import logging

from jupyter_core.application import JupyterApp, base_aliases, base_flags
from traitlets import Bool, Instance, Unicode, default
from jupyter_server.serverapp import list_running_servers

from ._version import __version__
from .terminaldisplay import render_data


flags = dict(base_flags)
aliases = dict(base_aliases)

version = __version__


MAGIC_STRING = 'jupyterlab-open-path'.upper()


class LabOpenApp(JupyterApp):
    version = version
    description = """
    Open a file in JupyterLab.
    
    This utility is designed to work in the JupyterLab terminal only.
    
        jupyter open <filename>
    """
    
    aliases = aliases
    flags = flags
    
    def start(self):
        
        if len(self.extra_args) != 1:
            print('`jupyter open` only supports a single file.')
            self.exit(1)
        
        filename = self.extra_args[0]
        filepath = os.path.abspath(filename)
        is_dir = os.path.isdir(filepath)
        data = {'isDir': is_dir, 'servers': {}}
        servers = list_running_servers()
        for server in servers:
            rel_path = os.path.relpath(filepath, server['root_dir'])
            hostname = server['hostname']
            port = server['port']
            host = hostname + ':' + str(port)
            data['servers'][host] = rel_path
        output = MAGIC_STRING + json.dumps(data)
        print(output)


#-----------------------------------------------------------------------------
# Main entry point
#-----------------------------------------------------------------------------

main = launch_new_instance = LabOpenApp.launch_instance

if __name__ == '__main__':
    main()