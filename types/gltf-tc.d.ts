import * as three from 'three';
import { CompressedTexture, WebGLRenderer, Texture } from 'three';
import { GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader';

interface TextureDef {
    sampler: number;
    source: number;
    extensions?: {
        [key: string]: any;
    };
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
interface GLTF {
    textures: Array<TextureDef>;
    images: Array<ImageDef>;
    buffers: Array<BufferDef>;
    materials: Array<MaterialDef>;
}

declare const typeFormatMap: {
    astc: three.CompressedPixelFormat;
    etc1: three.CompressedPixelFormat;
    bc7: three.CompressedPixelFormat;
    dxt: {
        0: three.CompressedPixelFormat;
        1: three.CompressedPixelFormat;
    };
    pvrtc: {
        0: three.CompressedPixelFormat;
        1: three.CompressedPixelFormat;
    };
};
declare type TEXTURE_TYPE = keyof typeof typeFormatMap;
declare type TEXTURE_INFO = {
    size: number;
    supported: boolean;
};
declare type DECODE_TYPE = 'zstd-worker' | 'zstd-ui' | 'none';
declare type STRATEGY_INFO = {
    [k in TEXTURE_TYPE]: TEXTURE_INFO;
};
declare type STRATEGY = (info: STRATEGY_INFO, extensionDef: any, gltf: GLTF, extName: string, state: any) => {
    textureType: TEXTURE_TYPE | 'bitmap';
    decodeType: DECODE_TYPE;
};
declare class GLTFGPUCompressedTexture {
    name: string;
    parser: GLTFParser;
    zstd: any;
    zstdWorker: any;
    supportInfo: {
        [k in keyof typeof typeFormatMap]: boolean;
    };
    static DEFAULT_STRATEGY: STRATEGY;
    CompressedTexture: CompressedTexture;
    loadStrategy: STRATEGY;
    loadStrategyState: any;
    constructor({ parser, renderer, pool, loadStrategy, CompressedTexture, }: {
        parser: GLTFParser;
        renderer: WebGLRenderer;
        pool: number;
        CompressedTexture: CompressedTexture;
        loadStrategy: STRATEGY;
    });
    detectSupport(renderer: WebGLRenderer): void;
    initDecoder(compress: number, decodeType: DECODE_TYPE): Promise<any>;
    getBufferSize: (bufferIndex: number) => any;
    loadTexture(textureIndex: number): Promise<Texture>;
    dispose(): void;
}

export { GLTFGPUCompressedTexture };
