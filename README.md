# zhiji-dsh-plugin

`zhiji-dsh-plugin` 是知己每日复盘的 DeepSeek Harness Bundle MVP。它面向已经安装 DSH 的用户，使用 DSH 官方 Profile、Skill Registry、`dsh-tool-skill` 和 Web UI；它不改造知己桌面端，也不把桌面端当作运行依赖。

## 能力边界

用户在 DSH Web UI 中粘贴一段单日日志，输入 `/zhiji-daily-review`（或直接请求“知己每日复盘”），得到一份短反馈：

- 用原文区分事实与推断，并在证据不足时降级；
- 只指出一个主要洞察；
- 只给一个少于 5 分钟的行动；
- 给出明天可观察的验证方式；
- 结果只留在 DSH 会话中，不写知己正式反馈、验证库或桌面端数据。

第一版是 Skill-only：日志已经由用户在会话中提供，不需要文件读取、历史聚合、写入或系统工具，所以没有 Host Tool。

## 开发

```powershell
cd C:\path\to\zhiji\apps\zhiji-dsh-plugin
npm test
npm pack --pack-destination .\dist
```

包没有 `install`、`prepare` 或 `build` 脚本，不含 native dependency，也不主动联网。

## 安装到 DSH Profile

下面的 tarball 是示例；正式使用时替换为发布包路径或包名。`dsh plugin` 是 DSH 官方包管理入口：

```powershell
dsh plugin --profile web add .\zhiji-dsh-plugin-0.1.0.tgz
dsh --profile web --no-open
```

首次修改 Profile 的 Bundle 集合后，按 DSH 约定重启该 Profile。Web UI 中粘贴单日日志后输入 `/zhiji-daily-review` 即可触发。

## 移除

```powershell
dsh plugin --profile web remove zhiji-dsh-plugin
dsh --profile web --no-open
```

移除由 DSH 官方 CLI 同时处理 dependency 和 Bundle layer；Profile 仍由 DSH 自己启动。

## 兼容版本

S1 在 DSH `0.1.0-rc.8`、上游提交 `141eb6fef83422698aef7a981029e843e8161534`、Node `v24.18.0` 和 pnpm `11.22.0` 上验证。插件只依赖 DSH 的公开 Skill/Bundle 行为，不使用 DSH 源码绝对路径或 deep import；后续 DSH 版本需要重新验证。

## 已知限制

- 只支持当前会话中用户明确粘贴的单日日志；不读取日志目录，不做周/月/项目复盘。
- 不写入 `复盘/每日反馈/`、`verified-patterns.md` 或桌面端数据目录。
- 不提供自定义 Web UI；结果使用 DSH Web UI 的普通会话消息。
- 本包不提供模型或 API Key。S1 的 keyless Runtime 验证使用了仅测试用的本地确定性模型适配器；真实模型效果仍需用户在自己的 DSH 配置中观察。

## 安全边界

插件只注册一个 Skill，并仅读取自身随包携带的 Markdown。它不读取凭据、不启动子进程、不注册 Shell、不加载 native module、不主动联网，也不调用知己桌面端或项目路径。
