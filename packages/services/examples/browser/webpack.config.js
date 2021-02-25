const webpack = require('webpack');

module.exports = {
  entry: './lib/index.js',
  mode: 'development',
  output: {
    path: require('path').join(__dirname, 'build'),
    filename: 'bundle.js'
  },
  plugins: [
    new webpack.DefinePlugin({
      // Needed for Blueprint. See https://github.com/palantir/blueprint/issues/4393
      'process.env': '{}',
      // Needed for various packages using cwd(), like the path polyfill
      process: { cwd: () => '/' }
    })
  ],
  bail: true
};
