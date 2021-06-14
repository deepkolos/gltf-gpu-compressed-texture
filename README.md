# gltf-gpu-compressed-texture

一个用于 GPU 压缩纹理降级的 GLTF 扩展，以及批量 CLI 转换工具，适用于`THREE`的`GLTFLoader`，[DEMO 地址](https://deepkolos.github.io/gltf-gpu-compressed-texture/examples/index.html)

> 注：对比使用的 KTX2Loader 全部 zstd decode 是在 UI 线程，[decode in Web Worker PR](https://github.com/mrdoob/three.js/pull/21984)已提交

## 命令行使用

```sh
> npm i gltf-gpu-compressed-texture -S
# 查看帮助
> gltf-tc -h

  -h --help                                              显示帮助
  -i --input [dir] [?outdir] [?compress] [?mipmap]       把gltf所使用纹理转换为GPU压缩纹理并支持fallback

Examples:
  gltf-tc -i '../examples/glb' '../examples/zstd'
  gltf-tc -i '../examples/glb' '../examples/no-zstd' 0
  gltf-tc -i '../examples/glb' '../examples/no-mipmap' 1 false
  gltf-tc -i '../examples/glb' '../examples/no-zstd-no-mipmap' 0 false

# 执行
> gltf-tc -i '../examples/glb' '../examples/zstd'

done: 6417ms    image3.png      法线:false      sRGB: true
done: 13746ms   image2.png      法线:true       sRGB: false
done: 14245ms   image0.png      法线:false      sRGB: true
done: 14491ms   image1.png      法线:false      sRGB: false
done: 577ms     FINDI_TOUMING01_nomarl1.jpg     法线:true       sRGB: false
done: 568ms     FINDI_TOUMING01_Basecoler.png   法线:false      sRGB: true
done: 1267ms    lanse_banzi-1.jpg       法线:false      sRGB: true
done: 577ms     FINDI_TOUMING01_Basecoler.png   法线:false      sRGB: true
done: 604ms     FINDI_TOUMING01_nomarl1.jpg     法线:true       sRGB: false
done: 1280ms    lvse_banzi-1.jpg        法线:false      sRGB: true

cost: 17.75s
compress: 1, summary:
  bitmap: 11.22MB
  astc  : 7.18MB
  etc1  : 1.85MB
  bc7   : 7.16MB
  dxt   : 3.04MB
  pvrtc : 2.28MB
```

## NPM 包使用

```js
import { GLTFLoader, CompressedTexture， WebGLRenderer } from 'three-platfromzie/examples/jsm/loaders/GLTFLoader';
import GLTFGPUCompressedTexture from 'gltf-gpu-compressed-texture';

const gltfLoader = new GLTFLoader();
const renderer = new WebGLRenderer();
const scene = new Scene();

gltfLoader.register(parser => {
  return new GLTFGPUCompressedTexture(parser, renderer, {
    CompressedTexture: THREE.CompressedTexture,
  });
});

gltfLoader.loadAsync('./examples/zstd/BoomBox.gltf').then((gltf) => {
  scene.add(gltf.scene);
});
```

## TODO

0. 多线程 encode (done
1. 输出加载各压缩纹理类型体积统计 (done
2. 按一定优先级规则 GPU 压缩纹理类型
3. 支持输出 GLB 格式
4. basisu zstd 参数可自定义
5. 少图片使用 UI 线程 decode, 多图片使用 worker decode (done, 但是对于少贴图模型需要更详细规则
