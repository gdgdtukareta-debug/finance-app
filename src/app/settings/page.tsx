'use client';

import { useEffect, useState } from 'react';
import {
  Wallet, RefreshCw, Clock, TrendingDown, Bell, Key,
  Database, LogOut, Info, ChevronRight, Save, Zap
} from 'lucide-react';
import { getSettings, saveSettings, getBudget, saveBudget, getStocks } from '@/lib/db';
import { AppSettings, BudgetSettings } from '@/lib/types';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [budget, setBudget] = useState<BudgetSettings | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(getSettings());
    setBudget(getBudget());
  }, []);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const handleSave = async () => {
    if (!settings || !budget) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 400)); // 保存感を演出
    saveSettings({ ...settings, updated_at: new Date().toISOString() });
    saveBudget({ ...budget, updated_at: new Date().toISOString() });
    setSaving(false);
    showToast('設定を保存しました ✓', 'success');
  };

  const handleExportCSV = () => {
    const stocks = getStocks();
    const header = '銘柄コード,銘柄名,保有数量,取得単価\n';
    const rows = stocks.map(s => `${s.symbol},${s.name},${s.shares},${s.avg_price}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast('CSVをエクスポートしました', 'success');
  };

  const handleResetDemo = () => {
    if (!confirm('デモデータをリセットしますか？登録した銘柄はすべて消えます。')) return;
    localStorage.clear();
    window.location.reload();
  };

  if (!settings || !budget) return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
    </div>
  );

  return (
    <>
      <header className="page-header">
        <h1>⚙️ 設定</h1>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
          {saving ? '保存中...' : '保存'}
        </button>
      </header>

      {/* トースト */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>

      <div className="page-content fade-in" style={{ paddingBottom: 100 }}>

        {/* デモモード */}
        <div className="section">
          <p className="section-title">モード設定</p>
          <div className="card" style={{
            borderColor: settings.demo_mode ? 'rgba(99,102,241,0.3)' : 'var(--border-subtle)',
            background: settings.demo_mode ? 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(10,14,26,0.9))' : 'var(--bg-card)',
          }}>
            <div className="row-between">
              <div className="row" style={{ gap: 10 }}>
                <Zap size={18} color="var(--accent-primary)" />
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>デモモード</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    模擬データで全機能を体験できます
                  </p>
                </div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={settings.demo_mode}
                  onChange={e => setSettings(s => s ? { ...s, demo_mode: e.target.checked } : s)} />
                <span className="toggle-slider" />
              </label>
            </div>
            {settings.demo_mode && (
              <div style={{
                marginTop: 12, padding: '8px 10px',
                background: 'rgba(99,102,241,0.08)', borderRadius: 'var(--radius-sm)',
                fontSize: 12, color: '#a5b4fc',
              }}>
                <Info size={11} style={{ display: 'inline', marginRight: 4 }} />
                デモモードON: 実際のAPI接続なしで動作します。本番環境に切り替えるには下記のAPIキーを設定してください。
              </div>
            )}
          </div>
        </div>

        {/* 月予算 */}
        <div className="section">
          <p className="section-title">
            <Wallet size={11} style={{ display: 'inline', marginRight: 6 }} />
            月予算設定
          </p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">月予算（円）</label>
              <input
                className="form-input" type="number"
                placeholder="例: 50000（0円 = 判定なし）"
                value={budget.monthly_budget || ''}
                onChange={e => setBudget(b => b ? { ...b, monthly_budget: Number(e.target.value), current_budget: Number(e.target.value) } : b)}
              />
            </div>
            <div className="row-between">
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>月末に余った予算を翌月へ繰越</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>ONにすると余剰分が翌月に加算されます</p>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={budget.rollover_enabled}
                  onChange={e => setBudget(b => b ? { ...b, rollover_enabled: e.target.checked } : b)} />
                <span className="toggle-slider" />
              </label>
            </div>
            {budget.rollover_enabled && (
              <div className="form-group">
                <label className="form-label">繰越上限（円）</label>
                <input
                  className="form-input" type="number"
                  placeholder="例: 10000"
                  value={budget.rollover_limit || ''}
                  onChange={e => setBudget(b => b ? { ...b, rollover_limit: Number(e.target.value) } : b)}
                />
              </div>
            )}
          </div>
        </div>

        {/* 判定条件 */}
        <div className="section">
          <p className="section-title">
            <TrendingDown size={11} style={{ display: 'inline', marginRight: 6 }} />
            買い判定条件
          </p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">3か月高値からの下落率（買いOK基準）</label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="form-input" type="number"
                  value={settings.drop_high_threshold}
                  onChange={e => setSettings(s => s ? { ...s, drop_high_threshold: Number(e.target.value) } : s)}
                  style={{ flex: 1 }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 14, minWidth: 20 }}>%</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>初期値: -5%</p>
            </div>
            <div className="form-group">
              <label className="form-label">平均取得単価からの下落率（買いOK基準）</label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="form-input" type="number"
                  value={settings.drop_avg_threshold}
                  onChange={e => setSettings(s => s ? { ...s, drop_avg_threshold: Number(e.target.value) } : s)}
                  style={{ flex: 1 }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 14, minWidth: 20 }}>%</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>初期値: -7%</p>
            </div>
            <div className="form-group">
              <label className="form-label">余剰資金投入候補の下落率</label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="form-input" type="number"
                  value={settings.surplus_threshold}
                  onChange={e => setSettings(s => s ? { ...s, surplus_threshold: Number(e.target.value) } : s)}
                  style={{ flex: 1 }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 14, minWidth: 20 }}>%</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>初期値: -15%</p>
            </div>
          </div>
        </div>

        {/* 自動判定時間 */}
        <div className="section">
          <p className="section-title">
            <Clock size={11} style={{ display: 'inline', marginRight: 6 }} />
            自動判定時間帯
          </p>
          <div className="card">
            <div className="grid-2" style={{ gap: 10 }}>
              <div className="form-group">
                <label className="form-label">開始時刻（時）</label>
                <input
                  className="form-input" type="number" min={0} max={23}
                  value={settings.judge_time_start}
                  onChange={e => setSettings(s => s ? { ...s, judge_time_start: Number(e.target.value) } : s)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">終了時刻（時）</label>
                <input
                  className="form-input" type="number" min={0} max={23}
                  value={settings.judge_time_end}
                  onChange={e => setSettings(s => s ? { ...s, judge_time_end: Number(e.target.value) } : s)}
                />
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
              この時間帯にアプリを開くと自動で株価を更新・判定します。初期値: 11〜14時
            </p>
          </div>
        </div>

        {/* LINE通知 */}
        <div className="section">
          <p className="section-title">
            <Bell size={11} style={{ display: 'inline', marginRight: 6 }} />
            LINE通知設定（オーナー専用）
          </p>
          <div className="card">
            <div className="form-group">
              <label className="form-label">LINE チャンネルアクセストークン</label>
              <input
                className="form-input"
                type="password"
                placeholder="LINE Messaging APIのトークン"
                value={settings.line_token}
                onChange={e => setSettings(s => s ? { ...s, line_token: e.target.value } : s)}
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.7 }}>
              買い判定が「○」になった際や余剰資金候補時に<br />
              LINEへ通知します。LINE Developersで取得できます。
            </p>
          </div>
        </div>

        {/* APIキー */}
        <div className="section">
          <p className="section-title">
            <Key size={11} style={{ display: 'inline', marginRight: 6 }} />
            APIキー設定（本番モード用）
          </p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">株価APIキー（Finnhub / Alpha Vantage）</label>
              <input
                className="form-input" type="password"
                placeholder="APIキーを入力"
                value={settings.stock_api_key}
                onChange={e => setSettings(s => s ? { ...s, stock_api_key: e.target.value } : s)}
              />
            </div>
          </div>
        </div>

        {/* Supabase設定 */}
        <div className="section">
          <p className="section-title">
            <Database size={11} style={{ display: 'inline', marginRight: 6 }} />
            Supabase接続設定（本番モード用）
          </p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Supabase URL</label>
              <input
                className="form-input"
                placeholder="https://xxxx.supabase.co"
                value={settings.supabase_url}
                onChange={e => setSettings(s => s ? { ...s, supabase_url: e.target.value } : s)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Supabase Anon Key</label>
              <input
                className="form-input" type="password"
                placeholder="eyJhbGci..."
                value={settings.supabase_anon_key}
                onChange={e => setSettings(s => s ? { ...s, supabase_anon_key: e.target.value } : s)}
              />
            </div>
            <div style={{
              padding: '10px 12px', background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-md)',
              fontSize: 12, color: '#fcd34d', lineHeight: 1.7,
            }}>
              <Info size={11} style={{ display: 'inline', marginRight: 4 }} />
              本番モードに切り替えると、データがSupabaseに保存されます。<br />
              Supabase公式サイト（supabase.com）で無料アカウントを作成してください。
            </div>
          </div>
        </div>

        {/* CSVエクスポート */}
        <div className="section">
          <p className="section-title">データ管理</p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-ghost btn-full" onClick={handleExportCSV} style={{ justifyContent: 'flex-start', gap: 10 }}>
              <ChevronRight size={16} />
              ポートフォリオをCSVでエクスポート
            </button>
            <div className="divider" />
            <button className="btn btn-danger btn-full" onClick={handleResetDemo} style={{ justifyContent: 'flex-start', gap: 10 }}>
              <LogOut size={16} />
              デモデータをリセット
            </button>
          </div>
        </div>

        {/* バージョン情報 */}
        <div style={{ textAlign: 'center', padding: '24px 0 8px', color: 'var(--text-muted)', fontSize: 12 }}>
          買い増し判定アプリ v1.0.0<br />
          <span style={{ fontSize: 11 }}>デモモードで動作中 • データはブラウザに保存されています</span>
        </div>
      </div>
    </>
  );
}
