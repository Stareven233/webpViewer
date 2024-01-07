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
  const eventArr = Object.keys(Type).filter(e => typeof e === 'string').map(e => `event${e}`)

  //touchstart事件，delta记录开始触摸位置
  function touchStart(event: TouchEvent) {
    this.delta = {}
    this.delta.x = event.touches[0].pageX
    this.delta.y = event.touches[0].pageY
    this.delta.time = new Date().getTime()
  }

  /**
   * touchend事件，计算两个事件之间的位移量
   * 1、如果位移量很小或没有位移，看做点击事件
   * 2、如果位移量较大，x大于y，可以看做平移，x>0,向右滑，反之向左滑。
   * 3、如果位移量较大，x小于y，看做上下移动，y>0,向下滑，反之向上滑
   * 这样就模拟的移动端几个常见的时间。
   * */
  function touchEnd(event: TouchEvent) {
    const delta = this.delta
    delete this.delta
    const timegap = new Date().getTime() - delta.time
    delta.x -= event.changedTouches[0].pageX
    delta.y -= event.changedTouches[0].pageY

    if (Math.abs(delta.x) < 5 && Math.abs(delta.y) < 5) {
      if (timegap < 1000) {
        if (this['eventclick']) {
          this['eventclick'].map((fn: Function) => fn(event))
        }
      } else {
        if (this['eventpress']) {
          this['eventpress'].map((fn: Function) => fn(event))
        }
      }
      return
    }

    if (Math.abs(delta.x) > Math.abs(delta.y)) {
      if (delta.x > 0) {
        if (this['eventslideleft']) {
          this['eventslideleft'].map((fn: Function) => fn(event))
        }
      } else {
        this['eventslideright'].map((fn: Function) => fn(event))
      }
    } else {
      if (delta.y > 0) {
        if (this['eventslidedown']) {
          this['eventslidedown'].map((fn: Function) => fn(event))
        }
      } else {
        this['eventslideup'].map((fn: Function) => fn(event))
      }
    }
  }

  function bind(dom: HTMLElement, type: string, callback: Function) {
    if (!dom) {
      console.error('dom is null or undefined')
    }
    const flag = eventArr.some(key => dom[key])
    if (!flag) {
      dom.addEventListener('touchstart', touchStart)
      dom.addEventListener('touchend', touchEnd)
    }
    if (!dom['event' + type]) {
      dom['event' + type] = []
    }
    dom['event' + type].push(callback)
  }

  function remove(dom: HTMLElement, type: string, callback: Function) {
    if (!dom['event' + type]) {
      return
    }
    for (let i = 0; i < dom['event' + type].length; i++) {
      if (dom['event' + type][i] === callback) {
        dom['event' + type].splice(i--, 1)
      }
    }
    if (!dom['event' + type] || dom['event' + type].length !== 0) {
      return
    }
    delete dom['event' + type]
    const flag = eventArr.every(key => !dom[key])
    if (flag) {
      dom.removeEventListener('touchstart', touchStart)
      dom.removeEventListener('touchend', touchEnd)
    }
  }

  return {
    Type,
    bind,
    remove,
  }
})()
