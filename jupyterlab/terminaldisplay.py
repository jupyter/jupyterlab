from os.path import splitext
import mimetypes

from IPython.display import HTML, Markdown, Latex, SVG, Image, JSON, Javascript

def display_html(data):
    o = HTML(data)
    return o._repr_html_(), {}

def display_markdown(data):
    o = Markdown(data)
    return o._repr_markdown_(), {}
 
def display_latex(data):
    o = Latex(data)
    return o._repr_latex_(), {}

def display_svg(data):
    o = SVG(data)
    return o._repr_svg_(), {}

def display_image(data):
    o = Image(data)
    return o._data_and_metadata(), {}

def display_json(data):
    o = JSON(data)
    return o._repr_json_()

def display_javascript(data):
    o = Javascript(data)
    return o._repr_javascript_(), {}

extension_map = {
    'md': 'text/markdown',
    'tex': 'text/latex',
}

def guess_mimetype(filename_or_url):

    # Local overrides for ones that are missing or different
    base, ext = splitext(filename_or_url)
    if not ext:
        return None
    # `splitext` includes leading period, so we skip it.
    ext = ext[1:].lower()
    guess = extension_map.get(ext, None)
    if guess is not None:
        return guess
    
    # Fall back to mimetypes if we don't know it.
    guess = mimetypes.guess_type(filename_or_url)
    if guess[0] is not None:
        return guess[0]

    raise ValueError('Unsupported file type: {}'.format(filename))

mimetype_map = {
    'text/html': display_html,
    'text/markdown': display_markdown,
    'text/latex': display_latex,
    'image/svg+xml': display_svg,
    'image/png': display_image,
    'image/jpeg': display_image,
    'image/gif': display_image,
    'application/json': display_json,
    'application/javascript': display_javascript,

}

def render_data(filename_or_url):
    mimetype = guess_mimetype(filename_or_url)
    display_func = mimetype_map.get(mimetype, None)
    if display_func is not None:
        data, metadata = display_func(filename_or_url)
    else:
        raise ValueError('Unsupported MIME type: {}'.format(mimetype))
    display_data = {
        'data': {mimetype: data},
        'metadata': {}
    }
    if metadata:
        display_data['metadata'][mimetype] = metadata
    return display_data
    

