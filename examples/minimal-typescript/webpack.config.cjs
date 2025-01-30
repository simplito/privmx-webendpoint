const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require("html-webpack-plugin");
const host = process.env.HOST || 'localhost';
module.exports = {
  entry: {
    bundle: './src/app.ts'
  },
  mode: 'production',
  plugins: [
    new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new HtmlWebpackPlugin({
      template: './src/index.html',
  })
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
      return 'out.js';
    },
    path: path.resolve(__dirname, 'dist'),
  },
  devServer: {
    static: [{
      directory: path.join(__dirname, 'public'),
      publicPath: '/public'
    }],
    compress: true,
    liveReload: false,
    host,
    port: 4001,
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",

      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization"

    }
  }

};

