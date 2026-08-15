# 开发环境与工具

## 已验证环境

| 工具 | 当前版本/位置 | 用途 |
| --- | --- | --- |
| Node.js | `v24.18.0`（最低要求 22） | 构建与本地服务 |
| npm | `11.16.0` | workspaces 与依赖管理 |
| Git | `2.55.0.windows.3` | 版本维护 |
| MuseScore Studio 4 | `C:\Program Files\MuseScore 4\bin\MuseScore4.exe`，4.7.4 | MSCZ 转 MusicXML |

MuseScore 探测顺序为设置面板本次请求路径、`MUSESCORE_PATH`、Windows 常见安装路径、`PATH`。`GET /api/health` 返回当前路径、版本和转换能力；显式路径必须是绝对路径、已知 MuseScore 文件名且能确认主版本为 4。

## 本地端口

- Vite：`http://localhost:5173`
- Fastify API：`http://127.0.0.1:4174`
- 开发时 Vite 将 `/api` 代理到 Fastify；构建后由 Fastify 同源提供 SPA 与 API。

## 数据与安全

- API Key 只按用户选择写入浏览器本地设置，不进入 `.waterclip`、XLSX、日志或服务端文件。
- 图片代理只接受 HTTP(S) Base URL，并固定模型、尺寸、质量与输出格式。
- `example.mscz` 及其本地转换产物只用于手动验收，均被 Git 忽略，不得传往外部服务。
- 自动测试不会调用真实 GPT 接口；图片请求由本地桩响应。

## 已完成的本机验收

- `example.mscz`（约 2.6 MB）经 MuseScore 4.7.4 转换为 7.9 MB MusicXML，alphaTab 成功解析出 50 个声部、198 小节和 13 个自带乐段起点。
- 1440×900 与 1280×720 无横向溢出；768×900 使用纵向堆叠，乐谱在自身容器滚动。
- 多声部跨小节框选创建多属性分镜组、面板折叠、Mute/Solo、反复遍次与 XLSX 导出均通过浏览器检查。
- 2026-08-11 回归门禁：服务端 18 项、前端 37 项测试全部通过，类型检查与生产构建通过；生产构建正确产出 alphaTab worker/worklet 文件。
- 2026-08-12 回归门禁：服务端 27 项、前端 52 项测试全部通过；`example.mscz` 在 Canvas/Worker 模式识别 50 个声部与 198 个悬浮小节标签，播放器达到 ready，1280×720 页面无外层溢出。
- 当前自动化通道无法连接用户的 Edge，因此新一轮逐像素 UI 与实际发声仍需在已启用浏览器扩展的 Edge 中人工确认；代码级 MIDI 就绪排队、seek、翻页、布局坐标与 Mute/Solo 状态均有回归覆盖。

## 常用命令

```text
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm start
npm run audit:open-source
npm run release:portable
```

`release:portable` 只在 Windows 发布构建机执行，默认复制 `C:\Program Files\MuseScore 4` 并附带精确版本的 MuseScore GPLv3 对应源码归档。生成物位于被 Git 忽略的 `release/`，不得把本机验收乐谱或 API Key 放入该目录。
