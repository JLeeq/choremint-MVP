// 아이콘 컴포넌트 - SVG 이미지로 이모지 대체
import { useState, useEffect } from 'react';

interface IconProps {
  name: string;
  className?: string;
  size?: number;
  active?: boolean; // 활성 상태 (민트색 #5CE1C6)
}

export default function Icon({ name, className = '', size = 24, active = false }: IconProps) {
  // 아이콘 이미지 경로 (SVG 우선)
  const iconPathSvg = `/icons/${name}.svg`;
  const [svgContent, setSvgContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  const emojiMap: Record<string, string> = {
    'home': '🏠',
    'chore': '🧹',
    'check': '✅',
    'gift': '🎁',
    'profile': '👤',
    'checklist': '📋',
    'camera': '📸',
    'star': '⭐',
    'wave': '👋',
    'celebration': '🎉',
    'trash': '🗑️',
    'bed': '🛏️',
    'dog': '🐕',
    'broom': '🧹',
    'trash-can': '🗑️',
    'dining': '🍽️',
    'plant': '🌱',
    'shoe': '👟',
    'template': '📋',
    'warning': '⚠️',
  };

  // SVG 파일 로드
  useEffect(() => {
    fetch(iconPathSvg)
      .then(res => res.text())
      .then(text => {
        setSvgContent(text);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [iconPathSvg]);

  // 색상 설정
  // star 아이콘은 항상 노란색, 나머지는 active 상태에 따라 변경
  const fillColor = name === 'star' 
    ? '#FFD700' // 노란색 (Gold)
    : (active ? '#5CE1C6' : '#808080'); // 활성: 민트색, 비활성: 회색

  // SVG 내용에서 fill 속성을 동적으로 변경
  // 모든 fill 속성을 제거하고 새로운 색상으로 교체
  const processedSvg = svgContent
    .replace(/fill="[^"]*"/g, '') // 기존 fill 속성 제거
    .replace(/fill='[^']*'/g, '') // 작은따옴표도 제거
    .replace(/<svg/, `<svg style="width: 100%; height: 100%;"`) // 스타일 추가
    .replace(/<path/g, `<path fill="${fillColor}"`) // path에 fill 추가
    .replace(/<circle/g, `<circle fill="${fillColor}"`) // circle에 fill 추가
    .replace(/<rect/g, `<rect fill="${fillColor}"`) // rect에 fill 추가
    .replace(/<polygon/g, `<polygon fill="${fillColor}"`) // polygon에 fill 추가
    .replace(/<polyline/g, `<polyline fill="${fillColor}"`); // polyline에 fill 추가

  if (loading) {
    return (
      <div 
        className={className}
        style={{ 
          width: size, 
          height: size, 
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <span className="text-xl">{emojiMap[name] || '❓'}</span>
      </div>
    );
  }

  if (!svgContent) {
    // SVG 로드 실패 시 이모지 폴백
    return (
      <div 
        className={className}
        style={{ 
          width: size, 
          height: size, 
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <span className="text-xl">{emojiMap[name] || '❓'}</span>
      </div>
    );
  }

  return (
    <div 
      className={className}
      style={{ 
        width: size, 
        height: size, 
        display: 'inline-block',
        transition: 'color 0.2s ease-in-out',
        minWidth: size,
        minHeight: size
      }}
      dangerouslySetInnerHTML={{ 
        __html: processedSvg
      }}
    />
  );
}

// 아이콘 이름 상수 (타입 안전성)
export const IconNames = {
  HOME: 'home',
  CHORE: 'chore',
  CHECK: 'check',
  GIFT: 'gift',
  PROFILE: 'profile',
  CHECKLIST: 'checklist',
  CAMERA: 'camera',
  STAR: 'star',
  WAVE: 'wave',
  CELEBRATION: 'celebration',
  TRASH: 'trash',
  BED: 'bed',
  DOG: 'dog',
  BROOM: 'broom',
  TRASH_CAN: 'trash-can',
  DINING: 'dining',
  PLANT: 'plant',
  SHOE: 'shoe',
  TEMPLATE: 'template',
  WARNING: 'warning',
} as const;

