import { prisma } from '../db'

/**
 * 告警引擎（轻量版）。
 * 支持三类规则：新 issue 出现、错误量突增、性能指标劣化。
 * 推送到企业微信 / 钉钉 / 飞书机器人 Webhook，中文场景开箱可用。
 */

interface AlertPayload {
  title: string
  content: string
}

async function push(webhook: string, payload: AlertPayload): Promise<void> {
  // 企业微信机器人格式，钉钉/飞书格式相近，可后续按 webhook 域名适配
  const body = {
    msgtype: 'markdown',
    markdown: { content: `### ${payload.title}\n${payload.content}` },
  }
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[vigil] 告警推送失败', err)
  }
}

/** 出现新 issue 时触发 */
export async function notifyNewIssue(appId: string, issueId: string, title: string, level: string, stack?: string): Promise<void> {
  const rules = await prisma.alertRule.findMany({ where: { appId, type: 'new_issue', enabled: true } })
  if (rules.length === 0) return

  const project = await prisma.project.findUnique({ where: { appId } })
  const content = [
    `**项目**：${project?.name ?? appId}（${appId}）`,
    `**等级**：${level}`,
    `**内容**：${title}`,
    stack ? `**堆栈首帧**：\n\`\`\`\n${stack.split('\n').slice(0, 4).join('\n')}\n\`\`\`` : '',
    `[查看详情](http://localhost:5173/issues/${issueId})`,
  ]
    .filter(Boolean)
    .join('\n')

  for (const rule of rules) {
    await push(rule.webhook, { title: '🚨 Vigil 发现新异常', content })
  }
}

/** 错误量突增：当前窗口错误数超过历史均值 * threshold */
export async function checkErrorSpike(appId: string): Promise<void> {
  const rules = await prisma.alertRule.findMany({ where: { appId, type: 'error_spike', enabled: true } })
  if (rules.length === 0) return

  const now = Date.now()
  const hour = 60 * 60 * 1000
  const [current, baseline] = await Promise.all([
    prisma.event.count({ where: { appId, kind: 'error', ts: { gte: new Date(now - hour) } } }),
    prisma.event.count({
      where: { appId, kind: 'error', ts: { gte: new Date(now - hour * 25), lt: new Date(now - hour) } },
    }),
  ])

  const avg = baseline / 24
  for (const rule of rules) {
    if (avg > 0 && current > avg * rule.threshold) {
      await push(rule.webhook, {
        title: '📈 Vigil 错误量突增',
        content: `项目 \`${appId}\` 最近 1 小时错误 ${current} 条，超过过去 24 小时均值（${avg.toFixed(1)} 条/小时）的 ${rule.threshold} 倍。`,
      })
    }
  }
}
