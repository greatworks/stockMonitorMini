// 免费接口：东方财富（主）+ 新浪（备）
const cloud = require('wx-server-sdk');
const axios = require('axios');
const http = require('http');
const https = require('https');
const iconv = require('iconv-lite');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TIMEOUT = 12000;
const RETRY = 2;

const httpClient = axios.create({
  timeout: TIMEOUT,
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false })
});

function normalizeCode(code) {
  if (!code) return null;
  const raw = String(code).trim().replace(/^(sh|sz|bj)/i, '');
  const m = raw.match(/\d{6}/);
  if (!m) return null;
  const c = m[0];
  // 北交所历史段（43/83/87/88）映射到 92xxxx，确保行情接口可用
  if (/^(43|83|87|88)\d{4}$/.test(c)) return '92' + c.slice(2);
  return c;
}

function getMarketMeta(code) {
  const c = normalizeCode(code);
  if (!c) return null;
  if (/^92/.test(c)) {
    return { code: c, secid: '0.' + c, marketName: '北交', boardName: '北交所', sinaIndex: 'bj899050', indexName: '北证50', indexSecid: '0.899050', indexSinaFallbacks: [] };
  }
  if (/^688/.test(c)) {
    return { code: c, secid: '1.' + c, marketName: '上证', boardName: '科创板', sinaIndex: 'sh000688', indexName: '科创50', indexSecid: '1.000688', indexSinaFallbacks: ['sh000001'] };
  }
  if (/^60[0-9]|^90/.test(c)) {
    return { code: c, secid: '1.' + c, marketName: '上证', boardName: '沪主板', sinaIndex: 'sh000001', indexName: '上证指数', indexSecid: '1.000001', indexSinaFallbacks: [] };
  }
  if (/^30/.test(c)) {
    return { code: c, secid: '0.' + c, marketName: '深证', boardName: '创业板', sinaIndex: 'sz399102', indexName: '创业板综指', indexSecid: '0.399102', indexSinaFallbacks: ['sz399006'] };
  }
  if (/^00|^20/.test(c)) {
    return { code: c, secid: '0.' + c, marketName: '深证', boardName: '深主板', sinaIndex: 'sz399107', indexName: '深证A指', indexSecid: '0.399107', indexSinaFallbacks: ['sz399001'] };
  }
  return { code: c, secid: '1.' + c, marketName: '上证', boardName: 'A股', sinaIndex: 'sh000001', indexName: '上证指数', indexSecid: '1.000001', indexSinaFallbacks: [] };
}

function toSinaCode(meta) {
  // 新浪北交所行情代码前缀为 `bj`（如 bj830946）
  // 这里根据 meta.code 段判断，避免将北交所错误映射到 sz。
  const c = String(meta.code || '').trim();
  if (/^(43|83|87|88|92)/.test(c)) return 'bj' + c;

  const prefix = meta.secid.startsWith('1.') ? 'sh' : 'sz';
  return prefix + c;
}

function hasChinese(text) {
  return /[\u4e00-\u9fa5]/.test(String(text || ''));
}

function isGarbledText(text) {
  if (!text) return true;
  const s = String(text);
  if (/\uFFFD/.test(s)) return true;
  if (hasChinese(s)) return false;
  if (/[^\x00-\x7F]/.test(s)) return true;
  return false;
}

function pickDisplayName(apiName, localName) {
  const local = (localName || '').trim();
  const api = (apiName || '').trim();
  if (local && !isGarbledText(local)) return local;
  if (api && !isGarbledText(api)) return api;
  return local || api || '';
}

async function requestWithRetry(url, options) {
  let lastErr;
  for (let i = 0; i <= RETRY; i++) {
    try {
      const res = await httpClient.get(url, options);
      return res;
    } catch (err) {
      lastErr = err;
      const retryable = /hang up|ECONNRESET|ETIMEDOUT|timeout|socket/i.test(err.message || '');
      if (!retryable || i === RETRY) break;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

/** 东方财富实时行情（云函数环境更稳定） */
async function fetchEastmoneyQuote(secid) {
  const res = await requestWithRetry('https://push.eastmoney.com/api/qt/stock/get', {
    params: {
      secid,
      invt: 2,
      fltt: 2,
      fields: 'f43,f57,f58,f169,f170'
    },
    headers: {
      Referer: 'https://quote-web.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const d = res.data && res.data.data;
  if (!d) return null;
  // fltt=2 时 f43/f170 已是真实数值，无需再 /100
  const price = d.f43 != null ? Number(d.f43) : 0;
  const changePct = d.f170 != null ? Number(d.f170) : 0;
  let name = String(d.f58 || '').trim();
  if (!hasChinese(name)) name = '';
  return {
    name,
    code: String(d.f57 || '').trim(),
    price,
    changePct
  };
}

function parseSina(raw) {
  const text = typeof raw === 'string' ? raw : String(raw || '');
  const match = text.match(/"([^"]*)"/);
  if (!match) return null;
  const v = match[1].split(',');
  if (v.length < 4) return null;
  const price = parseFloat(v[3]);
  const preclose = parseFloat(v[2]);
  const changePct = preclose ? ((price - preclose) / preclose) * 100 : 0;
  return { name: v[0], price, changePct };
}

async function fetchSinaQuote(sinaCode) {
  const res = await requestWithRetry('https://hq1.sinajs.cn/list=' + sinaCode, {
    responseType: 'arraybuffer',
    headers: {
      Referer: 'https://finance.sina.com.cn/',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const buf = Buffer.from(res.data);
  const text = iconv.decode(buf, 'gbk');
  return parseSina(text);
}

async function fetchQuote(meta, isIndex) {
  const secid = isIndex ? meta.indexSecid : meta.secid;
  try {
    const candidates = [secid];
    // 北交所部分代码在东方财富接口里 secid 前缀可能不一致，这里做一个兜底尝试
    if (meta && meta.boardName === '北交所') {
      const c = String(meta.code || '');
      if (!isIndex && c) candidates.push('1.' + c, '0.' + c);
      if (isIndex && meta.indexSecid) candidates.push(meta.indexSecid.startsWith('0.') ? meta.indexSecid.replace(/^0\./, '1.') : meta.indexSecid.replace(/^1\./, '0.'));
    }

    for (const s of candidates) {
      const q = await fetchEastmoneyQuote(s);
      if (q && typeof q.price === 'number' && !Number.isNaN(q.price)) return q;
    }
  } catch (e) {
    console.warn('eastmoney quote fail:', secid, e.message);
  }
  try {
    const sinaCode = isIndex ? meta.sinaIndex : toSinaCode(meta);
    return await fetchSinaQuote(sinaCode);
  } catch (e) {
    console.warn('sina quote fail:', e.message);
  }
  return null;
}

async function fetchSinaKlines(sinaCode, limit) {
  const res = await requestWithRetry(
    'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData',
    {
      params: {
        symbol: sinaCode,
        scale: 240,
        ma: 'no',
        datalen: limit
      },
      headers: {
        Referer: 'https://finance.sina.com.cn/',
        'User-Agent': 'Mozilla/5.0'
      }
    }
  );
  const arr = Array.isArray(res.data) ? res.data : [];
  return arr
    .map((item) => {
      const close = parseFloat(item.close);
      if (!item.day || !Number.isFinite(close) || close <= 0) return null;
      return { date: item.day, close, pct: 0 };
    })
    .filter(Boolean);
}

async function fetchSinaKlinesSafe(sinaCode, limit) {
  try {
    const data = await fetchSinaKlines(sinaCode, limit);
    return data.length ? data : [];
  } catch (e) {
    console.warn('sina kline fail:', sinaCode, e.message);
    return [];
  }
}

function getSinaIndexCandidates(meta) {
  const list = [meta.sinaIndex].concat(meta.indexSinaFallbacks || []);
  return [...new Set(list.filter(Boolean))];
}

function parseKlineLine(line) {
  const p = String(line || '').split(',');
  if (p.length < 9) return null;
  const close = parseFloat(p[2]);
  const pct = parseFloat(p[8]);
  if (!p[0] || !Number.isFinite(close) || close <= 0) return null;
  return {
    date: p[0],
    close,
    pct: Number.isFinite(pct) ? pct : 0
  };
}

function getKlineSecidCandidates(meta, isIndex) {
  const c = String(meta.code || '');
  const primary = isIndex ? meta.indexSecid : meta.secid;
  const candidates = [primary];
  if (!isIndex && meta.boardName === '北交所') {
    candidates.push('0.' + c, '1.' + c);
    if (/^92/.test(c)) {
      candidates.push('0.83' + c.slice(2), '0.87' + c.slice(2));
    }
  }
  if (isIndex && meta.boardName === '北交所') {
    candidates.push('1.899050');
  }
  return [...new Set(candidates.filter(Boolean))];
}

async function fetchKlines(secid, limit) {
  const res = await requestWithRetry('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
    params: {
      secid,
      klt: 101,
      fqt: 1,
      lmt: limit,
      end: 20500000,
      fields1: 'f1,f2,f3,f4,f5,f6',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
    },
    headers: {
      Referer: 'https://quote.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const lines = (res.data && res.data.data && res.data.data.klines) || [];
  return lines.map(parseKlineLine).filter(Boolean);
}

async function fetchKlinesSafe(secid, limit) {
  try {
    const data = await fetchKlines(secid, limit);
    return data.length ? data : [];
  } catch (e) {
    console.warn('kline fail:', secid, e.message);
    return [];
  }
}

async function fetchKlinesForMeta(meta, isIndex, limit) {
  const emCandidates = getKlineSecidCandidates(meta, isIndex);
  let best = [];
  for (const secid of emCandidates) {
    const data = await fetchKlinesSafe(secid, limit);
    if (data.length > best.length) best = data;
    if (data.length >= 30) return best;
  }

  const sinaCodes = isIndex ? getSinaIndexCandidates(meta) : [toSinaCode(meta)];
  for (const sinaCode of sinaCodes) {
    const data = await fetchSinaKlinesSafe(sinaCode, limit);
    if (data.length > best.length) best = data;
    if (data.length >= 30) return best;
  }
  return best;
}

function alignKlines(stockKlines, indexKlines) {
  const indexMap = {};
  indexKlines.forEach((item) => {
    indexMap[item.date] = item;
  });
  const rows = stockKlines
    .filter((s) => indexMap[s.date] && indexMap[s.date].close > 0 && s.close > 0)
    .map((s) => ({
      date: s.date,
      stockClose: s.close,
      indexClose: indexMap[s.date].close
    }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  return rows.map((item, i) => {
    if (i === 0) {
      return { ...item, stockPct: 0, indexPct: 0 };
    }
    const prev = rows[i - 1];
    const stockPct = prev.stockClose > 0 ? ((item.stockClose / prev.stockClose - 1) * 100) : 0;
    const indexPct = prev.indexClose > 0 ? ((item.indexClose / prev.indexClose - 1) * 100) : 0;
    return { ...item, stockPct, indexPct };
  });
}

function buildDeviationSeries(aligned) {
  return aligned.slice(1).map((item) => ({
    date: item.date,
    deviation: item.stockPct - item.indexPct
  }));
}

function sumLast(series, n) {
  if (!series.length || series.length < n) return null;
  return series.slice(-n).reduce((acc, cur) => acc + cur.deviation, 0);
}

/** 交易所公式：N日累计偏离 = 个股区间涨跌幅 - 指数区间涨跌幅（期初取窗口前一交易日收盘价） */
function calcOfficialCumulative(aligned, n) {
  if (aligned.length < n + 1) return null;
  const end = aligned[aligned.length - 1];
  const start = aligned[aligned.length - n - 1];
  const stockRet = (end.stockClose / start.stockClose - 1) * 100;
  const indexRet = (end.indexClose / start.indexClose - 1) * 100;
  const value = stockRet - indexRet;
  return Number.isFinite(value) ? value : null;
}

function calcCumulativeValue(aligned, series, n) {
  const official = calcOfficialCumulative(aligned, n);
  if (official !== null) return official;
  return sumLast(series, n);
}

function isStStock(name) {
  const s = String(name || '').trim();
  return /^\*?ST/i.test(s) || s.includes('*ST');
}

function getBoardThresholdMeta(meta, stockName) {
  const isGrowthOrStar = meta.boardName === '创业板' || meta.boardName === '科创板';
  const isMainBoard = meta.boardName === '沪主板' || meta.boardName === '深主板';
  const isSt = isStStock(stockName);
  if (isGrowthOrStar) {
    return { day3Limit: 30, day3Text: '阈值: ±30%（创业板/科创板普通异动）' };
  }
  if (isSt && isMainBoard) {
    return { day3Limit: 12, day3Text: '阈值: ±12%（ST主板普通异动）' };
  }
  return { day3Limit: 20, day3Text: '阈值: ±20%（主板普通异动）' };
}

function checkSafe(days, value, day3Limit) {
  if (days === 3) return Math.abs(value) < day3Limit;
  if (days === 10) return value > -50 && value < 100;
  if (days === 30) return value > -70 && value < 200;
  return true;
}

function fmtPct(v, withSign) {
  if (v === null || v === undefined) return '--';
  const n = Number(v);
  if (isNaN(n)) return '--';
  const sign = n > 0 && withSign ? '+' : '';
  return sign + n.toFixed(2) + '%';
}

function buildCumulative(aligned, series, meta, stockName) {
  const { day3Limit, day3Text } = getBoardThresholdMeta(meta, stockName);
  const cum3 = calcCumulativeValue(aligned, series, 3);
  const cum10 = calcCumulativeValue(aligned, series, 10);
  const cum30 = calcCumulativeValue(aligned, series, 30);
  return [
    { days: 3, label: '3日累计', value: cum3, threshold: day3Text, safe: cum3 === null ? true : checkSafe(3, cum3, day3Limit) },
    { days: 10, label: '10日累计', value: cum10, threshold: '阈值: +100%/-50%（严重异动）', safe: cum10 === null ? true : checkSafe(10, cum10, day3Limit) },
    { days: 30, label: '30日累计', value: cum30, threshold: '阈值: +200%/-70%（严重异动）', safe: cum30 === null ? true : checkSafe(30, cum30, day3Limit) }
  ].map((item) => ({
    days: item.days,
    label: item.label,
    valueText: fmtPct(item.value, true),
    threshold: item.threshold,
    safe: item.safe,
    dataReady: item.value !== null,
    valueClass: item.value === null ? '' : (item.value >= 0 ? 'up' : 'down')
  }));
}

function buildAnomalyResult(meta, stockQuote, indexQuote, aligned, series, displayName) {
  const stockPct = stockQuote.changePct;
  const indexPct = indexQuote ? indexQuote.changePct : 0;
  const dayDeviation = stockPct - indexPct;
  const finalName = pickDisplayName(stockQuote.name, displayName);
  const cumulative = buildCumulative(aligned, series, meta, finalName);

  return {
    code: meta.code,
    name: finalName,
    marketName: meta.marketName,
    boardName: meta.boardName,
    price: stockQuote.price.toFixed(2),
    changePct: stockPct,
    changeText: fmtPct(stockPct, true),
    changeClass: stockPct >= 0 ? 'up' : 'down',
    indexName: meta.indexName,
    stockPctText: fmtPct(stockPct, false),
    stockPctClass: stockPct >= 0 ? 'up' : 'down',
    indexPctText: fmtPct(indexPct, true),
    indexPctClass: indexPct >= 0 ? 'up' : 'down',
    dayDeviationText: fmtPct(dayDeviation, true),
    dayDeviationClass: dayDeviation >= 0 ? 'up' : 'down',
    cumulativeDataReady: aligned.length >= 4,
    cumulative
  };
}

exports.main = async (event) => {
  const { action, code, name: inputName } = event;
  const stockCode = normalizeCode(code);
  const meta = getMarketMeta(stockCode);

  try {
    if (action === 'realtime') {
      if (!meta) return { success: false, message: '股票代码无效' };
      const stock = await fetchQuote(meta, false);
      if (!stock) return { success: false, message: '获取行情失败' };
      return {
        success: true,
        data: {
          code: meta.code,
          name: pickDisplayName(stock.name, inputName),
          price: stock.price,
          changePct: stock.changePct
        }
      };
    }

    if (action === 'anomaly') {
      if (!meta) return { success: false, message: '股票代码无效' };

      // 串行请求，降低并发导致的 socket hang up
      const stockQuote = await fetchQuote(meta, false);
      if (!stockQuote) {
        return { success: false, message: '获取个股行情失败，请稍后重试' };
      }

      const indexQuote = await fetchQuote(meta, true);
      const [stockK, indexK] = await Promise.all([
        fetchKlinesForMeta(meta, false, 45),
        fetchKlinesForMeta(meta, true, 45)
      ]);
      const aligned = alignKlines(stockK, indexK);
      const series = buildDeviationSeries(aligned);

      if (!aligned.length) {
        console.warn('anomaly kline empty:', meta.code, 'stock', stockK.length, 'index', indexK.length);
      }

      return {
        success: true,
        data: buildAnomalyResult(meta, stockQuote, indexQuote, aligned, series, inputName)
      };
    }

    return { success: false, message: '不支持的 action' };
  } catch (err) {
    console.error('fetchStockData:', err);
    let msg = err.message || '请求失败';
    if (/hang up|ECONNRESET|ETIMEDOUT|timeout/i.test(msg)) {
      msg = '行情接口连接中断，请稍后重试';
    }
    return { success: false, message: msg };
  }
};
