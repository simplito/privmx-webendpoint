const path = require('path');
const webpack = require('webpack');
module.exports = {
  entry: {
    bundle: './src/index.ts'
  },
  mode: 'development',
  plugins: [
    new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
        "crypto": require.resolve('crypto-browserify'), 
        "assert": require.resolve('assert/'),
        "stream": require.resolve("stream-browserify"),
        "buffer": require.resolve("buffer"),
        "vm": require.resolve("vm-browserify"),
        'process/browser': require.resolve('process/browser'),
        
      } 
  },
  output: {
    filename: (pathData) => {
      return pathData.chunk.name == 'bundle' ? 'privmx-endpoint-web.js' : 'privmx-endpoint-web.[name].js';
    },
    path: path.resolve(__dirname, 'dist'),
  },
};