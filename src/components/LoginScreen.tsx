'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Wallet, LogIn, Mail, Lock, Shield, ArrowRight, UserPlus, Info } from 'lucide-react';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Googleログインの呼び出しに失敗しました。');
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください。');
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        
        // Supabase の設定によってはメール確認なしで即座にログインされる場合と、メール確認待ちになる場合があります。
        if (data.session) {
          setMessage('アカウント登録が完了し、ログインしました。');
        } else {
          setMessage('仮登録メールを送信しました。メールに記載されたリンクをクリックして本登録を完了してください。');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      // エラーメッセージの日本語化（一般的なもののみ）
      let errMsg = err.message || '認証エラーが発生しました。';
      if (errMsg.includes('Invalid login credentials')) {
        errMsg = 'メールアドレスまたはパスワードが正しくありません。';
      } else if (errMsg.includes('User already registered')) {
        errMsg = 'このメールアドレスは既に登録されています。';
      } else if (errMsg.includes('Password should be at least 6 characters')) {
        errMsg = 'パスワードは6文字以上で入力してください。';
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at top left, #1e1b4b 0%, #09090b 80%)',
      padding: 20,
      color: 'white',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 24,
        padding: '32px 24px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        textAlign: 'center',
      }}>
        {/* ロゴ・アプリ名 */}
        <div style={{ display: 'inline-flex', padding: 12, borderRadius: '30%', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', marginBottom: 16 }}>
          <Wallet size={28} />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8, background: 'linear-gradient(to right, #a5b4fc, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          買い増し判定アプリ
        </h1>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 28 }}>
          デバイス間でポートフォリオを同期し、最適な投資タイミングを自動判定します。
        </p>

        {/* エラー・成功メッセージ */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#fca5a5',
            fontSize: 12,
            padding: '10px 14px',
            borderRadius: 12,
            textAlign: 'left',
            marginBottom: 20,
            lineHeight: 1.5,
          }}>
            ⚠️ {error}
          </div>
        )}
        {message && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            color: '#6ee7b7',
            fontSize: 12,
            padding: '10px 14px',
            borderRadius: 12,
            textAlign: 'left',
            marginBottom: 20,
            lineHeight: 1.5,
          }}>
            ✉️ {message}
          </div>
        )}

        {/* 1. Google ログイン (優先ルート) */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            height: 48,
            borderRadius: 14,
            border: '1px solid rgba(255, 255, 255, 0.15)',
            background: 'white',
            color: '#1e293b',
            fontWeight: 600,
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.transform = 'none'; }}
        >
          {/* GoogleのロゴをインラインSVGで表現 */}
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69c-.29 1.5-.1.8-2.46 2.37v2.53h3.97c2.32-2.13 3.65-5.26 3.65-8.75z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.97-2.53c-1.1.74-2.52 1.18-3.96 1.18-3.05 0-5.63-2.06-6.55-4.83H1.36v2.6C3.34 21.46 7.37 24 12 24z"/>
            <path fill="#FBBC05" d="M5.45 14.91c-.24-.72-.38-1.5-.38-2.31s.14-1.59.38-2.31V7.7H1.36C.49 9.42 0 11.36 0 13.41c0 2.05.49 3.99 1.36 5.71l4.09-3.21z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.94 1.19 15.22 0 12 0 7.37 0 3.34 2.54 1.36 6.1l4.09 3.21c.92-2.77 3.5-4.56 6.55-4.56z"/>
          </svg>
          Google アカウントでサインイン
        </button>

        {/* 区切り線 */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0', color: '#475569', fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
          <span style={{ padding: '0 12px', fontWeight: 500, letterSpacing: '0.05em' }}>またはメールでサインイン</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255, 255, 255, 0.08)' }} />
        </div>

        {/* 2. メールアドレスログイン (予備ルート) */}
        <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4, paddingLeft: 4 }}>
              メールアドレス
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="#64748b" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  paddingLeft: 42,
                  paddingRight: 14,
                  color: 'white',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4, paddingLeft: 4 }}>
              パスワード
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="password"
                placeholder="6文字以上のパスワード"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  paddingLeft: 42,
                  paddingRight: 14,
                  color: 'white',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              color: 'white',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 10,
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
          >
            {loading ? (
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            ) : isSignUp ? (
              <>
                <UserPlus size={16} />
                新規アカウント登録
              </>
            ) : (
              <>
                <LogIn size={16} />
                ログイン
              </>
            )}
          </button>
        </form>

        {/* ログイン・新規登録のモード切り替え */}
        <div style={{ marginTop: 24, fontSize: 13, color: '#94a3b8' }}>
          {isSignUp ? (
            <>
              すでにアカウントをお持ちですか？{' '}
              <button
                onClick={() => { setIsSignUp(false); setError(null); setMessage(null); }}
                style={{ background: 'none', border: 'none', color: '#a5b4fc', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                ログインする
              </button>
            </>
          ) : (
            <>
              初めてご利用ですか？{' '}
              <button
                onClick={() => { setIsSignUp(true); setError(null); setMessage(null); }}
                style={{ background: 'none', border: 'none', color: '#a5b4fc', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                新規アカウント登録
              </button>
            </>
          )}
        </div>

        {/* 設定に関する注意書き（一般ユーザー向け） */}
        <div style={{
          marginTop: 28,
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          borderRadius: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          textAlign: 'left',
          fontSize: 10.5,
          color: '#64748b',
          lineHeight: 1.5
        }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Googleログインが反応しない場合は、管理者がSupabaseの設定を有効化していない可能性があります。その場合は上のメール登録からアカウントを作成してご利用いただけます。
          </span>
        </div>
      </div>
    </div>
  );
}
