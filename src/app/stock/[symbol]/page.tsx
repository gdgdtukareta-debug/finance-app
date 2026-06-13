/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, TrendingDown, TrendingUp, Target, DollarSign,
  Info, ToggleLeft, ToggleRight
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  Tooltip, ReferenceLine, CartesianGrid, Scatter
} from 'recharts';
import { getStocks, saveStock, getSettings } from '@/lib/db';
import { fetchPrice, generateDemoChart } from '@/lib/stockApi';
import { judgeStock } from '@/lib/judge';
import { Stock, PriceData, ChartDataPoint, StockJudgement } from '@/lib/types';

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = params?.symbol as string;

  const [stock, setStock] = useState<Stock | null>(null);
  const [price, setPrice] = useState<PriceData | null>(null);
  const [judgement, setJudgement] = useState<StockJudgement | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<ChartDataPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [memoInput, setMemoInput] = useState('');

  useEffect(() => {
    if (!symbol) return;
    (async () => {
      const stocks = getStocks();
      const found = stocks.find(s => s.symbol === symbol);
      if (!found) { router.push('/portfolio'); return; }
      setStock(found);
      setMemoInput(found.memo || '');

      const settings = getSettings();
      const p = await fetchPrice(symbol);
      setPrice(p);

      const j = judgeStock(found, p, settings, true);
      setJudgement(j);

      const chart = generateDemoChart(symbol, found.avg_price);
      setChartData(chart);
      setLoading(false);
    })();
  }, [symbol, router]);

  const handleToggleTarget = () => {
    if (!stock) return;
    const updated = { ...stock, is_target: !stock.is_target };
    saveStock(updated);
    setStock(updated);
  };

  const handleSaveMemo = () => {
    if (!stock) return;
    const updated = { ...stock, memo: memoInput.trim() };
    saveStock(updated);
    setStock(updated);
    setIsEditingMemo(false);
  };

  if (loading || !stock || !price || !judgement) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>データを読み込み中...</p>
      </div>
    );
  }

  const judgeColor = judgement.judge === '○' ? 'var(--color-buy)' : judgement.judge === '△' ? 'var(--color-watch)' : 'var(--text-muted)';

  // チャートのbuyポイントを散布図用データに変換
  const buyScatterNormal = chartData
    .filter(d => d.buyPoint?.type === 'normal')
    .map(d => ({ date: d.date, price: d.price }));
  const buyScatterSurplus = chartData
    .filter(d => d.buyPoint?.type === 'surplus')
    .map(d => ({ date: d.date, price: d.price }));

  // X軸ラベル用に日付を簡略化
  const chartWithIndex = chartData.map((d, i) => ({
    ...d,
    idx: i,
    label: i % 15 === 0 ? d.date.slice(5) : '',
  }));

  return (
    <>
      {/* ヘッダー */}
      <header className="page-header">
        <div className="row" style={{ gap: 12 }}>
          <button className="btn-icon" onClick={() => router.back()} aria-label="戻る">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 800 }}>{stock.name}</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{stock.symbol}</p>
          </div>
        </div>
        <button
          className="btn btn-sm"
          onClick={handleToggleTarget}
          style={{
            background: stock.is_target ? 'rgba(99,102,241,0.15)' : 'var(--bg-card)',
            border: `1px solid ${stock.is_target ? 'var(--accent-primary)' : 'var(--border-normal)'}`,
            color: stock.is_target ? 'var(--accent-primary)' : 'var(--text-secondary)',
            gap: 4,
          }}
        >
          {stock.is_target
            ? <><ToggleRight size={14} /> 対象中</>
            : <><ToggleLeft size={14} /> 対象外</>}
        </button>
      </header>

      <div className="page-content fade-in">
        {/* 判定メインカード */}
        <div className="section">
          <div className="card" style={{
            background: `linear-gradient(135deg, ${judgeColor}15, rgba(10,14,26,0.9))`,
            borderColor: `${judgeColor}40`,
            padding: '20px',
          }}>
            <div className="row-between">
              <div>
                <span className="label">現在の買い判定</span>
                <div className="row" style={{ gap: 12, marginTop: 8, alignItems: 'center' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    border: `2.5px solid ${judgeColor}`,
                    background: `${judgeColor}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 26, fontWeight: 900, color: judgeColor,
                    boxShadow: judgement.judge === '○' ? `0 0 24px ${judgeColor}60` : 'none',
                    animation: judgement.judge === '○' ? 'pulse-buy 2s infinite' : 'none',
                  }}>{judgement.judge}</div>
                  {judgement.is_surplus_candidate && (
                    <span className="badge-surplus">💰 余剰資金候補</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="label">現在株価</span>
                <div style={{ fontSize: 30, fontWeight: 900, fontFamily: 'Outfit', letterSpacing: '-0.02em', marginTop: 4 }}>
                  ¥{price.price.toLocaleString()}
                </div>
              </div>
            </div>
            <div style={{
              marginTop: 14, padding: '10px 12px',
              background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-md)',
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
            }}>
              <Info size={13} style={{ display: 'inline', marginRight: 6 }} />
              {judgement.judge_reason}
            </div>
          </div>
        </div>

        {/* 指標グリッド */}
        <div className="section">
          <div className="grid-2" style={{ gap: 10 }}>
            <MetricCard
              icon={<Target size={15} color="var(--accent-primary)" />}
              label="平均取得単価"
              value={`¥${stock.avg_price.toLocaleString()}`}
              sub={`${stock.shares}株保有`}
            />
            <MetricCard
              icon={<TrendingUp size={15} color="var(--color-watch)" />}
              label="3か月高値"
              value={`¥${price.high_3m.toLocaleString()}`}
              sub={`現値との差: ¥${(price.price - price.high_3m).toLocaleString()}`}
            />
            <MetricCard
              icon={<TrendingDown size={15} color={judgement.drop_from_high <= -5 ? 'var(--color-no)' : 'var(--text-secondary)'} />}
              label="高値からの下落率"
              value={`${judgement.drop_from_high.toFixed(2)}%`}
              highlight={judgement.drop_from_high <= -5}
              highlightColor="var(--color-no)"
              sub={`基準: -5%`}
            />
            <MetricCard
              icon={<TrendingDown size={15} color={judgement.drop_from_avg <= -7 ? 'var(--color-no)' : 'var(--text-secondary)'} />}
              label="平均単価からの下落"
              value={`${judgement.drop_from_avg.toFixed(2)}%`}
              highlight={judgement.drop_from_avg <= -7}
              highlightColor="var(--color-no)"
              sub={`基準: -7%`}
            />
            <MetricCard
              icon={<DollarSign size={15} color="var(--color-buy)" />}
              label="予定配当金（年）"
              value={`¥${price.dividend.toLocaleString()}`}
              sub={`利回り ${judgement.dividend_yield.toFixed(2)}%`}
            />
            <MetricCard
              icon={<Target size={15} color="var(--color-surplus)" />}
              label="余剰資金基準価格"
              value={`¥${Math.round(stock.avg_price * 0.85).toLocaleString()}`}
              sub={`平均単価の -15%`}
              highlight={judgement.is_surplus_candidate}
              highlightColor="var(--color-surplus)"
            />
          </div>
        </div>

        {/* メモセクション */}
        <div className="section">
          <p className="section-title">💡 銘柄メモ</p>
          <div className="card" style={{ padding: '14px 16px' }}>
            {isEditingMemo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  className="form-input"
                  style={{ minHeight: 60, resize: 'vertical', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' }}
                  value={memoInput}
                  onChange={e => setMemoInput(e.target.value)}
                  placeholder="この銘柄に関するメモを入力（例: 配当目的、〇〇円以下で買い増しなど）"
                />
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveMemo} style={{ flex: 1 }}>
                    保存
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setIsEditingMemo(false); setMemoInput(stock?.memo || ''); }} style={{ flex: 1 }}>
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div className="row-between" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {stock.memo ? (
                    <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {stock.memo}
                    </p>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      メモは登録されていません
                    </p>
                  )}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setIsEditingMemo(true)}
                  style={{ padding: '4px 8px', fontSize: 12 }}
                >
                  編集
                </button>
              </div>
            )}
          </div>
        </div>

        {/* チャート */}
        <div className="section">
          <p className="section-title">📊 過去90日チャート（買いポイント付き）</p>
          <div className="card" style={{ padding: '16px 8px 8px' }}>
            <div className="row" style={{ gap: 16, marginBottom: 12, paddingLeft: 8 }}>
              <div className="row" style={{ gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-chart-buy)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>通常買いポイント</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-chart-surplus)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>余剰資金候補</span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartWithIndex} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `¥${(v/1000).toFixed(0)}k`}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ background: '#1e2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                  formatter={(value: any) => [`¥${Number(value).toLocaleString()}`, '株価']}
                  labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.date ?? ''}
                />
                {/* 平均取得単価ライン */}
                <ReferenceLine y={stock.avg_price} stroke="rgba(99,102,241,0.6)" strokeDasharray="4 4"
                  label={{ value: '平均単価', position: 'right', fontSize: 10, fill: '#6366f1', offset: 4 }} />
                {/* -7%ライン */}
                <ReferenceLine y={stock.avg_price * 0.93} stroke="rgba(245,158,11,0.4)" strokeDasharray="3 3" />
                {/* -15%ライン */}
                <ReferenceLine y={stock.avg_price * 0.85} stroke="rgba(244,63,94,0.4)" strokeDasharray="3 3" />
                {/* 株価ライン */}
                <Line
                  type="monotone" dataKey="price"
                  stroke="var(--accent-primary)" strokeWidth={2}
                  dot={false} activeDot={{ r: 4, fill: 'var(--accent-primary)' }}
                />
                {/* 通常買いポイント */}
                <Scatter
                  data={buyScatterNormal.map((d, i) => ({ ...d, idx: chartWithIndex.findIndex(c => c.date === d.date) }))}
                  dataKey="price"
                  fill="var(--color-chart-buy)"
                  onClick={(d: any) => setSelectedPoint(chartData.find(c => c.date === d.date) ?? null)}
                  style={{ cursor: 'pointer' }}
                />
                {/* 余剰資金候補ポイント */}
                <Scatter
                  data={buyScatterSurplus.map((d) => ({ ...d, idx: chartWithIndex.findIndex(c => c.date === d.date) }))}
                  dataKey="price"
                  fill="var(--color-chart-surplus)"
                  onClick={(d: any) => setSelectedPoint(chartData.find(c => c.date === d.date) ?? null)}
                  style={{ cursor: 'pointer' }}
                />
              </ComposedChart>
            </ResponsiveContainer>

            {/* 選択したポイントの詳細 */}
            {selectedPoint?.buyPoint && (
              <div style={{
                margin: '12px 8px 0', padding: '12px',
                background: selectedPoint.buyPoint.type === 'surplus'
                  ? 'var(--color-surplus-bg)' : 'rgba(59,130,246,0.1)',
                border: `1px solid ${selectedPoint.buyPoint.type === 'surplus' ? 'var(--color-surplus)' : 'var(--color-chart-buy)'}40`,
                borderRadius: 'var(--radius-md)', fontSize: 13,
              }}>
                <div className="row-between">
                  <span style={{ fontWeight: 700 }}>{selectedPoint.date}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    ¥{selectedPoint.price.toLocaleString()}
                  </span>
                </div>
                <p style={{ marginTop: 6, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selectedPoint.buyPoint.reason}
                </p>
                <div className="row" style={{ gap: 16, marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    高値↓ {selectedPoint.buyPoint.drop_from_high.toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    単価↓ {selectedPoint.buyPoint.drop_from_avg.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ==================== 指標カード ====================
function MetricCard({
  icon, label, value, sub, highlight, highlightColor
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  highlightColor?: string;
}) {
  return (
    <div className="card" style={{
      borderColor: highlight ? `${highlightColor}40` : 'var(--border-subtle)',
      background: highlight ? `${highlightColor}10` : 'var(--bg-card)',
    }}>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        {icon}
        <span className="label" style={{ color: highlight ? highlightColor : undefined }}>{label}</span>
      </div>
      <div style={{
        fontSize: 18, fontWeight: 800, fontFamily: 'Outfit',
        color: highlight ? highlightColor : 'var(--text-primary)',
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
