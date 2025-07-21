// webpack.worker.config.js
const path = require('path');

module.exports = {
  entry: './src/webStreams/worker/worker.ts',
        mode: 'production',
  output: {
    filename: 'e2ee-worker.js',
    path: path.resolve(__dirname, 'dist')
  },
  target: 'webworker', // important for web workers
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  }
};