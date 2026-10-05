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
const HANDLE_TYPESCRIPT_WITH_TS_LOADER = {
  test: /\.([cm]?ts|tsx)$/,
  loader: "ts-loader",
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
  },
  module: {
    rules: [
      HANDLE_TYPESCRIPT_WITH_TS_LOADER,
    ],
  },
  output: {
    path: path.resolve(__dirname, OUTPUT_DIRECTORY),
    filename: 'src/micropolis.js',
  },
  // Sign-in and the city's WebSocket go to the server. With no server running they fail, and the page says no server
  // answers. Any Host header is allowed, so a reverse proxy under another name can front the dev server.
  devServer: {
    port: 44903,
    allowedHosts: 'all',
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
