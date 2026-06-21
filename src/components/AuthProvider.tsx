'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setUserId, syncFromSupabase } from '@/lib/db';
import LoginScreen from './LoginScreen';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 現在のセッションを取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setUserId(session.user.id);
        // バックグラウンドで同期を実行
        syncFromSupabase().catch(console.error);
      } else {
        setUser(null);
        setUserId('default_user');
      }
      setLoading(false);
    }).catch((err) => {
      console.error('Supabase getSession error:', err);
      setUser(null);
      setUserId('default_user');
      setLoading(false);
    });

    // 認証状態の変化を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        setUserId(session.user.id);
        await syncFromSupabase();
      } else {
        setUser(null);
        setUserId('default_user');
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setUserId('default_user');
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {/* ログインしていない場合はログイン画面をオーバーレイ表示 */}
      {!loading && !user && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-primary)', overflowY: 'auto' }}>
          <LoginScreen />
        </div>
      )}

      {/* ローディング中はスプラッシュ画面をオーバーレイ表示 */}
      {loading && (
        <div className="loading-screen" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--bg-primary)' }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>読み込み中...</p>
        </div>
      )}

      {/* 
        Next.jsのApp Routerでは、Layoutコンポーネント内でchildrenを必ずレンダリングする必要があります。
        そのため、childrenを破棄せず、CSSで隠すか、そのままレンダリングしてオーバーレイで覆う形をとります。
      */}
      <div style={{ display: (!loading && user) ? 'block' : 'none' }}>
        {children}
      </div>
    </AuthContext.Provider>
  );
}
