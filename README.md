# Postman 简体中文本地汉化

包含可分享的中文运行时、翻译数据和零第三方依赖的 Node.js 安装／恢复 CLI。非 Postman 官方项目，与 Postman, Inc. 无关联或背书。

## 来源与许可

运行时基于 [hlmd/postman-chinese-injector](https://github.com/hlmd/postman-chinese-injector) **1.11.3**，来自已安装汉化资源的允许文件快照。`runtime/` 包含三个汉化钩子、翻译提取／覆盖辅助模块 `pm-translation-tools.cjs`、相应数据、语言配置和原始许可，共九个文件；未包含 Postman 源代码、app.asar、用户数据或安装备份。

翻译是上游衍生版本，含 **29 + 56 + 22 + 56 项本机修复**，并非未经修改的上游发布包。这些数字是来源快照的修复批次说明，不代表本仓库新增或重新执行的测试数量。未提供逐条修复历史，无法据此重建每批差异。

保留上游 `Copyright (c) 2026 hlmd` 和完整 MIT 许可，见根目录 `LICENSE` 与 `runtime/LICENSE.postman-chinese-injector.txt`。本仓库新增 CLI 亦以 MIT 发布。MIT 仅覆盖工具自身代码；派生于 Postman 文案的翻译数据不因此获得对 Postman 原始文案、商标或其他资产的额外授权。使用时请遵循适用的 Postman 条款。

## 来源快照适配范围

| 项目 | 来源记录 |
| --- | --- |
| 桌面应用 | app **12.38.3** |
| 动态 UI | **12.38.4-ui-261125-0231** |
| 文案范围 | **197 模块、22543 键** |
| DOM 后备词典 | **17744 项** |

以上是来源版本与覆盖规模，不保证未来动态 UI 的覆盖率。交付验证已通过隔离 fixture 测试：dry-run、临时 ASAR 的真实安装、缺失文案导出、自定义译文重复更新、运行时翻译及参数／标签校验，以及恢复后原始 ASAR 逐字节一致性检查；另已通过 JS／PowerShell 语法与运行时 SHA256 检查、BAT 的 `--dry-run` 和恢复入口的 `--help` 调用。上述结果验证的是隔离环境中的工具行为，不代表实际 Postman GUI 显示效果已经验证，也不保证未来版本兼容。

## 功能

- 在设置 → 常规 → 应用程序 → 语言中增加“简体中文”，保留 English 和日本語。
- 语言选择会持久保存，并用于新建窗口；支持中文与英文切换及原生菜单恢复。
- 覆盖应用语言模块、原生菜单和 DOM 后备文本；后备翻译跳过代码编辑器、请求／响应正文、可编辑内容及用户命名。

## Windows 一键安装与恢复

下载公开仓库的完整 ZIP 并解压到可写目录，或克隆仓库。先自行完全退出 Postman（包括托盘和后台进程），再双击 `install.bat`；需要恢复时双击 `restore.bat`。脚本不会操作桌面、自动关闭 Postman、请求管理员权限或启动 Postman。遇到错误会保留窗口并显示退出码；解决问题后重新运行。

启动器依次查找 **PATH 中可运行的 Node.js >=20**、项目内 **`.tools/node/node.exe`**。都不存在时，通过 PowerShell 从 `https://nodejs.org/dist/v24.11.1/` 下载固定 LTS **Node.js 24.11.1** 的 Windows x64／ARM64 ZIP，读取同目录官方 `SHASUMS256.txt`，核对文件名、预置官方 SHA256 和 ZIP 的实际 SHA256，验证后解压缓存到 `.tools/node/`。首次自动准备需要联网和 PowerShell 5.1 或更高版本；后续可复用缓存，无需 `npm install`。不依赖开发者电脑的私有 Node 运行时，不修改系统 PATH，也不进行全局安装。此固定版本不会自动升级，维护者应另行审阅后更新版本及校验值。

32 位 Windows 不提供该固定版本的自动下载，请自行在 PATH 安装兼容的 Node.js >=20。缓存损坏时脚本会报错并保留已有目录；请手工移走 `.tools/node/` 后重试。并发下载或中断遗留的 `.tools/node-download.lock` 会阻止再次下载；确认没有其他启动器运行后再手工清理。`.tools/` 仅为本地工具缓存，不应提交或上传到公开仓库；项目忽略规则已排除 `.tools/`；手工打包发布时也应排除此目录。

BAT 支持透传 CLI 参数。以下是 **cmd.exe** 示例，路径含空格时保留双引号；相对路径以当前命令行工作目录解释：

```bat
rem 只读检查安装目标；首次运行仍可能下载并缓存 Node
install.bat --dry-run

rem 显式指定安装目录
install.bat --path "<Postman安装目录>" --dry-run
install.bat --path "<Postman安装目录>"

rem 恢复原版本，restore.bat 自动附加 --restore
restore.bat --path "<原安装版本目录>" --dry-run
restore.bat --path "<原安装版本目录>"

rem 查看当前 CLI 实际支持的参数
install.bat --help
```

`--path` 可省略；Windows 默认按数字版本号发现 `LOCALAPPDATA/Postman` 下最新且有 `app.asar` 的 `app-*` 目录。恢复时请明确指定原来打过补丁的版本，避免更新后指向新目录。安装目录须可写，权限不足时脚本停止，不自动提权。

已有 Node.js >=20 的用户也可直接执行 `node bin/postman-zh-cn.cjs [参数]`。其他操作系统须显式传入 `--path`，尚未验证；BAT 和便携 Node 自动准备仅支持 Windows。CLI 本身的 `--dry-run` 不写入翻译导出，也不创建目标应用的锁、备份或暂存文件；BAT 为准备 Node 可能写入项目 `.tools/`，两者含义不同。

如果目标已经被其他汉化工具修改，CLI 会保留原有入口内容；首次备份对应**执行本工具前**的状态，恢复不会移除此前存在的汉化。本工程不会下载或替换官方 Postman 应用包，也不会扫描用户账户数据；运行时语言切换沿用上游偏好设置行为。

## 未来版本的缺失翻译与自定义覆盖

CLI 和运行时支持缺失模块提取与自定义译文覆盖。**普通安装、重复更新和恢复前必须关闭 Postman；`--extract-only` 可在 Postman 运行时使用，不安装或更新补丁。**

```bat
rem 仅提取安装包中可识别的官方英文模块
install.bat --extract-only --path "<Postman安装目录>"

rem 指定官方英文 JSON 目录和导出根目录（仍需能定位 Postman 安装包）
install.bat --extract-only --path "<Postman安装目录>" --locale-dir "<官方英文JSON目录>" --output "<导出根目录>"

rem 只预览，不写入翻译导出或修改应用
install.bat --extract-only --dry-run --path "<Postman安装目录>"
```

`--locale-dir` 递归读取指定目录中的 JSON，只应指向明确的官方英文 locale JSON 目录，不应指向用户目录、账户缓存、工作区、集合导出或请求／响应数据。提取器不会自动扫描用户数据；传入错误目录可能导致解析失败或混入无关 JSON。即使提供此参数，仍需使用 `--path` 或默认发现定位有效的 Postman 安装包。静态提取仅能处理扫描时已存在、格式受支持的英文模块。

默认导出到项目 `translations/missing/app-X.Y.Z/`；每个模块生成以下文件，`MODULE` 为真实模块名：

| 文件 | 用途 |
| --- | --- |
| `modules/MODULE.json` | 缺失或需修正的待译文案，保留原始键树 |
| `sources/MODULE.json` | 对应官方英文模块原文，供翻译和后续版本核对 |
| `status/MODULE.json` | 缺失项／参数无效项统计及源文案 hash |

`--output` 直接指定导出根目录，`modules/`、`sources/`、`status/` 写在其下，不会再自动附加版本子目录。CLI 的 `--dry-run` 不写导出；BAT 首次运行仍可能为准备 Node 写入 `.tools/`。

安装后需**手动重新打开 Postman 并浏览相应页面**，运行时才能捕获实际加载的官方英文模块。懒加载文案只有页面加载到相应模块时才可能导出；只安装或执行静态提取不能保证收集全部页面。运行时将捕获结果写入安装时配置的项目导出位置，默认仍为上述版本目录。该位置须可写；移动项目或更换导出位置后应退出 Postman 并重新运行安装器更新配置。

将 `modules/MODULE.json` 中需要翻译的模块复制为项目 `translations/custom/MODULE.json`，填入**同形的部分或全部译文**：只修改字符串值，不改键名或层级。部分覆盖只需保留待覆盖的分支，其余键使用内置译文或英文；当前自定义数据支持对象键树与字符串，不支持把数组或其他非字符串值作为译文。例：

```json
{
  "actions": {
    "save": "保存",
    "greeting": "你好，{name}"
  }
}
```

保存为 UTF-8 JSON，严格保留 ICU 参数名与花括号、`plural`／`select` 结构及分支键、`#`、富文本标签和其他插值占位符；不要翻译格式标记。参数校验是保守检查，不是完整 ICU 语法或译文语义验证，仍需人工审阅。

译文中参数无效的条目会在运行时回退至可用的内置译文或英文，并导出待修正项和统计。JSON 无法解析或译文树结构不受支持时，安装检查可能直接报错，应先修复文件。

完全退出 Postman 后，**重新运行 `install.bat` 即可更新自定义译文，无需先执行 restore**。安装器保留首次备份，将项目 `translations/custom/` 中的文件部署到目标运行时目录 `resources/postman-zh/custom/`（即目标 runtime 的 `custom/`），重开 Postman 后生效。不要为更新译文删除首次备份或手工修改应用归档。

未来兼容性取决于入口文件、语言模块命名、加载协议、JSON 树结构及 Electron 安全策略，无法保证任意未来版本或任意结构都能提取、覆盖或运行。**即使模块名、键名和参数均未变化，官方同键英文文案也可能改变含义；旧译文不会因此自动变得正确，仍须结合 `sources/`、源文案 hash 和实际页面人工核对。**未知结构应停止并等待适配，键名或源文案变化后应重新提取并审阅旧译文。

项目忽略规则已排除缺失导出和本地 custom JSON。缺失导出可能含官方英文原文，公开分享译文前应审阅许可与内容，不上传用户数据、安装备份、个人路径、本机验证记录或本地缓存。

## 安装与恢复机制

- 内置 ASAR pickle/header 解析及重打包；检查文件边界与已有 SHA256 整体／分块 integrity，保留目录、链接及 unpacked 元数据。只对根目录 `main.js`、`preload_desktop.js`、`preload.js` 注入以 `process.resourcesPath` 定位的 `require`，不把本机绝对路径写入归档。其他归档文件内容逐项比对；`app.asar.unpacked` 不作改动。
- 内置运行时从项目 `runtime/` 的固定九文件白名单复制到目标 `resources/postman-zh/`，包含 `pm-translation-tools.cjs`，通过 `runtime-manifest.json` 校验每个文件 SHA256；另由安装器生成捕获配置并部署 `custom/` 自定义译文。修改运行时后应自行审阅并重新生成清单，CLI 不自动信任变化。
- 写入前检查 Postman 进程，使用独占锁并复查文件；把原归档和已有 runtime 存入目标 `resources/.postman-zh-cn-backup/`，清单记录原始及安装后 hash，不记录个人路径。备份不会写入仓库；重复安装更新保留首次归档和运行时备份，仅更新安装后状态记录，恢复仍返回首次安装前状态。
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
install.bat               Windows 一键安装／参数透传
restore.bat               Windows 一键恢复／参数透传
scripts/launch.ps1        Node 发现、官方下载及校验
bin/postman-zh-cn.cjs      安装／恢复命令
lib/asar.cjs               内置 ASAR 读写及 integrity
lib/locales.cjs            官方英文模块扫描与缺失提取
runtime/                   九个内置运行时文件、数据与许可
translations/custom/      本地自定义译文
translations/missing/     自动捕获／静态提取结果
runtime-manifest.json      运行时 SHA256 清单
LICENSE                    保留的上游 MIT
```

仓库不包含安装备份、个人路径、本机验证报告或测试套件。发布前可对 `bin/`、`lib/`、`runtime/` 的 JS 文件执行 `node --check`，再运行 `--dry-run`；dry-run 仍会完整构建并检查内存中的归档，不落盘。

## AI 面板的中文范围

AI 快捷操作标题、可视化建议和工具执行状态纳入界面词典。AI 自由生成的回复、会话标题和图表 HTML 不属于静态语言包，不能用固定词典保证中文，也不会把用户的响应数据发送到额外翻译服务。旧会话中的英文回复不会被本工具重新生成。

需要中文回复和图表时，在 AI 输入框发送：

> 请用简体中文重新解释当前响应，并重新生成图表。图表标题、坐标轴、图例和提示文字使用简体中文；保留接口字段名、代码、状态码及原始数据。后续回复也请使用简体中文。

该请求用于引导模型，不能保证服务端每次遵循。应用中文汉化不会自动修改你的 AI 提示词或历史会话。更新本补丁前需完全退出 Postman，再运行 install.bat，默认选择本机最新 app-* 版本。Postman 自动升级后，新版本需要重新安装汉化；不要沿用旧 app-* 版本的固定路径。需要指定位置时，请优先传入 Postman 根目录，让安装器选择最新版本。
