import sys, os
import base64
import json
import logging

from jupyter_core.application import JupyterApp, base_aliases, base_flags
from traitlets import Bool, Instance, Unicode, default

from ._version import __version__
from .terminaldisplay import render_data


flags = dict(base_flags)
flags['json'] = (
    {'LabDisplayApp': {'json': True}},
    "Output raw JSON."
)
aliases = dict(base_aliases)

version = __version__


MAGIC_STRING = 'jupyterlab-display-mimemodel'.upper()


class LabDisplayApp(JupyterApp):
    version = version
    description = """
    Display a file in JupyterLab using JupyterLab's rich output.
    
    This utility is designed to work in the JupyterLab terminal only.
    
        jupyter display <filename_or_url>
    """
    
    aliases = aliases
    flags = flags
    
    json = Bool(default=False, config=True, help="Output JSON.")
    
    def start(self):
        
        if len(self.extra_args) > 1:
            print('Too many arguments were provided, `jupyter display` only supports a single file or URL argument.')
            self.exit(1)
        
        filename = self.extra_args[0]
        mimemodel = render_data(filename)

        if self.json:
            print(json.dumps(mimemodel, indent=2))
        else:
            output = MAGIC_STRING + json.dumps(mimemodel)
            print(output)


#-----------------------------------------------------------------------------
# Main entry point
#-----------------------------------------------------------------------------

main = launch_new_instance = LabDisplayApp.launch_instance

if __name__ == '__main__':
    main()