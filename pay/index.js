/**
 * 支付适配层（可插拔）。
 *
 * 当前内置 "mock" 沙箱模式：下单后不真正收款，前端点“我已支付（沙箱）”即完成，
 * 便于在没有商户号时先把会员/置顶的完整流程跑通。
 *
 * 接真实支付时：把 PAY_PROVIDER 设为 wechat / xunhupay，并在下面补全
 * createPayment（返回二维码或跳转链接）与 verifyNotify（回调验签）即可，
 * 业务层（server.js 的 billing 路由）无需改动。
 */
const PROVIDER = (process.env.PAY_PROVIDER || "mock").toLowerCase();

/**
 * 创建一笔支付。
 * @param {object} order  订单对象（含 amount[分]、outTradeNo、type、days 等）
 * @param {object} ctx    { origin } 当前站点地址，用于拼回调/跳转
 * @returns {Promise<{provider:string, sandbox?:boolean, message?:string, qr?:string, payUrl?:string}>}
 */
async function createPayment(order, ctx = {}) {
  if (PROVIDER === "mock") {
    return {
      provider: "mock",
      sandbox: true,
      message: "沙箱模式：点下方“我已支付（沙箱）”即可完成开通。接入真实支付后，这里会显示收款二维码。",
    };
  }

  // ===== 真实通道接入点（待你定服务器/资质后补全）=====
  if (PROVIDER === "xunhupay") {
    // TODO: 调用虎皮椒下单 API，返回 { provider:'xunhupay', qr: 二维码图片url 或 payUrl }
    throw new Error("虎皮椒通道尚未配置：请在 pay/index.js 中补全 createPayment");
  }
  if (PROVIDER === "wechat") {
    // TODO: 微信支付 Native 下单，返回 { provider:'wechat', qr: code_url }
    throw new Error("微信支付通道尚未配置：请在 pay/index.js 中补全 createPayment");
  }
  throw new Error(`未知支付通道 PAY_PROVIDER=${PROVIDER}`);
}

/**
 * 校验支付平台的异步回调，返回该回调对应的商户订单号（验签通过才返回）。
 * mock 模式不走真实回调，返回 null。
 * @returns {Promise<{outTradeNo:string}|null>}
 */
async function verifyNotify(req) {
  if (PROVIDER === "mock") return null;
  // TODO: 按所选通道验签 req.body，成功后 return { outTradeNo }
  throw new Error(`支付回调验签未实现：PAY_PROVIDER=${PROVIDER}`);
}

module.exports = { PROVIDER, createPayment, verifyNotify };
