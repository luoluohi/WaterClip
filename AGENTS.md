# WaterClip Project Instructions

## Language and product

- 用户界面、错误提示、项目文档默认使用简体中文。
- WaterClip 是面向多乐器合奏视频的桌面优先单页分镜编排工具。
- 不要把 API Key、项目图片、用户乐谱或临时转换文件提交到 Git。

## Tool environment

- 根目录 `example.mscz` 是用户提供的本机验收文件：只能在本机转换/渲染，不得上传、复制到测试夹具或提交到 Git。

- Node.js: `v24.18.0`（项目最低要求 Node.js 22）。
- npm: `11.16.0`，使用根目录 npm workspaces；不要混用其他包管理器。
- Git: `2.55.0.windows.3`。
- MuseScore Studio 4: `C:\Program Files\MuseScore 4\bin\MuseScore4.exe`。
- 可通过 `MUSESCORE_PATH` 覆盖 MuseScore 路径；服务端不得把上述绝对路径当成其他平台的唯一选择。

## Architecture boundaries

- `apps/web/src/domain`: 纯领域模型与规则，不访问 DOM、网络或 IndexedDB。
- `apps/web/src/data`、`apps/web/src/export`: 持久化、项目包和 XLSX 适配器。
- `apps/web/src/score`: alphaTab 渲染/播放适配器；像素坐标不得进入持久化领域模型。
- `apps/web/src/components`: UI 组件；跨区状态通过集中 Store 调用领域函数。
- `apps/server`: 仅负责 MuseScore 转换、同源静态服务和 GPT Image 代理；不得持久化或记录 API Key。

## Commands and verification

- 开发：`npm run dev`
- 单元/集成测试：`npm test`
- 类型检查：`npm run typecheck`
- 生产构建：`npm run build`
- 功能变更必须增加有意义测试；UI 改动完成后至少检查 1440px、1280px 和窄屏布局。

## Git and plans

- 计划实施期间以 `.agent-work/PLAN.md` 为准；完成后归档到 `.agent-work/PLANS/{YYYYMMDD-HHMM}.md`。
- 使用小而可回滚的提交；不推送、不创建 PR，除非用户明确要求。
- 保留用户未要求移除的工作，不使用 `git reset --hard` 或破坏性清理。
