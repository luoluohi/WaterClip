# WaterClip 开源前审计

审计日期：2026-08-16
审计对象：WaterClip 0.1.0 完整源码仓库及其 Windows x64 便携发行物。

## 审计范围说明

本仓库包含完整 WaterClip TypeScript/React 源码、Node.js 本地服务、测试、依赖锁文件和发行构建脚本。本报告同时核对源码、生成的浏览器构建产物、随包 MuseScore、音源、许可证和启动脚本；GitHub Release 中的便携包不能替代本源码仓库。

## 本次已检查

- 本地服务默认绑定 `127.0.0.1`，并拒绝不同 Host 的浏览器 Origin。
- 图像和 LLM API Key 仅由同源浏览器请求发送；服务端不持久化请求正文或密钥。
- `.waterclip` 导出会递归移除名称匹配 API Key 的设置字段。
- 乐谱上传限制为 50 MB；MuseScore 子进程使用参数数组、受控临时目录、超时和固定可执行文件发现逻辑，没有 shell 字符串拼接。
- 用户不可再从设置或查询参数指定 MuseScore 路径；MSCZ 转换和 PDF 导出只使用启动器配置的随包 CLI 或受控自动发现结果。
- 分屏乐谱弹窗、BroadcastChannel 同步、第二套乐谱渲染器和相关按钮/样式已移除，避免重复渲染与播放状态广播。
- `.waterclip` 保持 ZIP 容器，只写入当前分镜实际引用的图片，并对较大图片做导出时缩放/JPEG 优化，使用 Deflate level 9；导入仍验证 manifest、版本和必需文件。
- XLSX 图片在嵌入前按 384 x 216 预览尺寸压缩；同一资产 ID 只写入工作簿一次。
- PDF 导出使用 MuseScore 官方页码页眉：偶数页左上角、奇数页右上角，仅保留页码，不写入 WaterClip、临时文件名或 `Full Score` 等额外文字；导出文件名使用“制片标记谱”。
- 设置面板显示 WaterClip 版本；工程名支持原位重命名。
- 普通入口已改为 `点我开始.bat`；诊断入口 `WaterClip-console.cmd` 和停止脚本继续保留。
- 未发现 `.env`、私钥或常见 API token。验收乐谱、项目、展开数据、日志和 PID 均不进入 Git 或公开 Release 归档。

## 真实项目验收结果

使用桌面 `snezhnaya.waterclip`（50 个声部、109 个分镜组、220 个子镜头）完成浏览器端回归：

- 项目可打开，64 个当前引用图片均可恢复显示。
- 最新回归导出的项目包为 10,240,246 字节，包含 64 张当前引用图片；此前未清理孤立图片、未缩放压缩的样本为 329,827,535 字节，体积下降约 96.9%。
- 最新 UI 回归导出的 XLSX 为 860,023 字节；测试中新粘贴的图片计入后共有 65 个去重媒体文件。
- 制片总谱 PDF 共 23 页；MuseScore 官方页码从第 2 页开始按偶数页左侧、奇数页右侧显示，文本提取未发现 `waterclip`、`waterclip-score` 或 `Full Score`。
- 粘贴事件和“粘贴剪贴板”按钮都能立即显示分镜参考图；“仅参考图”和“仅描述”分别应用到 5 个同乐器、同景别分镜时互不覆盖另一字段。

## 第三方组件与许可证材料

- MuseScore Studio 4.7.4（Build 7688c00）：GPL-3.0，见 `licenses/MuseScore-GPL-3.0.txt`。
- MuseScore 对应版本与源码地址：见 `corresponding-source/MUSESCORE-SOURCE.txt`。
- Node.js：见 `licenses/Node.js-LICENSE.txt`。
- React、alphaTab、ExcelJS、Fastify、pdf-lib、fflate、Lucide 等 npm 组件：见 `licenses/NPM-THIRD-PARTY-NOTICES.md`。
- Bravura、Sonivox、MS Basic SoundFont 等：见 `licenses/THIRD-PARTY-NOTICES.md`、`licenses/MuseScore-MS-Basic-SoundFont.md` 和资源目录内许可证。

WaterClip 自身采用 GPL-3.0-only。WaterClip 与 MuseScore 通过命令行和临时文件交互，作为独立程序聚合分发；MuseScore 的 GPLv3 权利和对应源码义务仍须单独满足。

### GPL-3.0-only 合规核对

- WaterClip 根目录 `LICENSE` 是 GNU GPL v3.0 的完整原文，未混入 MuseScore 的 Freefont exception 或其他项目专属条款。
- 随包 MuseScore 4.7.4 作为独立可执行程序通过命令行调用，未与 WaterClip JavaScript/Node.js 代码链接或合并；当前分发形态属于聚合分发，WaterClip 自身可单独采用 GPL-3.0-only。
- `licenses/MuseScore-GPL-3.0.txt` 保留 MuseScore 的版权、GPLv3 和字体例外说明；`corresponding-source/MUSESCORE-SOURCE.txt` 锁定了与二进制 Build 7688c00 对应的官方 tag 和源码归档地址。
- 完整的 `MuseScore-4.7.4-source.zip` 已通过 ZIP 结构校验，SHA-256 已记录在 `SHA256SUMS.txt`。
- WaterClip 源码仓库和发行物均声明 GPL-3.0-only；第三方组件继续适用各自许可证。

## 许可证与资产记录

- WaterClip 根目录使用 GPL-3.0-only，完整条款位于 `LICENSE`。
- Release 资产包含与 MuseScore 4.7.4 二进制对应的源码 ZIP、许可证和 SHA-256 校验和。
- `BUILD-INFO.json` 记录源码提交、MuseScore 构建号和源码归档状态；`SOURCE-REPOSITORY.txt` 记录公开仓库和构建提交。
- 便携包未签名；Windows SmartScreen 可能显示未识别发布者提示。

## 源码仓库检查结果

已在完整源码仓库中执行：

```powershell
npm ci
npm audit --omit=dev --registry=https://registry.npmjs.org
npm test
npm run typecheck
npm run build
```

本次验收还覆盖：

- 在干净 Windows 用户环境测试首次启动、重复启动与停止。
- 分别导入 MSCZ、MusicXML、XML、MXL。
- 验证播放、框选、撤销/重做、分镜图片、项目保存/恢复。
- 用重复大图比较优化前后的 `.waterclip` 和 XLSX 体积，并确认图片可见。
- 导出多页制片总谱 PDF，确认官方页码存在、无 WaterClip 或临时文件名等额外页眉文字，且标记位置正确。
- 检查便携包不包含 npm 缓存、开发依赖、用户数据和密钥。
- 明确排除 `runtime/snezhnaya-debug`、`runtime/snezhnaya-mscx`、日志、PID 和所有验收导出物。
- 为最终 Release 归档生成并发布 SHA-256。

## 当前发布结论

完整源码仓库、GPL-3.0-only 根许可证、源码侧测试、开源审计、Windows 便携包和 MuseScore 4.7.4 对应源码资产均已就绪。
