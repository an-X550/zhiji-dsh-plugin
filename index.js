import { readFileSync } from 'node:fs'

const skillNames = ['daily-review', 'weekly-review', 'monthly-review', 'project-review']
const skills = skillNames.map((skillName) => {
  const rawSkill = readFileSync(new URL(`./skills/${skillName}.md`, import.meta.url), 'utf8')
  const frontmatter = rawSkill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1] ?? ''
  const field = (name) => frontmatter.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1] ?? ''
  return {
    name: field('name'),
    description: field('description'),
    whenToUse: field('whenToUse'),
    content: rawSkill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim(),
  }
})

export const name = 'zhiji-dsh-plugin'
export const inject = ['skills']

export function apply(ctx) {
  for (const skill of skills) {
    ctx.skills.register({
      ...skill,
      source: 'bundled',
    })
  }
}
