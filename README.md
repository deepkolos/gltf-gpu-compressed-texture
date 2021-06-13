# gltf-gpu-compressed-texture

一个用于 GPU 压缩纹理降级的 GLTF 扩展，以及批量 CLI 转换工具

## 命令行使用

```sh
> npm i gltf-gpu-compressed-texture -S
> gltf-tc -i ./exmaples/glb
```

## NPM 包使用

```js
import { GLTFLoader, CompressedTexture， WebGL1Renderer } from 'three-platfromzie/examples/jsm/loaders/GLTFLoader';
import GLTFGPUCompressedTexture from 'gltf-gpu-compressed-texture';

const gltfLoader = new GLTFLoader();
const renderer = new WebGL1Renderer();
const scene = new Scene();

gltfLoader.register((parser) => {
  return new GLTFGPUCompressedTexture(parser, renderer, {
    CompressedTexture,
    ZSTDDecoder,
    ZSTDDecoderWorker
  })
});

gltfLoader.loadAsync('./examples/glb/Fendi_banzi_blue.glb').then((gltf) => {
  scene.add(gltf.scene);
});
```

## TODO

0. 多线程 encode done
1. 输出加载各压缩纹理类型体积统计 done
2. 支持输出 GLB 格式
3. basisu zstd 参数可自定义
4. 少图片使用 UI 线程 decode, 多图片使用 worker decode
