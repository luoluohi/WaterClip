# WaterClip

WaterClip 是面向多乐器合奏视频的单页分镜编排工具。它将乐谱、MIDI 试听、声部 Mute/Solo、多声部框选、分屏故事板、GPT 示意图和 XLSX 通告表放进同一个“导演谱台”。

## 快速开始

要求 Node.js 22+ 与 MuseScore Studio 4。

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`。服务会自动探测 `C:\Program Files\MuseScore 4\bin\MuseScore4.exe`，也可使用 `MUSESCORE_PATH` 或设置面板中的“MuseScore 可执行文件”指定其他安装位置。

## 使用流程

1. 导入 `.mscz`、`.musicxml`、`.xml` 或 `.mxl` 乐谱。
2. 播放或拖动播放位置；也可单击谱面小节、点击进度条上全部 A/B/C… 乐段标记快速跳转，并在右侧或乐器铭牌下方执行 Mute/Solo。
3. 在谱面拖拽框选一个或多个声部及连续小节，按 Enter 创建分镜组。
4. 设置各子镜头的景别、描述、参考图和分屏布局；同一区间可重复建组用于补拍。
5. 在设置中分别填写图像生成与 LLM 的 Base URL/API Key；按子镜头生成 `1280×720` 示意图或用 LLM 完善描述。
6. 导出 `.waterclip` 项目包、五列含图 XLSX 演奏通告表，或带 30% 紫色分镜标记与镜头描述的 MuseScore 排版 PDF。

左侧分镜属性、右侧声部监听和底部故事板均可折叠；窄屏会改为纵向堆叠，乐谱保留独立滚动区域。

## 乐谱工作区

- 谱面使用单一横向连续布局；中央工作区提供独立的水平、垂直滚动条，不会撑开或覆盖左右面板。
- 每个乐器/声部行左侧都有悬浮铭牌及 M/S 按钮，水平浏览后续小节时仍可确认当前行归属并控制监听。
- 每个小节都有固定编号标签，乐谱左上角另显示圆形当前小节标记；青色表示框选范围，朱红表示当前播放位置。
- 设置中可选择“播放时自动整页翻谱”：只有当前视口播放完才右移，并保留上一页最后一小节。拖动顶部播放位置会同步把目标小节移入视口。
- “故事板、播放进度与谱面联动”默认开启：播放命中的故事板会自动滚到视口中央，点击故事板会同步跳到对应小节；可在设置中关闭。
- 支持 `Ctrl+Z` 撤销、`Ctrl+Shift+Z` 重做和 `Del` 删除当前分镜组；在输入控件中不会拦截原生编辑快捷键。
- `Ctrl+D` 是唯一清除框选的方式；按住 Ctrl 再拖拽可追加或反选精确的声部小节，拖到视口边缘会自动滚动。
- 播放命中的分镜声部使用紫色第三层高亮；顶部统计按钮可查看各声部覆盖小节和分镜数量。
- 工具栏可把乐谱拆分成独立窗口拖到第二块屏幕，并通过同源通道同步播放、定位、缩放及 M/S。
- 设置可选择 Canvas/Worker 增强渲染；GPU 是否实际参与合成由浏览器决定，遇到驱动兼容问题可关闭并回退 SVG。
- 播放按钮会等待 MIDI 与 SoundFont 就绪后自动开始，不会丢弃过早点击。
- 新建分镜默认近景；参考图区提供“上传参考图”和“粘贴剪贴板”并排按钮，并可用设置中的 LLM 模型辅助完善拍摄描述。
- 图像生成与 LLM 使用完全独立的 Base URL、API Key；旧版共用凭据只在首次升级时迁移，后续可分别修改。
- 框选在滚动后仍按当前可见坐标命中，松开、取消或丢失指针捕获时会立即收起选框。
- 监听电平取自 alphaTab 播放时发出的 MIDI 音符力度事件，并非装饰动画；Mute/Solo 会同步控制电平可见性。

## 验证与生产运行

```bash
npm test
npm run typecheck
npm run build
npm start
```

`npm start` 由 Fastify 在 `http://127.0.0.1:4174` 同源提供构建后的 SPA 与 API。

## Windows 便携版

发布维护者可在已安装 MuseScore Studio 4 的 Windows 构建机上运行：

```powershell
npm run release:portable
```

生成的 `release/WaterClip-0.1.0-win-x64-portable.zip` 已包含 Node.js 运行时、生产服务、构建后的前端和完整 MuseScore CLI 运行目录；最终用户无需安装 Node.js、npm 或 MuseScore。解压后双击 `WaterClip.vbs`，需要排错时使用 `WaterClip-console.cmd`。

替代后端和 GPLv3 再分发结论见 [MuseScore CLI 替代方案](docs/MUSESCORE_ALTERNATIVES.md)，审计与公开发布剩余事项见 [开源前审计](docs/OPEN_SOURCE_AUDIT.md)。WaterClip 自身的开源许可证仍须由版权所有者选择；在根许可证提交前，本仓库不能宣称已经开源。

PDF 导出由 MuseScore 同源生成矢量 PDF 和 `.mpos` 小节坐标，再由服务端使用 `pdf-lib` 叠加声部标记。服务只使用受控临时目录，完成后立即清理乐谱与中间产物。

根目录的 `example.mscz` 仅供本机手动验收，已加入 `.gitignore`，不得上传或提交。自动测试使用仓库内自建的最小 MusicXML 夹具。
