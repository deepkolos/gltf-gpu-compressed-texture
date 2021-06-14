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
import { ZSTDDecoder, wasm } from './libs/zstddec';
import { ZSTDDecoderWorker } from './libs/zstddec.worker';
import type { CompressedTexture, Texture, WebGLRenderer } from 'three';
import type { GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader';
import { GLTF } from './types';

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

export class GLTFGPUCompressedTexture {
  name: string;
  parser: GLTFParser;
  zstd: any;
  zstdWorker: any;
  supportInfo: {
    astc: boolean;
    bc7: boolean;
    dxt: boolean;
    etc1: boolean;
    etc2: boolean;
    pvrtc: boolean;
  };
  deps: {
    CompressedTexture: CompressedTexture;
  };

  static preferUseWorker = true;
  compressedTextureNum?: number;

  constructor(
    parser: GLTFParser,
    renderer: WebGLRenderer,
    deps: {
      CompressedTexture: CompressedTexture;
    },
  ) {
    this.name = 'EXT_gpu_compressed_texture';
    this.parser = parser;
    this.deps = deps;
    this.detectSupport(renderer);
    this.zstd = new ZSTDDecoder();
    this.zstdWorker = new ZSTDDecoderWorker(wasm);
  }

  detectSupport(renderer: WebGLRenderer) {
    this.supportInfo = {
      astc: renderer.extensions.has('WEBGL_compressed_texture_astc'),
      bc7: renderer.extensions.has('EXT_texture_compression_bptc'),
      dxt: renderer.extensions.has('WEBGL_compressed_texture_s3tc'),
      etc1: renderer.extensions.has('WEBGL_compressed_texture_etc1'),
      etc2: renderer.extensions.has('WEBGL_compressed_texture_etc'),
      pvrtc:
        renderer.extensions.has('WEBGL_compressed_texture_pvrtc') ||
        renderer.extensions.has('WEBKIT_WEBGL_compressed_texture_pvrtc'),
    };
  }

  async initDecoder(compress: number) {
    if (compress === 1) {
      const useWorker = this.shouldUseWorker();
      await (useWorker ? this.zstdWorker.init() : this.zstd.init());
      return useWorker ? this.zstdWorker : this.zstd;
    }
  }

  shouldUseWorker(): boolean {
    if (this.compressedTextureNum === undefined) {
      const { parser, name } = this;
      const json: GLTF = parser.json;
      this.compressedTextureNum = json.textures.filter(
        tex => !!tex.extensions?.[name],
      ).length;
    }

    return (
      GLTFGPUCompressedTexture.preferUseWorker && this.compressedTextureNum >= 4
    );
  }

  async loadTexture(textureIndex: number): Promise<Texture> {
    const { parser, name } = this;
    const json = parser.json;
    const textureDef = json.textures[textureIndex];

    if (!textureDef.extensions || !textureDef.extensions[name])
      return parser.loadTexture(textureIndex);

    const extensionDef = textureDef.extensions[name];
    const { hasAlpha, compress } = extensionDef;

    for (let type in this.supportInfo) {
      if (this.supportInfo[type] && extensionDef[type] !== undefined) {
        const [buffer, decoder] = await Promise.all([
          parser.getDependency('buffer', extensionDef[type]),
          this.initDecoder(compress),
        ]);
        const header = new Uint32Array(buffer, 0, 4);
        const [width, height, levels, dataLen] = header;
        const offsets = new Uint32Array(buffer, header.byteLength, levels);
        const dataOffset = header.byteLength + offsets.byteLength;
        const totalLen = dataOffset + dataLen;
        let bufferData = new Uint8Array(buffer);

        if (decoder) {
          const input = Uint8Array.from(new Uint8Array(buffer, dataOffset));
          const output = await decoder.decode(input, dataLen);
          bufferData = new Uint8Array(totalLen);
          bufferData.set(output, dataOffset);
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
          typeof typeFormatMap[type] == 'number'
            ? typeFormatMap[type]
            : typeFormatMap[type][hasAlpha];
        // @ts-ignore
        const texture = new this.deps.CompressedTexture(
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
    }

    // 降级为 PNG/JPEG.
    return parser.loadTexture(textureIndex);
  }

  dispose() {
    this.zstdWorker.dispose();
  }
}
