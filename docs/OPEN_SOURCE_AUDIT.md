# WaterClip 开源前审计

审计日期：2026-08-15。范围为当前 Git 工作树、npm 依赖、浏览器/本地服务边界、便携版组成和项目文档。

## 已通过

- Git 未跟踪 `example.mscz`、`.env`、`.waterclip` 或用户项目图片；根目录验收乐谱由 `.gitignore` 明确排除。
- 受版本控制的文本未发现 API Key、私钥或常见 token 形态。服务端不持久化 API Key，LLM 失败响应不会反射上游正文。
- `@fastify/static` 已升级到修复路径穿越问题的 `10.1.3`；ExcelJS 的传递依赖 `uuid` 固定为 `11.1.1`。使用官方 npm registry 执行生产依赖审计为 0 个已知漏洞。
- 本地服务默认只监听 `127.0.0.1`；未知浏览器 Origin 会在读取上传正文前被拒绝，避免任意网页调用本机转换/代理接口。
- MuseScore 子进程使用 `execFile` 参数数组、可执行文件名白名单、受控临时目录、大小上限和超时；没有 shell 字符串拼接。
- npm 包元数据清点未发现缺少 license 字段的依赖；发布器会聚合生产依赖的包名、版本、SPDX 标识，以及包内许可证文本或 MIT/ISC 标准文本回退，Bravura、Sonivox、MS Basic、Node.js 与 MuseScore 的许可证也会随发行物保留。
- Windows 便携版不包含 npm、缓存、开发依赖、用户乐谱、项目包、API Key 或浏览器数据，并在归档前执行真实健康检查。`BUILD-INFO.json` 会记录 MuseScore 源码归档是否随包提供。
- 启动器只在当前用户 `%LOCALAPPDATA%\WaterClip\runtime` 建立版本化目录 junction，解决 MuseScore 在深层中文路径下的 CLI 崩溃；不会复制或修改包内 MuseScore 文件。

可重复执行：

```powershell
npm run audit:open-source
npm audit --omit=dev --registry=https://registry.npmjs.org
npm test
npm run typecheck
npm run build
```

## 已知边界

- 自定义图像/LLM Base URL 是产品能力，因此登录 WaterClip 的本机用户可以让服务访问其指定的 HTTP(S) 地址，包括局域网地址。服务只绑定 loopback 且拒绝第三方 Origin；不要以 `HOST=0.0.0.0` 暴露到不可信网络。
- 用户选择“记住 API Key”时，密钥会明文保存在该浏览器配置中。项目包、XLSX、PDF 和服务日志不包含密钥。
- 发行物尚未进行 Authenticode 签名，Windows SmartScreen 可能显示未知发布者。
- 便携版约含 432 MB MuseScore 运行目录、Node 运行时和 Web 资源，体积显著大于 MusicXML-only 构建。
- GitHub codeload 不支持断点续传；`-SkipMuseScoreSourceArchive` 仅供网络受限的内部候选包使用。该候选包必须在源码等价可得后才能公开分发。

## 公开发布前仍需版权所有者决定

WaterClip 自身尚未选择开源许可证。没有根级 `LICENSE` 时，外部贡献者和用户默认没有复制、修改或再分发授权，因此当前状态是“代码可审阅、发布工程就绪”，还不是法律意义上的开源项目。

建议在首次公开仓库前明确选择一种：

- `GPL-3.0-only`：与随包 MuseScore 的许可叙事最简单，整个 WaterClip 保持强 copyleft；
- `Apache-2.0`：允许更宽松复用并包含明确专利授权，同时继续把 MuseScore 作为独立 GPLv3 程序分发；
- `MIT`：最简短宽松，但没有 Apache-2.0 那样明确的专利条款。

许可证必须由版权所有者选择；选择后应同步根 `LICENSE`、`package.json`、README 徽标/说明和贡献者协议策略。

## 发布检查清单

- [ ] 选择并提交 WaterClip 根许可证。
- [ ] 设置公开仓库 URL、问题反馈地址与安全联系渠道。
- [ ] 在与二进制相同的下载位置持续提供 MuseScore 对应源码；不要只依赖短期临时链接。
- [ ] 决定是否申请代码签名证书并签署启动器/运行时。
- [ ] 在干净 Windows 用户环境验证启动、MSCZ 转换、PDF、XLSX、音频与停止脚本。
- [ ] 创建版本标签并发布 SHA-256 校验文件；当前仓库未配置 Git remote，不会自动推送。
