/**
 * 调用云函数
 * @param {string} name - 云函数名称
 * @param {object} data - 传递参数
 * @returns {Promise}
 */
const CLOUD_TIMEOUT_MS = {
  fetchLhb: 60000,
  fetchStockData: 60000,
  fetchStockList: 60000,
  searchStock: 15000
};

async function callCloudFunction(name, data = {}) {
  const timeout = CLOUD_TIMEOUT_MS[name] || 20000;
  try {
    const res = await wx.cloud.callFunction({
      name,
      data,
      config: { timeout }
    });
    if (res.result && res.result.success) {
      return res.result.data;
    }
    const msg = (res.result && res.result.message) || '请求失败';
    throw new Error(msg);
  } catch (err) {
    const errMsg = err.errMsg || err.message || '';
    if (/timeout|超时|hang up|连接中断|TIME_LIMIT_EXCEEDED|504003/i.test(errMsg)) {
      console.error(`云函数 ${name} 调用超时或中断`);
      throw new Error(
        name === 'fetchLhb'
          ? '查询超时，请重新部署 fetchLhb 云函数后重试'
          : '网络不稳定，请稍后重试'
      );
    }
    console.error(`云函数 ${name} 调用失败:`, err);
    throw err;
  }
}

module.exports = {
  callCloudFunction
};
