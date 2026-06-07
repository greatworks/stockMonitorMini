const app = getApp();
const { callCloudFunction } = require('../../utils/request');
const { pickDisplayName } = require('../../utils/text');

Page({
  data: {
    keyword: '',
    clock: '00:00:00',
    loading: false,
    searched: false,
    list: []
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
      title: '龙虎榜揭秘 - 查历史上榜记录',
      path: '/pages/lhb/lhb'
    };
  },

  onShareTimeline() {
    return {
      title: '龙虎榜揭秘 - 查历史上榜记录'
    };
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    wx.setNavigationBarTitle({ title: '龙虎榜揭秘' });
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
    const { code, name, keyword } = e.detail;
    this.doSearch(code, name, keyword);
  },

  async doSearch(code, name, keyword) {
    if (!code) return;

    this.setData({ loading: true, searched: true, list: [] });
    wx.showLoading({ title: '查询中' });

    try {
      const data = await callCloudFunction('fetchLhb', {
        code,
        name: name || '',
        keyword: keyword || name || code
      });
      const apiName = (data && data[0] && data[0].name) || '';
      const localName = name || '';
      const displayName = pickDisplayName(apiName, localName);
      const list = (data || []).map((item) => ({
        ...item,
        name: pickDisplayName(item.name, displayName) || item.name
      }));
      const finalName = (list[0] && list[0].name) || displayName || keyword;
      this.setData({
        list,
        keyword: finalName
      });
      app.globalData.searchKeyword = finalName;
    } catch (err) {
      wx.showToast({
        title: err.message || '查询失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  }
});
