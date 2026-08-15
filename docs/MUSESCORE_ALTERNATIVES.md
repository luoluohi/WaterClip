# MuseScore CLI 替代方案与许可证结论

核查日期：2026-08-15。

## 结论

WaterClip 现有功能中，MusicXML 的交互式渲染、播放、定位和 M/S 已经由 alphaTab 在浏览器内完成；真正依赖 MuseScore Studio 4 的只有两类能力：

1. 将 `.mscz` 高保真转换为标准 MusicXML；
2. 按 MuseScore 原生排版导出 PDF 和 `.mpos` 小节坐标，再叠加分镜标记。

当前没有一个更宽松许可、成熟且可直接替换的组件同时满足 `.mscz` 4.7.x 兼容、原生排版 PDF、逐小节坐标和 Windows 稳定运行。首个用户版因此保留 MuseScore CLI，并将完整运行目录作为独立程序随便携包分发。

## 候选方案

| 方案 | `.mscz` | PDF/坐标 | 播放 | 许可证/成熟度 | 判断 |
| --- | --- | --- | --- | --- | --- |
| alphaTab | 不支持 | 可渲染但不复现 MuseScore 分页；无 `.mpos` | 已用于 WaterClip | MIT；MusicXML 支持成熟但官方统计仍有部分特性未覆盖 | 适合 MusicXML-only 版本，不能替代现有导出链 |
| Verovio | 不支持 | SVG/基础 MIDI/时间映射 | 基础 MIDI | LGPL-3.0；面向 MEI/MusicXML | 可做独立 MusicXML 渲染后端，不能直接读取 MSCZ |
| LibreScore webmscore | 支持 | 支持 SVG/PNG/PDF/位置数据 | 支持 | 从 MuseScore/libmscore 派生，GPL；基于较旧 MuseScore/Qt WebAssembly 栈 | 技术上可去掉本机 CLI，但不独立于 MuseScore，也没有消除 GPL 与兼容风险 |
| 自行解析 MSCZ/MSCX | 容器可解压 | 必须重做制谱、字体、分页、反复和坐标系统 | 必须重做 | 维护成本极高；MSCX 是 MuseScore 内部格式 | 不建议作为首版发布路径 |

可以后续提供一个真正无 MuseScore 的“MusicXML-only”构建：禁用 `.mscz` 导入和 MuseScore 原生 PDF，仅保留 alphaTab 渲染、播放、分镜与 XLSX。这是功能降级版，不是现有产品的等价替代。

## MuseScore 再分发边界

- MuseScore 官方仓库声明 MuseScore Studio 采用 GNU GPL version 3：<https://github.com/musescore/MuseScore>。
- 本机版本为 `4.7.4 / Build 7688c00`，对应官方标签 `v4.7.4`：<https://github.com/musescore/MuseScore/releases/tag/v4.7.4>。
- GPLv3 允许把相互独立、没有组合成单一程序的作品作为 aggregate 放在同一分发介质中；WaterClip 通过 CLI 参数和临时文件调用 MuseScore，发布结构也保持两个程序独立。GPLv3 原文：<https://www.gnu.org/licenses/gpl-3.0.html>。
- 分发 MuseScore object code 时必须满足 GPLv3 第 6 节的对应源码可得性、许可证和告知义务。便携版默认附带精确标签的源码归档、GPLv3 文本、Build 信息和上游链接。
- MuseScore 安装目录中的 MS Basic SoundFont 另有 MIT 与署名要求，发布器会一并复制其许可证。

以上是工程合规结论，不构成法律意见。正式公开发布前，应由版权/法务负责人复核项目自身许可证、MuseScore 商标展示以及源码长期托管方式。
