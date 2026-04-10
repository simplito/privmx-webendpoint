const path = require("path");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: {
    bundle: "./src/bundle.ts",
  },
  mode: "production",
  plugins: [
    new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
    }),
    new CopyPlugin({
      patterns: [
        {
          from: "src/webStreams/audio/rms-processor.js",
          to: "rms-processor.js",
        },
      ],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        include: path.resolve(__dirname, "src"),
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    fallback: {
      "buffer": require.resolve("buffer"),
      "assert": require.resolve("assert/"),
      "process/browser": require.resolve("process/browser"),
    }, 
  },
  output: {
    filename: (pathData) => {
      if (pathData.chunk.name === "bundle") return "privmx-endpoint-web.js";
      return "privmx-endpoint-web.[name].js";
    },
    globalObject: "this",
    path: path.resolve(__dirname, "dist/bundle"),
    library: {
      name: {
        root: "PrivmxWebEndpoint",
        amd: "privmx-webendoint",
        commonjs: "privmx-webendpoint",
      },
      type: "umd",
    },
  },
  performance: {
    hints: false,
    maxEntrypointSize: 1048576, // 1MB
    maxAssetSize: 1048576, // 1MB
  },
};