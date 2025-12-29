import { Link, useLocation } from 'react-router-dom';
import Icon from './Icon';

export default function ChildTabNav() {
  const location = useLocation();

  const tabs = [
    { path: '/child/today', label: 'Dashboard', iconName: 'home' },
    { path: '/child/upload', label: 'Upload', iconName: 'camera' },
    { path: '/child/character', label: 'Character', iconName: 'star' },
    { path: '/child/rewards', label: 'Rewards', iconName: 'gift' },
    { path: '/child/profile', label: 'Settings', iconName: 'profile' },
  ];

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex justify-around items-center h-16">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive
                  ? 'text-[#5CE1C6]'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="mb-1">
                  <Icon name={tab.iconName} size={20} className="md:w-6 md:h-6" active={isActive} />
              </div>
              <span className="text-[10px] md:text-xs font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
