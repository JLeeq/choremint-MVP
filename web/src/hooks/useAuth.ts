import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

// 부모 인증 훅
export function useParentAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // 초기 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) {
        navigate('/');
      }
    });

    // 인증 상태 변경 감지
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate('/');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  return { session, loading };
}

// 자녀 인증 훅
export function useChildAuth() {
  const [childSession, setChildSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const session = localStorage.getItem('child_session');
    if (session) {
      try {
        const parsed = JSON.parse(session);
        // 세션 만료 체크 (30일)
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        if (parsed.loggedInAt && parsed.loggedInAt > thirtyDaysAgo) {
          setChildSession(parsed);
          setLoading(false);
        } else {
          localStorage.removeItem('child_session');
          navigate('/');
        }
      } catch (e) {
        localStorage.removeItem('child_session');
        navigate('/child-login');
      }
    } else {
      navigate('/child-login');
    }
    setLoading(false);
  }, [navigate]);

  return { childSession, loading };
}

