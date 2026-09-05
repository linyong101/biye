import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import type { ECharts } from 'echarts/core'

// 按需注册看板实际用到的图表与组件，避免把完整 echarts（>1MB）打进包
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  CanvasRenderer,
])

/**
 * ECharts 轻量封装。
 * 不引入 echarts-for-react，自己管理实例生命周期：
 * 挂载时 init、option 变化时 setOption、卸载时 dispose，并跟随窗口 resize。
 */
export function Chart({ option, height = 280 }: { option: EChartsOption; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    // notMerge=true 避免切换数据时残留上一份 series
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={containerRef} style={{ height }} className="w-full" />
}

/** 统一图表底色与网格，保持看板视觉一致 */
export const baseGrid = { left: 8, right: 16, top: 24, bottom: 8, containLabel: true }

export const axisStyle = {
  axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
  axisLabel: { color: '#94a3b8', fontSize: 11 },
  splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } },
}
