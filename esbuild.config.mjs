import esbuild from "esbuild";
import process from "node:process";

const prod = process.argv.includes("--production");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  target: "es2018",
  platform: "browser",
  // Obsidian 在运行时提供这些模块，不能打进 bundle
  external: [
    "obsidian",
    "electron",
    "@codemirror/state",
    "@codemirror/view",
    "@codemirror/language",
  ],
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  // 产物是给 Obsidian 的插件入口用的，保持可读（不压缩时便于对照源码排错）
  keepNames: true,
});

if (process.argv.includes("--watch")) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
