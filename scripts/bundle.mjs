import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const corejs = require('core-js/package.json').version;

export async function bundleJavaScript({ minify = true } = {}) {
  const bundled = await build({
    absWorkingDir: root,
    stdin: {
      contents: "import 'whatwg-fetch'; import './src/assets/js/app.js';",
      resolveDir: root,
      sourcefile: 'browser-entry.js',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'esnext',
    legalComments: 'inline',
  });

  const transpiled = await transformAsync(bundled.outputFiles[0].text, {
    filename: 'app.js',
    babelrc: false,
    configFile: false,
    presets: [
      [
        require.resolve('@babel/preset-env'),
        {
          targets: { ie: '11' },
          modules: false,
          useBuiltIns: 'usage',
          corejs,
        },
      ],
    ],
  });

  // Bundle Babel's injected polyfills too; the browser loads a single classic script.
  const output = await build({
    absWorkingDir: root,
    stdin: { contents: transpiled.code, resolveDir: root, sourcefile: 'app.js' },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es5',
    minify,
    legalComments: 'inline',
  });
  return output.outputFiles[0].text;
}
