import json from '@rollup/plugin-json';
import addCliEntry from './add-cli-entry';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import sucrase from '@rollup/plugin-sucrase';
import copy from 'rollup-plugin-copy';
import pkg from './package.json';

const plugins = [
  json(),
  resolve(),
  commonjs({ ignoreDynamicRequires: true }),
  sucrase({ transforms: ['typescript'] }),
  addCliEntry(),
  copy({
    targets: [
      {
        src: 'src/libs/basis_encoder.wasm',
        dest: 'dist/',
      },
    ],
  }),
];

export default [
  {
    input: 'src/main.ts',
    output: [
      {
        name: 'GLTFGPUCompressedTexture',
        file: pkg.browser,
        format: 'umd',
      },
      { file: pkg.main, format: 'cjs', exports: 'auto' },
      { file: pkg.module, format: 'es' },
    ],
    plugins,
  },

  {
    input: 'src/main-cli.ts',
    output: {
      file: pkg.bin['gltf-tc'],
      format: 'cjs',
      exports: 'auto',
    },
    external: ['gltf-pipeline'],
    plugins,
  },
];
