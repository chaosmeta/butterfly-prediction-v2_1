export default function HowItWorks() {
  const steps = [
    {
      num:   '01',
      title: '连接钱包',
      desc:  '使用 MetaMask 或任意 EIP-6963 兼容钱包连接，确保网络为 BNB Smart Chain 主网。',
    },
    {
      num:   '02',
      title: '选择档位',
      desc:  '从 20 分钟、1 小时、24 小时三个时间档中选择你偏好的预测周期。',
    },
    {
      num:   '03',
      title: '押注涨跌',
      desc:  '选择方向（涨/跌），选择份数，授权并提交交易。每份价格由合约锁定，公平透明。',
    },
    {
      num:   '04',
      title: '等待结算',
      desc:  '轮次结束后合约自动结算，预测正确的一方按份额比例分得对方奖池（扣除 1% 平台费）。',
    },
  ]

  return (
    <section className="py-16 px-4" aria-label="玩法说明">
      <h2 className="text-2xl font-bold text-center text-foreground mb-10 text-balance">
        如何参与
      </h2>
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((s) => (
          <div key={s.num} className="glass p-5 rounded-card flex flex-col gap-3">
            <span className="text-3xl font-bold text-primary/40">{s.num}</span>
            <h3 className="font-semibold text-foreground">{s.title}</h3>
            <p className="text-fg-dim text-sm leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* 规则说明 */}
      <div className="mt-10 max-w-2xl mx-auto glass p-5 rounded-card space-y-2 text-sm text-fg-dim">
        <h3 className="font-semibold text-foreground mb-3">规则要点</h3>
        <ul className="list-disc list-inside space-y-1.5">
          <li>每轮开盘前均可下注，关闭后不可修改</li>
          <li>价格由 Chainlink 预言机喂价，不可人为干预</li>
          <li>奖励可在结算后随时领取，无时间限制</li>
          <li>合约已开源，欢迎审计</li>
        </ul>
      </div>
    </section>
  )
}
