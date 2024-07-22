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
  const threshold = 150

  //touchstart事件，delta记录开始触摸位置
  function touchStart(event: TouchEvent) {
    // this: 绑定的dom元素
    this.touch_start = {
      x: event.touches[0].pageX,
      y: event.touches[0].pageY,
      time: new Date().getTime(),
    }
    // 最大触点的数量
    this.max_n_touch = event.touches.length
    // console.log(window.innerHeight)
  }

  //touchstart事件，delta记录开始触摸位置
  function touchMove(event: TouchEvent) {
    this.max_n_touch = Math.max(this.max_n_touch, event.touches.length)
    // console.log(window.innerHeight)
  }

  /**
   * touchend事件，计算两个事件之间的位移量
   * 1、如果位移量很小或没有位移，看做点击事件
   * 2、如果位移量较大，x大于y，可以看做平移，x>0,向右滑，反之向左滑。
   * 3、如果位移量较大，x小于y，看做上下移动，y>0,向下滑，反之向上滑
   * 这样就模拟的移动端几个常见的时间。
   * */
  function touchEnd(event: TouchEvent) {
    if (this.max_n_touch !== 1) {
      // 暂不支持多指功能
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

    if (abs_x < 50 && abs_y < 50) {
      // 位移小，点击或长按
      delta.time < 500? gesture('click'): gesture('press')
    } else if (abs_x > threshold && abs_y < threshold) {
      delta.x > 0? gesture('slideleft'): gesture('slideright')
    } else if (this.touch_start.x > this.clientWidth/2 && abs_y > threshold && abs_x < threshold) {
      // 区域右边才支持上下切换，左侧保留给原生的页面滑动
      delta.y > 0? gesture('slidedown'): gesture('slideup')
    }
  }
 
  function bind(dom: HTMLElement, type: string, callback: Function) {
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

  function remove(dom: HTMLElement, type: string, callback: Function) {
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
