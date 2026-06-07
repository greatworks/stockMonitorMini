Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/anomaly/anomaly', text: '异动计算' },
      { pagePath: '/pages/lhb/lhb', text: '龙虎榜揭秘' }
    ]
  },

  methods: {
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const path = this.data.list[index].pagePath;
      wx.switchTab({ url: path });
      this.setData({ selected: index });
    }
  }
});
