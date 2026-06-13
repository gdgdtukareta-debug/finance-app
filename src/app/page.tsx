'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, TrendingDown, Wallet, ChevronRight, Zap, AlertCircle } from 'lucide-react';
import { getStocks, getBudget, getSettings } from '@/lib/db';
import { fetchAllPrices } from '@/lib/stockApi';
import { judgeAllStocks, isJudgeTimeNow } from '@/lib/judge';
import { Stock, PriceData, StockJudgement, BudgetSettings, AppSettings } from '@/lib/types';

export default function HomePage() {
  const [judgements, setJudgements] = useState<StockJudgement[]>([]);
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [budget, setBudget] = useState<BudgetSettings | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const s = getSettings();
      const b = getBudget();
      const stocks = getStocks();
      setSettings(s);
      setBudget(b);
      setAllStocks(stocks);

      const targetStocks = stocks.filter(st => st.is_target);
      const symbols = targetStocks.map(st => st.symbol);
      const priceData = await fetchAllPrices(symbols);
      setPrices(priceData);

      const results = judgeAllStocks(stocks, priceData, s, b.current_budget);
      setJudgements(results);
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const buyOk = judgements.filter(j => j.judge === '○');
  const watchList = judgements.filter(j => j.judge === '△');
  const noList = judgements.filter(j => j.judge === '×');

  const budgetPct = budget && budget.monthly_budget > 0
    ? Math.min(100, (budget.current_budget / budget.monthly_budget) * 100)
    : 0;

  const barClass = budgetPct > 60 ? 'budget-bar-high' : budgetPct > 30 ? 'budget-bar-mid' : 'budget-bar-low';

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>株価データを取得中...</p>
      </div>
    );
  }

  return (
    <>
      {/* ヘッダー */}
      <header className="page-header">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>📈 買い増し判定</h1>
          {lastUpdated && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              更新: {lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          className="btn-icon"
          onClick={loadData}
          disabled={refreshing}
          aria-label="データを更新"
        >
          <RefreshCw size={18} style={{ animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }} />
        </button>
      </header>

      {/* デモモードバナー */}
      {settings?.demo_mode && (
        <div className="demo-banner">
          <Zap size={13} />
          デモモード稼働中 — 模擬データで表示しています
        </div>
      )}

      <div className="page-content fade-in">
        {/* 月予算カード */}
        <div className="section">
          <div className="card card-glass" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)', borderColor: 'rgba(99,102,241,0.2)' }}>
            <div className="row-between">
              <div className="row" style={{ gap: 8 }}>
                <Wallet size={16} color="var(--accent-primary)" />
                <span className="label">今月の残り予算</span>
                {budget?.rollover_enabled && (
                  <span style={{ fontSize: 10, color: 'var(--accent-primary)', background: 'rgba(99,102,241,0.15)', padding: '2px 6px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>繰越あり</span>
                )}
              </div>
              <Link href="/settings" style={{ color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none' }}>設定 →</Link>
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 800, fontFamily: 'Outfit', letterSpacing: '-0.02em', color: budgetPct > 30 ? 'var(--text-primary)' : 'var(--color-no)' }}>
                ¥{(budget?.current_budget ?? 0).toLocaleString()}
              </span>
              {budget && budget.monthly_budget > 0 && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 8 }}>
                  / ¥{budget.monthly_budget.toLocaleString()}
                </span>
              )}
            </div>
            {budget && budget.monthly_budget > 0 && (
              <div className="budget-bar-container">
                <div className={`budget-bar-fill ${barClass}`} style={{ width: `${budgetPct}%` }} />
              </div>
            )}
            {budget?.monthly_budget === 0 && (
              <div className="row mt-8" style={{ gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
                <AlertCircle size={13} />
                設定から月予算を登録すると判定が有効になります
              </div>
            )}
          </div>
        </div>

        {/* 判定時間帯インジケーター */}
        {settings && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px', marginTop: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isJudgeTimeNow(settings.judge_time_start, settings.judge_time_end) ? 'var(--color-buy)' : 'var(--text-muted)',
              boxShadow: isJudgeTimeNow(settings.judge_time_start, settings.judge_time_end) ? '0 0 8px var(--color-buy)' : 'none',
              animation: isJudgeTimeNow(settings.judge_time_start, settings.judge_time_end) ? 'pulse-buy 2s infinite' : 'none',
            }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isJudgeTimeNow(settings.judge_time_start, settings.judge_time_end)
                ? `判定時間中（${settings.judge_time_start}:00〜${settings.judge_time_end}:00）`
                : `判定時間外（${settings.judge_time_start}:00〜${settings.judge_time_end}:00）`}
            </span>
          </div>
        )}

        {/* ○ 買いOK銘柄 */}
        {buyOk.length > 0 && (
          <div className="section">
            <p className="section-title">🟢 買いOK ({buyOk.length}銘柄)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {buyOk.map(j => <StockCard key={j.stock.symbol} judgement={j} />)}
            </div>
          </div>
        )}

        {/* △ 様子見 */}
        {watchList.length > 0 && (
          <div className="section">
            <p className="section-title">🟡 様子見 ({watchList.length}銘柄)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {watchList.map(j => <StockCard key={j.stock.symbol} judgement={j} />)}
            </div>
          </div>
        )}

        {/* × 買い見送り */}
        {noList.length > 0 && (
          <div className="section">
            <p className="section-title">⚫ 買い見送り ({noList.length}銘柄)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {noList.map(j => <StockCard key={j.stock.symbol} judgement={j} />)}
            </div>
          </div>
        )}

        {judgements.length === 0 && (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <div className="empty-state-icon">
              <TrendingDown size={28} />
            </div>
            <h3>銘柄が登録されていません</h3>
            <p>「銘柄」タブからポートフォリオを登録してください。楽天証券のCSVも取り込めます。</p>
            <Link href="/portfolio" className="btn btn-primary" style={{ marginTop: 8 }}>
              銘柄を登録する
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

// ==================== 銘柄カード ====================
function StockCard({ judgement: j }: { judgement: StockJudgement }) {
  const judgeColor = j.judge === '○' ? 'var(--color-buy)' : j.judge === '△' ? 'var(--color-watch)' : 'var(--text-muted)';
  const judgeBg = j.judge === '○' ? 'var(--color-buy-bg)' : j.judge === '△' ? 'var(--color-watch-bg)' : 'var(--bg-card)';

  return (
    <Link href={`/stock/${j.stock.symbol}`} style={{ textDecoration: 'none' }}>
      <div className="card pressable" style={{
        borderColor: j.judge === '○' ? 'rgba(34,197,94,0.2)' : j.judge === '△' ? 'rgba(245,158,11,0.2)' : 'var(--border-subtle)',
        background: j.judge === '○' ? 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(10,14,26,0.8))' : 'var(--bg-card)',
      }}>
        <div className="row-between">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>{j.stock.name}</span>
              {j.is_surplus_candidate && <span className="badge-surplus">💰 余剰資金候補</span>}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{j.stock.symbol}</span>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: judgeBg, border: `2px solid ${judgeColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: judgeColor,
              boxShadow: j.judge === '○' ? '0 0 20px var(--color-buy-glow)' : 'none',
              animation: j.judge === '○' ? 'pulse-buy 2s ease-in-out infinite' : 'none',
            }}>{j.judge}</div>
            <ChevronRight size={16} color="var(--text-muted)" />
          </div>
        </div>

        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="col">
            <span className="label">現在値</span>
            <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'Outfit' }}>¥{j.price.price.toLocaleString()}</span>
          </div>
          <div className="col">
            <span className="label">高値↓</span>
            <span className={j.drop_from_high <= -5 ? 'rate-down' : 'rate-neutral'} style={{ fontSize: 15, fontWeight: 700 }}>
              {j.drop_from_high.toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>
              高値 ¥{j.price.high_3m.toLocaleString()}
            </span>
          </div>
          <div className="col">
            <span className="label">単価↓</span>
            <span className={j.drop_from_avg <= -7 ? 'rate-down' : j.drop_from_avg < 0 ? 'rate-neutral' : 'rate-up'} style={{ fontSize: 15, fontWeight: 700 }}>
              {j.drop_from_avg.toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>
              平均 ¥{j.stock.avg_price.toLocaleString()}
            </span>
          </div>
        </div>

        {j.stock.memo && (
          <div style={{
            marginTop: 10, padding: '6px 10px',
            background: 'rgba(99,102,241,0.06)', 
            borderLeft: '2px solid var(--accent-primary)',
            borderRadius: '2px',
            fontSize: 11, color: 'var(--text-secondary)',
            lineHeight: 1.4,
          }}>
            💡 {j.stock.memo}
          </div>
        )}

        <div style={{
          marginTop: 10, padding: '8px 10px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)',
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
        }}>
          {j.judge_reason}
        </div>
      </div>
    </Link>
  );
}
