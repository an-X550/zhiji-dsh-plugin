import { readFileSync } from 'node:fs'

const rawSkill = readFileSync(new URL('./skills/daily-review.md', import.meta.url), 'utf8')
const skillContent = rawSkill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()

export const name = 'zhiji-dsh-plugin'
export const inject = ['skills']

export function apply(ctx) {
  ctx.skills.register({
    name: 'zhiji-daily-review',
    description: '把用户明确提供的一段单日日志转成有证据边界的知己每日复盘：一个主要洞察、一个小行动和明天可观察的验证。',
    whenToUse: '用户粘贴单日日志并请求知己每日复盘时使用；不读取文件、不写入正式报告。',
    source: 'bundled',
    content: skillContent,
  })
}
