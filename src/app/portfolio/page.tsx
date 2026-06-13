'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Upload, Trash2, Edit3, Check, X, FileText, ChevronDown, RefreshCw } from 'lucide-react';
import { getStocks, saveStock, deleteStock, upsertStockFromCSV } from '@/lib/db';
import { fetchAllPrices } from '@/lib/stockApi';
import { Stock, PriceData } from '@/lib/types';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };

export default function PortfolioPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [csvDragging, setCsvDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ symbol: '', name: '', avg_price: '', shares: '', memo: '' });

  const loadData = useCallback(async () => {
    const storedStocks = getStocks();
    setStocks(storedStocks);

    if (storedStocks.length > 0) {
      setLoadingPrices(true);
      try {
        const symbols = storedStocks.map(s => s.symbol);
        const priceData = await fetchAllPrices(symbols);
        setPrices(priceData);
      } catch (error) {
        console.error("Failed to fetch prices:", error);
      } finally {
        setLoadingPrices(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const handleAdd = () => {
    if (!form.symbol || !form.name || !form.avg_price || !form.shares) {
      showToast('すべての項目を入力してください', 'error'); return;
    }
    const avgPrice = parseFloat(form.avg_price);
    const shares = parseFloat(form.shares);
    if (isNaN(avgPrice) || isNaN(shares) || avgPrice <= 0 || shares <= 0) {
      showToast('単価・株数は正の数値を入力してください', 'error'); return;
    }
    upsertStockFromCSV(form.symbol.trim(), form.name.trim(), shares, avgPrice, undefined, form.memo.trim());
    loadData();
    setForm({ symbol: '', name: '', avg_price: '', shares: '', memo: '' });
    setShowAddForm(false);
    showToast(`${form.name} を登録しました`, 'success');
  };

  const handleDelete = (symbol: string, name: string) => {
    if (!confirm(`${name} を削除しますか？`)) return;
    deleteStock(symbol);
    loadData();
    showToast(`${name} を削除しました`, 'info');
  };

  const handleToggleTarget = (stock: Stock) => {
    const updated = { ...stock, is_target: !stock.is_target };
    saveStock(updated);
    loadData();
  };

  // ==================== CSVパーサー（楽天証券実CSVフォーマット対応） ====================

  /**
   * ダブルクォーテーション囲みのカンマ入りセルを正しく分割する
   * 例: 7956,ピジョン,"1,800","100" → ['7956','ピジョン','1,800','100']
   */
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"'; // エスケープされたダブルクォーテーション
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  /**
   * カンマ入り数値文字列を数値に変換する
   * 例: "1,800" → 1800, "100" → 100, "1800.50" → 1800.5
   */
  const parseNumber = (str: string): number => {
    const cleaned = str.replace(/,/g, '').replace(/"/g, '').trim();
    return parseFloat(cleaned);
  };

  /**
   * CSVファイルを読み込む（Shift_JIS → UTF-8 の自動判定付き）
   */
  const handleCSVFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast('CSVファイルを選択してください', 'error'); return;
    }

    // まず Shift_JIS で読む（楽天証券のCSVはShift_JISが多い）
    const readerSJIS = new FileReader();
    readerSJIS.onload = (e) => {
      const text = e.target?.result as string;
      // 文字化けチェック：日本語が読めているか確認
      // 特殊記号などによる軽微な文字化け（）が含まれていてもUTF-8で誤読しないよう、の割合が全体の1%未満なら正常と見なす
      const replacementCharCount = (text?.match(/\uFFFD/g) || []).length;
      const replacementRatio = replacementCharCount / ((text?.length || 1));
      
      if (text && replacementRatio < 0.01) {
        parseAndImportCSV(text);
      } else {
        // Shift_JISで文字化けしたらUTF-8で再読み込み
        const readerUTF8 = new FileReader();
        readerUTF8.onload = (e2) => {
          const text2 = e2.target?.result as string;
          parseAndImportCSV(text2);
        };
        readerUTF8.readAsText(file, 'UTF-8');
      }
    };
    readerSJIS.readAsText(file, 'Shift_JIS');
  };

  /**
   * 楽天証券・SBI証券のヘッダー行から列の位置を自動認識する
   */
  const findColumnIndexes = (headerCols: string[]): {
    symbolIdx: number; nameIdx: number; sharesIdx: number; priceIdx: number;
  } | null => {
    // 列名のパターン（各証券会社のCSVで使われる様々な表記に対応）
    const symbolPatterns = ['銘柄コード', 'コード', 'ティッカー', 'symbol', 'code'];
    const namePatterns = ['銘柄名', '銘柄', '名称', 'name', '銘柄名称'];
    const sharesPatterns = ['保有数量', '数量', '株数', '保有株数', 'quantity', 'shares'];
    const pricePatterns = ['取得単価', '取得価格', '平均取得単価', '平均取得価額', '取得価額', '買付単価', 'price', '単価'];

    const find = (patterns: string[]) =>
      headerCols.findIndex(col =>
        patterns.some(p => col.toLowerCase().includes(p.toLowerCase()))
      );

    const symbolIdx = find(symbolPatterns);
    
    // 銘柄名は、銘柄コードとして選ばれた列以外の列から探す（「銘柄コード」が「銘柄」パターンに部分一致して重複するのを防ぐため）
    const nameIdx = headerCols.findIndex((col, idx) =>
      idx !== symbolIdx &&
      namePatterns.some(p => col.toLowerCase().includes(p.toLowerCase()))
    );

    const sharesIdx = find(sharesPatterns);
    const priceIdx = find(pricePatterns);

    if (symbolIdx >= 0 && nameIdx >= 0 && sharesIdx >= 0 && priceIdx >= 0) {
      return { symbolIdx, nameIdx, sharesIdx, priceIdx };
    }
    return null;
  };

  /**
   * CSVテキストを解析して銘柄を取り込む
   * SBI証券の「■特定口座」といった口座区分にも対応
   */
  const parseAndImportCSV = (text: string) => {
    // BOM（先頭の制御文字）を除去
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).filter(l => l.trim());

    if (lines.length === 0) {
      showToast('CSVファイルが空です', 'error'); return;
    }

    let imported = 0;
    let skipped = 0;
    let currentAccountType = '未分類';
    let colIndexes: { symbolIdx: number; nameIdx: number; sharesIdx: number; priceIdx: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 口座区分のヘッダー行かチェック（SBI証券フォーマット対応）
      if (line.startsWith('■')) {
        const title = line.replace('■', '').split(',')[0].trim();
        // 評価額などの集計行は無視し、「口座」や「NISA」が含まれるものを口座区分とする
        if (title.includes('口座') || title.includes('NISA')) {
          currentAccountType = title;
          colIndexes = null; // 口座が変わるたびにヘッダー行を探し直す
        }
        continue;
      }

      const cols = parseCSVLine(line);

      // まだこのセクションでの列位置が不明な場合、ヘッダー行かチェックする
      if (!colIndexes) {
        const found = findColumnIndexes(cols);
        if (found) {
          colIndexes = found;
          continue; // ヘッダー行自身はデータとして読まない
        }
        // ヘッダーが見つからない、かつ行にデータがある場合は、ヘッダー無しCSVとして最初の行で列を決める
        if (cols.length >= 4 && i === 0 && !line.startsWith('■')) {
           colIndexes = { symbolIdx: 0, nameIdx: 1, sharesIdx: 2, priceIdx: 3 };
        } else {
           continue; // 単なる空行や集計行なら無視
        }
      }

      // 列位置が判明している場合はデータとして読み取る
      const maxIdx = Math.max(colIndexes.symbolIdx, colIndexes.nameIdx, colIndexes.sharesIdx, colIndexes.priceIdx);
      if (cols.length <= maxIdx) { skipped++; continue; }

      const symbol = cols[colIndexes.symbolIdx].replace(/"/g, '').trim();
      const name = cols[colIndexes.nameIdx].replace(/"/g, '').trim();
      const shares = parseNumber(cols[colIndexes.sharesIdx]);
      const avgPrice = parseNumber(cols[colIndexes.priceIdx]);

      // 銘柄コードが4〜5桁の数字かチェック（日本株）
      if (!/^\d{4,5}$/.test(symbol)) { skipped++; continue; }
      if (isNaN(shares) || isNaN(avgPrice) || shares <= 0 || avgPrice <= 0) { skipped++; continue; }
      if (!name) { skipped++; continue; }

      upsertStockFromCSV(symbol, name, shares, avgPrice, currentAccountType);
      imported++;
    }

    loadData();
    if (imported > 0) {
      showToast(`✅ ${imported}件の銘柄を取り込みました${skipped > 0 ? `（${skipped}件スキップ）` : ''}`, 'success');
    } else {
      showToast(`取り込める銘柄が見つかりませんでした（${skipped}件スキップ）。CSVの形式を確認してください。`, 'error');
    }
  };

  // 合計の計算
  const totalInvestment = stocks.reduce((sum, s) => sum + s.avg_price * s.shares, 0);
  const totalValue = stocks.reduce((sum, s) => {
    const p = prices[s.symbol]?.price ?? s.avg_price;
    return sum + p * s.shares;
  }, 0);
  const totalProfitLoss = totalValue - totalInvestment;
  const totalProfitLossPct = totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0;

  return (
    <>
      <header className="page-header">
        <div className="row" style={{ gap: 8 }}>
          <h1>📋 ポートフォリオ</h1>
          {loadingPrices && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            className="btn-icon"
            onClick={loadData}
            disabled={loadingPrices}
            aria-label="データを更新"
            style={{ width: 32, height: 32 }}
          >
            <RefreshCw size={14} style={{ animation: loadingPrices ? 'spin 0.7s linear infinite' : 'none' }} />
          </button>
          <button
            className="btn-icon"
            onClick={() => setShowAddForm(true)}
            aria-label="銘柄を追加"
            style={{ width: 32, height: 32 }}
          >
            <Plus size={16} />
          </button>
        </div>
      </header>

      {/* トースト通知 */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>

      <div className="page-content fade-in">
        {/* ポートフォリオ合計サマリー */}
        {stocks.length > 0 && (
          <div className="section" style={{ marginTop: 12 }}>
            <div className="card card-glass" style={{
              background: 'linear-gradient(135deg, rgba(30,41,59,0.4) 0%, rgba(15,23,42,0.7) 100%)',
              borderColor: 'var(--border-subtle)',
              padding: '18px 20px',
            }}>
              <p className="label" style={{ marginBottom: 4, color: 'var(--text-secondary)' }}>総資産評価額</p>
              <div className="row-between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 30, fontWeight: 800, fontFamily: 'Outfit', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  ¥{Math.round(totalValue).toLocaleString()}
                </span>
                <span className={totalProfitLoss >= 0 ? 'rate-up' : 'rate-down'} style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Outfit' }}>
                  {totalProfitLoss >= 0 ? '+' : '-'}¥{Math.abs(Math.round(totalProfitLoss)).toLocaleString()} ({totalProfitLoss >= 0 ? '+' : ''}{totalProfitLossPct.toFixed(2)}%)
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <span className="label" style={{ fontSize: 10 }}>投資元本（取得価額）</span>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Outfit', marginTop: 2, color: 'var(--text-secondary)' }}>
                    ¥{Math.round(totalInvestment).toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="label" style={{ fontSize: 10 }}>銘柄数</span>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Outfit', marginTop: 2, color: 'var(--text-secondary)' }}>
                    {stocks.length} 銘柄
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* CSVインポートエリア */}
        <div className="section">
          <p className="section-title">楽天証券CSVインポート</p>
          <div
            className="card"
            style={{
              border: `2px dashed ${csvDragging ? 'var(--accent-primary)' : 'var(--border-normal)'}`,
              background: csvDragging ? 'rgba(99,102,241,0.06)' : 'var(--bg-card)',
              cursor: 'pointer', textAlign: 'center', padding: '24px 16px',
              transition: 'var(--transition)',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setCsvDragging(true); }}
            onDragLeave={() => setCsvDragging(false)}
            onDrop={e => {
              e.preventDefault(); setCsvDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleCSVFile(file);
            }}
          >
            <Upload size={28} color={csvDragging ? 'var(--accent-primary)' : 'var(--text-muted)'} style={{ margin: '0 auto 10px' }} />
            <p style={{ fontWeight: 600, fontSize: 14, color: csvDragging ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
              CSVファイルをドロップ
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              または タップして選択
            </p>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVFile(f); e.target.value = ''; }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, padding: '0 4px', lineHeight: 1.8 }}>
            <FileText size={11} style={{ display: 'inline', marginRight: 4 }} />
            楽天証券・SBI証券の保有商品一覧CSVに対応<br />
            ※ ヘッダー行や口座区分（「■特定口座」「■NISA」等）を自動認識します。<br />
            ※ 重複する銘柄は株数を合算して平均単価を再計算します
          </div>
        </div>

        {/* 手動追加フォーム */}
        {showAddForm && (
          <div className="section">
            <div className="card" style={{ borderColor: 'var(--border-accent)' }}>
              <div className="row-between" style={{ marginBottom: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 14 }}>銘柄を手動で追加</p>
                <button className="btn-icon" onClick={() => setShowAddForm(false)} style={{ width: 28, height: 28 }}>
                  <X size={15} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">銘柄コード</label>
                    <input className="form-input" placeholder="例: 7956" value={form.symbol}
                      onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">銘柄名</label>
                    <input className="form-input" placeholder="例: ピジョン" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">平均取得単価（円）</label>
                    <input className="form-input" type="number" placeholder="例: 1800" value={form.avg_price}
                      onChange={e => setForm(f => ({ ...f, avg_price: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">保有株数</label>
                    <input className="form-input" type="number" placeholder="例: 100" value={form.shares}
                      onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">メモ（任意）</label>
                  <input className="form-input" placeholder="例: 配当目的、優待狙い、〇〇円以下で買い増しなど" value={form.memo}
                    onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
                </div>
                <button className="btn btn-primary btn-full" onClick={handleAdd} style={{ marginTop: 4 }}>
                  <Check size={16} /> 登録する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 銘柄一覧 */}
        <div className="section">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <p className="section-title" style={{ margin: 0 }}>保有銘柄 ({stocks.length})</p>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              買い増し対象: {stocks.filter(s => s.is_target).length}銘柄
            </span>
          </div>
          {stocks.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 16px' }}>
              <div className="empty-state-icon"><Plus size={24} /></div>
              <h3>銘柄がありません</h3>
              <p>右上の「＋」ボタンまたはCSVで追加してください</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stocks.map(stock => (
                <StockListItem
                  key={stock.symbol}
                  stock={stock}
                  price={prices[stock.symbol]}
                  onDelete={() => handleDelete(stock.symbol, stock.name)}
                  onToggleTarget={() => handleToggleTarget(stock)}
                  onEdit={() => setEditingId(editingId === stock.id ? null : stock.id)}
                  isEditing={editingId === stock.id}
                  onSave={(updated) => {
                    saveStock(updated);
                    loadData();
                    setEditingId(null);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ==================== 銘柄リストアイテム ====================
function StockListItem({
  stock, onDelete, onToggleTarget, onEdit, isEditing, onSave, price
}: {
  stock: Stock;
  onDelete: () => void;
  onToggleTarget: () => void;
  onEdit: () => void;
  isEditing: boolean;
  onSave: (s: Stock) => void;
  price?: PriceData;
}) {
  const [editAvg, setEditAvg] = useState(String(stock.avg_price));
  const [editShares, setEditShares] = useState(String(stock.shares));
  const [editMemo, setEditMemo] = useState(stock.memo || '');

  // 編集モード切り替え時にステートを同期
  useEffect(() => {
    setEditAvg(String(stock.avg_price));
    setEditShares(String(stock.shares));
    setEditMemo(stock.memo || '');
  }, [stock, isEditing]);

  const handleSave = () => {
    const avg = parseFloat(editAvg);
    const sh = parseFloat(editShares);
    if (!isNaN(avg) && !isNaN(sh) && avg > 0 && sh > 0) {
      onSave({ ...stock, avg_price: avg, shares: sh, memo: editMemo.trim() });
    }
  };

  return (
    <div className="card pressable" style={{ borderColor: stock.is_target ? 'rgba(99,102,241,0.2)' : 'var(--border-subtle)' }}>
      <div className="row-between">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{stock.name}</span>
            {stock.account_type && stock.account_type !== '未分類' && (
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                {stock.account_type}
              </span>
            )}
            {stock.is_target && (
              <span style={{ fontSize: 10, color: 'var(--accent-primary)', background: 'rgba(99,102,241,0.12)', padding: '2px 6px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                対象
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{stock.symbol}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn-icon" onClick={onEdit} style={{ width: 32, height: 32 }} aria-label="編集">
            <Edit3 size={14} />
          </button>
          <button className="btn-icon" onClick={onDelete} style={{ width: 32, height: 32, color: 'var(--color-no)' }} aria-label="削除">
            <Trash2 size={14} />
          </button>
          <ChevronDown size={14} color="var(--text-muted)" style={{ transform: isEditing ? 'rotate(180deg)' : 'none', transition: 'var(--transition)' }} />
        </div>
      </div>

      {/* 通常時：メモがあれば表示する */}
      {!isEditing && stock.memo && (
        <div style={{
          marginTop: 6, padding: '4px 8px',
          background: 'rgba(255,255,255,0.02)',
          borderLeft: '2px solid var(--accent-primary)',
          fontSize: 11, color: 'var(--text-secondary)',
          borderRadius: '2px',
        }}>
          💡 {stock.memo}
        </div>
      )}

      {isEditing ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">平均単価（円）</label>
              <input className="form-input" type="number" value={editAvg} onChange={e => setEditAvg(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">保有株数</label>
              <input className="form-input" type="number" value={editShares} onChange={e => setEditShares(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">メモ</label>
            <input className="form-input" placeholder="例: 配当目的、優待狙いなど" value={editMemo} onChange={e => setEditMemo(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} style={{ flex: 1 }}>
              <Check size={13} /> 保存
            </button>
            <button className={`btn btn-sm ${stock.is_target ? 'btn-ghost' : 'btn-primary'}`} onClick={onToggleTarget} style={{ flex: 1 }}>
              {stock.is_target ? '対象から外す' : '買い増し対象にする'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          marginTop: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          paddingTop: 8,
          borderTop: '1px solid rgba(255,255,255,0.03)'
        }}>
          <div className="col">
            <span className="label">平均単価</span>
            <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'Outfit' }}>¥{stock.avg_price.toLocaleString()}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stock.shares.toLocaleString()}株</span>
          </div>
          <div className="col">
            <span className="label">現在値</span>
            <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'Outfit', color: price ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {price ? `¥${price.price.toLocaleString()}` : '---'}
            </span>
          </div>
          <div className="col">
            <span className="label">現在評価額</span>
            <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'Outfit', color: price ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {price ? `¥${Math.round(price.price * stock.shares).toLocaleString()}` : '---'}
            </span>
          </div>
          <div className="col">
            <span className="label">損益</span>
            {price ? (
              (() => {
                const profitLoss = (price.price - stock.avg_price) * stock.shares;
                const profitLossPct = stock.avg_price > 0 ? ((price.price - stock.avg_price) / stock.avg_price) * 100 : 0;
                const isProfit = profitLoss >= 0;
                return (
                  <>
                    <span className={isProfit ? 'rate-up' : 'rate-down'} style={{ fontWeight: 700, fontSize: 13, fontFamily: 'Outfit' }}>
                      {isProfit ? '+' : ''}{profitLossPct.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 10, color: isProfit ? 'var(--color-buy)' : 'var(--color-no)' }}>
                      {isProfit ? '+' : ''}¥{Math.round(profitLoss).toLocaleString()}
                    </span>
                  </>
                );
              })()
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>---</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
