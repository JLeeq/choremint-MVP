// 아이콘 컴포넌트 - SVG 이미지 로드 및 표시
import { useState, useEffect } from 'react';

interface IconProps {
  name: string;
  className?: string;
  size?: number;
  active?: boolean; // 활성 상태 (민트색 #5CE1C6)
  color?: string; // 색상 오버라이드
}

export default function Icon({ name, className = '', size = 24, active = false, color }: IconProps) {
  // 템플릿 아이콘 목록 (chores 폴더에서 가져옴)
  const choreIcons = ['bed', 'dog', 'broom', 'trash-can', 'dining', 'plant', 'shoe'];
  const isChoreIcon = choreIcons.includes(name);
  
  // 아이콘 이미지 경로 (템플릿 아이콘은 chores 폴더에서, 나머지는 루트에서)
  const iconPathSvg = isChoreIcon 
    ? `/icons/chores/${name}.svg`
    : `/icons/${name}.svg`;
  const [svgContent, setSvgContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

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
  // color prop이 있으면 우선 사용, 없으면 기본 로직 사용
  // star 아이콘은 항상 노란색, 나머지는 active 상태에 따라 변경
  // active일 때는 노란색 (#FCD34D = yellow-400), 비활성: 회색
  const fillColor = color || (name === 'star' 
    ? '#FFD700' // 노란색 (Gold)
    : (active ? '#FCD34D' : '#808080')); // 활성: 노란색 (yellow-400), 비활성: 회색

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
        <div className="w-full h-full bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  if (!svgContent) {
    // SVG 로드 실패 시 빈 div 반환
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
        <div className="w-full h-full bg-gray-200 rounded"></div>
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

