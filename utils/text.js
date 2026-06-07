/** 判断名称是否像乱码（GBK 误当 UTF-8 等） */
function isGarbledText(text) {
  if (!text) return true;
  const s = String(text);
  if (/\uFFFD/.test(s)) return true;
  const chineseCount = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (chineseCount > 0) return false;
  if (/[^\x00-\x7F]/.test(s)) return true;
  return false;
}

function looksLikeStockCode(text) {
  return /^\d{6}$/.test(String(text || '').trim());
}

/** 优先使用本地正确名称；纯 6 位代码不算有效名称 */
function pickDisplayName(apiName, localName) {
  const local = (localName || '').trim();
  const api = (apiName || '').trim();
  const localValid = local && !isGarbledText(local) && !looksLikeStockCode(local);
  if (localValid) return local;
  if (api && !isGarbledText(api)) return api;
  return localValid ? local : api || '';
}

module.exports = {
  isGarbledText,
  pickDisplayName
};
