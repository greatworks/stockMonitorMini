const { FALLBACK_STOCK_LIST } = require('./utils/stockFallback');
const { callCloudFunction } = require('./utils/request');

App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-xxxxxxx',
        traceUser: true
      });
    }
    this.loadStockList();
  },

  globalData: {
    stockList: FALLBACK_STOCK_LIST,
    searchKeyword: ''
  },

  loadStockList() {
    callCloudFunction('fetchStockList', {})
      .then((data) => {
        if (data && data.length) {
          this.globalData.stockList = data;
        }
      })
      .catch((err) => {
        console.warn('启动加载股票列表失败，已使用本地兜底:', err && err.message ? err.message : err);
      });
  }
});
