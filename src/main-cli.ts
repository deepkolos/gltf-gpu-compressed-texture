import fs from 'fs';
import path from 'path';
import CLI from './cli';
import process from 'process';
import { GLTF } from './types';
import * as gltfPipe from 'gltf-pipeline';
import BASIS from './libs/basis_encoder.js';
import { decodeBasisCli, encodeBasisCli, Pkg, removeTmpFiles } from './basis';
import { makeSureDir, readJsonSync, walkDir, writeJsonSync } from './utils';
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
  pkg: Pkg,
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
    // console.log('update separateResources', fileName);
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
    material => material.normalTexture?.index === textureIndex,
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
    const { dir, outdir = './gltf' } = args;
    const compress = (args.compress ?? 1) | 0;
    const mipmap = (args.mipmap ?? 'true') !== 'false';
    // console.log(dir, outdir, compress, mipmap);

    makeSureDir(outdir);

    const basis = await BASIS();
    basis.initializeBasis();

    await walkDir(dir, async (file, isDir) => {
      // if (file.indexOf('BoomBox') === -1) return;

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
        const entries = Object.entries(
          result.separateResources as { [k: string]: Buffer },
        );
        await Promise.all(
          entries.map(async ([resName, buffer]) => {
            if (resName.match(/\.(jpg|png|bmp)$/i)) {
              const { normal, sRGB, ext } = getTextureInfo(resName, result);
              console.log('processing', resName, normal, sRGB);
              const basisFileData = await encodeBasisCli(
                buffer,
                ext,
                mipmap,
                normal,
                sRGB,
              );
              const pkg = await decodeBasisCli(basisFileData, basis, compress);

              injectGLTFExtension(result, resName, pkg, compress);
            }
          }),
        );

        writeGLTF(result, outdir, fileName);
      }
    });

    console.log('\n', `cost: ${Date.now() - t}ms`, '\n');

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
  
  .action("gltf-tc -i '../examples/glb' '../examples/zstd'", '', 'Examples')
  .action("gltf-tc -i '../examples/glb' '../examples/no-zstd' 0", '', 'Examples')
  .action("gltf-tc -i '../examples/glb' '../examples/no-mipmap 1 false'", '', 'Examples')
  .action("gltf-tc -i '../examples/glb' '../examples/no-zstd-no-mipmap 0 false'", '', 'Examples')

  .run(process.argv.slice(2));
