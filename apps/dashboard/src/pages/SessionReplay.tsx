import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type ReplayFrameView, type SessionEvent } from '../lib/api'
import { useAppState } from '../store'
import { fromNow } from '../lib/format'

type FrameEvent = SessionEvent & { frame: ReplayFrameView }

export function SessionReplay() {
  const { id = '' } = useParams()
  const { appId } = useAppState()
  const { data, isLoading } = useQuery({
    queryKey: ['session', appId, id],
    queryFn: () => api.session(appId, id),
  })

  const frames = useMemo(
    () => (data?.events ?? []).filter((e): e is FrameEvent => e.frame !== null),
    [data],
  )
  const errorTs = useMemo(() => {
    const err = (data?.events ?? []).find((e) => e.kind === 'error')
    return err ? err.ts : null
  }, [data])

  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i >= frames.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 800)
    return () => clearInterval(timer.current)
  }, [playing, frames.length])

  if (isLoading) return <div className="card p-8 text-sm text-slate-500">加载中…</div>
  if (!data) return <div className="card p-8 text-sm text-rose-300">会话不存在或已被删除</div>

  const current = frames[Math.min(idx, Math.max(frames.length - 1, 0))]

  return (
    <div className="space-y-5">
      <div>
        <Link to="/sessions" className="text-xs text-slate-400 hover:text-brand-400">
          ← 返回会话列表
        </Link>
        <h1 className="mt-2 text-lg font-medium text-white">会话回放</h1>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
          <span className="font-mono">{id.slice(0, 16)}</span>
          <span>共 {frames.length} 帧</span>
          {errorTs && <span className="rounded bg-rose-500/10 px-2 py-0.5 text-rose-300">含错误</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">回放舞台</h2>
            <div className="flex gap-2">
              <button
                className="btn-primary py-1.5"
                onClick={() => {
                  setIdx(0)
                  setPlaying(true)
                }}
                disabled={frames.length === 0}
              >
                {playing ? '暂停' : '播放'}
              </button>
              <button className="btn-ghost py-1.5" onClick={() => setPlaying(false)}>
                停止
              </button>
            </div>
          </div>

          <ReplayStage frame={current} />

          <input
            type="range"
            min={0}
            max={Math.max(frames.length - 1, 0)}
            value={idx}
            onChange={(e) => {
              setPlaying(false)
              setIdx(Number(e.target.value))
            }}
            className="mt-3 w-full accent-brand-500"
          />
          <div className="mt-1 text-xs text-slate-500">
            {current ? `${current.frame.type} · ${current.frame.url} · +${current.frame.t}ms` : '暂无帧数据'}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-white/5 px-5 py-3">
            <h2 className="card-title">事件时间轴</h2>
          </div>
          <div className="max-h-[600px] divide-y divide-white/5 overflow-auto">
            {data.events.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  const fi = frames.findIndex((f) => f.ts >= e.ts)
                  setPlaying(false)
                  setIdx(fi < 0 ? Math.max(frames.length - 1, 0) : fi)
                }}
                className="flex w-full items-center gap-2 px-5 py-2 text-left text-xs hover:bg-white/5"
              >
                <span className={e.kind === 'error' ? 'text-rose-400' : e.frame ? 'text-brand-400' : 'text-slate-600'}>
                  {e.kind === 'error' ? '⚠' : e.frame ? '●' : '·'}
                </span>
                <span className="shrink-0 text-slate-500">{fromNow(new Date(e.ts).toISOString())}</span>
                <span className="shrink-0 text-slate-400">{e.kind}</span>
                <span className="truncate text-slate-300">{e.frame?.url ?? e.url ?? ''}</span>
              </button>
            ))}
            {data.events.length === 0 && <div className="py-10 text-center text-sm text-slate-500">暂无事件</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 用精简 DOM 快照在舞台中按相对坐标重建界面缩略，模拟用户当时看到的页面 */
function ReplayStage({ frame }: { frame?: FrameEvent }) {
  if (!frame) {
    return (
      <div className="grid aspect-[16/10] w-full place-items-center rounded-lg bg-white/[0.02] text-sm text-slate-600">
        暂无可回放的帧
      </div>
    )
  }
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-white/[0.02]">
      {frame.frame.nodes.map((n, i) => (
        <div
          key={i}
          className="absolute overflow-hidden rounded border border-brand-500/30 bg-brand-500/5 px-1 text-[10px] text-slate-300"
          style={{ left: `${n.rect.x}%`, top: `${n.rect.y}%`, width: `${n.rect.w}%`, height: `${n.rect.h}%` }}
          title={n.text ?? n.value ?? n.tag}
        >
          {n.value !== undefined ? `▮ ${n.value}` : (n.text ?? n.tag)}
        </div>
      ))}
    </div>
  )
}
