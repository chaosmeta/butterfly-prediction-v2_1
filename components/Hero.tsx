'use client'

import Image from 'next/image'

export default function Hero() {
  return (
    <section className="relative pt-32 pb-12 flex flex-col items-center text-center px-4">
      {/* 径向渐变光晕 */}
      <div
        className="absolute inset-x-0 top-0 h-[500px] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.18) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* 浮动 Logo */}
      <div className="relative mb-6 animate-float">
        <div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: 'rgba(167,139,250,0.3)', transform: 'scale(1.4)' }}
          aria-hidden="true"
        />
        <Image
          src="/assets/logo.webp"
          alt="蝴蝶预测"
          width={100}
          height={100}
          className="relative rounded-full shadow-glow"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).src = '/assets/logo.png'
          }}
          priority
        />
      </div>

      <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-3 text-balance tracking-tight">
        蝴蝶预测
      </h1>
      <p className="text-fg-dim text-base sm:text-lg max-w-xl text-pretty leading-relaxed mb-2">
        基于 BNB Chain 的去中心化价格涨跌预测协议
      </p>
      <p className="text-muted text-sm">
        预测正确即可获得奖励，让每一分钟都充满可能
      </p>

      {/* 统计数字条 */}
      <div className="mt-8 flex flex-wrap justify-center gap-6 sm:gap-10">
        {[
          { label: '链', value: 'BSC' },
          { label: '时间档', value: '3' },
          { label: '平台费', value: '1%' },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center">
            <span className="text-2xl font-bold text-primary">{value}</span>
            <span className="text-xs text-muted mt-0.5">{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
