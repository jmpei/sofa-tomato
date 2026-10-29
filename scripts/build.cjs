// Builds dist/index.html: one self-contained file for the Claude artifact. It is page
// content only; the artifact publisher wraps it in <html>, <head> and <body>.
// It bundles src/main.jsx (and its imports) with esbuild, then inlines the JS and CSS
// into src/index.html. React itself loads from cdnjs as a UMD <script>.
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const { outputFiles } = esbuild.buildSync({
  entryPoints: [path.join(root, "src/main.jsx")],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2020",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  charset: "utf8",
  legalComments: "none",
});

// "</script" inside the bundle would end the inline <script> early.
const js = outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = read("src/styles.css") + "\n" + read("src/slot.css");

// Function replacers, so "$&" or "$1" inside the code is not treated as a pattern.
const html = read("src/index.html")
  .replace("/*__CSS__*/", () => css)
  .replace("/*__JS__*/", () => js);

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/index.html"), html);
console.log(`Built dist/index.html (${(html.length / 1024).toFixed(1)} KB)`);
