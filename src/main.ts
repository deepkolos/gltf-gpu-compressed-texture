import * as THREE from 'three';

const shareTestKey = [
  'mapping',
  'wrapS',
  'wrapT',
  'magFilter',
  'magFilter',
  'anisotropy',
  'format',
  'internalFormat',
  'type',
  'flipY',
  'premultiplyAlpha',
  'encoding',
];

export default class GLTFGPUCompressedTexture {
  public sharedTexture: { [k: string]: THREE.Texture } = {};

  updateSharedTexture = (node: THREE.Mesh) => {
    if (node.isMesh && node.material) {
      Object.keys(node.material).forEach(key => {
        const tex = node.material[key];
        if (tex && tex.isTexture && tex.image && tex.image.src) {
          const cacheKey =
            tex.image.src +
            shareTestKey.map((key, i) => `${i}_${tex[key]}`).join('_');
          const cacheTexture = this.sharedTexture[cacheKey];
          const canUseShareTexture =
            cacheTexture && shareTestKey.every(k => cacheTexture[k] === tex[k]);
          if (canUseShareTexture) {
            node.material[key] = cacheTexture;
          } else {
            this.sharedTexture[cacheKey] = tex;
          }
        }
      });
    }
  };

  public dispose() {
    Object.values(this.sharedTexture).forEach(tex => tex.dispose());
    this.sharedTexture = {};
  }
}
