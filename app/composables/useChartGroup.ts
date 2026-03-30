export function useChartGroup(groupId: string) {
  const chartRefs: any[] = []

  function registerChart(chartComponent: any) {
    if (!chartComponent || !import.meta.client) return
    const instance = chartComponent?.chart
    if (instance) {
      instance.group = groupId
      // Dynamically import echarts to avoid SSR issues
      import('echarts/core').then((echarts) => {
        echarts.connect(groupId)
      })
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
