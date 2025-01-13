const path = require('path');
const webpack = require("webpack");

module.exports = env => {
    const host = process.env.HOST || 'localhost';    
    return {
        entry: "./src/app.js",
        mode: "development",
        devServer: {
          static: {
            directory: path.join(__dirname, 'src'),
            publicPath: '/',
          },
          compress: true,
          liveReload: true,
          host,
          port: 4002,
          headers: {
            "Cross-Origin-Embedder-Policy": "require-corp",
            "Cross-Origin-Opener-Policy": "same-origin"
          }
        }
    }
};
