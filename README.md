# ReflectLoop DSH Plugin（知己 DSH 插件）

> 为 DeepSeek Harness 增加四个有证据边界的复盘 Skill，以及一个受控的只读日志范围 Tool。

`zhiji-dsh-plugin` 是一个安装到 DSH Profile 的 ReflectLoop（知己）Node 插件包。它把每日、每周、每月和项目复盘入口注册到 DSH Web UI；它不提供模型、API Key 或独立 Web UI，也不依赖知己 Windows 桌面端才能运行。

- 当前包版本：`0.3.1`
- [GitHub 仓库](https://github.com/an-X550/zhiji-dsh-plugin)
- [下载与 Releases](https://github.com/an-X550/zhiji-dsh-plugin/releases)
- [提交问题](https://github.com/an-X550/zhiji-dsh-plugin/issues)
- 许可证：MIT，见 [LICENSE](LICENSE)

相关入口：[ReflectLoop 主仓库](https://github.com/an-X550/Reflectloop) · [ReflectLoop Desktop Agent](https://github.com/an-X550/Reflectloop-Desktop-Agent) · [知己用户版分发包](https://github.com/an-X550/knowing-yourself-zhiji-user)

在 ReflectLoop 体系中，主仓库是产品与 Skill/CLI 运行入口，用户版仓库是可复制的 Agent Skill 工作区，Desktop Agent 是 Windows 应用；本仓库只负责 DSH 适配。四个仓库不会自动共享日志或会话结果。

## 先判断它是否适合你

这个插件适合你，如果：

- 你已经安装 DeepSeek Harness，并且有一个可以启动的 DSH Profile；
- 你希望在 DSH Web UI 中粘贴日志或复盘材料后直接调用知己入口；
- 你希望在明确配置后，让插件只读聚合指定日期范围内的 Markdown 日志；
- 你接受结果只存在于当前 DSH 会话，不自动写入知己桌面端或正式报告目录。

这个插件不适合以下需求：

- 没有安装 DSH，想单独双击或直接运行这个仓库；
- 想让插件替你提供模型、API Key、云端日志同步或自定义 Web UI；
- 想让它扫描任意路径、递归搜索整块磁盘或自动发现日志目录；
- 想直接读取 D:\AI\deepseek-harness 等 DSH 源码目录。

## 它提供什么

| 入口 | 用途 | 默认材料 |
| --- | --- | --- |
| `/zhiji-daily-review` | 一天的事实、一个主要洞察、一个小行动和明天的验证 | 当前会话中粘贴的一段单日日志 |
| `/zhiji-weekly-review` | 一周趋势、偏差、关键变化和下周验证 | 当前会话材料，或明确要求读取配置范围 |
| `/zhiji-monthly-review` | 月度主主题、反例、关键变化和下月检查点 | 当前会话材料，或明确要求读取配置范围 |
| `/zhiji-project-review` | 项目目标、结果、过程、偏差和后续行动 | 当前会话材料，或明确要求读取配置范围 |

四个入口都区分事实、推断、建议和证据不足。材料不足时会降级，不把多篇材料机械拼成摘要，也不会自动把一次事件写成长期模式。

## 安装

### 前置条件

- Windows、macOS 或 Linux 上可运行的 DeepSeek Harness；
- 一个可以正常启动的 DSH Profile；
- Node.js 22.19+ 或 24+ 只在你从源码打包或运行测试时需要；
- 运行时不需要 DSH 源码检出目录，也不需要安装知己桌面端。

### 从源码打包并安装

当前仓库的 GitHub Releases 是否提供预构建 tarball，以 [Releases 页面](https://github.com/an-X550/zhiji-dsh-plugin/releases) 为准。没有 tarball 时，可以直接从源码生成：

```powershell
git clone https://github.com/an-X550/zhiji-dsh-plugin.git
cd zhiji-dsh-plugin
npm pack --pack-destination .\dist
```

然后把生成的包安装到目标 Profile。下面的 `web` 只是示例，请替换成你自己的 Profile 名称：

```powershell
dsh plugin --profile web add .\dist\zhiji-dsh-plugin-0.3.1.tgz
dsh --profile web --no-open
dsh --profile web --dump-config
```

`--dump-config` 用于确认 Profile 中已经出现 `zhiji-dsh-plugin` Bundle entry。首次安装或更新后必须重启该 Profile；只修改磁盘上的 tarball，不会自动更新已经运行的 Profile。

## 第一次使用

1. 启动刚刚安装插件的 DSH Profile；
2. 打开 DSH Web UI；
3. 粘贴一段真实材料，明确说明你想做哪一种复盘；
4. 输入对应的 `/zhiji-*-review` 入口；
5. 阅读会话结果，并把你认可的行动和保留意见留在自己的工作流中。

例如，每日复盘可以这样使用：

```text
/zhiji-daily-review

这是我今天的日志：
- 上午完成了……
- 下午因为……没有完成……
- 我当时的判断是……
```

插件不会把这次结果写入 `复盘/每日反馈/`、`verified-patterns.md` 或桌面端数据目录；如果你需要正式保存，请由你决定是否手动整理或使用其他正式入口。

## 可选：读取指定日期范围的本地日志

默认情况下，插件只分析当前会话中你粘贴的材料。只有同时满足下面两个条件时，日志 Tool 才会读取本地文件：

1. 你在启动 DSH Profile 的同一个 PowerShell 进程中设置了 `ZHIJI_DSH_LOG_ROOT`；
2. 你在会话中明确要求读取一个日期范围。

设置目录：

```powershell
$env:ZHIJI_DSH_LOG_ROOT = 'C:\Users\you\Documents\zhiji-logs'
dsh --profile web --no-open
```

然后在 DSH Web UI 中明确写出起止日期，例如：

```text
/zhiji-weekly-review
请使用已配置日志根目录读取 2026-08-17 至 2026-08-23 的日志，完成周度复盘。
```

日志 Tool 的读取规则：

- 只读取配置根目录的顶层 Markdown，不递归进入子目录；
- 支持文件名为 `YYYY-MM-DD.md` 的日志；
- 也支持文件名中含年份、正文中以 `YYYY-MM-DD` 或 `M月D日` 标记日期段的 Markdown；
- 日期范围包含起止日期；无命中材料时返回“范围内没有可用日志材料”，由 Skill 按证据不足处理；
- 单次聚合材料上限为 120,000 字符，范围过大时请缩小日期范围；
- 非 Markdown 文件、子目录、非法日期、越界路径或无法解析的 Markdown 会明确失败，不会猜测内容。

`ZHIJI_DSH_LOG_ROOT` 不是让模型获得任意路径访问权。Tool 只接收日期，不接收会话传入的文件路径，并且会校验真实路径仍在你配置的根目录内。

## 数据与安全边界

这是一个 DSH 的 Node 宿主插件，安装它意味着你信任包内代码。当前插件运行时：

- 不读取 API Key、凭据文件或知己桌面端数据；
- 不启动子进程，不执行 Shell，不加载 native module；
- 不主动联网；模型请求由 DSH Profile 的模型配置负责；
- 只在你明确配置日志根目录并提出日期范围请求时读取顶层 Markdown；
- 不写入日志、复盘、验证模式或项目文件；
- 不会把配置的绝对根路径放入模型返回材料。

插件本身不是 Agent sandbox。安装第三方包前，请先检查来源、版本和代码变更。

## 常见问题

### Skill 或 Tool 没有出现

确认安装命令针对的是当前使用的 Profile，然后依次执行：

```powershell
dsh plugin --profile web add .\dist\zhiji-dsh-plugin-0.3.1.tgz
dsh --profile web --dump-config
```

确认配置中有 `zhiji-dsh-plugin` 后，重启同一个 Profile。Bundle 集合的变化不会自动注入已经运行的会话。

### 日志读取失败

确认：

- `ZHIJI_DSH_LOG_ROOT` 在启动 DSH 的同一个 PowerShell 窗口中设置；
- 环境变量是存在的绝对目录，不是文件，不含 `..` 路径段；
- 目录顶层只放受支持的 Markdown 文件，不要放子目录或其他格式；
- 请求中的日期使用 `YYYY-MM-DD`，且起始日期不晚于结束日期。

### 模型或 API Key 报错

插件不提供模型或凭据。先在 DSH Profile 中确认模型、API Key 和网络配置，再判断是否是插件问题。

### 更新或移除插件

更新时重新打包并对同一 Profile 执行 `add`，然后重启 Profile。移除时：

```powershell
dsh plugin --profile web remove zhiji-dsh-plugin
dsh --profile web --no-open
```

## 兼容性与限制

当前 `0.3.1` 包在以下环境完成过验证：

- DeepSeek Harness `0.1.0-rc.8`；
- Node.js `24.18.0`；
- 使用 DSH 官方 Bundle patch、Skill Registry 和 raw ToolDefinition 注册入口。

其他 DSH 版本不能仅凭版本号推断兼容；升级 DSH 后应重新执行本地测试和实际 Profile 验证。插件当前明确不支持：

- 递归读取日志目录；
- 自动发现日志根目录；
- 非 Markdown 日志格式；
- 写回正式报告、验证库或项目验收结果；
- 自定义 Web UI；
- 自动提供模型、API Key 或云端同步。

## 开发与发布

这个包没有 `install`、`prepare` 或 `build` 脚本，也没有运行时依赖。开发者可以在仓库根目录执行：

```powershell
npm test
npm pack --dry-run
```

`npm pack --dry-run` 应只包含插件运行需要的入口、四个 Skill、Bundle patch、README 和许可证等文件。`DSH_SOURCE_ROOT` 或验证脚本的 `-DshRoot` 参数只用于与 DSH 源码做兼容性验证，不是插件安装或运行时依赖。

## 许可证

[MIT](LICENSE)
