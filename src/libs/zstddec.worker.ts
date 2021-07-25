import { WorkerPool } from './worker-pool';

function createWorkerSourceUrl(fn: Function) {
  const fnStr = fn.toString();
  return URL.createObjectURL(
    new Blob([fnStr.substring(fnStr.indexOf('{') + 1, fnStr.lastIndexOf('}'))]),
  );
}

export class ZSTDDecoderWorker {
  workerPool: WorkerPool;
  wasmBufferPromise: Promise<ArrayBuffer>;
  workerSourceUrl: string;
  initPromise: Promise<void>;

  static Worker() {
    let instance: {
        exports: {
          memory: { buffer: Iterable<number> };
          malloc: (arg0: any) => any;
          ZSTD_findDecompressedSize: (arg0: any, arg1: any) => any;
          ZSTD_decompress: (arg0: any, arg1: any, arg2: any, arg3: any) => any;
          free: (arg0: any) => void;
        };
      },
      heap: Uint8Array;

    let initPromiseResolve: (e: any) => void;
    let initPromise = new Promise<void>(resolve => {
      initPromiseResolve = e => {
        instance = e.instance;
        importObject.env.emscripten_notify_memory_growth(0);
        resolve();
      };
    });

    const importObject = {
      env: {
        emscripten_notify_memory_growth: function (index) {
          heap = new Uint8Array(instance.exports.memory.buffer);
        },
      },
    };

    self.addEventListener('message', e => {
      switch (e.data.type) {
        case 'init':
          WebAssembly.instantiate(e.data.wasmBuffer, importObject).then(
            initPromiseResolve,
          );
          break;
        case 'decode':
          initPromise.then(() => {
            const t = performance.now();
            // Write compressed data into WASM memory.
            let { array, uncompressedSize } = e.data;
            const compressedSize = array.byteLength;
            const compressedPtr = instance.exports.malloc(compressedSize);
            heap.set(array, compressedPtr);

            // Decompress into WASM memory.
            uncompressedSize =
              uncompressedSize ||
              Number(
                instance.exports.ZSTD_findDecompressedSize(
                  compressedPtr,
                  compressedSize,
                ),
              );
            const uncompressedPtr = instance.exports.malloc(uncompressedSize);
            const actualSize = instance.exports.ZSTD_decompress(
              uncompressedPtr,
              uncompressedSize,
              compressedPtr,
              compressedSize,
            );

            // Read decompressed data and free WASM memory.
            const dec = heap.slice(
              uncompressedPtr,
              uncompressedPtr + actualSize,
            );
            instance.exports.free(compressedPtr);
            instance.exports.free(uncompressedPtr);

            // console.log('worker decode cost', performance.now() - t);
            // @ts-ignore
            self.postMessage({ dec, t: performance.now() - t }, [dec.buffer]);
          });
          break;
      }
    });
  }

  constructor(wasm: string, pool = 5) {
    this.workerPool = new WorkerPool(pool);
    this.wasmBufferPromise = fetch('data:application/wasm;base64,' + wasm).then(
      response => response.arrayBuffer(),
    );
    this.workerSourceUrl = createWorkerSourceUrl(ZSTDDecoderWorker.Worker);
    this.initPromise = null;
  }

  init() {
    if (!this.initPromise)
      this.initPromise = Promise.resolve(this.wasmBufferPromise).then(
        wasmBuffer => {
          this.workerPool.setWorkerCreator(() => {
            const worker = new Worker(this.workerSourceUrl);
            const wasmBufferCopy = wasmBuffer.slice(0);
            worker.postMessage({ type: 'init', wasmBuffer: wasmBufferCopy }, [
              wasmBufferCopy,
            ]);
            return worker;
          });
        },
      );

    return this.initPromise;
  }

  decode(array: Uint8Array, uncompressedSize = 0): Promise<Uint8Array> {
    return this.workerPool
      .postMessage({ type: 'decode', array, uncompressedSize }, [array.buffer])
      .then(e => e.data.dec);
  }

  dispose() {
    URL.revokeObjectURL(this.workerSourceUrl);
    this.workerPool.dispose();
  }
}
