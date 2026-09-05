import { Fragment } from 'react'

/**
 * 极简 Markdown 渲染器。
 * 只需支持 AI 返回内容里的代码块与列表，不引入完整 Markdown 库，
 * 避免为了一个小功能增加几十 KB 依赖。
 */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/```/)

  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-300">
      {blocks.map((block, index) => {
        // 奇数下标为代码块内容
        if (index % 2 === 1) {
          const code = block.replace(/^\w+\n/, '') // 去掉语言标记行
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-lg bg-ink-900/80 p-3 font-mono text-xs leading-relaxed text-slate-300"
            >
              {code}
            </pre>
          )
        }
        return (
          <Fragment key={index}>
            {block
              .split('\n')
              .filter((line) => line.trim() !== '')
              .map((line, i) => (
                <p key={i}>
                  {line.startsWith('>') ? (
                    <span className="text-slate-500">{line.replace(/^>\s*/, '')}</span>
                  ) : (
                    line
                  )}
                </p>
              ))}
          </Fragment>
        )
      })}
    </div>
  )
}
