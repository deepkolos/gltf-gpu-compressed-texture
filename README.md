# gltf-gpu-compressed-texture

一个用于 GPU 压缩纹理降级的 GLTF 扩展，以及批量 CLI 转换工具，适用于`THREE`的`GLTFLoader`，[DEMO 地址](https://deepkolos.github.io/gltf-gpu-compressed-texture/examples/index.html)，[扩展定义](https://github.com/deepkolos/glTF/tree/master/extensions/2.0/Vendor/EXT_gpu_compressed_texture)

## 命令行使用

> 使用之前请确保[zstd](https://github.com/facebook/zstd/releases/)和[basisu](https://github.com/BinomialLLC/basis_universal/releases/)已经在 PATH 里面

```sh
> npm i gltf-gpu-compressed-texture -S
# 查看帮助
> gltf-tc -h

  -h --help                                                              显示帮助
  -i --input [dir] [?outdir] [?compress] [?mipmap] [?basisuArgs]         把gltf所使用纹理转换为GPU压缩纹理并支
持fallback

Examples:
  gltf-tc -i ./examples/glb ./examples/zstd
  gltf-tc -i ./examples/glb ./examples/no-zstd 0
  gltf-tc -i ./examples/glb ./examples/no-mipmap 1 false
  gltf-tc -i ./examples/glb ./examples/no-zstd-no-mipmap 0 false
  gltf-tc -i ./examples/glb ./examples/zstd 1 true "-uastc"

# 执行
> gltf-tc -i ./examples/glb ./examples/zstd

done: 9855ms    image3.png      法线:false      sRGB: true
done: 15337ms   image2.png      法线:true       sRGB: false
done: 16189ms   image0.png      法线:false      sRGB: true
done: 16894ms   image1.png      法线:false      sRGB: false
done: 600ms     FINDI_TOUMING01_nomarl1.jpg     法线:true       sRGB: false
done: 612ms     FINDI_TOUMING01_Basecoler.png   法线:false      sRGB: true
done: 1317ms    lanse_banzi-1.jpg       法线:false      sRGB: true

cost: 18.88s
compress: 1, BoomBox summary:
  bitmap: 10.53MB (0.00MB)
  astc  : 6.12MB (-4.41MB)
  bc7   : 6.08MB (-4.44MB)
  dxt   : 2.56MB (-7.97MB)
  pvrtc : 1.87MB (-8.66MB)
  etc1  : 1.41MB (-9.12MB)

compress: 1, Fendi_banzi_blue summary:
  bitmap: 0.33MB (0.00MB)
  astc  : 0.52MB (0.19MB)
  bc7   : 0.53MB (0.19MB)
  dxt   : 0.23MB (-0.10MB)
  pvrtc : 0.20MB (-0.14MB)
  etc1  : 0.21MB (-0.12MB)

Done in 19.43s.
```

> 只要设置 -comp_level 6，这个脚本就是烤机工具

## NPM 包使用

```js
import {
  GLTFLoader,
  CompressedTexture,
  WebGLRenderer,
} from 'three-platfromzie/examples/jsm/loaders/GLTFLoader';
import { GLTFGPUCompressedTexture } from 'gltf-gpu-compressed-texture';

const gltfLoader = new GLTFLoader();
const renderer = new WebGLRenderer();
const scene = new Scene();

gltfLoader.register(parser => {
  return new GLTFGPUCompressedTexture(parser, renderer, {
    CompressedTexture: THREE.CompressedTexture,
  });
});

gltfLoader.loadAsync('./examples/zstd/BoomBox.gltf').then(gltf => {
  scene.add(gltf.scene);
});
```

## 性能情况

运行环境 Chrome 93, CPU Intel I9 10900 ES 版，核显 HD630\
加载 `BC7` 格式，use ImageBitmapLoader，THREE r129，localhost，disable cache: true

| 模型       | 参数                            | load     | render  | 总耗时   | 模型大小 | 依赖大小 |
| ---------- | ------------------------------- | -------- | ------- | -------- | -------- | -------- |
| banzi_blue | gltf-tc zstd no-mimap no-worker | 36.10ms  | 1.60ms  | 37.70ms  | 506kb    | 22.3kb   |
| banzi_blue | gltf-tc no-zstd mimap no-worker | 25.80ms  | 1.50ms  | 27.30ms  | 2.2mb    | 22.3kb   |
| banzi_blue | gltf-tc zstd mimap no-worker    | 37.90ms  | 1.60ms  | 39.50ms  | 648kb    | 22.3kb   |
| banzi_blue | gltf ktx2 uastc                 | 534.70ms | 1.70ms  | 536.40ms | 684kb    | 249.3kb  |
| banzi_blue | glb                             | 32.80qms | 6.00ms  | 38.80ms  | 443kb    |          |
| banzi_blue | gltf                            | 27.70ms  | 4.90ms  | 32.60ms  | 446kb    |          |
| BoomBox    | gltf-tc zstd mipmap worker      | 153.50ms | 23.70ms | 177.20ms | 6.6mb    | 22.3kb   |
| BoomBox    | gltf-tc zstd mipmap no-worker   | 241.10ms | 9.40ms  | 250.50ms | 6.6mb    | 22.3kb   |
| BoomBox    | glb ktx2 uastc                  | 506.10ms | 9.30ms  | 515.40ms | 7.1mb    | 249.3kb  |
| BoomBox    | glb                             | 156.10ms | 89.50ms | 245.60ms | 11.3mb   |          |
| BoomBox    | gltf                            | 120.20ms | 58.80ms | 179.00ms | 11.3mb   |          |

> 由于 banzi_blue 贴图小于 4 张，所以在 UI 线程 decode zstd，因为 worker 传数据也会有不少耗时
> 对比使用的 KTX2Loader 全部 zstd decode 是在 UI 线程，[decode in Web Worker PR](https://github.com/mrdoob/three.js/pull/21984)已提交
> 依赖大小 22.3kb 是从[线上 DEMO](https://deepkolos.github.io/gltf-gpu-compressed-texture/examples/index.html) 取得，http-server --gzip 不太好使

可以明显看到相比于 KTX2+uastc 的压缩纹理方案，从加载耗时和依赖大小，有**大幅优势**，模型大小也有不少优势\
同时也可以看到 BoomBox gltf-tc zstd mipmap worker load+render 耗时，与 gltf 耗时 相差不大，但是模型大小有大幅优势

但是这些都是相对于 PNG 和压缩纹理对比，从 DamagedHelmet 可看到 jpg 的体积对比，jpg 有**十分巨大**的体积优势

```sh
compress: 1, DamagedHelmet summary:
  bitmap: 3.06MB (0.00MB)
  astc  : 11.49MB (8.42MB)
  bc7   : 11.52MB (8.46MB)
  dxt   : 5.15MB (2.09MB)
  pvrtc : 4.12MB (1.05MB)
  etc1  : 4.71MB (1.65MB)
```

MI 8 下和火狐的测试数据可以查看 [screenshots](https://github.com/deepkolos/gltf-gpu-compressed-texture/tree/main/screenshots) 目录

微信 webview 下 BoomBox 均比 glb/gltf 快，应该属于异常，chrome 下表现正常，banzi_blue 则稍慢一些，KTX2 的方案依然很慢

> 示例还有 FlightHelmetCases，但是图片资源太大，火狐 lost context, chrome render process 崩溃

## 加载策略

0. 优先使用 pvrtc，因为其体积上面与 jpg 相差不大，与 PNG 有较大优势（done
1. 无透明通道优先使用 etc1
2. 根据 bitmap 与所支持的压缩纹理格式体积比值判断是否使用压缩纹理
3. 少图片和小图片 UI 线程 decode，否则在 Worker 线程 decode（done 少图片

## TODO

0. 多进程 encode (done
1. 输出加载各压缩纹理类型体积统计 (done
2. 按一定优先级规则 GPU 压缩纹理类型 （优先 pvrtc
3. 支持输出 GLB 格式
4. basisu zstd 参数可自定义（basisu done
5. 少图片使用 UI 线程 decode, 多图片使用 worker decode （done, 但是对于少贴图模型需要更详细规则
6. 支持 ETC2 格式

### [CHANGELOG](https://github.com/deepkolos/gltf-gpu-compressed-texture/blob/master/CHANGELOG.md)

## 参考

0. [ASTC 纹理压缩格式详解](https://zhuanlan.zhihu.com/p/158740249)
1. [你所需要了解的几种纹理压缩格式原理](https://zhuanlan.zhihu.com/p/237940807)

# 赞助

如果项目对您有帮助或者有适配需求，欢迎打赏

<img src="https://upload-images.jianshu.io/upload_images/252050-d3d6bfdb1bb06ddd.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240" alt="赞赏码" width="300">
