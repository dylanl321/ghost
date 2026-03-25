import * as echarts from 'echarts/core'

export function useChartGroup(groupId: string) {
  const chartRefs: echarts.ECharts[] = []

  function registerChart(chartComponent: any) {
    if (!chartComponent) return
    // vue-echarts exposes the ECharts instance via the .chart property
    const instance = chartComponent?.chart
    if (instance) {
      instance.group = groupId
      echarts.connect(groupId)
      chartRefs.push(instance)
    }
  }

  function unregisterAll() {
    for (const instance of chartRefs) {
      instance.group = ''
    }
    chartRefs.length = 0
  }

  return { registerChart, unregisterAll }
}
