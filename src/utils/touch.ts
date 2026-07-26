/**
https://www.cnblogs.com/hcfinal/p/11261971.html
     * 用touch事件模拟点击、左滑、右滑、上拉、下拉等时间，
     * 是利用touchstart和touchend两个事件发生的位置来确定是什么操作。
     * 例如：
     * 1、touchstart和touchend两个事件的位置基本一致，也就是没发生位移，那么可以确定用户是想点击按钮等。
     * 2、touchend在touchstart正左侧，说明用户是向左滑动的。
     * 利用上面的原理，可以模拟移动端的各类事件。
    **/
export default (function () {
  //支持事件列表
  enum Type {
    slideleft, slideright, slideup, slidedown, click, press
  }
  // const eventArr = ['eventslideleft', 'eventslideright', 'eventslideup', 'eventslidedown', 'eventclick', 'eventpress']
  const eventArr = Object.keys(Type).filter(e => typeof e === 'string').map(e => `event_${e}`)

  // 点击判定：位移与耗时都要足够小
  const TAP_MOVE = 10
  const TAP_TIME = 500
  // 方向锁定阈值：位移超过它就锁死主导轴，避免斜向拖动同时命中横竖两种手势
  const LOCK_MOVE = 12
  // 快速轻扫：位移不够但速度足够快也算翻页（px/ms）
  const FLING_SPEED = 0.5

  /**
   * 手势宿主：绑定了手势的 DOM 元素。
   * 手势中间状态直接挂在元素上，多个元素各自独立，无需额外的全局表。
   */
  type GestureHost = HTMLElement & {
    touch_start?: { x: number, y: number, time: number }
    touch_origin?: Element | null
    // 本次手势是否已作废（多指缩放、或让位给原生滚动）
    gesture_void?: boolean
    // 主导轴，锁定后不再改变
    axis_lock?: '' | 'x' | 'y'
    [key: string]: any
  }

  /** 翻页阈值按视口短边取比例，兼顾大屏与小屏；下限保证小屏不至于太灵敏 */
  const slideThreshold = () => Math.max(60, Math.min(window.innerWidth, window.innerHeight) * 0.15)

  /**
   * 从手势起点元素向上找可在指定轴滚动的祖先。
   * 找到则说明用户意图是滚动内容（如文本面板、文件列表），不应劫持为翻页。
   * 到 stopAt（绑定手势的容器）为止，容器本身也参与判断。
   */
  const canScrollAlong = (start: Element | null | undefined, stopAt: Element, axis: 'x' | 'y') => {
    let node: Element | null | undefined = start
    while (node) {
      const [scrollSize, clientSize] = axis === 'y'
        ? [node.scrollHeight, node.clientHeight]
        : [node.scrollWidth, node.clientWidth]
      // 有溢出内容才算可滚动，还要确认 CSS 没把滚动关掉
      if (scrollSize - clientSize > 1) {
        const overflow = getComputedStyle(node)[axis === 'y' ? 'overflowY' : 'overflowX']
        if (overflow === 'auto' || overflow === 'scroll') {
          return true
        }
      }
      if (node === stopAt) {
        break
      }
      node = node.parentElement
    }
    return false
  }

  //touchstart事件，delta记录开始触摸位置
  function touchStart(this: GestureHost, event: TouchEvent) {
    // this: 绑定的dom元素
    // 多指（如双指缩放）直接作废本次手势，避免松手瞬间被误判成滑动
    if (event.touches.length > 1) {
      this.gesture_void = true
      return
    }
    this.gesture_void = false
    this.axis_lock = ''
    this.touch_start = {
      x: event.touches[0].pageX,
      y: event.touches[0].pageY,
      time: new Date().getTime(),
    }
    // 起点所在元素，用于判断原生滚动是否应优先
    this.touch_origin = event.target as Element
  }

  function touchMove(this: GestureHost, event: TouchEvent) {
    // 中途出现第二根手指同样作废（缩放的典型序列）
    if (event.touches.length > 1) {
      this.gesture_void = true
      return
    }
    if (this.gesture_void || !this.touch_start || this.axis_lock) {
      return
    }
    const dx = Math.abs(event.touches[0].pageX - this.touch_start.x)
    const dy = Math.abs(event.touches[0].pageY - this.touch_start.y)
    // 首次超过阈值时锁定主导轴，之后不再改变
    if (Math.max(dx, dy) < LOCK_MOVE) {
      return
    }
    this.axis_lock = dx > dy ? 'x' : 'y'
    // 该轴上存在可滚动祖先时让位给原生滚动，不再当作翻页
    if (canScrollAlong(this.touch_origin, this, this.axis_lock)) {
      this.gesture_void = true
    }
  }

  /**
   * touchend事件，计算两个事件之间的位移量
   * 1、如果位移量很小或没有位移，看做点击事件
   * 2、位移较大且锁定在x轴，按方向派发左右滑
   * 3、位移较大且锁定在y轴，按方向派发上下滑
   * 滚动冲突与多指缩放已在 touchstart/touchmove 中过滤。
   * */
  function touchEnd(this: GestureHost, event: TouchEvent) {
    if (!this.touch_start) {
      return
    }

    const delta = Object.assign({}, this.touch_start)
    delta.time = new Date().getTime() - delta.time
    delta.x -= event.changedTouches[0].pageX
    delta.y -= event.changedTouches[0].pageY
    const abs_x = Math.abs(delta.x)
    const abs_y = Math.abs(delta.y)

    const gesture = (name: string) => {
      const key = `event_${name}`
      if (!Object.keys(this).includes(key)) {
        // console.warn('no', name, 'in', this)
        return
      }
      // console.log('has', name)
      this[key].map((fn: Function) => fn(event))
    }

    // 点击/长按不受作废标记影响：多指结束后的残留触点不会走到这里（位移通常已超阈值）
    if (abs_x < TAP_MOVE && abs_y < TAP_MOVE) {
      // 位移小，点击或长按
      delta.time < TAP_TIME ? gesture('click') : gesture('press')
      return
    }

    if (this.gesture_void || !this.axis_lock) {
      return
    }

    const threshold = slideThreshold()
    // 位移够长，或者速度够快的轻扫，都算一次翻页
    const reached = (distance: number) => distance > threshold || distance / delta.time > FLING_SPEED

    if (this.axis_lock === 'x') {
      if (reached(abs_x)) {
        delta.x > 0 ? gesture('slideleft') : gesture('slideright')
      }
      return
    }
    if (reached(abs_y)) {
      delta.y > 0 ? gesture('slidedown') : gesture('slideup')
    }
  }

  function bind(dom: any, type: string, callback: Function) {
    const key = `event_${type}`
    if (!dom) {
      console.error('dom is null or undefined')
    }
    const flag = eventArr.some(key => dom[key])
    if (!flag) {
      dom.addEventListener('touchstart', touchStart, true)
      dom.addEventListener('touchmove', touchMove, true)
      dom.addEventListener('touchend', touchEnd, true)
    }
    if (!dom[key]) {
      dom[key] = []
    }
    dom[key].push(callback)
  }

  function remove(dom: any, type: string, callback: Function) {
    const key = `event_${type}`
    if (!dom[key]) {
      return
    }
    for (let i = 0; i < dom[key].length; i++) {
      if (dom[key][i] === callback) {
        dom[key].splice(i--, 1)
      }
    }
    if (!dom[key] || dom[key].length !== 0) {
      return
    }
    delete dom[key]
    const flag = eventArr.every(key => !dom[key])
    if (flag) {
      dom.removeEventListener('touchstart', touchStart)
      dom.removeEventListener('touchmove', touchMove)
      dom.removeEventListener('touchend', touchEnd)
    }
  }

  return {
    Type,
    bind,
    remove,
  }
})()
