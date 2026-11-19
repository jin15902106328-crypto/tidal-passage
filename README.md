# 双星潮汐 · Tidal Passage

两座星系擦肩而过，星尘在它们之间架起一座桥。

一段二十秒的星系近掠：可以看完成片，也可以自己驾驶视角穿过星桥。

WebGL 实时渲染，无构建步骤、无运行时依赖、无外部请求。页面、样式与脚本都是可直接阅读的明文源码。

## 体验内容

- **播放短片（00:20）**：导演镜头按「近掠 / 星桥 / 远望」三段推进，可拖动进度条、跳转章节、全屏观看。
- **自由探索**：拖动环绕双星系，滚轮或双指缩放；「回到导演镜头」可随时切回成片视角，另有「复位视角」。
- **原声开关**：默认开启，可一键静音。
- **下载影片**：整段 MP4 随仓库提供，点「下载影片」即可导出。

## 目录结构

```
tidal-passage/
├── index.html                 # 页面结构
├── css/
│   └── styles.css             # 全部样式（含 @font-face）
├── js/
│   ├── three.min.js           # three.js 的 UMD 构建（内联版，MIT）
│   ├── scene.js               # 场景：双星系、星尘、星桥与镜头
│   ├── canvas-fallback.js     # 无 WebGL 时的 Canvas 2D 兜底
│   ├── textures.js            # 贴图路径 + 两张查找表（运行时需 atob）
│   └── app.js                 # 界面状态、播放、章节、自由探索
├── assets/
│   ├── film.mp4               # 20 秒成片（22 MB）
│   ├── score.mp3              # 原声音轨
│   ├── poster-portrait.webp   # 竖版海报
│   ├── poster-landscape.webp  # 横版海报
│   ├── textures/              # warm / cold / bridge / sky 四张贴图
│   └── fonts/                 # Instrument Serif 常规与斜体
├── README.md
├── LICENSE
└── .gitignore
```

## 本地运行

直接双击 `index.html` 即可（本机 Edge 已验证贴图、字体、影片均能加载；需支持 WebGL 的现代浏览器）。

若你的浏览器对本地文件限制较严，起一个静态服务：

```bash
python -m http.server 8000
```

然后打开 `http://localhost:8000/`。

## 技术要点

- three.js 渲染星系、星尘与星桥；`createTidalScene` 用同一套 20 秒时钟驱动所有镜头，保证成片与自由探索看到的是同一个场景。
- 无 WebGL 时走 `canvas-fallback.js`，用 Canvas 2D 画出低功耗版本。
- 影片与音轨作为普通媒体文件加载，首屏不必等待整段视频下载；只有点击「播放短片」时才拉取。
- 响应式布局，适配移动端安全区与横屏；支持 `prefers-reduced-motion`；键盘焦点可见。
- 贴图与字体走相对路径，直接用 `file://` 或任意静态服务都能工作。

## 关于仓库体积

约 23 MB，其中 22 MB 是 `assets/film.mp4`。这是唯一的大文件，其余代码与图片都在可读、可 diff 的量级。

> 早期版本曾是单个 32 MB 的 HTML，把影片、贴图、海报、字体全部 base64 内嵌。那种形态便于整包转发，但 GitHub 无法渲染、克隆后也无法阅读，因此改成了现在这套源码树。

## 第三方组件与许可

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| three.js | MIT（© 2010-2023 three.js authors） | `js/three.min.js`，许可全文保留在 `index.html` 末尾 |
| Instrument Serif | SIL Open Font License 1.1 | `assets/fonts/`，许可全文保留在 `index.html` 末尾 |

## 许可

本项目以 MIT 许可证发布，见 [LICENSE](LICENSE)。Copyright © 2026 Tidal Passage authors.
