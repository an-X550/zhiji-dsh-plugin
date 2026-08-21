import { CallId, LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'

const OFF = ReasoningEffortId('off')
const TOOL_NAME = 'zhiji_read_journal_range'

const REPLIES = {
  weekly: `## 聊天摘要
📌 关键发现：工具返回的日期材料显示，先确认风险再动手正在减少返工，但仍有一次反例。
🧭 下周建议：继续把风险确认作为开始工作的前置检查。

---
[聊天摘要结束。以下为完整周度复盘]

## 一、回顾目标
目标：从配置日志范围中判断本周的工作顺序变化。
## 二、评估结果
主要洞察：S3_RANGE_MATERIAL_2026_08_19 支持“先确认风险再动手”是跨日期重复证据，而不是普通摘要。
## 三、分析原因（正向）
风险确认把验收边界提前，减少了后续返工。
## 四、分析原因（负向）
材料仍有一次先改页面的反例，证据不足以判断顺序已经稳定改变。
## 五、重来演练
第一次修改前先写一个最大风险和检查方式。
## 六、下周规划
目标：保持风险检查前置。
手段：每次开始页面工作前写一个最大风险。
检查方式：下一个工作日记录是否先完成风险检查。
S3_WEEKLY_ACTION_SINGLE
## 质量自检
材料由 zhiji_read_journal_range 读取；只使用了配置范围内的日期，不读取桌面端，也没有写回日志。
## 用户回应区
### AI 复盘中我认可的判断
### AI 复盘中我不认可或觉得偏的判断
### AI 没提，但我认为重要的事
### 下周不可丢的硬约束`,
  monthly: `## 聊天摘要
📌 关键发现：范围工具返回的多日期材料显示，风险确认在本月后半段反复出现，但没有上月基线。
🧭 下月建议：把风险边界设为页面工作的前置检查。

---
[聊天摘要结束。以下为完整月度复盘]

## 一、回顾目标
目标：判断本月是否形成了更可靠的风险确认顺序。
## 二、评估结果
S3_RANGE_MATERIAL_2026_08_19 在多个日期出现，支持重复模式；对比基线缺失。
## 三、分析原因（正向）
风险清单把验收标准变成了可讨论对象。
## 四、分析原因（负向）
仍有忙时跳过检查的反例，不能宣称长期稳定。
## 五、重来演练
项目开始时先写验收标准和最大风险。
## 六、下月规划
目标：稳定先确认风险的顺序。
手段：每次开始页面工作前写最大风险。
检查点：记录是否先完成风险检查。
待验证假说：先写风险会减少无效页面返工。
S3_MONTHLY_ACTION_SINGLE
## 质量自检
材料来自显式配置范围；上月对比基线缺失，没有写回文件。`,
  project: `## 聊天摘要
📌 关键发现：项目范围内的日志材料和项目结果共同显示，风险边界最终影响了验收顺序，但日志本身不是验收证明。
🧭 后续建议：把验收标准和最大风险设为项目启动检查。

---
[聊天摘要结束。以下为完整项目复盘]

## 一、回顾目标
目标：在项目范围内确认上线风险边界和验收标准。
## 二、评估结果
S3_RANGE_MATERIAL_2026_08_19 是过程证据；项目结果材料仍需由用户明确提供，不能只凭日志宣称完成。
## 三、分析原因（正向）
风险清单让过程判断与验收标准建立了联系。
## 四、分析原因（负向）
早期仍把页面数量当推进指标，日志只能支持过程偏差判断。
## 五、重来演练
第一次页面修改前先确认验收标准。
## 六、后续规划
下一次项目启动时把验收标准和最大风险设为前置检查，并在首次评审时复核。
S3_PROJECT_ACTION_SINGLE
## 质量自检
材料来自显式配置范围；Tool 是只读补充证据，没有读取桌面端或写入报告。`,
}

function textOf(messages) {
  return messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

function toolResultText(messages) {
  return messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
    .filter((block) => block.type === 'tool-result')
    .flatMap((block) => block.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

function textResponse(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 16, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function toolCallResponse(args) {
  const id = CallId('s3-journal-range-1')
  const argumentsJson = JSON.stringify(args)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: TOOL_NAME, argumentsDelta: argumentsJson.slice(0, 7) },
    { type: 'tool-call-delta', index: 0, id, argumentsDelta: argumentsJson.slice(7) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: TOOL_NAME, arguments: argumentsJson } },
    { type: 'usage', usage: { inputTokens: 12, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

class FixtureAdapter extends LlmAdapter {
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, reasoning: { efforts: [{ id: OFF, name: 'Off' }], defaultEffort: OFF } }
  }

  async *stream(options) {
    const prompt = textOf(options.messages)
    if (prompt.includes('Generate the session title')) {
      yield* textResponse('知己日志范围复盘 fixture')
      return
    }

    const routes = [
      ['weekly', '/zhiji-weekly-review', 'zhiji-weekly-review', { start_date: '2026-08-17', end_date: '2026-08-23' }],
      ['monthly', '/zhiji-monthly-review', 'zhiji-monthly-review', { start_date: '2026-08-01', end_date: '2026-08-31' }],
      ['project', '/zhiji-project-review', 'zhiji-project-review', { start_date: '2026-08-17', end_date: '2026-08-21' }],
    ]
    const route = routes.find(([, command]) => prompt.includes(command))
    if (route === undefined) {
      yield* textResponse('DSH profile restart passed.')
      return
    }

    const [kind, , skillName, range] = route
    if (!prompt.includes(`<skill_content name="${skillName}">`)) throw new Error(`S3 fixture: ${skillName} was not injected`)
    if (!options.tools?.some((tool) => tool.name === TOOL_NAME)) throw new Error('S3 fixture: journal range Tool was not visible')

    const aggregate = toolResultText(options.messages)
    if (!aggregate) {
      yield* toolCallResponse(range)
      return
    }
    if (!aggregate.includes('S3_RANGE_MATERIAL_2026_08_19')) throw new Error('S3 fixture: Tool result did not reach the next model request')
    yield* textResponse(REPLIES[kind])
  }
}

export const name = 'zhiji-dsh-s3-fixture-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(['zhiji-s3-fixture'], new FixtureAdapter())
}
