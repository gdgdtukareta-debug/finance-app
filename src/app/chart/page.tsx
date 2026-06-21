/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, DollarSign } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Scatter, AreaChart, Area
} from 'recharts';
import { getStocks, getSettings, getBudget } from '@/lib/db';
import { fetchAllPrices, fetchStockChart } from '@/lib/stockApi';
import { judgeAllStocks } from '@/lib/judge';
import { Stock, PriceData, StockJudgement, ChartDataPoint, AppSettings } from '@/lib/types';
import Link from 'next/link';

export default function ChartPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [judgements, setJudgements] = useState<StockJudgement[]>([]);
  const [overallChart, setOverallChart] = useState<{ date: string; price: number }[]>([]);
  const [individualCharts, setIndividualCharts] = useState<Record<string, ChartDataPoint[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const s = getSettings();
      const allStocks = getStocks().filter(st => st.is_target);
      setStocks(allStocks);

      if (allStocks.length === 0) {
        setLoading(false);
        return;
      }

      // 1. 各銘柄の最新価格と判定をロード
      const prices = await fetchAllPrices(allStocks.map(st => st.symbol));
      const b = getBudget();
      const j = judgeAllStocks(allStocks, prices, s, b.current_budget);
      setJudgements(j);

      // 2. 各銘柄の過去3ヶ月チャートデータを取得
      const chartMap: Record<string, ChartDataPoint[]> = {};
      await Promise.all(
        allStocks.map(async (st) => {
          chartMap[st.symbol] = await fetchStockChart(st.symbol, st.avg_price, s);
        })
      );
      setIndividualCharts(chartMap);

      // 3. 全体ポートフォリオの過去3ヶ月資産推移の算出
      const allDates = Array.from(
        new Set(
          Object.values(chartMap)
            .flatMap(points => points.map(p => p.date))
        )
      ).sort();

      const overallData = allDates.map(date => {
        let totalVal = 0;
        allStocks.forEach(st => {
          const points = chartMap[st.symbol] || [];
          // その日、またはその日より前で最も直近の有効なデータを探す
          let pt = points.find(p => p.date === date);
          if (!pt) {
            const pastPoints = points.filter(p => p.date < date);
            if (pastPoints.length > 0) {
              pt = pastPoints[pastPoints.length - 1];
            }
          }
          if (pt && pt.price) {
            totalVal += pt.price * st.shares;
          }
        });
        return {
          date,
          price: Math.round(totalVal),
        };
      }).filter(d => d.price > 0);

      setOverallChart(overallData);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>資産チャートを描画中...</p>
      </div>
    );
  }

  // 判定結果順（○ ➔ △ ➔ ×）で銘柄を並び替え
  const sortedJudgements = [...judgements].sort((a, b) => {
    const order: Record<string, number> = { '○': 0, '△': 1, '×': 2 };
    return order[a.judge] - order[b.judge];
  });

  return (
    <>
      <header className="page-header">
        <h1>📊 資産チャート</h1>
      </header>

      <div className="page-content fade-in" style={{ paddingBottom: 80 }}>
        {stocks.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 60 }}>
            <div className="empty-state-icon"><BarChart2 size={28} /></div>
            <h3>銘柄が登録されていません</h3>
            <p>「銘柄」タブからポートフォリオを登録してください</p>
            <Link href="/portfolio" className="btn btn-primary" style={{ marginTop: 8 }}>銘柄を登録する</Link>
          </div>
        ) : (
          <>
            {/* 1. ポートフォリオ全体の総資産チャート */}
            <div className="section">
              <p className="section-title">💼 ポートフォリオ全体の総評価額推移 (過去3ヶ月)</p>
              <div className="card card-glass" style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(139,92,246,0.05) 100%)',
                borderColor: 'rgba(99,102,241,0.15)',
                padding: '20px 12px 12px'
              }}>
                {overallChart.length > 0 && (
                  <div style={{ marginBottom: 16, paddingLeft: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>現在の合計評価額</span>
                    <h2 style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Outfit', color: 'var(--text-primary)', marginTop: 2 }}>
                      ¥{overallChart[overallChart.length - 1].price.toLocaleString()}
                    </h2>
                  </div>
                )}
                
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={overallChart} margin={{ top: 10, right: 5, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorOverall" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 9, fill: '#475569' }} 
                      axisLine={false} 
                      tickLine={false}
                      tickFormatter={val => val.slice(5)}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 9, fill: '#475569' }}
                      axisLine={false} 
                      tickLine={false}
                      tickFormatter={v => `¥${(v / 10000).toFixed(0)}万`}
                      width={55}
                    />
                    <Tooltip
                      contentStyle={{ background: '#1e2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => [`¥${Number(v).toLocaleString()}`, '総評価額']}
                      labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Area type="monotone" dataKey="price" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorOverall)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. 個別の買い増し判定銘柄チャート一覧 */}
            <div className="section" style={{ marginTop: 28 }}>
              <p className="section-title">📈 個別銘柄の株価と買いタイミング (判定優先順)</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {sortedJudgements.map(j => {
                  const chartData = individualCharts[j.stock.symbol] || [];
                  const buyNormal = chartData.filter(d => d.buyPoint?.type === 'normal');
                  const buySurplus = chartData.filter(d => d.buyPoint?.type === 'surplus');
                  
                  const judgeColor = j.judge === '○' ? 'var(--color-buy)' : j.judge === '△' ? 'var(--color-watch)' : 'var(--text-muted)';
                  const judgeBg = j.judge === '○' ? 'var(--color-buy-bg)' : j.judge === '△' ? 'var(--color-watch-bg)' : 'var(--bg-card)';

                  return (
                    <div key={j.stock.symbol} className="card" style={{
                      borderColor: j.judge === '○' ? 'rgba(34,197,94,0.15)' : j.judge === '△' ? 'rgba(245,158,11,0.15)' : 'var(--border-subtle)',
                      background: 'var(--bg-card)',
                      padding: '16px 12px 12px'
                    }}>
                      {/* 銘柄ヘッダー */}
                      <div className="row-between" style={{ marginBottom: 12 }}>
                        <div>
                          <div className="row" style={{ gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{j.stock.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{j.stock.symbol}</span>
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            平均単価: ¥{j.stock.avg_price.toLocaleString()} ({j.stock.shares}株)
                          </p>
                        </div>
                        
                        <div className="row" style={{ gap: 8 }}>
                          <span style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: judgeBg,
                            border: `1px solid ${judgeColor}`,
                            color: judgeColor,
                            fontWeight: 700
                          }}>
                            判定: {j.judge}
                          </span>
                          <Link href={`/stock/${j.stock.symbol}`}>
                            <span style={{ fontSize: 11, color: 'var(--accent-primary)', textDecoration: 'none', cursor: 'pointer' }}>詳細 →</span>
                          </Link>
                        </div>
                      </div>

                      {/* 株価・下落率の簡易ステータス */}
                      <div className="grid-3" style={{ background: 'rgba(255,255,255,0.01)', padding: '8px 6px', borderRadius: 8, marginBottom: 12 }}>
                        <div className="col">
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>現在値</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Outfit' }}>¥{j.price.price.toLocaleString()}</span>
                        </div>
                        <div className="col">
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>高値比</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: j.drop_from_high <= -5 ? 'var(--color-no)' : 'var(--text-secondary)' }}>
                            {j.drop_from_high.toFixed(1)}%
                          </span>
                        </div>
                        <div className="col">
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>取得単価比</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: j.drop_from_avg <= -7 ? 'var(--color-no)' : 'var(--text-secondary)' }}>
                            {j.drop_from_avg.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* チャート本体 */}
                      <div style={{ position: 'relative' }}>
                        <ResponsiveContainer width="100%" height={130}>
                          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                            <XAxis 
                              dataKey="date" 
                              tick={{ fontSize: 8, fill: '#475569' }} 
                              axisLine={false} 
                              tickLine={false}
                              tickFormatter={val => val.slice(5)}
                            />
                            <YAxis
                              domain={['auto', 'auto']}
                              tick={{ fontSize: 8, fill: '#475569' }}
                              axisLine={false} 
                              tickLine={false}
                              tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`}
                              width={40}
                            />
                            <Tooltip
                              contentStyle={{ background: '#1e2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 10, padding: '4px 8px' }}
                              formatter={(v: any) => [`¥${Number(v).toLocaleString()}`, '株価']}
                              labelFormatter={(label) => `日付: ${label}`}
                            />
                            {/* 平均取得単価のライン */}
                            {j.stock.avg_price > 0 && (
                              <Line 
                                type="monotone" 
                                dataKey={() => j.stock.avg_price} 
                                stroke="rgba(99,102,241,0.25)" 
                                strokeWidth={1} 
                                strokeDasharray="4 4"
                                dot={false} 
                              />
                            )}
                            <Line type="monotone" dataKey="price" stroke="var(--accent-primary)" strokeWidth={1.5} dot={false} />
                            <Scatter data={buyNormal} dataKey="price" fill="var(--color-chart-buy)" r={2.5} />
                            <Scatter data={buySurplus} dataKey="price" fill="var(--color-chart-surplus)" r={2.5} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      {/* 判定コメント */}
                      <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.01)', padding: '6px 10px', borderRadius: 6, marginTop: 8, lineHeight: 1.4 }}>
                        💡 {j.judge_reason}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
