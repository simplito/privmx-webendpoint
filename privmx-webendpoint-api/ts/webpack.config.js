const path = require('path');
const webpack = require('webpack');
module.exports = [
  // {
  //   name: "webworker",
  //   target: "webworker",
  //   entry: "./src/webStreams/worker/worker.ts",
  //   output: { filename: "./worker.js" }
  // },
  {
      name: "privmx-lib",
      // dependencies: ["webworker"],
      entry: {
        bundle: './src/bundle.ts'
      },
      mode: 'production',
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
        path: path.resolve(__dirname, 'dist/bundle'),
        library: {
          name: {
            root: 'PrivmxWebEndpoint',
            amd: 'privmx-webendoint',
            commonjs: 'privmx-webendpoint',
          },
          type: 'umd',
        }
      },
    }
];