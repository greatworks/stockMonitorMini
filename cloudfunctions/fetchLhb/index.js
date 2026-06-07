// 免费接口：东方财富龙虎榜
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TIMEOUT = 8000;
const API = 'https://datacenter.eastmoney.com/api/data/v1/get';
const PAGE_SIZE = 500;
const MAX_UNIQUE_DAYS = 50;

const COLUMNS =
  'SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_DATE,CLOSE_PRICE,CHANGE_RATE,TURNOVERRATE,EXPLANATION';

function normalizeCode(code) {
  if (!code) return '';
  const m = String(code).trim().match(/\d{6}/);
  if (!m) return '';
  const c = m[0];
  // 北交所历史代码（43/83/87/88）映射到当前 92xxxx，避免查询不到
  if (/^(43|83|87|88)\d{4}$/.test(c)) return '92' + c.slice(2);
  return c;
}

function tradeDateKey(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).split(' ')[0];
}

function formatDateCN(dateStr) {
  const key = tradeDateKey(dateStr);
  if (!key) return '';
  const p = key.split('-');
  if (p.length < 3) return key;
  return p[0] + '年' + parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日榜';
}

async function requestLhb(extraParams) {
  const res = await axios.get(API, {
    timeout: TIMEOUT,
    params: Object.assign(
      {
        source: 'WEB',
        client: 'WEB',
        reportName: 'RPT_DAILYBILLBOARD_DETAILSNEW',
        columns: COLUMNS,
        pageNumber: 1,
        pageSize: PAGE_SIZE,
        sortTypes: -1,
        sortColumns: 'TRADE_DATE'
      },
      extraParams
    ),
    headers: { Referer: 'https://data.eastmoney.com/' }
  });
  const body = res.data;
  if (!body || body.success === false) {
    const msg = (body && body.message) || '龙虎榜接口返回异常';
    throw new Error(msg);
  }
  return (body.result && body.result.data) || [];
}

/** 按股票代码一次请求拉取（单股记录通常 <500 条） */
async function fetchLhbByCode(stockCode) {
  return requestLhb({
    filter: '(SECURITY_CODE="' + stockCode + '")'
  });
}

/** 按名称一次请求拉取，禁止无 filter 全市场扫描 */
async function fetchLhbByName(name) {
  return requestLhb({
    filter: '(SECURITY_NAME_ABBR="' + name + '")'
  });
}

function mergeByTradeDate(rows) {
  const map = new Map();

  for (const item of rows) {
    const key = tradeDateKey(item.TRADE_DATE);
    if (!key) continue;

    const reason = (item.EXPLANATION || '').trim();
    let entry = map.get(key);

    if (!entry) {
      map.set(key, {
        SECURITY_CODE: item.SECURITY_CODE,
        SECURITY_NAME_ABBR: item.SECURITY_NAME_ABBR,
        TRADE_DATE: item.TRADE_DATE,
        CLOSE_PRICE: item.CLOSE_PRICE,
        CHANGE_RATE: item.CHANGE_RATE,
        TURNOVERRATE: item.TURNOVERRATE,
        reasons: reason ? [reason] : []
      });
      continue;
    }

    if (reason && entry.reasons.indexOf(reason) < 0) {
      entry.reasons.push(reason);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    tradeDateKey(b.TRADE_DATE).localeCompare(tradeDateKey(a.TRADE_DATE))
  );
}

function toListItem(item, stockCode) {
  const changeRate = parseFloat(item.CHANGE_RATE) || 0;
  const dateKey = tradeDateKey(item.TRADE_DATE);
  const code = stockCode || normalizeCode(item.SECURITY_CODE);
  return {
    id: code + '_' + dateKey,
    code: normalizeCode(item.SECURITY_CODE),
    name: item.SECURITY_NAME_ABBR || '',
    tradeDate: dateKey,
    dateText: formatDateCN(item.TRADE_DATE),
    price: item.CLOSE_PRICE != null ? String(item.CLOSE_PRICE) : '--',
    changeRate,
    changeText: (changeRate > 0 ? '+' : '') + changeRate.toFixed(2) + '%',
    changeClass: changeRate >= 0 ? 'up' : 'down',
    turnoverText: '换手率 ' + (parseFloat(item.TURNOVERRATE) || 0).toFixed(2) + '%',
    reason: (item.reasons || []).join('；')
  };
}

exports.main = async (event) => {
  const { code, name, keyword } = event;
  const stockCode = normalizeCode(code || keyword);
  const stockName = (name || keyword || '').trim();

  try {
    let rows = [];

    if (stockCode) {
      rows = await fetchLhbByCode(stockCode);
    } else if (stockName) {
      rows = await fetchLhbByName(stockName);
    } else {
      return { success: false, message: '请输入股票代码或名称', data: [] };
    }

    const merged = mergeByTradeDate(rows);
    const list = merged.slice(0, MAX_UNIQUE_DAYS).map((item) => toListItem(item, stockCode));

    return { success: true, data: list, total: merged.length };
  } catch (err) {
    console.error('fetchLhb:', err);
    return {
      success: false,
      message: /timeout/i.test(err.message) ? '龙虎榜接口超时' : err.message,
      data: []
    };
  }
};
