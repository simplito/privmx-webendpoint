const path = require('path');

module.exports = env => {
    const host = process.env.HOST || 'localhost';    
    return {
        entry: "./fake.js",
        mode: "development",
        devServer: {
          static: {
            directory: path.join(__dirname, 'src'),
            publicPath: '/',
          },
          compress: true,
          liveReload: true,
          host,
          port: 4001,
          headers: {
            "Cross-Origin-Embedder-Policy": "require-corp",
            "Cross-Origin-Opener-Policy": "same-origin"
          }
        }
    }
};
