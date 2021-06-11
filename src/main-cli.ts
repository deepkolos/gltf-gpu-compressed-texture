import fs from 'fs';
import path from 'path';
import CLI from './cli';
import process from 'process';
import { GLTF, ZSTDI } from './types';
import * as Jimp from 'jimp';
import * as crypto from 'crypto';
import * as gltfPipe from 'gltf-pipeline';
import BASIS from './libs/basis_encoder.js';
import {
  decodeBasis,
  decodeBasisCli,
  encodeBasis,
  encodeBasisCli,
  removeTmpFiles,
} from './basis';
import {
  exec,
  makeSureDir,
  readJsonSync,
  walkDir,
  writeJsonSync,
} from './utils';
import { ZstdCodec } from 'zstd-codec';

const cli = new CLI();

interface Args {
  dir: string;
  outdir: string;
  compress: number;
  mipmap: string;
}

type GLTFPipeResult = {
  gltf: GLTF;
  separateResources: { [key: string]: Buffer };
};

function updateGLTFRes(gltf: any, resUri: string, newResUri: string) {
  [...gltf.images, ...gltf.buffers].some(i => {
    if (i.uri === resUri) {
      i.uri = newResUri;
      return true;
    }
  });
}

function updateGLTFTextures(
  gltf: GLTF,
  resName: string,
  extensionName: string,
  extensionDef: any,
) {
  gltf.textures.some(tex => {
    if (gltf.images[tex.source].uri === resName) {
      tex.extensions = tex.extensions || {};
      tex.extensions[extensionName] = extensionDef;
      return true;
    }
  });
}

function injectGLTFExtension(
  result: GLTFPipeResult,
  resName: string,
  pkg: ReturnType<typeof decodeBasis>,
  compress: number,
) {
  const extensionDef = {};
  const baseName = path.basename(resName).replace(path.extname(resName), '');

  // 更新separateResources和buffer
  Object.keys(pkg.textures).forEach(type => {
    const fileName = `${baseName}.${type}.bin`;
    const buffer = pkg.textures[type] as Buffer;
    const len = result.gltf.buffers.push({
      name: `${baseName}.${type}`,
      byteLength: buffer.byteLength,
      uri: fileName,
    });
    extensionDef[type] = len - 1;
    result.separateResources[fileName] = buffer;
    console.log('update separateResources', fileName);
  });

  // 更新texture extension
  updateGLTFTextures(result.gltf, resName, 'EXT_GPU_COMPRESSED_TEXTURE', {
    ...extensionDef,
    width: pkg.width,
    height: pkg.height,
    hasAlpha: pkg.hasAlpha,
    compress,
  });
}

function writeGLTF(result: GLTFPipeResult, outdir: string, fileName: string) {
  // 重新封装成gltf // TODO: glb
  writeJsonSync(path.resolve(outdir, fileName + '.gltf'), result.gltf);
  // 写入所依赖的分散资源
  for (let [resName, buffer] of Object.entries(
    result.separateResources as { [k: string]: Buffer },
  )) {
    fs.writeFileSync(path.resolve(outdir, resName), buffer);
  }
}

function getTextureInfo(resName: string, result: GLTFPipeResult) {
  const ext = path.extname(resName);
  const imgIndex = result.gltf.images.findIndex(i => i.uri === resName);
  const textureIndex = result.gltf.textures.findIndex(
    i => i.source === imgIndex,
  );
  const normal = result.gltf.materials.some(
    material => material.normalTexture.index === textureIndex,
  );
  const sRGB = result.gltf.materials.some(material =>
    [
      material.emissiveTexture?.index,
      material.pbrMetallicRoughness?.baseColorTexture?.index,
      material.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseTexture
        .index,
      material.extensions?.KHR_materials_specular?.specularColorTexture.index,
      material.extensions?.KHR_materials_sheen?.sheenColorTexture.index,
    ].includes(textureIndex),
  );
  return { ext, normal, sRGB };
}

const main = async (args: Args) => {
  try {
    const t = Date.now();
    // prettier-ignore
    const { dir, outdir = './gltf'} = args;
    const compress = (args.compress ?? 1) | 0;
    const mipmap = (args.mipmap ?? 'true') !== 'false';
    console.log(dir, outdir, compress, mipmap);

    makeSureDir(outdir);

    const basis = await BASIS();
    // const zstd = await new Promise<ZSTDI>(resolve => ZstdCodec.run(resolve));

    // const zstdSimple = new zstd.Simple();

    basis.initializeBasis();

    // 先解开为gltf
    // 然后在拼接成gltf/glb
    await walkDir(dir, async (file, isDir) => {
      if (file.indexOf('BoomBox') === -1) return;

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

        // TODO: 多线程 done（promise all + child_process的zstd encoder和basisu encoder）
        // const entries = Object.entries(
        //   result.separateResources as { [k: string]: Buffer },
        // );
        // for (let [resName, buffer] of entries) {
        //   if (resName.match(/\.(jpg|png|bmp)$/i)) {
        //     let pngBuffer = buffer;
        //     console.log('processing', resName);

        //     // TODO: wasm的encode只支持png，速度慢，此法是一种fallback，优先使用命令行的方式，速度快，有SIMD加速
        //     if (resName.match(/\.(jpg|bmp)$/i)) {
        //       const t = Date.now();
        //       const jimp = await Jimp.create(buffer);
        //       pngBuffer = await jimp.getBufferAsync('image/png');
        //       console.log('to png cost', Date.now() - t);
        //     }

        //     const basisFileData = encodeBasis(pngBuffer, basis, mipmap);
        //     const pkg = decodeBasis(basisFileData, basis, zstdSimple, compress);
        //     // console.log(pkg);

        //     injectGLTFExtension(result, resName, pkg, compress);
        //   }
        // }

        // 使用cli来encode basis zstd等，比to png的wasm encode basis快很多
        // const entries = Object.entries(
        //   result.separateResources as { [k: string]: Buffer },
        // );
        // for (let [resName, buffer] of entries) {
        //   if (resName.match(/\.(jpg|png|bmp)$/i)) {
        //     console.log('processing', resName);
        //     const { normal, sRGB, ext } = getTextureInfo(resName, result);
        //     const basisFileData = await encodeBasisCli(
        //       buffer,
        //       ext,
        //       mipmap,
        //       normal,
        //       sRGB,
        //     );
        //     const pkg = await decodeBasisCli(basisFileData, basis, compress);
        //     // console.log(pkg);

        //     injectGLTFExtension(result, resName, pkg, compress);
        //   }
        // }

        // promise.all 大概减少4s时间
        const entries = Object.entries(
          result.separateResources as { [k: string]: Buffer },
        );
        await Promise.all(
          entries.map(async ([resName, buffer]) => {
            if (resName.match(/\.(jpg|png|bmp)$/i)) {
              console.log('processing', resName);
              const { normal, sRGB, ext } = getTextureInfo(resName, result);
              const basisFileData = await encodeBasisCli(
                buffer,
                ext,
                mipmap,
                normal,
                sRGB,
              );
              const pkg = await decodeBasisCli(basisFileData, basis, compress);
              // console.log(pkg);

              injectGLTFExtension(result, resName, pkg, compress);
            }
          }),
        );

        // console.log(result.separateResources);
        writeGLTF(result, outdir, fileName);
      }
    });

    removeTmpFiles();

    console.log(`
cost: ${Date.now() - t}ms
`);
  } catch (error) {
    console.log(error);
  }
};

cli
  .action('-h --help', '显示帮助', '', () => cli.help())
  .action<Args>(
    '-i --input [dir] [?outdir] [?compress] [?mipmap]',
    '把gltf所使用纹理转换为GPU压缩纹理并支持fallback',
    '',
    main,
  )

  .action("gltf-tc -i '../examples/glb' '../examples/gltf'", '', 'Examples')

  .run(process.argv.slice(2));
