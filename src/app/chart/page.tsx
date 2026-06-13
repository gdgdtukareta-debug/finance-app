/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Scatter, Legend
} from 'recharts';
import { getStocks, getSettings } from '@/lib/db';
import { fetchAllPrices, generateDemoChart } from '@/lib/stockApi';
import { judgeAllStocks } from '@/lib/judge';
import { Stock, PriceData, StockJudgement, ChartDataPoint } from '@/lib/types';
import Link from 'next/link';

export default function ChartPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [judgements, setJudgements] = useState<StockJudgement[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const s = getSettings();
      const allStocks = getStocks().filter(st => st.is_target);
      setStocks(allStocks);

      if (allStocks.length === 0) { setLoading(false); return; }

      const prices = await fetchAllPrices(allStocks.map(s => s.symbol));
      const j = judgeAllStocks(allStocks, prices, s, 999999);
      setJudgements(j);

      const first = allStocks[0];
      setSelected(first.symbol);
      setChartData(generateDemoChart(first.symbol, first.avg_price));
      setLoading(false);
    })();
  }, []);

  const handleSelect = (symbol: string) => {
    const s = stocks.find(st => st.symbol === symbol);
    if (!s) return;
    setSelected(symbol);
    setChartData(generateDemoChart(symbol, s.avg_price));
  };

  const selectedStock = stocks.find(s => s.symbol === selected);
  const selectedJudge = judgements.find(j => j.stock.symbol === selected);

  const buyNormal = chartData.filter(d => d.buyPoint?.type === 'normal');
  const buySurplus = chartData.filter(d => d.buyPoint?.type === 'surplus');
  const chartWithLabel = chartData.map((d, i) => ({
    ...d, label: i % 15 === 0 ? d.date.slice(5) : ''
  }));

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>データを読み込み中...</p>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <h1>📊 チャート</h1>
      </header>

      <div className="page-content fade-in">
        {stocks.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 60 }}>
            <div className="empty-state-icon"><BarChart2 size={28} /></div>
            <h3>銘柄がありません</h3>
            <p>「銘柄」タブからポートフォリオを登録してください</p>
            <Link href="/portfolio" className="btn btn-primary" style={{ marginTop: 8 }}>銘柄を登録する</Link>
          </div>
        ) : (
          <>
            {/* 銘柄選択タブ */}
            <div className="section">
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {stocks.map(s => {
                  const j = judgements.find(j => j.stock.symbol === s.symbol);
                  const isActive = selected === s.symbol;
                  const jColor = j?.judge === '○' ? 'var(--color-buy)' : j?.judge === '△' ? 'var(--color-watch)' : 'var(--text-muted)';
                  return (
                    <button
                      key={s.symbol}
                      onClick={() => handleSelect(s.symbol)}
                      style={{
                        flexShrink: 0, padding: '8px 14px',
                        borderRadius: 'var(--radius-full)',
                        background: isActive ? 'var(--accent-gradient)' : 'var(--bg-card)',
                        border: `1px solid ${isActive ? 'transparent' : 'var(--border-normal)'}`,
                        color: isActive ? 'white' : 'var(--text-secondary)',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        transition: 'var(--transition)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 12, color: isActive ? 'rgba(255,255,255,0.8)' : jColor }}>{j?.judge ?? '-'}</span>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 選択銘柄の概要 */}
            {selectedStock && selectedJudge && (
              <div className="card" style={{ marginTop: 12, borderColor: 'rgba(99,102,241,0.2)' }}>
                <div className="row-between">
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 15 }}>{selectedStock.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selectedStock.symbol}</p>
                  </div>
                  <Link href={`/stock/${selectedStock.symbol}`} style={{ textDecoration: 'none' }}>
                    <button className="btn btn-ghost btn-sm">詳細 →</button>
                  </Link>
                </div>
                <div className="grid-3" style={{ marginTop: 12 }}>
                  <div className="col">
                    <span className="label">現在値</span>
                    <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'Outfit' }}>
                      ¥{selectedJudge.price.price.toLocaleString()}
                    </span>
                  </div>
                  <div className="col">
                    <span className="label">高値↓</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: selectedJudge.drop_from_high <= -5 ? 'var(--color-no)' : 'var(--text-secondary)' }}>
                      {selectedJudge.drop_from_high.toFixed(1)}%
                    </span>
                  </div>
                  <div className="col">
                    <span className="label">単価↓</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: selectedJudge.drop_from_avg <= -7 ? 'var(--color-no)' : 'var(--text-secondary)' }}>
                      {selectedJudge.drop_from_avg.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* チャート本体 */}
            <div className="card" style={{ marginTop: 14, padding: '16px 8px 8px' }}>
              <div className="row" style={{ gap: 16, marginBottom: 12, paddingLeft: 8 }}>
                <div className="row" style={{ gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-chart-buy)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>通常買い</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-chart-surplus)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>余剰資金候補</span>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartWithLabel} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: '#475569' }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any) => [`¥${Number(v).toLocaleString()}`, '株価']}
                    labelFormatter={(_: any, p: any) => p?.[0]?.payload?.date ?? ''}
                  />
                  <Line type="monotone" dataKey="price" stroke="var(--accent-primary)" strokeWidth={2} dot={false}
                    activeDot={{ r: 4, fill: 'var(--accent-primary)' }} />
                  <Scatter data={buyNormal} dataKey="price" fill="var(--color-chart-buy)" />
                  <Scatter data={buySurplus} dataKey="price" fill="var(--color-chart-surplus)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 買いポイント一覧 */}
            {(buyNormal.length + buySurplus.length) > 0 && (
              <div className="section">
                <p className="section-title">買いポイント一覧（過去90日）</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...buySurplus, ...buyNormal].slice(0, 10).map(d => d.buyPoint && (
                    <div key={d.date} className="card" style={{
                      borderLeft: `3px solid ${d.buyPoint.type === 'surplus' ? 'var(--color-chart-surplus)' : 'var(--color-chart-buy)'}`,
                      padding: '10px 14px',
                    }}>
                      <div className="row-between">
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{d.date}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'Outfit' }}>
                          ¥{d.price.toLocaleString()}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                        {d.buyPoint.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
