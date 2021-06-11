type enableFn = (enable: boolean) => void;

export interface BasisEncoder {
  new (): {
    setSliceSourceImage: (
      index: number,
      data: Uint8Array,
      a: number,
      b: number,
      c: boolean,
    ) => void;
    setDebug: enableFn;
    setComputeStats: enableFn;
    setPerceptual: enableFn;
    setMipSRGB: enableFn;
    setMipGen: enableFn;
    setQualityLevel: (n: number) => void;
    setUASTC: enableFn;

    encode: (output: Uint8Array) => number;
    delete: () => void;
  };
}

export interface BasisFile {
  new (data: Uint8Array): {
    getImageWidth: (a: number, b: number) => number;
    getImageHeight: (a: number, b: number) => number;
    getNumImages: () => number;
    getNumLevels: (a: number) => number;
    getHasAlpha: () => number;
    getFileDesc: () => {
      version: string;
      usPerFrame: number;
      totalImages: number;
      userdata0: number;
      userdata1: number;
      texFormat: number;
      yFlipped: boolean;
      hasAlphaSlices: boolean;
      numEndpoints: number;
      endpointPaletteOfs: number;
      endpointPaletteLen: number;
      numSelectors: number;
      selectorPaletteOfs: number;
      selectorPaletteLen: number;
      tablesOfs: number;
      tablesLen: number;
    };
    getImageDesc: (n: number) => {
      origWidth: number;
      origHeight: number;
      numBlocksX: number;
      numBlocksY: number;
      numLevels: number;
      alphaFlag: boolean;
      iframeFlag: boolean;
    };
    getImageLevelDesc: (
      imgIndex: number,
      levelIndex: number,
    ) => {
      rgbFileOfs: number;
      rgbFileLen: number;
      alphaFileOfs: number;
      alphaFileLen: number;
    };
    getImageTranscodedSizeInBytes: (
      imgIndex: number,
      levelIndex: number,
      format: number,
    ) => number;
    transcodeImage: (
      dst: Uint8Array,
      a: number,
      b: number,
      format: number,
      c: number,
      d: number,
    ) => number;
    startTranscoding: () => boolean;
    close: () => void;
    delete: () => void;
  };
}

export interface IBASIS {
  BasisFile: BasisFile;
  BasisEncoder: BasisEncoder;
  initializeBasis: () => void;
  formatIsUncompressed: (format: number) => boolean;
  // encodeBasisTexture;
}

interface Args {}

type BASISType = (args?: Args) => Promise<IBASIS>;

export const BASIS: BASISType;

export default BASIS;
