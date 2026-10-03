import { execSync } from 'child_process';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin  from 'html-webpack-plugin';
import path from 'path';

// Workaround now this is a module...
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ADD_TS_EXTENSIONS_TO_WEPACK = [".ts", ".tsx", ".js"];
const SUPPORT_FULLY_QUALIFIED_TS_ESM_IMPORTS = {
  ".js": [".js", ".ts"],
  ".cjs": [".cjs", ".cts"],
  ".mjs": [".mjs", ".mts"],
};
// The bundle is built from ES modules: the page starts the city's worker with new Worker(new URL(..., import.meta.url)),
// which webpack bundles as a worker, and import.meta is only allowed in an ES module. tsconfig.json stays on CommonJS
// for ts-jest, which never compiles the page's entry point. Modules resolve as under CommonJS, from node_modules: an
// ES module target alone would resolve them the classic way, which finds no package.
const HANDLE_TYPESCRIPT_WITH_TS_LOADER = {
  test: /\.([cm]?ts|tsx)$/,
  loader: "ts-loader",
  options: {compilerOptions: {module: "es2020", moduleResolution: "node"}},
};

const OUTPUT_DIRECTORY = 'dist';

// The C# server's address in development: applicationUrl in server/Micropolis.Server/Properties/launchSettings.json
const SERVER_URL = 'http://localhost:5180';

function recursivelyCopy(dir) {
  return {from: dir, to: dir, toType: 'dir'};
}

function cleanUpLeftovers() {
  return new CleanWebpackPlugin();
}

function copyStaticAssets() {
  return new CopyPlugin({
    "patterns": [
      recursivelyCopy('css'),
      recursivelyCopy('images'),
      recursivelyCopy('sprites'),
      'LICENSE',
      'COPYING',
    ]
  });
}

function injectBundleIntoHTML(buildId) {
  return new HtmlWebpackPlugin({
    buildId,
    inject: true,
    hash: true,
    template: './index.html',
    filename: 'index.html'
  });
}

function injectBuildIdIntoAbout(buildId) {
  return new HtmlWebpackPlugin({
    buildId,
    inject: false,
    hash: true,
    template: './about.html',
    filename: 'about.html'
  });
}

function injectBuildIdIntoNameLicense(buildId) {
  return new HtmlWebpackPlugin({
    buildId,
    inject: false,
    hash: true,
    template: './name_license.html',
    filename: 'name_license.html'
  });
}

// The build ID is cosmetic, and a GPL source tarball has no git history, so a build outside a git checkout is
// still a valid build.
function getBuildId() {
  try {
    return execSync('git rev-parse --short=12 HEAD', {cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore']})
      .toString().trim();
  } catch {
    return 'unknown';
  }
}

const buildId = getBuildId();

export default {
  entry: './src/micropolis.ts',
  resolve: {
    extensions: ADD_TS_EXTENSIONS_TO_WEPACK,
    extensionAlias: SUPPORT_FULLY_QUALIFIED_TS_ESM_IMPORTS,
  },
  module: {
    rules: [
      HANDLE_TYPESCRIPT_WITH_TS_LOADER,
    ],
  },
  output: {
    path: path.resolve(__dirname, OUTPUT_DIRECTORY),
    filename: 'src/micropolis.js',
    // The city's worker is a chunk the page loads by its URL, which HtmlWebpackPlugin's hash never reaches. Its content
    // hash is in its name, so a browser that kept an old worker never runs it against a newer page.
    chunkFilename: 'src/[name].[contenthash].js',
  },
  // Sign-in and the city's WebSocket go to the server. With no server running they fail, and the game starts
  // single-player.
  devServer: {
    proxy: [
      {context: ['/api', '/ws/city'], target: SERVER_URL, ws: true},
    ],
  },
  plugins: [
    cleanUpLeftovers(),
    copyStaticAssets(),
    injectBundleIntoHTML(buildId),
    injectBuildIdIntoAbout(buildId),
    injectBuildIdIntoNameLicense(buildId),
  ],
};
