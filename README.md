# WaterClip

WaterClip 是面向多乐器合奏视频的单页分镜编排工具。它将乐谱、MIDI 试听、声部 Mute/Solo、多声部框选、分屏故事板、GPT 示意图和 XLSX 通告表放进同一个“导演谱台”。

## 快速开始

要求 Node.js 22+ 与 MuseScore Studio 4。

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`。服务会自动探测 `C:\Program Files\MuseScore 4\bin\MuseScore4.exe`，也可使用 `MUSESCORE_PATH` 指定其他安装位置。

## 使用流程

1. 导入 `.mscz`、`.musicxml`、`.xml` 或 `.mxl` 乐谱。
2. 播放或拖动播放位置，在右侧对声部执行 Mute/Solo。
3. 在谱面拖拽框选一个或多个声部及连续小节，按 Enter 创建分镜组。
4. 设置各子镜头的景别、描述、参考图和分屏布局；同一区间可重复建组用于补拍。
5. 在设置中填写 Base URL 与 API Key 后，按子镜头生成 `1280×720` 示意图。
6. 导出 `.waterclip` 项目包，或导出五列且含图的 XLSX 演奏通告表。

左侧分镜属性、右侧声部监听和底部故事板均可折叠；窄屏会改为纵向堆叠，乐谱保留独立滚动区域。

## 验证与生产运行

```bash
npm test
npm run typecheck
npm run build
npm start
```

`npm start` 由 Fastify 在 `http://127.0.0.1:4174` 同源提供构建后的 SPA 与 API。

根目录的 `example.mscz` 仅供本机手动验收，已加入 `.gitignore`，不得上传或提交。自动测试使用仓库内自建的最小 MusicXML 夹具。
