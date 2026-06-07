function normalizeCode(code) {
  if (!code) return '';
  const m = String(code).trim().match(/\d{6}/);
  return m ? m[0] : '';
}

function isPinyinKeyword(keyword) {
  return /^[a-zA-Z]+$/.test(String(keyword || '').trim());
}

function matchByPinyin(keyword, item) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw || !item) return false;
  const py = String(item.py || '').trim().toLowerCase();
  if (!py) return false;
  return py === kw || py.startsWith(kw) || kw.startsWith(py);
}

function resolveStock(keyword, stockList) {
  const kw = (keyword || '').trim();
  if (!kw) return null;

  const list = stockList || [];
  const lower = kw.toLowerCase();

  const exactCode = list.find((item) => item.code === kw || item.code === normalizeCode(kw));
  if (exactCode) return exactCode;

  const byCode = list.find((item) => item.code.includes(kw));
  if (byCode) return byCode;

  const byName = list.find(
    (item) => item.name.indexOf(kw) >= 0 || item.name.toLowerCase().indexOf(lower) >= 0
  );
  if (byName) return byName;

  if (isPinyinKeyword(kw)) {
    const byPinyin = list.find((item) => matchByPinyin(kw, item));
    if (byPinyin) return byPinyin;
  }

  const codeOnly = normalizeCode(kw);
  if (codeOnly) {
    return { code: codeOnly, name: '' };
  }

  return null;
}

function filterLocalStockList(keyword, stockList, limit = 20) {
  const kw = (keyword || '').trim();
  if (!kw) return [];

  const lower = kw.toLowerCase();
  return (stockList || [])
    .filter((item) => {
      if (!item || !item.code) return false;
      const code = String(item.code).toLowerCase();
      const name = String(item.name || '').toLowerCase();
      return (
        code.includes(lower) ||
        name.includes(lower) ||
        (isPinyinKeyword(lower) && matchByPinyin(lower, item))
      );
    })
    .slice(0, limit);
}

function mergeStockLists(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const item of list || []) {
      const code = item && item.code ? String(item.code) : '';
      if (!code || seen.has(code)) continue;
      seen.add(code);
      merged.push(item);
    }
  }
  return merged;
}

/** 输入联想：本地列表 + 云函数，去重后返回 */
async function suggestStocks(keyword, stockList, callCloud, limit = 20) {
  const kw = (keyword || '').trim();
  if (!kw) return [];

  const local = filterLocalStockList(kw, stockList, limit);
  let cloud = [];
  if (typeof callCloud === 'function') {
    try {
      cloud = (await callCloud('searchStock', { keyword: kw })) || [];
    } catch (err) {
      console.error('联想搜索失败:', err);
    }
  }
  return mergeStockLists(cloud, local).slice(0, limit);
}

/** 本地匹配失败时，通过云函数拼音/简称联想 */
async function resolveStockAsync(keyword, stockList, callCloud) {
  const local = resolveStock(keyword, stockList);
  if (local && local.code) return local;

  const kw = (keyword || '').trim();
  if (!kw || !isPinyinKeyword(kw) || typeof callCloud !== 'function') {
    return local;
  }

  try {
    const list = await callCloud('searchStock', { keyword: kw });
    if (list && list.length > 0) {
      return list[0];
    }
  } catch (err) {
    console.error('拼音联想失败:', err);
  }

  return local;
}

module.exports = {
  normalizeCode,
  isPinyinKeyword,
  matchByPinyin,
  filterLocalStockList,
  mergeStockLists,
  suggestStocks,
  resolveStock,
  resolveStockAsync
};
