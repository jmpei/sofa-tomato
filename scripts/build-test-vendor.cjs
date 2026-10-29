// Test-only: the test machine may have no network, so the e2e tests serve a local
// React build in place of the cdnjs scripts. This bundles the local react and
// react-dom packages into two browser scripts that set window.React and window.ReactDOM,
// the same globals the UMD builds set.
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const out = path.join(__dirname, "..", "test-vendor");
fs.mkdirSync(out, { recursive: true });
const nodePaths = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
const common = { nodePaths, bundle: true, write: true, format: "iife", minify: true, define: { "process.env.NODE_ENV": '"production"' } };

esbuild.buildSync({
  ...common,
  stdin: { contents: "window.React = require('react');", resolveDir: __dirname },
  outfile: path.join(out, "react.js"),
});

// react-dom must reuse window.React, not bundle a second copy (two copies break hooks).
const useGlobalReact = {
  name: "global-react",
  setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "global-react" }));
    build.onLoad({ filter: /.*/, namespace: "global-react" }, () => ({ contents: "module.exports = window.React;" }));
  },
};
esbuild.build({
  ...common,
  stdin: {
    contents: "window.ReactDOM = Object.assign({}, require('react-dom'), require('react-dom/client'));",
    resolveDir: __dirname,
  },
  plugins: [useGlobalReact],
  outfile: path.join(out, "react-dom.js"),
}).then(() => console.log("Built test-vendor/react.js and test-vendor/react-dom.js"));

// The on-device store, exposed as a global, so the tests can build a fake
// window.claude whose db is shared by two pages of one browser context.
esbuild.buildSync({
  ...common,
  entryPoints: [path.join(__dirname, "..", "src/localdb.js")],
  globalName: "ReelLogTestDb",
  // Playwright wraps init scripts in a function, so a top-level var stays local.
  footer: { js: "globalThis.ReelLogTestDb = ReelLogTestDb;" },
  outfile: path.join(out, "localdb.js"),
});
