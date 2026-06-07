const app = getApp();
const { callCloudFunction } = require('../../utils/request');
const { suggestStocks, filterLocalStockList } = require('../../utils/stock');

Component({
  properties: {
    value: {
      type: String,
      value: '',
      observer(val) {
        if (val !== this.data.keyword) {
          this.setData({ keyword: val || '' });
        }
      }
    },
    label: { type: String, value: '' },
    placeholder: { type: String, value: '输入代码/名称/拼音' },
    btnText: { type: String, value: '查询' }
  },

  data: {
    keyword: '',
    suggestions: [],
    showSuggestions: false,
    selectedStock: null
  },

  lifetimes: {
    attached() {
      this.setData({ keyword: this.properties.value || '' });
    },
    detached() {
      clearTimeout(this._debounceTimer);
      clearTimeout(this._blurTimer);
    }
  },

  methods: {
    onDropdownTouch() {
      this._dropdownTouched = true;
    },

    onFocus() {
      clearTimeout(this._blurTimer);
      const { keyword, suggestions } = this.data;
      if (keyword.trim() && suggestions.length > 0) {
        this.setData({ showSuggestions: true });
      }
    },

    onBlur() {
      this._blurTimer = setTimeout(() => {
        if (this._dropdownTouched || this._picking) {
          this._dropdownTouched = false;
          this._picking = false;
          return;
        }
        this.setData({ showSuggestions: false });
      }, 350);
    },

    onInput(e) {
      const keyword = e.detail.value;
      this.setData({ keyword, selectedStock: null });
      this.triggerEvent('change', { keyword });
      this.fetchSuggestions(keyword);
    },

    fetchSuggestions(keyword) {
      clearTimeout(this._debounceTimer);
      const kw = (keyword || '').trim();
      if (!kw) {
        this.setData({ suggestions: [], showSuggestions: false });
        return;
      }

      const stockList = (app.globalData && app.globalData.stockList) || [];
      const local = filterLocalStockList(kw, stockList, 20);
      if (local.length > 0) {
        this.setData({ suggestions: local, showSuggestions: true });
      }

      this._debounceTimer = setTimeout(async () => {
        if ((this.data.keyword || '').trim() !== kw) return;
        const list = await suggestStocks(kw, stockList, callCloudFunction, 20);
        if ((this.data.keyword || '').trim() !== kw) return;
        this.setData({
          suggestions: list,
          showSuggestions: list.length > 0
        });
      }, 300);
    },

    onItemTouchStart(e) {
      this._picking = true;
      this._dropdownTouched = true;
      clearTimeout(this._blurTimer);

      const index = Number(e.currentTarget.dataset.index);
      const stock = this.data.suggestions[index];
      if (!stock) {
        this._picking = false;
        return;
      }

      this.pickStock(stock);
    },

    pickStock(stock) {
      clearTimeout(this._blurTimer);
      this._picking = false;
      this._dropdownTouched = false;

      const keyword = stock.name || stock.code;
      this.setData({
        keyword,
        selectedStock: stock,
        showSuggestions: false
      });
      this.triggerEvent('change', { keyword });
      this.emitSearch(stock);
    },

    onConfirm() {
      this.submitSearch();
    },

    onSearchTap() {
      this.submitSearch();
    },

    async submitSearch() {
      const keyword = (this.data.keyword || '').trim();
      if (!keyword) {
        wx.showToast({ title: '请输入搜索内容', icon: 'none' });
        return;
      }

      const { selectedStock, suggestions } = this.data;
      if (selectedStock && (selectedStock.name === keyword || selectedStock.code === keyword)) {
        this.emitSearch(selectedStock);
        return;
      }

      if (suggestions.length === 1) {
        this.pickStock(suggestions[0]);
        return;
      }

      if (suggestions.length > 1) {
        this.setData({ showSuggestions: true });
        wx.showToast({ title: '请从列表中选择股票', icon: 'none' });
        return;
      }

      const stockList = (app.globalData && app.globalData.stockList) || [];
      const list = await suggestStocks(keyword, stockList, callCloudFunction, 20);
      if (list.length === 1) {
        this.pickStock(list[0]);
        return;
      }
      if (list.length > 1) {
        this.setData({ suggestions: list, showSuggestions: true });
        wx.showToast({ title: '请从列表中选择股票', icon: 'none' });
        return;
      }

      wx.showToast({ title: '未匹配到股票', icon: 'none' });
    },

    emitSearch(stock) {
      if (!stock || !stock.code) return;
      const keyword = stock.name || stock.code;
      this.triggerEvent('search', {
        code: stock.code,
        name: stock.name || '',
        keyword
      });
    }
  }
});
