const app = getApp();
const { callCloudFunction } = require('../../utils/request');
const { pickDisplayName } = require('../../utils/text');

Page({
  data: {
    keyword: '',
    clock: '00:00:00',
    loading: false,
    searched: false,
    result: null
  },

  _timer: null,

  onLoad() {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    const kw = app.globalData.searchKeyword || '';
    this.setData({ keyword: kw });
    this.startClock();
  },

  onShareAppMessage() {
    return {
      title: '异动计算器 - 实时偏离值测算',
      path: '/pages/anomaly/anomaly'
    };
  },

  onShareTimeline() {
    return {
      title: '异动计算器 - 实时偏离值测算'
    };
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    wx.setNavigationBarTitle({ title: '异动计算器' });
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer);
  },

  startClock() {
    const tick = () => {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      this.setData({ clock: h + ':' + m + ':' + s });
    };
    tick();
    this._timer = setInterval(tick, 1000);
  },

  onKeywordChange(e) {
    const keyword = e.detail.keyword || '';
    this.setData({ keyword });
    app.globalData.searchKeyword = keyword;
  },

  onStockSearch(e) {
    const { code, name } = e.detail;
    this.doSearch(code, name);
  },

  async doSearch(code, name) {
    if (!code) return;

    this.setData({ loading: true, searched: true, result: null });
    wx.showLoading({ title: '计算中' });

    try {
      const data = await callCloudFunction('fetchStockData', {
        action: 'anomaly',
        code,
        name: name || ''
      });
      const finalName = pickDisplayName(data.name, name);
      data.name = finalName;
      this.setData({
        result: data,
        keyword: finalName
      });
      app.globalData.searchKeyword = finalName;
    } catch (err) {
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      });
      this.setData({ result: null });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  }
});
