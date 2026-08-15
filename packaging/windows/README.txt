WaterClip Windows 便携版
=======================

1. 双击 WaterClip.vbs 启动，默认浏览器会打开 http://127.0.0.1:4174。
2. 无需安装 Node.js 或 npm；MuseScore Studio 4 已包含在 third_party 目录。
3. 如需查看启动错误，请运行 WaterClip-console.cmd。
4. 使用 Stop-WaterClip.cmd 结束隐藏运行的本地服务。
5. 项目与 API Key 保存在当前 Windows 用户的浏览器存储中，不会写入发行目录。

启动器会在 %LOCALAPPDATA%\WaterClip\runtime 下创建一个短路径目录联接，指向包内
MuseScore。这样即使便携包位于中文或较深目录，MuseScore CLI 也能稳定运行。

请勿删除 app、runtime 或 third_party 目录。公开再分发前请阅读 licenses 目录和
OPEN-SOURCE-AUDIT.md；MuseScore Studio 4 受 GNU GPLv3 约束。
