# WaterClip

WaterClip 是面向乐谱的分镜脚本撰写工作台，为云和奏类音乐节目而生。它可以导入 MSCZ、MusicXML、XML 或 MXL 乐谱，在谱面上框选声部与小节，制作分镜、参考图和拍摄描述，并导出项目包、XLSX 分镜表及带分镜标记的制片总谱 PDF，还支持接入大模型辅助参考图与拍摄描述的创作。Enjoy it！

> 本项目通过Vibe Coding构建，所使用的模型：GPT 5.6 Sol。

## 启动方式

### 使用 Windows 便携版

从 GitHub Release 下载 `WaterClip-0.1.0-win-x64-portable.zip` 后：

1. 完整解压整个文件夹。不要只单独复制启动文件，也不要删除 `app`、`runtime`、`third_party` 或 `licenses`。
2. 双击 **`点我开始.bat`**。
3. 等待浏览器打开 `http://127.0.0.1:4174`。首次启动会为随包 MuseScore CLI 准备一个较短的本机路径，通常需要几秒。
4. 如果没有自动打开，在浏览器中手动访问上述地址；若启动失败，运行 `WaterClip-console.cmd` 查看错误。
5. 使用完毕可运行 `Stop-WaterClip.cmd` 停止后台服务。

WaterClip 只监听本机回环地址，不应把服务端口暴露到公网或不可信局域网。

### 从源码运行

项目使用 npm workspaces，要求 Node.js 22 或更高版本：

```powershell
npm ci
npm run dev
```

提交或发布前运行 `npm test`、`npm run typecheck`、`npm run build` 和 `npm run audit:open-source`。Windows 便携版由 `npm run release:portable` 构建，发布资产会写入 `release-assets`；其中包含 `点我开始.bat` 启动器、完整 GPL-3.0-only 许可证和 MuseScore 对应源码归档。

## 使用教程

### 初次体验

1. 点击顶部红色的“导入乐谱”，选择 `.mscz`、`.musicxml`、`.xml` 或 `.mxl`。
2. 在中央谱面上按住鼠标左键拖拽，框选需要拍摄的声部和小节。
3. 按 `Enter` 创建分镜组。左侧会出现每个声部对应的子镜头。
4. 为子镜头选择特写、近景、中景或全景，填写拍摄描述，并上传或粘贴分镜参考图。
5. 需要复用分镜属性时，勾选“参考图”和/或“描述”，点击“应用到同类型分镜”。“同类型”指乐器声部和景别均相同。
6. 在底部故事板检查顺序和画面。点击故事板卡片可选中分镜，并在联动开启时跳到对应小节。
7. 使用顶部按钮保存 `.waterclip` 项目，或导出 XLSX 和制片总谱 PDF。

### 谱面操作

- **左键拖拽**：框选声部与小节。
- **`Ctrl` + 左键拖拽**：在已有框选基础上增补或调整选择。
- **单击小节**：定位到该小节。
- **拖动播放光标**：快速改变播放位置。
- **`Shift` + 鼠标滚轮**：在大型谱面中平移；触控板的横向/纵向滚动量会被保留。
- **按住鼠标中键拖拽**：自由平移谱面。
- **顶部缩放滑杆**：调整谱面显示比例。
- **播放按钮或进度条**：播放、暂停或跳转。首次播放时浏览器可能需要短暂加载音源。

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Enter` | 用当前谱面框选创建分镜组 |
| `Delete` | 删除当前分镜组 |
| `Ctrl + Z` | 撤销 |
| `Ctrl + Shift + Z` | 重做 |
| `Ctrl + D` | 取消当前谱面框选 |
| `Esc` | 取消工程名编辑 |
| 工程名编辑时 `Enter` | 保存新名称 |

在输入框、文本框、下拉框或可编辑文字区域中，上述全局快捷键不会被触发。

## 界面说明

### 顶部工具栏

- **工程名**：点击即可原位重命名，失焦或按 `Enter` 保存。
- **导入乐谱**：导入 MSCZ 或 MusicXML 系列文件。
- **打开文件夹图标**：打开已有 `.waterclip` 项目。
- **下载图标**：保存当前 `.waterclip` 项目。导出时图片会压缩后写入 ZIP，以减小体积；不会修改浏览器中正在编辑的原图。
- **带 X 的文档图标**：导出 XLSX 分镜表。图片会缩放压缩，相同图片只嵌入一次。
- **带音符的文档图标**：导出带分镜标记的制片总谱 PDF。页码沿用 MuseScore 官方总谱样式，偶数页位于左上角、奇数页位于右上角；页眉不会附加 WaterClip 或临时文件名。
- **统计图标**：查看各声部的分镜数和覆盖小节数。
- **齿轮图标**：打开本机设置，并显示当前版本号。

### 左侧“分镜属性”

- 顶部标签切换分镜组，范围栏设置播放遍次或删除当前组。
- 分屏编排支持单画面、横向、纵向和宫格；预览格可以拖拽换位。
- 每个子镜头可设置景别、描述、参考图、LLM 描述完善和 AI 示意图生成。
- “复制补拍”会在当前组复制一个子镜头；“应用到同类型分镜”作用于整个工程。

### 中央乐谱

- 显示、播放和框选乐谱。小节标签会标出当前播放位置和已选区域。
- 顶部乐段标记可快速跳转；静音和独奏状态与右侧声部监听同步。

### 右侧“声部监听”

- 每个声部显示实时电平。
- `M` 为静音，`S` 为独奏。

### 底部“故事板”

- 按乐谱时间排列所有分镜组，显示分屏、参考图和声部信息。
- 播放时自动滚动到当前分镜；可在设置中关闭联动。
- 各面板标题右侧的箭头可折叠或展开面板。

## Windows 便携包构建方法

环境要求：Windows x64、Node.js 22 或更高版本、npm，以及 MuseScore Studio 4.7.4。MuseScore 可安装在默认目录，也可以通过 `-MuseScoreRoot` 指定目录。

在仓库根目录执行：

```powershell
npm ci
npm test
npm run typecheck
npm run build
npm run audit:open-source
npm audit --omit=dev --registry=https://registry.npmjs.org
```

构建便携包：

```powershell
npm run release:portable -- `
  -MuseScoreRoot "C:\Program Files\MuseScore 4" `
  -MuseScoreSourceArchive "C:\path\to\MuseScore-4.7.4-source.zip"
```

如果 MuseScore 对应源码 ZIP 已放在上一版便携目录，脚本会优先使用本地缓存；也可以省略 `-MuseScoreSourceArchive` 让脚本从 MuseScore 官方地址获取。构建完成后，正式上传资产位于 `release-assets`：

- `WaterClip-0.1.0-win-x64-portable.zip`
- `MuseScore-4.7.4-source.zip`
- `SHA256SUMS.txt`

验证便携包：

```powershell
npm run release:verify -- `
  -PackageRoot ".\release\WaterClip-0.1.0-win-x64-portable" `
  -ScorePath ".\example.mscz"
```

`release/`、`release-assets/`、日志、PID、验收乐谱和用户项目均已加入忽略规则，不应提交到源码仓库。便携包解压后使用 `点我开始.bat` 启动。

## 文件与隐私

- `.waterclip` 是 ZIP 项目包，包含清理过的工程 JSON、乐谱和当前分镜实际引用的图片，不包含 API Key；替换图片后留下的孤立资源不会进入导出包。
- 项目导出会把较大的分镜图片限制在 1600 x 900 以内，并在确实能减小时转换为高质量 JPEG，再使用最高 Deflate 等级打包。
- XLSX 中的图片按显示尺寸生成预览并去重，适合传阅；原始参考图仍保留在当前工程中。
- 图像服务和 LLM 服务的 API Key 分别保存在当前浏览器的本地存储中，不会写入项目包、XLSX 或 PDF。公共电脑上请勿保留密钥。

## 许可与声明

### MuseScore CLI

本项目的以下功能使用了 MuseScore CLI ：导入与转换 MSCZ 文件、排版与导出带制片标记的总谱 PDF 。GitHub Release 的 Windows 便携包已经包含 **MuseScore Studio 4.7.4（Build 7688c00）**，WaterClip 通过命令行和临时文件边界调用它；便携版用户不需要另行安装，也不需要在设置中填写路径。

MuseScore 是独立的 GPLv3 程序。发行包内的许可证位于 `licenses/MuseScore-GPL-3.0.txt`，对应版本和源码地址位于 `corresponding-source/MUSESCORE-SOURCE.txt`。公开发布包含 MuseScore 二进制的下载时，分发者必须确保相同版本的完整对应源码以合规方式持续可得。

### 第三方开源组件

发行包还使用 Node.js、React、alphaTab、ExcelJS、Fastify、pdf-lib、fflate、Lucide、Bravura、Sonivox 和 MS Basic SoundFont 等开源组件。构建时生成的完整包名、版本、SPDX 标识及许可证文本见发行包中的：

- `licenses/NPM-THIRD-PARTY-NOTICES.md`
- `licenses/THIRD-PARTY-NOTICES.md`
- `licenses/Node.js-LICENSE.txt`
- `licenses/MuseScore-MS-Basic-SoundFont.md`
- `app/web/soundfont/LICENSE`

### WaterClip 许可证

WaterClip 自身以 **GNU General Public License v3.0 only（GPL-3.0-only）** 发布，完整条款见仓库根目录 `LICENSE`。第三方组件仍分别适用其各自许可证。

### AI使用声明

本项目通过Vibe Coding构建，您应当知晓AI生成代码可能具有的缺陷及运行所致的风险。

欢迎为本项目提 Issues ，以便更好地改进和服务富有创意的节目创作。( •̀ ω •́ )✧
