import { IBASIS } from './libs/basis_encoder.js';
import { ZSTDSimple } from './types';
import { exec, makeSureDir } from './utils';
import * as fs from 'fs';

// ASTC format, from:
// https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_astc/
const COMPRESSED_RGBA_ASTC_4x4_KHR = 0x93b0;

// DXT formats, from:
// http://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_s3tc/
const COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83f0;
const COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83f1;
const COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83f2;
const COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83f3;

// BC7 format, from:
// https://www.khronos.org/registry/webgl/extensions/EXT_texture_compression_bptc/
const COMPRESSED_RGBA_BPTC_UNORM = 0x8e8c;

// ETC format, from:
// https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_etc1/
const COMPRESSED_RGB_ETC1_WEBGL = 0x8d64;

// PVRTC format, from:
// https://www.khronos.org/registry/webgl/extensions/WEBGL_compressed_texture_pvrtc/
const COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 0x8c00;
const COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 0x8c02;

// Same as the Module.transcoder_texture_format enum
const BASIS_FORMAT = {
  cTFETC1: 0,
  cTFETC2: 1,
  cTFBC1: 2,
  cTFBC3: 3,
  cTFBC4: 4,
  cTFBC5: 5,
  cTFBC7: 6,
  cTFPVRTC1_4_RGB: 8,
  cTFPVRTC1_4_RGBA: 9,
  cTFASTC_4x4: 10,
  cTFATC_RGB: 11,
  cTFATC_RGBA_INTERPOLATED_ALPHA: 12,
  cTFRGBA32: 13,
  cTFRGB565: 14,
  cTFBGR565: 15,
  cTFRGBA4444: 16,
  cTFFXT1_RGB: 17,
  cTFPVRTC2_4_RGB: 18,
  cTFPVRTC2_4_RGBA: 19,
  cTFETC2_EAC_R11: 20,
  cTFETC2_EAC_RG11: 21,
};

const BASIS_FORMAT_NAMES = {};
for (const name in BASIS_FORMAT) {
  BASIS_FORMAT_NAMES[BASIS_FORMAT[name]] = name;
}

const DXT_FORMAT_MAP = {};
DXT_FORMAT_MAP[BASIS_FORMAT.cTFBC1] = COMPRESSED_RGB_S3TC_DXT1_EXT;
DXT_FORMAT_MAP[BASIS_FORMAT.cTFBC3] = COMPRESSED_RGBA_S3TC_DXT5_EXT;
DXT_FORMAT_MAP[BASIS_FORMAT.cTFBC7] = COMPRESSED_RGBA_BPTC_UNORM;

export function encodeBasis(
  buffer: ArrayBuffer,
  BASIS: IBASIS,
  mipmap: boolean,
) {
  const basisEncoder = new BASIS.BasisEncoder();
  // prettier-ignore
  basisEncoder.setSliceSourceImage(0, new Uint8Array(buffer), 0, 0, true);
  basisEncoder.setDebug(false);
  basisEncoder.setComputeStats(false);
  basisEncoder.setPerceptual(true);
  basisEncoder.setMipSRGB(true);
  basisEncoder.setQualityLevel(10);
  basisEncoder.setUASTC(true);
  basisEncoder.setMipGen(mipmap);

  const basisFileData = new Uint8Array(1024 * 1024 * 10);
  const startTime = Date.now();
  const numOutputBytes = basisEncoder.encode(basisFileData);
  const elapsed = Date.now() - startTime;
  console.log('encode cost:', elapsed);

  // prettier-ignore
  const actualBasisFileData = new Uint8Array(basisFileData.buffer, 0, numOutputBytes);
  basisEncoder.delete();
  return actualBasisFileData;
}

export function decodeBasis(
  buffer: ArrayBuffer,
  BASIS: IBASIS,
  ZSTD: ZSTDSimple,
  compress: number,
) {
  const startTime = Date.now();

  let basisFile = new BASIS.BasisFile(new Uint8Array(buffer));

  const width = basisFile.getImageWidth(0, 0);
  const height = basisFile.getImageHeight(0, 0);
  const images = basisFile.getNumImages();
  const levels = basisFile.getNumLevels(0);
  const hasAlpha = basisFile.getHasAlpha();

  if (!width || !height || !images || !levels) {
    console.warn('Invalid .basis file');
    basisFile.close();
    basisFile.delete();
    return;
  }
  const types = {
    astc: BASIS_FORMAT.cTFASTC_4x4,
    bc7: BASIS_FORMAT.cTFBC7,
    dxt: hasAlpha ? BASIS_FORMAT.cTFBC3 : BASIS_FORMAT.cTFBC1,
    pvrtc: hasAlpha
      ? BASIS_FORMAT.cTFPVRTC1_4_RGBA
      : BASIS_FORMAT.cTFPVRTC1_4_RGB,
    etc1: BASIS_FORMAT.cTFETC1,
  };
  const alignedWidth = (width + 3) & ~3;
  const alignedHeight = (height + 3) & ~3;

  interface Output {
    hasAlpha: number;
    width: number;
    height: number;
    textures: Partial<Record<keyof typeof types, Uint8Array>>;
  }

  const output: Output = {
    hasAlpha,
    width: alignedWidth,
    height: alignedHeight,
    textures: {},
  };

  Object.keys(types).forEach(type => {
    const format = types[type];

    if (!basisFile.startTranscoding()) {
      console.warn('startTranscoding failed');
      basisFile.close();
      basisFile.delete();
      return;
    }

    const mipmaps = [];
    let mipmapsByteLen = 0;
    for (let mip = 0; mip < levels; mip++) {
      const dst = new Uint8Array(
        basisFile.getImageTranscodedSizeInBytes(0, mip, format),
      );
      const status = basisFile.transcodeImage(dst, 0, mip, format, 0, hasAlpha);

      if (!status) {
        console.warn('transcodeImage failed', type);
      } else {
        mipmaps.push(dst);
        mipmapsByteLen += dst.byteLength;
      }
    }

    let data = new Uint8Array(mipmapsByteLen);
    const header = Uint32Array.from([
      alignedWidth,
      alignedHeight,
      levels,
      mipmapsByteLen,
    ]);
    const offsets = new Uint32Array(levels);
    mipmaps.reduce((offset, mipmap, i) => {
      data.set(mipmap, offset);
      offsets[i] =
        header.byteLength + offsets.byteLength + offset + mipmap.byteLength;
      return offset + mipmap.byteLength;
    }, 0);

    // zstd压缩
    if (compress === 1) {
      const t = Date.now();
      data = ZSTD.compress(data, 1);
      console.log('zstd cost:', Date.now() - t);
    }

    const dst = new Uint8Array(
      header.byteLength + offsets.byteLength + data.byteLength,
    );
    const dstHeader = new Uint32Array(dst.buffer, 0, header.length);
    const dstOffsets = new Uint32Array(
      dst.buffer,
      header.byteLength,
      offsets.length,
    );
    dstHeader.set(header, 0);
    dstOffsets.set(offsets, 0);
    dst.set(data, header.byteLength + offsets.byteLength);

    output.textures[type] = dst;
  });

  const elapsed = Date.now() - startTime;
  basisFile.close();
  basisFile.delete();
  console.log('deocde cost:', elapsed);

  return output;
}

const tmpFileBaseName = './gltf-tc.tmp';
let tmpFileId = 0;
const tmpFiles = [];

function tmpFileName(ext = '') {
  tmpFileId++;
  const fileName = `${tmpFileBaseName}${tmpFileId}${ext}`;
  tmpFiles.push(fileName);
  return fileName;
}

export function removeTmpFiles() {
  tmpFiles.forEach(i => fs.unlinkSync(i));
}

export async function encodeBasisCli(
  buffer: ArrayBuffer,
  ext: string,
  mipmap: boolean,
  normal: boolean,
  sRGB: boolean,
): Promise<Uint8Array> {
  const tmpFile = tmpFileName(ext);
  fs.writeFileSync(tmpFile, new Uint8Array(buffer));
  let cmd = `basisu ${tmpFile}`;
  cmd += mipmap ? ' -mipmap' : '';
  cmd += normal ? ' -normal_map' : '';
  cmd += !sRGB ? ' -linear' : '';

  // await exec(`${cmd} -output_file ${tmpFile}`);
  await exec(`${cmd} -uastc -output_file ${tmpFile}`);
  // await exec(`${cmd} -uastc -uastc_level 2 -uastc_rdo_d 1024 -output_file ${tmpFile}`);
  const basisBuffer = fs.readFileSync(tmpFile);
  return new Uint8Array(basisBuffer);
}

export async function decodeBasisCli(
  buffer: ArrayBuffer,
  BASIS: IBASIS,
  compress: number,
) {
  const startTime = Date.now();

  let basisFile = new BASIS.BasisFile(new Uint8Array(buffer));

  const width = basisFile.getImageWidth(0, 0);
  const height = basisFile.getImageHeight(0, 0);
  const images = basisFile.getNumImages();
  const levels = basisFile.getNumLevels(0);
  const hasAlpha = basisFile.getHasAlpha();

  if (!width || !height || !images || !levels) {
    console.warn('Invalid .basis file');
    basisFile.close();
    basisFile.delete();
    return;
  }
  const types = {
    astc: BASIS_FORMAT.cTFASTC_4x4,
    bc7: BASIS_FORMAT.cTFBC7,
    dxt: hasAlpha ? BASIS_FORMAT.cTFBC3 : BASIS_FORMAT.cTFBC1,
    pvrtc: hasAlpha
      ? BASIS_FORMAT.cTFPVRTC1_4_RGBA
      : BASIS_FORMAT.cTFPVRTC1_4_RGB,
    etc1: BASIS_FORMAT.cTFETC1,
  };
  const alignedWidth = (width + 3) & ~3;
  const alignedHeight = (height + 3) & ~3;

  interface Output {
    hasAlpha: number;
    width: number;
    height: number;
    textures: Partial<Record<keyof typeof types, Uint8Array>>;
  }

  const output: Output = {
    hasAlpha,
    width: alignedWidth,
    height: alignedHeight,
    textures: {},
  };

  const typesKeys = Object.keys(types);

  for (let i = 0; i < typesKeys.length; i++) {
    const type = typesKeys[i];
    const format = types[type];

    if (!basisFile.startTranscoding()) {
      console.warn('startTranscoding failed');
      basisFile.close();
      basisFile.delete();
      return;
    }

    const mipmaps = [];
    let mipmapsByteLen = 0;
    for (let mip = 0; mip < levels; mip++) {
      const dst = new Uint8Array(
        basisFile.getImageTranscodedSizeInBytes(0, mip, format),
      );
      const status = basisFile.transcodeImage(dst, 0, mip, format, 0, hasAlpha);

      if (!status) {
        console.warn('transcodeImage failed', type);
      } else {
        mipmaps.push(dst);
        mipmapsByteLen += dst.byteLength;
      }
    }

    let data = new Uint8Array(mipmapsByteLen);
    const header = Uint32Array.from([
      alignedWidth,
      alignedHeight,
      levels,
      mipmapsByteLen,
    ]);
    const offsets = new Uint32Array(levels);
    mipmaps.reduce((offset, mipmap, i) => {
      data.set(mipmap, offset);
      offsets[i] =
        header.byteLength + offsets.byteLength + offset + mipmap.byteLength;
      return offset + mipmap.byteLength;
    }, 0);

    // zstd压缩
    if (compress === 1) {
      const t = Date.now();
      // data = ZSTD.compress(data, 1);
      const tmpFile = tmpFileName();
      const tmpOutput = tmpFileName('.zst');
      fs.writeFileSync(tmpFile, data);
      await exec(`zstd -1 ${tmpFile} -f -q -o ${tmpOutput}`);
      const zstdBuffer = fs.readFileSync(tmpOutput);
      data = new Uint8Array(zstdBuffer);
      console.log('zstd cost:', Date.now() - t);
    }

    const dst = new Uint8Array(
      header.byteLength + offsets.byteLength + data.byteLength,
    );
    const dstHeader = new Uint32Array(dst.buffer, 0, header.length);
    const dstOffsets = new Uint32Array(
      dst.buffer,
      header.byteLength,
      offsets.length,
    );
    dstHeader.set(header, 0);
    dstOffsets.set(offsets, 0);
    dst.set(data, header.byteLength + offsets.byteLength);

    output.textures[type] = dst;
  }

  const elapsed = Date.now() - startTime;
  basisFile.close();
  basisFile.delete();
  console.log('deocde cost:', elapsed);

  return output;
}
