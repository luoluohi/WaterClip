# 参与 WaterClip 开发

感谢参与。公开贡献入口将在项目许可证与仓库地址确定后启用。

## 本地开发

需要 Node.js 22+、npm 和 MuseScore Studio 4。安装依赖后运行：

```powershell
npm install
npm run dev
```

提交前必须通过：

```powershell
npm run audit:open-source
npm test
npm run typecheck
npm run build
```

功能变更应增加能够验证真实行为和边界条件的测试。领域规则放在 `apps/web/src/domain`，浏览器乐谱适配放在 `apps/web/src/score`，本地转换与 API 代理放在 `apps/server`。

不要提交真实用户乐谱、项目图片、API Key、`.waterclip` 项目包或临时转换产物。测试夹具必须自行创作或具有明确的可再分发许可。
