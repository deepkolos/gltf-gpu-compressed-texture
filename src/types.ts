interface TextureDef {
  sampler: number;
  source: number;
  extensions?: { [key: string]: any };
}

interface ImageDef {
  mimeType: string;
  name: string;
  uri: string;
}

interface BufferDef {
  name: string;
  byteLength: number;
  uri: string;
}

interface TextureRef {
  index: number;
  texCoord: number;
}

interface MaterialDef {
  alphaMode?: string;
  name: string;
  normalTexture?: TextureRef;
  emissiveTexture?: TextureRef;
  occlusionTexture?: TextureRef;
  pbrMetallicRoughness?: {
    baseColorTexture: TextureRef;
    metallicFactor: number;
    roughnessFactor: number;
    baseColorFactor: [number, number, number, number];
  };
  emissiveFactor: [number, number, number];
  doubleSided: boolean;
  extensions?: {
    KHR_materials_pbrSpecularGlossiness?: {
      diffuseTexture?: TextureRef;
    };
    KHR_materials_specular?: {
      specularColorTexture?: TextureRef;
    };
    KHR_materials_sheen?: {
      sheenColorTexture?: TextureRef;
    };
  };
}

export interface GLTF {
  textures: Array<TextureDef>;
  images: Array<ImageDef>;
  buffers: Array<BufferDef>;
  materials: Array<MaterialDef>;
}

export interface ZSTDSimple {
  compress: (input: Uint8Array, compressionLevel: number) => Uint8Array;
  decompress: (input: Uint8Array) => Uint8Array;
}

export interface ZSTDI {
  Simple: {
    new (): ZSTDSimple;
  };
}
