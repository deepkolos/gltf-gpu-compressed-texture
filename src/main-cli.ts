import fs from 'fs';
import path from 'path';
import CLI from './cli';
import process from 'process';
import * as gltfPipe from 'gltf-pipeline';
import BASIS from './libs/basis_encoder.js';
import { decodeBasisCli, encodeBasisCli, removeTmpFiles } from './basis';
import {
  walkDir,
  writeGLTF,
  makeSureDir,
  readJsonSync,
  getTextureInfo,
  injectGLTFExtension,
} from './utils';
import type { GLTFPipeResult } from './types';

const cli = new CLI();

interface Args {
  dir: string;
  outdir: string;
  compress: number;
  mipmap: string;
  basisuArgs: string;
}

const main = async (args: Args) => {
  try {
    const t = Date.now();
    const { dir, outdir = './gltf-tc', basisuArgs } = args;
    const compress = (args.compress ?? 1) | 0;
    const mipmap = (args.mipmap ?? 'true') !== 'false';
    const sizeInfo: { [file: string]: { [t: string]: number } } = {};

    makeSureDir(outdir);

    const basis = await BASIS();
    basis.initializeBasis();

    await walkDir(dir, async (file, isDir) => {
      const ext = path.extname(file);
      const isGLTF = !!ext.match(/\.gltf$/i);
      const isGLB = !!ext.match(/\.glb$/i);
      if (!isDir && (isGLB || isGLTF)) {
        const fileName = path.basename(file, ext);
        let result: GLTFPipeResult;
        sizeInfo[fileName] = {};

        if (isGLB) {
          result = await gltfPipe.glbToGltf(fs.readFileSync(file), {
            separate: true,
          });
        } else if (isGLTF) {
          const gltf = readJsonSync(file);
          result = await gltfPipe.processGltf(gltf, {
            resourceDirectory: dir,
            separate: true,
          });
        }

        // promise all + child_process的zstd encoder和basisu encoder
        await Promise.all(
          Object.entries(result.separateResources).map(
            async ([resName, buffer]) => {
              if (!resName.match(/\.(jpg|png|bmp)$/i)) return;

              const t = Date.now();
              const { normal, sRGB, ext } = getTextureInfo(resName, result);
              // prettier-ignore
              const basisFileData = await encodeBasisCli(
              buffer, ext, mipmap, normal, sRGB, basisuArgs
            );
              const pkg = await decodeBasisCli(basisFileData, basis, compress);

              injectGLTFExtension(result, resName, pkg, compress);

              const cost = Date.now() - t;
              console.log(
                `done: ${cost}ms\t${resName}\t法线:${normal}\tsRGB: ${sRGB}`,
              );
              sizeInfo[fileName].bitmap = sizeInfo[fileName].bitmap ?? 0;
              sizeInfo[fileName].bitmap += buffer.byteLength;
              for (let k in pkg.textures) {
                sizeInfo[fileName][k] = sizeInfo[fileName][k] ?? 0;
                sizeInfo[fileName][k] += pkg.textures[k].byteLength;
              }
            },
          ),
        );

        const subDir = path.resolve(outdir, path.basename(fileName));
        makeSureDir(subDir);
        writeGLTF(result, subDir, fileName);
      }
    });

    console.log('');
    console.log(`cost: ${((Date.now() - t) / 1000).toFixed(2)}s`);

    let bitmapMB = 0;
    for (let fileName in sizeInfo) {
      console.log(`compress: ${compress}, ${fileName} summary:`);
      for (let k in sizeInfo[fileName]) {
        const sizeMB = sizeInfo[fileName][k] / 1024 ** 2;
        if (k === 'bitmap') bitmapMB = sizeMB;
        const diffMB = (sizeMB - bitmapMB).toFixed(2);

        console.log(
          `  ${k.padEnd(6, ' ')}: ${sizeMB.toFixed(2)}MB (${diffMB}MB)`,
        );
      }
      console.log('');
    }

    removeTmpFiles();
  } catch (error) {
    console.log(error);
  }
};

// prettier-ignore
cli
  .action('-h --help', '显示帮助', '', () => cli.help())
  .action<Args>(
    '-i --input [dir] [?outdir] [?compress] [?mipmap] [?basisuArgs]',
    '把gltf所使用纹理转换为GPU压缩纹理并支持fallback',
    '',
    main,
  )
  
  .action("gltf-tc -i ./examples/glb ./examples/zstd", '', 'Examples')
  .action("gltf-tc -i ./examples/glb ./examples/no-zstd 0", '', 'Examples')
  .action("gltf-tc -i ./examples/glb ./examples/no-mipmap 1 false", '', 'Examples')
  .action("gltf-tc -i ./examples/glb ./examples/no-zstd-no-mipmap 0 false", '', 'Examples')
  .action("gltf-tc -i ./examples/glb ./examples/zstd 1 true \"-uastc\"", '', 'Examples')

  .run(process.argv.slice(2));
