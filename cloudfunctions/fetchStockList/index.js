// 免费接口：东方财富 A 股列表
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TIMEOUT = 8000;
const FALLBACK = [
  { code: '603538', name: '美诺华', market: 'sh' },
  { code: '600519', name: '贵州茅台', market: 'sh' },
  { code: '000858', name: '五粮液', market: 'sz' },
  { code: '300750', name: '宁德时代', market: 'sz' },
  { code: '600036', name: '招商银行', market: 'sh' },
  { code: '688981', name: '中芯国际', market: 'sh' },
  { code: '830946', name: '森萱医药', market: 'bj' }
];

function detectMarket(code) {
  const c = String(code || '').trim();
  if (/^92/.test(c)) return 'bj';
  if (/^(60|68|90)/.test(c)) return 'sh';
  return 'sz';
}

async function fetchEastmoneyList() {
  const all = [];
  const pages = 3;
  for (let pn = 1; pn <= pages; pn++) {
    const res = await axios.get('https://push2.eastmoney.com/api/qt/clist/get', {
      timeout: TIMEOUT,
      params: {
        pn,
        pz: 2000,
        po: 1,
        np: 1,
        fltt: 2,
        invt: 2,
        fid: 'f12',
        fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81',
        fields: 'f12,f14'
      },
      headers: { Referer: 'https://quote1.eastmoney.com/' }
    });
    const diff = (res.data && res.data.data && res.data.data.diff) || [];
    diff.forEach((row) => {
      const code = String(row.f12 || '').trim();
      const name = String(row.f14 || '').trim();
      if (code && name) {
        all.push({
          code,
          name,
          market: detectMarket(code)
        });
      }
    });
    if (diff.length < 2000) break;
  }
  return all;
}

exports.main = async () => {
  try {
    const list = await fetchEastmoneyList();
    if (list.length > 0) {
      return { success: true, data: list, source: 'eastmoney' };
    }
    return { success: true, data: FALLBACK, source: 'fallback' };
  } catch (err) {
    console.error('fetchStockList:', err.message);
    return { success: true, data: FALLBACK, source: 'fallback', message: err.message };
  }
};
