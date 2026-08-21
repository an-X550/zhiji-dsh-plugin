# zhiji-dsh-plugin

`zhiji-dsh-plugin` 是知己每日、周、月和项目复盘的 DeepSeek Harness Bundle。它面向已经安装 DSH 的用户，使用 DSH 官方 Profile、Bundle、Skill Registry、Tool Registry 和 Web UI；它不改造知己桌面端，也不把桌面端当作运行依赖。

## 能力边界

用户可以在 DSH Web UI 中粘贴材料，输入对应入口得到会话内复盘：

- `/zhiji-daily-review`：单日事实、一个洞察、一个小行动和明天验证；
- `/zhiji-weekly-review`：一周趋势、偏差、关键变化和下周验证；
- `/zhiji-monthly-review`：月度主题、趋势与反例，以及下月检查点和假说；
- `/zhiji-project-review`：项目目标、结果、过程、偏差和后续行动。

四种入口都区分事实、推断和建议；材料不足时明确降级，不把多篇材料机械拼成摘要。结果只留在 DSH 会话中，不写知己正式反馈、验证库或桌面端数据。

每日复盘继续只消费当前会话中的单日日志。周/月/项目复盘既支持粘贴材料，也支持用户明确要求读取已配置的日志根目录；后者只通过 `zhiji_read_journal_range` 读取一个明确日期范围，再交给对应 Skill 判断。Tool 不接受路径参数，不递归扫描，不写回文件。

## 配置只读日志范围

先在启动 DSH Profile 的同一环境中设置一个绝对日志根目录：

```powershell
$env:ZHIJI_DSH_LOG_ROOT = 'C:\Users\you\Documents\zhiji-logs'
```

然后在会话中明确说明日期范围，例如：

```text
/zhiji-weekly-review
请使用已配置日志根目录读取 2026-08-17 至 2026-08-23 的日志，完成周度复盘。
```

Tool 只读取配置根目录的顶层 Markdown 文件：支持 `YYYY-MM-DD.md` 日志，以及文件名含年份的 Markdown 中以 `YYYY-MM-DD` 或 `M月D日` 标记的日期段。非 Markdown 文件、嵌套目录、非法日期、越界路径和无法解析的 Markdown 会明确失败；没有命中材料时返回“范围内没有可用日志材料”，由 Skill 降级，不补完整故事。

## 开发

```powershell
cd C:\path\to\zhiji-dsh-plugin
npm test
npm pack --pack-destination .\dist
```

包没有 `install`、`prepare` 或 `build` 脚本，不含 native dependency，也不主动联网。

验证脚本需要一个可运行的 DSH 源码检出目录。请通过 `-DshRoot` 传入，或设置 `DSH_SOURCE_ROOT`；该目录只用于验证，不是插件运行时依赖。

## 安装到 DSH Profile

下面的 tarball 是示例；正式使用时替换为发布包路径或包名。`dsh plugin` 是 DSH 官方包管理入口：

```powershell
dsh plugin --profile web add .\zhiji-dsh-plugin-0.3.1.tgz
dsh --profile web --no-open
```

首次修改 Profile 的 Bundle 集合后，按 DSH 约定重启该 Profile。Web UI 中粘贴材料后输入对应 `/zhiji-*-review` 即可触发。

## 移除

```powershell
dsh plugin --profile web remove zhiji-dsh-plugin
dsh --profile web --no-open
```

移除由 DSH 官方 CLI 同时处理 dependency 和 Bundle layer；Profile 仍由 DSH 自己启动。

## 隐私、信任与排错

这个包是 DSH 的 Node 宿主插件，安装它代表信任包内代码；它不等同于 Agent sandbox。运行时不会读取凭据、启动子进程、执行 Shell、主动联网或访问知己桌面端。只有用户明确设置 `ZHIJI_DSH_LOG_ROOT` 并在会话中要求日期范围读取时，Tool 才会读取该目录的顶层 Markdown；日志内容只进入当前 DSH 会话，不会上传或写回正式报告。

如果 Skill 或 Tool 没有出现：

1. 确认 `dsh plugin --profile <name> add <tarball>` 成功；
2. 执行 `dsh --profile <name> --dump-config`，确认 `zhiji-dsh-plugin` Bundle entry；
3. 按 DSH 约定重启 Profile，Bundle 集合变更不会自动改变已经运行的 Profile。

如果日志读取失败：确认环境变量在启动 DSH 的同一 PowerShell 进程中设置，路径为现有绝对目录，并且目录顶层只有受支持的 Markdown。Tool 不接受会话里传入的任意路径；遇到非 Markdown、嵌套目录、无日期段或非法日期会明确失败。空范围不是成功猜测，而是返回“范围内没有可用日志材料”，由 Skill 降级。

如果出现模型或 API Key 错误，那是 DSH Profile 的模型配置问题，不是插件提供模型或凭据。S1-S3 的本地验证使用测试用确定性适配器，不能替代真实模型质量验证。

## 发布准备元数据

package manifest 已包含 `dsh-plugin`、`deepseek-harness` 等关键词、公开访问声明、独立仓库地址和 Node/DSH 兼容版本。当前仓库已完成本地 tarball 验证；npm publish、GitHub Release 和外部市场提交仍需单独决定。

## 兼容版本

S4 package `0.3.1`（包含 S3 的运行时能力）在 DSH `0.1.0-rc.8`、上游提交 `141eb6fef83422698aef7a981029e843e8161534`、Node `v24.18.0` 和 pnpm `11.22.0` 上验证。插件不声明运行时依赖，使用 DSH 官方 Bundle patch、Skill Registry 和 raw `ToolDefinition` 注册入口，不使用 DSH 源码绝对路径或 deep import；后续 DSH 版本需要重新验证。

## 已知限制

- Tool 只做顶层 Markdown 的确定性日期范围聚合，不支持递归目录、其他格式、自动发现日志根目录或项目验收写入。
- 不写入 `复盘/每日反馈/`、`verified-patterns.md` 或桌面端数据目录。
- 不提供自定义 Web UI；结果使用 DSH Web UI 的普通会话消息。
- 本包不提供模型或 API Key。S1-S3 的 keyless Runtime 验证使用了仅测试用的本地确定性模型适配器；真实模型效果、浏览器 UI 体验和连续用户价值仍需用户在自己的 DSH 配置中观察。

## 安全边界

插件注册四个 Skill 和一个 `zhiji_read_journal_range` Tool。Tool 只读取用户通过 `ZHIJI_DSH_LOG_ROOT` 显式配置的目录，且不会把绝对根路径放入模型结果；插件不读取凭据、不启动子进程、不注册 Shell、不加载 native module、不主动联网，也不调用知己桌面端或项目绝对路径。
