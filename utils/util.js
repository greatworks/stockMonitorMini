/**
 * 格式化数字，保留两位小数
 */
function formatNumber(num, digits = 2) {
  if (num === null || num === undefined) return '--';
  return Number(num).toFixed(digits);
}

/**
 * 格式化涨跌幅，带正负号
 */
function formatChange(val) {
  if (val === null || val === undefined) return '--';
  const num = Number(val);
  return (num > 0 ? '+' : '') + num.toFixed(2) + '%';
}

/**
 * 判断涨跌类型
 */
function getChangeType(val) {
  if (val > 0) return 'up';
  if (val < 0) return 'down';
  return '';
}

module.exports = {
  formatNumber,
  formatChange,
  getChangeType
};
