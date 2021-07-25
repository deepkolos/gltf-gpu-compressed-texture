import type { CompressedTexture, WebGLRenderer } from 'three';
import type { GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader';

export class GLTFGPUCompressedTexture {
  constructor(cfg: {
    parser: GLTFParser;
    renderer: WebGLRenderer;
    CompressedTexture: CompressedTexture;
    pool: number;
  });

  dispose(): void;
}
