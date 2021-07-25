import * as fs from 'fs';
import * as path from 'path';
import * as shell from 'child_process';
import type { Pkg } from './basis';
import type { GLTF, GLTFPipeResult } from './types';

export function updateGLTFTextures(
  gltf: GLTF,
  resName: string,
  extensionName: string,
  extensionDef: any,
) {
  // blender导出可能有冗余的texture定义
  gltf.textures.forEach(tex => {
    if (gltf.images[tex.source].uri === resName) {
      tex.extensions = tex.extensions || {};
      tex.extensions[extensionName] = extensionDef;
    }
  });
}

export function injectGLTFExtension(
  result: GLTFPipeResult,
  resName: string,
  pkg: Pkg,
  compress: number,
  bitmapBuffer: Buffer,
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
  });

  updateGLTFTextures(result.gltf, resName, 'EXT_gpu_compressed_texture', {
    ...extensionDef,
    width: pkg.width,
    height: pkg.height,
    hasAlpha: pkg.hasAlpha,
    bitmapByteLength: bitmapBuffer.byteLength,
    compress,
  });
}

export function writeGLTF(
  result: GLTFPipeResult,
  outdir: string,
  fileName: string,
) {
  // 重新封装成gltf // TODO: glb
  writeJsonSync(path.resolve(outdir, fileName + '.gltf'), result.gltf);
  // 写入所依赖的分散资源
  for (let [resName, buffer] of Object.entries(
    result.separateResources as { [k: string]: Buffer },
  )) {
    fs.writeFileSync(path.resolve(outdir, resName), buffer);
  }
}

// 规则参考meshoptimizer
export function getTextureInfo(resName: string, result: GLTFPipeResult) {
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

export function exec(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    shell.exec(cmd, { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err || stderr) reject({ err, stdout, stderr });
      else resolve(stdout);
    });
  });
}

export function readJsonSync(path: string) {
  return JSON.parse(fs.readFileSync(path, { encoding: 'utf8' }));
}

export function writeJsonSync(path: string, json: Object) {
  return fs.writeFileSync(path, JSON.stringify(json));
}

export function makeSureDir(dir: string) {
  try {
    fs.statSync(dir, { throwIfNoEntry: true });
  } catch (error) {
    fs.mkdirSync(dir);
  }
}

export async function walkDir(
  src: string,
  callback: (file: string, type: boolean) => Promise<void> | void,
) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    await callback(src, true);
    const files = fs.readdirSync(src);
    for (let file of files) {
      await walkDir(path.resolve(src, file), callback);
    }
  } else {
    await callback(src, false);
  }
}

export function sleep(t: number) {
  return new Promise(r => setTimeout(r, t));
}

export function Log(enable: boolean) {
  return enable ? (...args) => console.log(...args) : () => {};
}
