/* global Vigil */
/**
 * Demo 站点逻辑：制造各类线上异常，验证 SDK 采集链路。
 * 这里的每一个按钮，都对应一类真实的生产事故。
 */

const REPORT_ENDPOINT = 'http://localhost:3001/api/report'

Vigil.init({
  appId: 'demo-shop',
  endpoint: REPORT_ENDPOINT,
  release: '1.4.2',
  environment: 'production',
  debug: false,
  slowRequestThreshold: 2000,
  sensitiveKeys: ['phone'],
  beforeSend(event) {
    // 演示钩子能力：过滤掉测试环境的噪音数据
    if (event.url?.includes('/health')) return null
    return event
  },
})

Vigil.setUser('user-' + Math.random().toString(36).slice(2, 8))

const statusEl = document.getElementById('sdk-status')
statusEl.textContent = 'Vigil SDK 已接入 · appId=demo-shop'
statusEl.classList.add('ok')

const logEl = document.getElementById('log')
function log(message, type = '') {
  const line = document.createElement('div')
  line.className = 'line ' + type
  line.textContent = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`
  logEl.prepend(line)
}

/* ---------------- 异常制造按钮 ---------------- */

const ERROR_CASES = [
  {
    title: 'JS 运行时异常',
    desc: '访问 undefined 的属性，最常见的线上错误',
    action: () => {
      const product = undefined
      // eslint-disable-next-line no-undef
      return product.price.toFixed(2)
    },
  },
  {
    title: 'Promise 未捕获',
    desc: '异步请求失败却没有 catch',
    action: () => {
      Promise.reject(new Error('request timeout after 3000ms'))
    },
  },
  {
    title: '接口 500',
    desc: '服务端返回 5xx，SDK 会记录响应体',
    action: async () => {
      await fetch('/api/mock/500')
    },
  },
  {
    title: '慢请求',
    desc: '超过阈值(2s)的请求，用于验证性能告警',
    action: async () => {
      await fetch('/api/mock/slow')
    },
  },
  {
    title: '资源加载失败',
    desc: '图片/脚本 404，捕获阶段可监听到',
    action: () => {
      const img = new Image()
      img.src = '/not-exist-' + Date.now() + '.png'
      document.body.appendChild(img)
    },
  },
  {
    title: '白屏',
    desc: '清空页面内容，触发白屏检测（2 秒后刷新页面）',
    action: () => {
      document.querySelector('.container').innerHTML = ''
      log('已清空页面内容，等待白屏检测…', 'error')
      setTimeout(() => location.reload(), 2500)
    },
  },
]

const MISC_CASES = [
  {
    title: '手动上报异常',
    desc: 'try/catch 中调用 captureException',
    action: () => {
      try {
        JSON.parse('{ invalid json }')
      } catch (err) {
        Vigil.captureException(err, { scene: 'parse-config' })
      }
    },
  },
  {
    title: '上报业务消息',
    desc: 'captureMessage，用于记录关键业务事件',
    action: () => {
      Vigil.captureMessage('用户进入结算流程', 'info', { step: 'checkout' })
    },
  },
  {
    title: '批量压测（20 条）',
    desc: '验证批量上报与错误指纹聚合',
    action: () => {
      for (let i = 0; i < 20; i++) {
        Vigil.captureException(new Error(`Batch test error #${i}: Cannot read properties of null (reading 'sku')`))
      }
      log('已注入 20 条异常，观察看板是否聚合为 1 个 issue', 'ok')
    },
  },
  {
    title: '立即上报队列',
    desc: 'flush()，不等定时器立即发送',
    action: () => {
      Vigil.flush()
      log('队列已 flush')
    },
  },
]

function renderCases(cases, containerId) {
  const container = document.getElementById(containerId)
  cases.forEach((item) => {
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `<h3>${item.title}</h3><p>${item.desc}</p>`
    const btn = document.createElement('button')
    btn.className = 'btn danger'
    btn.textContent = '触发'
    btn.onclick = () => {
      log(`触发：${item.title}`, 'error')
      try {
        const result = item.action()
        if (result && typeof result.catch === 'function') {
          result.catch(() => undefined)
        }
      } catch (err) {
        Vigil.captureException(err, { scene: 'demo-button' })
        throw err
      }
    }
    card.appendChild(btn)
    container.appendChild(card)
  })
}

renderCases(ERROR_CASES, 'error-grid')
renderCases(MISC_CASES, 'misc-grid')

/* ---------------- 商品与购物车 ---------------- */

const PRODUCTS = [
  { id: 1, name: '无线降噪耳机', price: 899, emoji: '🎧' },
  { id: 2, name: '机械键盘 87 键', price: 469, emoji: '⌨️' },
  { id: 3, name: '4K 显示器 27 寸', price: 1899, emoji: '🖥️' },
  { id: 4, name: '人体工学椅', price: 1299, emoji: '🪑' },
]

let cart = []

const productsEl = document.getElementById('products')
const totalEl = document.getElementById('cart-total')

function renderProducts() {
  productsEl.innerHTML = ''
  PRODUCTS.forEach((p) => {
    const el = document.createElement('div')
    el.className = 'product'
    el.innerHTML = `
      <div class="thumb">${p.emoji}</div>
      <div class="name">${p.name}</div>
      <div class="price">¥${p.price.toFixed(2)}</div>
    `
    const btn = document.createElement('button')
    btn.className = 'btn'
    btn.textContent = '加入购物车'
    btn.onclick = () => {
      cart.push(p)
      renderCart()
      log(`加入购物车：${p.name}`, 'ok')
    }
    el.appendChild(btn)
    productsEl.appendChild(el)
  })
}

function renderCart() {
  totalEl.textContent = `合计：¥${cart.reduce((s, p) => s + p.price, 0).toFixed(2)}`
}

function checkout() {
  if (cart.length === 0) {
    // 故意不校验，直接读取空数组首元素 —— 经典线上事故
    const first = cart[0]
    log(`结算失败：${first.price}`, 'error')
    return first.price
  }
  log(`提交订单成功，共 ${cart.length} 件商品`, 'ok')
  cart = []
  renderCart()
}

renderProducts()
renderCart()

document.getElementById('checkout').onclick = checkout

log('Demo 已就绪，点击任意按钮开始制造异常', 'ok')
