// 一个故意抛错的业务函数，用于演示 Source Map 还原。
// esbuild 会把它打包成压缩产物并产出 .map，
// 运行打包后文件得到的堆栈指向 dist/app.cjs，经还原后应回到本文件源码位置。

function checkout(orderId: string): number {
  const order: any = undefined
  // 这里会抛：Cannot read properties of undefined (reading 'items')
  return order.items.length
}

export function pay(): void {
  const total = checkout('order-9988')
  console.log('paid', total)
}

pay()
