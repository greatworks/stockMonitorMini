// 东方财富：代码/名称/拼音简称联想
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TIMEOUT = 6000;
const API = 'https://searchapi.eastmoney.com/api/suggest/get';
const TOKEN = 'D43BF7226B3xxxxxxxxxxxxx';

function toMarket(code) {
  const c = String(code || '').trim();
  if (/^92/.test(c)) return 'bj';
  if (/^(60|68|90)/.test(c)) return 'sh';
  return 'sz';
}

function isMainlandACode(code) {
  const c = String(code || '').trim();
  return (
    /^(00|30|60|68)\d{4}$/.test(c) ||
    /^92\d{4}$/.test(c)
  );
}

function normalizeBSECode(code) {
  const c = String(code || '').trim();
  // 北交所历史代码段（43/83/87/88）在东方财富联想里通常会“切换”为 92xxxx
  // 例如：830946 => 920946
  if (/^(43|83|87|88)\d{4}$/.test(c)) return '92' + c.slice(2);
  return c;
}

exports.main = async (event) => {
  const keyword = (event.keyword || '').trim();
  if (!keyword) { 
    return { success: true, data: [] };
  }

  try {
    const res = await axios.get(API, {
      timeout: TIMEOUT,
      params: {
        input: keyword,
        type: 14,
        token: TOKEN,
        count: 20
      }
    });
    const rows = (res.data && res.data.QuotationCodeTable && res.data.QuotationCodeTable.Data) || [];
    const list = rows
      .filter((item) => {
        const code = normalizeBSECode(item.Code);
        // 不再依赖 Classify（科创板常为 "23"），统一按代码段判断大陆 A 股
        return isMainlandACode(code);
      })
      .map((item) => ({
        code: normalizeBSECode(item.Code),
        name: String(item.Name || ''),
        py: String(item.PinYin || '').toLowerCase(),
        market: toMarket(normalizeBSECode(item.Code))
      }));

    return { success: true, data: list };
  } catch (err) {
    console.error('searchStock:', err.message);
    return { success: false, message: err.message, data: [] };
  }
};
