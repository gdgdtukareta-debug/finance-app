'use client';

import { useEffect, useState } from 'react';
import {
  Wallet, RefreshCw, Clock, TrendingDown, Bell, Key,
  Database, LogOut, Info, ChevronRight, Save, Zap, User, Copy, Check
} from 'lucide-react';
import { getSettings, saveSettings, getBudget, saveBudget, getStocks } from '@/lib/db';
import { AppSettings, BudgetSettings } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [budget, setBudget] = useState<BudgetSettings | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  const { user, signOut } = useAuth();

  useEffect(() => {
    setSettings(getSettings());
    setBudget(getBudget());
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhook/line`);
    }
  }, []);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const handleSave = async () => {
    if (!settings || !budget) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
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

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    showToast('コピーしました', 'success');
    setTimeout(() => setCopied(false), 2000);
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

        {/* ログインユーザー情報 */}
        <div className="section">
          <p className="section-title">アカウント管理</p>
          <div className="card">
            <div className="row-between">
              <div className="row" style={{ gap: 10 }}>
                <div style={{ padding: 8, background: 'rgba(99,102,241,0.1)', borderRadius: '50%', color: 'var(--accent-primary)' }}>
                  <User size={18} />
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13 }}>ログイン中のアカウント</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{user?.email}</p>
                </div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={signOut} style={{ gap: 6 }}>
                <LogOut size={13} />
                ログアウト
              </button>
            </div>
          </div>
        </div>

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

        {/* LINE通知 ＆ Webhook設定 */}
        <div className="section">
          <p className="section-title">
            <Bell size={11} style={{ display: 'inline', marginRight: 6 }} />
            LINE自動返信・通知設定
          </p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">LINE チャンネルアクセストークン</label>
              <input
                className="form-input"
                type="password"
                placeholder="LINE Messaging APIのトークン"
                value={settings.line_token || ''}
                onChange={e => setSettings(s => s ? { ...s, line_token: e.target.value } : s)}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">あなたの LINE ユーザーID</label>
              <input
                className="form-input"
                placeholder="トークで「ID」と送信すると取得できます"
                value={settings.line_user_id || ''}
                onChange={e => setSettings(s => s ? { ...s, line_user_id: e.target.value } : s)}
              />
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                このIDを登録すると、LINEから「判定」と送るだけでいつでも買い時を確認できます。
              </p>
            </div>

            <div className="divider" />

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>💬 LINE Webhook 設定ガイド</p>
              
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                1. LINE Developers管理画面で、以下の <strong>Webhook URL</strong> をコピーして設定してください：
              </p>
              
              <div className="row" style={{ gap: 8, margin: '8px 0' }}>
                <input className="form-input" style={{ flex: 1, fontSize: 11, background: '#111520', border: '1px solid #1e293b' }} value={webhookUrl} readOnly />
                <button className="btn btn-ghost" onClick={handleCopyWebhook} style={{ padding: '0 10px', height: 38 }}>
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                </button>
              </div>

              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                2. LINE Developers側で <strong>「Webhookの利用 (Use Webhook)」をオン</strong> にします。<br />
                3. LINE Botと友だちになり、トークルームで「<strong>ID</strong>」と送ります。<br />
                4. 送られてきた長い文字列をコピーし、上の「<strong>あなたの LINE ユーザーID</strong>」に入力して保存します。<br />
                5. 以降、LINEで「<strong>判定</strong>」と送ると、最新の買い時銘柄リストが自動で届くようになります！
              </p>
            </div>
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
            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              ※Finnhubのキーを設定しておくと、Yahoo Finance APIが一時的に停止・遅延した場合でも、米国株の現在値は自動的に公式API（Finnhub）から正確に補完されます。
            </p>
          </div>
        </div>

        {/* Googleログイン有効化ガイド */}
        <div className="section">
          <p className="section-title">
            <Database size={11} style={{ display: 'inline', marginRight: 6 }} />
            アカウント機能（Googleログイン）有効化ガイド
          </p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              他のスマホやパソコンと同じデータで同期して見たい場合は、SupabaseとGoogleを接続することでGoogleアカウントログインが利用可能になります。一般の方でも以下の手順で行えます。
            </p>

            <div style={{ padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <ol style={{ paddingLeft: 16, margin: 0 }}>
                <li><strong>Google Cloud Console</strong>（無料）を開き、プロジェクトを作成します。</li>
                <li>「OAuth 同意画面」を設定し、「認証情報」から「OAuth 2.0 クライアント ID」を作成します。</li>
                <li>「承認済みのリダイレクト URI」に、以下のURLを設定します：
                  <div style={{ background: '#111520', padding: '4px 8px', borderRadius: 4, fontFamily: 'monospace', fontSize: 10, margin: '4px 0', wordBreak: 'break-all' }}>
                    https://avqoidkrntrxolvspoqh.supabase.co/auth/v1/callback
                  </div>
                </li>
                <li>発行された <strong>クライアントID</strong> と <strong>クライアントシークレット</strong> をコピーします。</li>
                <li><strong>Supabase Dashboard</strong> にログインし、[Auth] ➔ [Providers] ➔ [Google] を開きます。</li>
                <li>Googleプロバイダーをオンにして、クライアントIDとクライアントシークレットを入力して保存します。これでGoogleログインが使えるようになります。</li>
              </ol>
            </div>
          </div>
        </div>

        {/* データ管理 */}
        <div className="section">
          <p className="section-title">データ管理</p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-ghost btn-full" onClick={handleExportCSV} style={{ justifyContent: 'flex-start', gap: 10 }}>
              <ChevronRight size={16} />
              ポートフォリオをCSVでエクスポート
            </button>
          </div>
        </div>

        {/* バージョン情報 */}
        <div style={{ textAlign: 'center', padding: '24px 0 8px', color: 'var(--text-muted)', fontSize: 12 }}>
          買い増し判定アプリ v1.1.0<br />
          <span style={{ fontSize: 11 }}>アカウント同期モード稼働中 • クラウドに安全に保存されています</span>
        </div>
      </div>
    </>
  );
}
