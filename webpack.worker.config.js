// webpack.worker.config.js
const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: "./src/crypto/workerHelper.ts",
        mode: "production",
  output: {
    filename: "assets/privmx-worker.js",
    path: path.resolve(__dirname, "dist"),
  },
  target: "webworker", // important for web workers
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
    }),
  ],
  performance: {
    hints: false,
    maxEntrypointSize: 1048576, // 1MB
    maxAssetSize: 1048576, // 1MB
  },
  resolve: {
    extensions: [".ts", ".js"],
    fallback: {
      "buffer": require.resolve("buffer"),
      "assert": require.resolve("assert/"),
      "process/browser": require.resolve("process/browser"),
    },
  },
};