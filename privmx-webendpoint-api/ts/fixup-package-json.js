const fs = require("fs");
const path = require("path");
const DIST_BUNDLE_PATH = "bundle";
// const DIST_MJS_PATH = "dist";

if (fs.existsSync(DIST_BUNDLE_PATH)) {
  fs.appendFileSync(path.resolve(DIST_BUNDLE_PATH, "package.json"), JSON.stringify({
    main: DIST_BUNDLE_PATH + "/bundle.js",
    types: DIST_BUNDLE_PATH + "/bundle.d.ts"
  }, null, 2));
}

// if (fs.existsSync(DIST_MJS_PATH)) {
//   fs.appendFileSync(path.resolve(DIST_MJS_PATH, "package.json"), JSON.stringify({
//     main: DIST_MJS_PATH + "/index.js",
//     types: DIST_MJS_PATH + "/index.d.ts"
//   }, null, 2));  
// }
