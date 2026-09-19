import { ImageResponse } from 'next/og';

// The home-screen icon for phones: the logo mark, drawn large.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const grid = 'rgba(255,255,255,0.16)';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0f1f1a' }}>
        <div style={{ position: 'absolute', left: 62, top: 0, width: 7, height: 180, background: grid }} />
        <div style={{ position: 'absolute', left: 118, top: 0, width: 7, height: 180, background: grid }} />
        <div style={{ position: 'absolute', top: 62, left: 0, height: 7, width: 180, background: grid }} />
        <div style={{ position: 'absolute', top: 118, left: 0, height: 7, width: 180, background: grid }} />
        <div style={{ position: 'absolute', left: 95, top: 38, width: 48, height: 48, borderRadius: 24, background: '#7fd1a6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: '#0f1f1a' }} />
        </div>
      </div>
    ),
    size,
  );
}
