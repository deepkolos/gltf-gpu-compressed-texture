import {
  UnsignedByteType,
  LinearFilter,
  LinearMipmapLinearFilter,
  // RGB_ETC2_Format,
  RGB_ETC1_Format,
  RGB_S3TC_DXT1_Format,
  RGB_PVRTC_4BPPV1_Format,
  // RGBAFormat,
  RGBA_BPTC_Format,
  // RGBA_ETC2_EAC_Format,
  RGBA_ASTC_4x4_Format,
  RGBA_S3TC_DXT5_Format,
  RGBA_PVRTC_4BPPV1_Format,
  RepeatWrapping,
  ClampToEdgeWrapping,
  MirroredRepeatWrapping,
} from 'three/src/constants.js';
import { ZSTDDecoder } from './libs/zstddec';
import { ZSTDDecoderWorker } from './libs/zstddec.worker';
import type { CompressedTexture, Texture, WebGLRenderer } from 'three';
import type { GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader';
import { GLTF } from './types';
import { zstdWasm } from './libs/zstd.size';

const typeFormatMap = {
  astc: RGBA_ASTC_4x4_Format,
  etc1: RGB_ETC1_Format,
  bc7: RGBA_BPTC_Format,
  dxt: {
    0: RGB_S3TC_DXT1_Format,
    1: RGBA_S3TC_DXT5_Format,
  },
  pvrtc: {
    0: RGB_PVRTC_4BPPV1_Format,
    1: RGBA_PVRTC_4BPPV1_Format,
  },
};

const WEBGL_WRAPPINGS = {
  33071: ClampToEdgeWrapping,
  33648: MirroredRepeatWrapping,
  10497: RepeatWrapping,
};

type TEXTURE_TYPE = keyof typeof typeFormatMap;
type TEXTURE_INFO = {
  size: number;
  supported: boolean;
};
type DECODE_TYPE = 'zstd-worker' | 'zstd-ui' | 'none';
type STRATEGY_INFO = {
  [k in TEXTURE_TYPE]: TEXTURE_INFO;
};
type STRATEGY = (
  info: STRATEGY_INFO,
  extensionDef: any,
  gltf: GLTF,
  extName: string,
  state: any,
) => {
  textureType: TEXTURE_TYPE | 'bitmap';
  decodeType: DECODE_TYPE;
};

const DEFAULT_STRATEGY: STRATEGY = (
  info: STRATEGY_INFO,
  extensionDef: any,
  gltf: GLTF,
  extName: string,
  state: any,
) => {
  // 压缩纹理数量大于等于4时在worker decode TODO: 小图片也在UI线程decode
  if (state.compressedTextureNum === undefined) {
    state.compressedTextureNum = gltf.textures.filter(
      tex => !!tex.extensions?.[extName],
    ).length;
  }
  // 压缩纹理大小升序，并且大小少于bitmap的2倍
  const typeSizeAsc = Object.keys(info)
    .filter(
      key =>
        info[key].supported &&
        info[key].size > 0 &&
        info[key].size < extensionDef.bitmapByteLength * 2,
    )
    .sort((a, b) => info[a].size - info[b].size);

  return {
    textureType: (typeSizeAsc[0] as TEXTURE_TYPE) || 'bitmap',
    decodeType: state.compressedTextureNum >= 4 ? 'zstd-worker' : 'zstd-ui',
  };
};

export class GLTFGPUCompressedTexture {
  name: string;
  parser: GLTFParser;
  zstd: any;
  zstdWorker: any;
  supportInfo: {
    [k in keyof typeof typeFormatMap]: boolean;
  };

  static DEFAULT_STRATEGY = DEFAULT_STRATEGY;
  CompressedTexture: CompressedTexture;
  loadStrategy: STRATEGY;
  loadStrategyState: any;

  constructor({
    parser,
    renderer,
    pool = 4,
    loadStrategy = DEFAULT_STRATEGY,
    CompressedTexture,
  }: {
    parser: GLTFParser;
    renderer: WebGLRenderer;
    pool: number;
    CompressedTexture: CompressedTexture;
    loadStrategy: STRATEGY;
  }) {
    this.name = 'EXT_gpu_compressed_texture';
    this.parser = parser;
    this.CompressedTexture = CompressedTexture;
    this.detectSupport(renderer);
    this.zstd = new ZSTDDecoder();
    this.zstdWorker = new ZSTDDecoderWorker(zstdWasm, pool);
    this.loadStrategy = loadStrategy;
    this.loadStrategyState = {};
  }

  detectSupport(renderer: WebGLRenderer) {
    this.supportInfo = {
      pvrtc:
        renderer.extensions.has('WEBGL_compressed_texture_pvrtc') ||
        renderer.extensions.has('WEBKIT_WEBGL_compressed_texture_pvrtc'),
      dxt: renderer.extensions.has('WEBGL_compressed_texture_s3tc'),
      astc: renderer.extensions.has('WEBGL_compressed_texture_astc'),
      bc7: renderer.extensions.has('EXT_texture_compression_bptc'),
      etc1: renderer.extensions.has('WEBGL_compressed_texture_etc1'),
      // etc2: renderer.extensions.has('WEBGL_compressed_texture_etc'),
    };
  }

  async initDecoder(compress: number, decodeType: DECODE_TYPE) {
    if (compress === 1 && decodeType !== 'none') {
      await (decodeType === 'zstd-worker'
        ? this.zstdWorker.init()
        : this.zstd.init());
      return decodeType === 'zstd-worker' ? this.zstdWorker : this.zstd;
    }
  }

  getBufferSize = (bufferIndex: number) => {
    const bufferDef = this.parser.json.buffers[bufferIndex];
    return bufferDef ? bufferDef.byteLength : -1;
  };

  async loadTexture(textureIndex: number): Promise<Texture> {
    const { parser, name, supportInfo, getBufferSize } = this;
    const json = parser.json;
    const textureDef = json.textures[textureIndex];

    if (!textureDef.extensions || !textureDef.extensions[name])
      return parser.loadTexture(textureIndex);

    const extensionDef = textureDef.extensions[name];
    const { hasAlpha, compress } = extensionDef;
    // prettier-ignore
    const strategyInfo: STRATEGY_INFO = {
      astc: { supported: supportInfo.astc, size: getBufferSize(extensionDef.astc) },
      etc1: { supported: supportInfo.etc1, size: getBufferSize(extensionDef.etc1) },
      bc7: { supported: supportInfo.bc7, size: getBufferSize(extensionDef.bc7) },
      dxt: { supported: supportInfo.dxt, size: getBufferSize(extensionDef.dxt) },
      pvrtc: { supported: supportInfo.pvrtc, size: getBufferSize(extensionDef.pvrtc) },
    };
    // prettier-ignore
    const { textureType, decodeType } = this.loadStrategy(
      strategyInfo, extensionDef, json, name, this.loadStrategyState);

    if (textureType === 'bitmap') return parser.loadTexture(textureIndex);

    const [buffer, decoder] = await Promise.all([
      parser.getDependency('buffer', extensionDef[textureType]),
      this.initDecoder(compress, decodeType),
    ]);
    const header = new Uint32Array(buffer, 0, 4);
    const [width, height, levels, dataLen] = header;
    const offsets = new Uint32Array(buffer, header.byteLength, levels);
    const dataOffset = header.byteLength + offsets.byteLength;
    const totalLen = dataOffset + dataLen;
    let bufferData = new Uint8Array(buffer);

    if (decoder) {
      // const t = performance.now()
      const input = Uint8Array.from(new Uint8Array(buffer, dataOffset));
      const output = await decoder.decode(input, dataLen);
      bufferData = new Uint8Array(totalLen);
      bufferData.set(output, dataOffset);
      // console.log('zstd decode cost', performance.now() - t, decodeType)
    }

    const mipmaps = [];
    let offsetPre = dataOffset;
    for (let i = 0; i < levels; i++) {
      mipmaps.push({
        data: new Uint8Array(
          bufferData.buffer,
          offsetPre,
          offsets[i] - offsetPre,
        ),
        width: ~~(width / 2 ** i),
        height: ~~(height / 2 ** i),
      });
      offsetPre = offsets[i];
    }
    const format =
      typeof typeFormatMap[textureType] == 'number'
        ? typeFormatMap[textureType]
        : typeFormatMap[textureType][hasAlpha];
    // @ts-ignore
    const texture = new this.CompressedTexture(
      mipmaps,
      width,
      height,
      format,
      UnsignedByteType,
    );
    if (textureDef.name) texture.name = textureDef.name;

    const samplers = json.samplers || {};
    const sampler = samplers[textureDef.sampler] || {};
    texture.wrapS = WEBGL_WRAPPINGS[sampler.wrapS] || RepeatWrapping;
    texture.wrapT = WEBGL_WRAPPINGS[sampler.wrapT] || RepeatWrapping;
    texture.minFilter =
      mipmaps.length === 1 ? LinearFilter : LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;

    parser.associations.set(texture, {
      type: 'textures',
      index: textureIndex,
    });
    return texture;
  }

  dispose() {
    this.zstdWorker.dispose();
  }
}
