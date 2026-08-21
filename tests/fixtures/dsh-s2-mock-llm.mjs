import { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'

const OFF = ReasoningEffortId('off')

const REPLIES = {
  weekly: `## 聊天摘要
📌 关键发现：本周从“补页面”转向先确认风险边界。
🧭 下周建议：开始工作前先写一个最大风险，并检查是否改变了顺序。

---
[聊天摘要结束。以下为完整周度复盘]

## 一、回顾目标
目标：确认本周上线方案的风险边界。
## 二、评估结果
本周后半段先列风险后对齐变快；这是日期材料支持的变化。
## 三、分析原因（正向）
风险清单把讨论从页面数量拉回验收标准。
## 四、分析原因（负向）
8月17日和8月19日仍有先补页面的偏差；证据不足以判断已稳定改变。
## 五、重来演练
如果重来，第一次页面修改前先写最大风险。
## 六、下周规划
目标：先确认风险边界。
手段：开始页面工作前写一个最大风险。
检查方式：明天开始工作时先检查风险而不是直接补细节。
## 质量自检
材料来源是本次会话粘贴的3个日期；趋势只基于这些日期，其他日期证据不足。
## 用户回应区
### AI 复盘中我认可的判断
### AI 复盘中我不认可或觉得偏的判断
### AI 没提，但我认为重要的事
### 下周不可丢的硬约束`,
  monthly: `## 聊天摘要
📌 关键发现：月内反复出现“先补页面、后确认边界”的偏差，风险清单在后半月缩短了对齐时间。
🧭 下月建议：把风险边界设为页面工作的前置检查。

---
[聊天摘要结束。以下为完整月度复盘]

## 一、回顾目标
目标：在本月确定上线方案的验收边界。
## 二、评估结果
5个日期显示先写风险后对齐更快，但仍有忙时回到补页面的反例。
## 三、分析原因（正向）
风险清单把验收标准变成了可讨论对象。
## 四、分析原因（负向）
单次成功不能证明长期稳定；本月没有上月材料，环比证据不足。
## 五、重来演练
项目开始时先写验收标准和最大风险。
## 六、下月规划
目标：稳定先确认风险边界的顺序。
手段：每次开始页面工作前写最大风险。
检查点：记录是否先完成风险检查。
待验证假说：先写风险会减少无效页面返工。
## 质量自检
材料来源是本次会话粘贴的5个日期；上月对比基线缺失。`,
  project: `## 聊天摘要
📌 关键发现：项目最终按风险边界完成验收，但早期把页面数量当成推进指标。
🧭 后续建议：把验收标准和最大风险设为项目启动检查。

---
[聊天摘要结束。以下为完整项目复盘]

## 一、回顾目标
目标是在本周确定上线风险边界和验收标准。
## 二、评估结果
三个里程碑完成，方案在十分钟内对齐；页面数量没有增加。
## 三、分析原因（正向）
风险清单让结果和验收标准连接起来。
## 四、分析原因（负向）
早期把页面数量误当推进指标，偏差在8月19日才被修正。
## 五、重来演练
第一次页面修改前先确认验收标准。
## 六、后续规划
下一次项目启动时把验收标准和最大风险设为前置检查，并在首次评审时复核。
## 质量自检
材料来源包含项目范围、目标、过程、结果和偏差；没有读取桌面端数据。`,
}

const INSUFFICIENT = `## 聊天摘要
📌 关键发现：证据不足，当前材料只能确认一次片段，不能判断周期趋势或项目完成度。
🧭 后续建议：补充明确日期、目标和结果。

---
[聊天摘要结束。以下为证据不足的降级复盘]

## 一、回顾目标
证据不足：目标或周期范围不完整。
## 二、评估结果
只能确认当前材料中的一次片段，不能外推。
## 三、分析原因（正向）
无足够材料判断。
## 四、分析原因（负向）
证据不足，不补完故事。
## 五、重来演练
先补齐日期、范围、目标和结果。
## 六、后续规划
补充材料后再判断；目前不提出周期趋势或项目完成结论。
## 质量自检
证据不足：当前输入未达到该复盘类型的最低材料要求。`

function textOf(messages) {
  return messages.flatMap((message) => Array.isArray(message.content) ? message.content : [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

class FixtureAdapter extends LlmAdapter {
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, reasoning: { efforts: [{ id: OFF, name: 'Off' }], defaultEffort: OFF } }
  }

  async *stream(options) {
    const prompt = textOf(options.messages)
    if (prompt.includes('Generate the session title')) {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '知己周期复盘 fixture' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '知己周期复盘 fixture' } }
      yield { type: 'usage', usage: { inputTokens: 4, outputTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }

    const routes = [
      ['weekly', '/zhiji-weekly-review', 'zhiji-weekly-review', '2026-W34'],
      ['monthly', '/zhiji-monthly-review', 'zhiji-monthly-review', '2026-08'],
      ['project', '/zhiji-project-review', 'zhiji-project-review', '项目：'],
    ]
    const route = routes.find(([, command]) => prompt.includes(command))
    if (route === undefined) {
      const reply = 'DSH profile restart passed.'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: reply }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 8 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }

    const [kind, , skillName, fixtureMarker] = route
    if (!prompt.includes(`<skill_content name="${skillName}">`)) throw new Error(`S2 fixture: ${skillName} was not injected`)
    if (!prompt.includes(fixtureMarker)) throw new Error(`S2 fixture: ${fixtureMarker} was not passed`)
    const reply = prompt.includes('证据不足 fixture') ? INSUFFICIENT : REPLIES[kind]
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 64, outputTokens: 96 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'zhiji-dsh-s2-fixture-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(['zhiji-s2-fixture'], new FixtureAdapter())
}
