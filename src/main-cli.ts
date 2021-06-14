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
}

const main = async (args: Args) => {
  try {
    const t = Date.now();
    const { dir, outdir = './gltf-tc' } = args;
    const compress = (args.compress ?? 1) | 0;
    const mipmap = (args.mipmap ?? 'true') !== 'false';
    // prettier-ignore
    const sizeInfoSummary = { bitmap: 0, astc: 0, etc1: 0, bc7: 0, dxt: 0, pvrtc: 0 };

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
              buffer, ext, mipmap, normal, sRGB
            );
              const pkg = await decodeBasisCli(basisFileData, basis, compress);

              injectGLTFExtension(result, resName, pkg, compress);

              const cost = Date.now() - t;
              console.log(
                `done: ${cost}ms\t${resName}\t法线:${normal}\tsRGB: ${sRGB}`,
              );
              sizeInfoSummary.bitmap += buffer.byteLength;
              for (let k in pkg.textures) {
                sizeInfoSummary[k] += pkg.textures[k].byteLength;
              }
            },
          ),
        );

        writeGLTF(result, outdir, fileName);
      }
    });

    console.log('');
    console.log(`cost: ${((Date.now() - t) / 1000).toFixed(2)}s`);
    console.log(`compress: ${compress}, summary:`);
    for (let k in sizeInfoSummary) {
      const sizeMB = sizeInfoSummary[k] / 1024 ** 2;
      console.log(`  ${k.padEnd(6, ' ')}: ${sizeMB.toFixed(2)}MB`);
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
    '-i --input [dir] [?outdir] [?compress] [?mipmap]',
    '把gltf所使用纹理转换为GPU压缩纹理并支持fallback',
    '',
    main,
  )
  
  .action("gltf-tc -i ./examples/glb' ./examples/zstd", '', 'Examples')
  .action("gltf-tc -i ./examples/glb' ./examples/no-zstd 0", '', 'Examples')
  .action("gltf-tc -i ./examples/glb' ./examples/no-mipmap 1 false", '', 'Examples')
  .action("gltf-tc -i ./examples/glb' ./examples/no-zstd-no-mipmap 0 false", '', 'Examples')

  .run(process.argv.slice(2));
