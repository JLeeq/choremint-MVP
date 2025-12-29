import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { initializePushNotifications } from '../lib/pushNotifications';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function LoginSelect() {
  const [userType, setUserType] = useState<'parent' | 'child'>('parent');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Child login states
  const [familyCode, setFamilyCode] = useState('');
  const [pin, setPin] = useState('');
  
  // PWA install states
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    // Check if parent is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/parent/home');
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigate('/parent/home');
      }
    });

    // Check if child is already logged in
    const childSession = localStorage.getItem('child_session');
    if (childSession) {
      try {
        const session = JSON.parse(childSession);
        if (session.expiresAt && session.expiresAt > Date.now()) {
          if (session.childId && session.nickname && session.familyId) {
            navigate('/child/today');
          }
        } else {
          localStorage.removeItem('child_session');
        }
      } catch (e) {
        localStorage.removeItem('child_session');
      }
    }

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Check if already installed
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                            (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // PWA Install Prompt (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!isStandaloneMode) {
        setShowInstallButton(true);
      }
    };

    if (!isIOSDevice && !isStandaloneMode) {
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    } else if (isIOSDevice && !isStandaloneMode) {
      setShowInstallButton(true);
    }

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      alert(error.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  const handleChildLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!familyCode.trim() || !pin.trim()) {
      setError('Please enter both family code and PIN.');
      return;
    }

    setLoading(true);
    try {
      // Find family by family code
      const { data: familyData, error: familyError } = await supabase
        .from('families')
        .select('id')
        .eq('family_code', familyCode.trim().toUpperCase())
        .single();

      if (familyError || !familyData) {
        throw new Error('Invalid family code.');
      }

      // Find child by PIN within the family
      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('id, nickname, pin, points, family_id')
        .eq('family_id', familyData.id)
        .eq('pin', pin.trim())
        .single();

      if (childError || !childData) {
        throw new Error('Invalid PIN or child not found in this family.');
      }

      // Save child session (30 days)
      const childSession = {
        childId: childData.id,
        nickname: childData.nickname,
        pin: childData.pin,
        points: childData.points,
        familyId: childData.family_id,
        loggedInAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      };

      localStorage.setItem('child_session', JSON.stringify(childSession));
      
      // Initialize push notifications for child
      await initializePushNotifications(childData.id, true);
      
      // Navigate to child dashboard
      navigate('/child/today');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstallButton(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="max-w-md w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Chore<span className="text-[#5CE1C6]">Mint</span>
          </h1>
          <p className="text-gray-600">Earn · Learn · Save</p>
        </div>

        {/* User Type Toggle */}
        <div className="mb-6">
          <div className="flex bg-gray-100 rounded-full p-1">
            <button
              type="button"
              onClick={() => setUserType('parent')}
              className={`flex-1 py-2 px-4 rounded-full font-medium transition-all ${
                userType === 'parent'
                  ? 'bg-white text-[#5CE1C6] shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Parent
            </button>
            <button
              type="button"
              onClick={() => setUserType('child')}
              className={`flex-1 py-2 px-4 rounded-full font-medium transition-all ${
                userType === 'child'
                  ? 'bg-white text-[#5CE1C6] shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Child
            </button>
          </div>
        </div>

        {/* PWA Install Button */}
        {showInstallButton && !isStandalone && (
          <div className="mb-4">
            {isIOS ? (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium mb-2">📱 Add to Home Screen</p>
                <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                  <li>Tap the share button <span className="font-bold">(□↑)</span> at the bottom</li>
                  <li>Select "Add to Home Screen"</li>
                  <li>Tap "Add"</li>
                </ol>
              </div>
            ) : (
              <button
                onClick={handleInstallClick}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-400 to-pink-400 text-white rounded-lg px-6 py-3 font-medium hover:from-orange-500 hover:to-pink-500 transition-colors shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Install App
              </button>
            )}
          </div>
        )}

        {/* Parent Login */}
        {userType === 'parent' && (
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 rounded-xl px-6 py-4 text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? 'Logging in...' : 'Login with Google'}
          </button>
        )}

        {/* Child Login */}
        {userType === 'child' && (
          <form onSubmit={handleChildLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Family Code
              </label>
              <input
                type="text"
                value={familyCode}
                onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
                onFocus={(e) => e.target.placeholder = ''}
                onBlur={(e) => e.target.placeholder = 'Enter family code'}
                placeholder="Enter family code"
                className="w-full px-4 py-3 border-2 border-yellow-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-center text-lg font-semibold"
                style={{ textTransform: familyCode ? 'uppercase' : 'none' }}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                PIN
              </label>
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onFocus={(e) => e.target.placeholder = ''}
                onBlur={(e) => e.target.placeholder = 'Enter PIN'}
                placeholder="Enter PIN"
                className="w-full px-4 py-3 border-2 border-yellow-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-center text-lg font-semibold"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !familyCode.trim() || !pin.trim()}
              className="w-full px-6 py-4 bg-[#5CE1C6] text-white rounded-xl hover:bg-[#4BC9B0] transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            💡 Parents login with Google, children login with PIN
          </p>
        </div>
      </div>
    </div>
  );
}
