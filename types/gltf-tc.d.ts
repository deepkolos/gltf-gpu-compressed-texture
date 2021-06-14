import type { CompressedTexture, WebGLRenderer } from 'three';
import type { GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader';

export default class GLTFGPUCompressedTexture {
  constructor(
    parser: GLTFParser,
    renderer: WebGLRenderer,
    deps: {
      CompressedTexture: CompressedTexture;
    },
  );

  dispose(): void;
}
