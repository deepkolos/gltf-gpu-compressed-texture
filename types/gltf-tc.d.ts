import type { CompressedTexture, WebGLRenderer } from 'three';
import type { GLTFParser, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

type TEXTURE_TYPE = 'astc' | 'etc1' | 'bc7' | 'dxt' | 'pvrtc';
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

export class GLTFGPUCompressedTexture {
  constructor(cfg: {
    parser: GLTFParser;
    renderer: WebGLRenderer;
    CompressedTexture: CompressedTexture;
    pool: number;
    loadStrategy: STRATEGY;
  });

  dispose(): void;
}
