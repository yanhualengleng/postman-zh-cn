# Postman 简体中文本地汉化

包含可分享的中文运行时、翻译数据和零第三方依赖的 Node.js 安装／恢复 CLI。非 Postman 官方项目，与 Postman, Inc. 无关联或背书。

## 来源与许可

运行时基于 [hlmd/postman-chinese-injector](https://github.com/hlmd/postman-chinese-injector) **1.11.3**，来自已安装汉化资源的允许文件快照。`runtime/` 仅包含三个汉化钩子、相应数据、语言配置和原始许可；未包含 Postman 源代码、app.asar、用户数据或安装备份。

翻译是上游衍生版本，含 **29 + 56 + 22 + 56 项本机修复**，并非未经修改的上游发布包。这些数字是来源快照的修复批次说明，不代表本仓库新增或重新执行的测试数量。未提供逐条修复历史，无法据此重建每批差异。

保留上游 `Copyright (c) 2026 hlmd` 和完整 MIT 许可，见根目录 `LICENSE` 与 `runtime/LICENSE.postman-chinese-injector.txt`。本仓库新增 CLI 亦以 MIT 发布。MIT 仅覆盖工具自身代码；派生于 Postman 文案的翻译数据不因此获得对 Postman 原始文案、商标或其他资产的额外授权。使用时请遵循适用的 Postman 条款。

## 来源快照适配范围

| 项目 | 来源记录 |
| --- | --- |
| 桌面应用 | app **12.38.3** |
| 动态 UI | **12.38.4-ui-261125-0231** |
| 文案范围 | **197 模块、22543 键** |
| DOM 后备词典 | **17744 项** |

以上是来源版本与覆盖规模，不保证未来动态 UI 的覆盖率。本工程交付检查仅为 JS 语法、运行时 SHA256 和只读安装 dry-run，没有启动或修改实际 Postman 来验证显示效果。

## 功能

- 在设置 → 常规 → 应用程序 → 语言中增加“简体中文”，保留 English 和日本語。
- 语言选择会持久保存，并用于新建窗口；支持中文与英文切换及原生菜单恢复。
- 覆盖应用语言模块、原生菜单和 DOM 后备文本；后备翻译跳过代码编辑器、请求／响应正文、可编辑内容及用户命名。

## 使用

需要 Node.js **20 或更高版本**，无需 `npm install`。完全退出 Postman（含托盘和后台进程）后，在项目目录运行：

```sh
# 只读检查，不创建锁、暂存目录或备份
node bin/postman-zh-cn.cjs --dry-run

# Windows 自动选择 LOCALAPPDATA/Postman 下版本号最新且有 app.asar 的 app-* 目录
node bin/postman-zh-cn.cjs

# 显式指定目录；支持 Postman 安装根目录、app-*、resources 或 macOS .app 目录
node bin/postman-zh-cn.cjs --path "<Postman安装目录>" --dry-run
node bin/postman-zh-cn.cjs --path "<Postman安装目录>"

# 先预览，再恢复
node bin/postman-zh-cn.cjs --path "<原安装版本目录>" --restore --dry-run
node bin/postman-zh-cn.cjs --path "<原安装版本目录>" --restore
```

`--path` 可省略；自动发现仅支持 Windows。其他系统需显式指定路径，尚未验证。恢复时应明确指定原先安装过补丁的版本目录，避免应用更新后默认发现指向新版本。需要对目标 resources 目录有写入权限。

如果目标已经被其他汉化工具修改，CLI 会保留原有入口内容；首次备份对应**执行本工具前**的状态，恢复不会移除此前存在的汉化。本工程不会下载或替换官方应用包，也不会访问用户账户数据；运行时语言切换沿用上游偏好设置行为。

## 安装与恢复机制

- 内置 ASAR pickle/header 解析及重打包；检查文件边界与已有 SHA256 整体／分块 integrity，保留目录、链接及 unpacked 元数据。只对根目录 `main.js`、`preload_desktop.js`、`preload.js` 注入以 `process.resourcesPath` 定位的 `require`，不把本机绝对路径写入归档。其他归档文件内容逐项比对；`app.asar.unpacked` 不作改动。
- 运行时只从项目 `runtime/` 的固定八文件白名单复制到目标 `resources/postman-zh/`，通过 `runtime-manifest.json` 校验每个文件 SHA256。修改运行时后应自行审阅并重新生成清单，CLI 不自动信任变化。
- 写入前检查 Postman 进程，使用独占锁并复查文件；把原归档和已有 runtime 存入目标 `resources/.postman-zh-cn-backup/`，清单记录原始及安装后 hash，不记录个人路径。备份不会写入仓库，且拒绝覆盖已有备份。
- 先暂存并验证 runtime，再通过同目录 rename 切换；ASAR 经暂存、fsync、同目录 rename 原子替换。多文件切换不是单一文件系统事务，因此捕获失败后自动回滚，备份保留供恢复。安装后再次核验 SHA256。
- `--restore` 验证备份完整性，拒绝覆盖 hash 不符的归档或被其他程序改过的 runtime；成功后删除本工具备份。遇到不支持的归档格式或入口布局时停止，不猜测、不修改可执行文件签名或 Electron 完整性策略。

应用升级会使用新的版本目录，需重新 dry-run 和安装；新版本未必兼容。启用外部 ASAR 签名校验的发行版可能拒绝修改后的包，本工具不绕过此类校验。

## 中断后的处理

普通写入异常会自动回滚。断电、进程被强制终止或磁盘损坏无法保证执行回滚，原始备份仍应优先保留。

1. 完全退出 Postman，确认没有本工具进程。仅在确认锁已失效后移除目标 resources 中的 `.postman-zh-cn.lock`。
2. 如存在 `.postman-zh-cn-stage` 或 `.postman-zh-cn-previous`，先将它们移至安装目录之外保留，避免覆盖中断现场；不要把这些文件提交到仓库。
3. 对原版本执行 `--restore --dry-run`，校验成功再执行 `--restore`。若 runtime 在切换时暂时缺失，恢复仍可使用备份；归档必须匹配原始或已安装 hash。
4. 若备份缺少 `manifest.json`，说明备份阶段未完成，CLI 尚未开始替换应用。先核对原应用状态，再移走这份不完整备份，重新 dry-run。备份 hash 不符时停止自动恢复并保留现场，不要强行覆盖。

## 项目结构

```text
bin/postman-zh-cn.cjs      安装／恢复命令
lib/asar.cjs               内置 ASAR 读写及 integrity
runtime/                   上游衍生钩子、数据与许可
runtime-manifest.json      运行时 SHA256 清单
LICENSE                    保留的上游 MIT
```

仓库不包含安装备份、个人路径、本机验证报告或测试套件。发布前可对 `bin/`、`lib/`、`runtime/` 的 JS 文件执行 `node --check`，再运行 `--dry-run`；dry-run 仍会完整构建并检查内存中的归档，不落盘。
