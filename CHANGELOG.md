# 更新日志

## [Unreleased]

### Added

- 初始化 npm workspace、React/Vite 前端、Fastify 本地服务与 Git 维护规则。
- 支持 MusicXML/MXL 直读及 MuseScore Studio 4.7.4 的 MSCZ 转换。
- 集成 alphaTab 乐谱渲染、MIDI/SoundFont 播放、拖动 seek、声部 Mute/Solo 与框选坐标映射。
- 支持多声部 × 连续小节建组、重复补拍、反复遍次、2–16 格横/纵分屏及 2×2、3×3、4×4 宫格。
- 增加 DaVinci 风格故事板、高亮跟随、三大工作区折叠与窄屏堆叠布局。
- 增加 `gpt-image-2` 生成/编辑代理、参考图上传与剪贴板读取；固定 1280×720、medium、PNG。
- 增加 IndexedDB 自动保存、`.waterclip` 项目包往返和含图片的五列 XLSX 导出。
- 增加生产 SPA 静态托管、安全边界及 27 个领域、持久化、导出与服务回归测试。

### Fixed

- 修复 React 回调变化导致 alphaTab 在渲染前被销毁的问题。
- 修复替换乐谱后旧分镜和选区残留导致声部 ID 错配的问题。
- 修复窄屏下大型乐谱撑宽工作区、顶部操作按钮移出视口的问题。
