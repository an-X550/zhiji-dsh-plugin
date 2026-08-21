import { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'

const OFF = ReasoningEffortId('off')
const REPLY = `📋 8月21日 知己每日复盘

📌 事实
「对方问了验收标准后，我发现真正卡住的是风险边界，不是页面数量」

🔍 主要洞察
推断：你把“继续补页面”当成推进方式，但这次真正结束讨论的是先澄清风险边界。
证据边界：这是当天一次事件的观察，是否能重复仍待验证。

⚡ 单一行动
建议：开始改页面前先写下一个最大上线风险。
验证：明天开始工作时，你会先检查风险，而不是直接增加页面细节。`

function textOf(messages) {
  return messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

class FixtureAdapter extends LlmAdapter {
  async resolveModel(provider, model) {
    return {
      provider,
      id: model,
      name: model,
      reasoning: { efforts: [{ id: OFF, name: 'Off' }], defaultEffort: OFF },
    }
  }

  async *stream(options) {
    const prompt = textOf(options.messages)
    const isTitleRequest = prompt.includes('Generate the session title')
    if (isTitleRequest) {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '知己每日复盘 fixture' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '知己每日复盘 fixture' } }
      yield { type: 'usage', usage: { inputTokens: 4, outputTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }

    const isReview = prompt.includes('/zhiji-daily-review')
    if (isReview) {
      if (!prompt.includes('<skill_content name="zhiji-daily-review">')) {
        throw new Error('S1 fixture: zhiji-daily-review was not injected into the official runtime')
      }
      if (!prompt.includes('验收标准') || !prompt.includes('风险边界')) {
        throw new Error('S1 fixture: dated journal fixture was not passed to the model')
      }
    }

    const reply = isReview ? REPLY : 'DSH profile restart passed.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 32, outputTokens: 48 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'zhiji-dsh-s1-fixture-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(['zhiji-s1-fixture'], new FixtureAdapter())
}
