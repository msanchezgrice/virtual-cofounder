import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Virtual Cofounder - A team that ships while you sleep';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #fefdfb 0%, #fff0e6 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Background pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 20% 80%, rgba(232, 93, 4, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(232, 93, 4, 0.08) 0%, transparent 50%)',
          }}
        />
        
        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px',
            position: 'relative',
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '40px',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                background: 'linear-gradient(135deg, #e85d04 0%, #ff8a4c 100%)',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
              }}
            >
              🚀
            </div>
            <span
              style={{
                fontSize: '40px',
                fontWeight: 600,
                color: '#1d1c1a',
              }}
            >
              Virtual Cofounder
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontSize: '72px',
              fontWeight: 500,
              color: '#1d1c1a',
              textAlign: 'center',
              margin: 0,
              lineHeight: 1.1,
              maxWidth: '900px',
            }}
          >
            A team that <span style={{ fontStyle: 'italic', color: '#e85d04' }}>ships</span> while you sleep
          </h1>

          {/* Subheadline */}
          <p
            style={{
              fontSize: '28px',
              color: '#5c5a56',
              textAlign: 'center',
              marginTop: '24px',
              maxWidth: '700px',
            }}
          >
            The cofounder who handles the work you&apos;ve been putting off, overnight.
          </p>

          {/* URL */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '48px',
              padding: '12px 24px',
              background: 'rgba(232, 93, 4, 0.1)',
              borderRadius: '100px',
            }}
          >
            <span
              style={{
                fontSize: '20px',
                color: '#e85d04',
                fontWeight: 500,
              }}
            >
              virtualcofounder.ai
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
