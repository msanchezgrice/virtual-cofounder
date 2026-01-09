'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

interface NavItem {
  href: string;
  icon: string;
  label: string;
  badge?: boolean;
}

const navItems: NavItem[] = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/dashboard/queue', icon: '📋', label: 'Queue', badge: true },
  { href: '/priorities', icon: '🎯', label: 'Priorities' },
  { href: '/progress', icon: '🚀', label: 'Progress' },
  { href: '/projects', icon: '📁', label: 'Projects' },
  { href: '/agents', icon: '🤖', label: 'Agents' },
];

const outputItems = [
  { href: '/scans', icon: '🔍', label: 'Scans' },
  { href: '/gallery', icon: '🎨', label: 'Gallery' },
  { href: '/history', icon: '📜', label: 'History' },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname();
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const fetchQueueCount = async () => {
      try {
        const res = await fetch('/api/stories?status=pending&limit=1');
        const data = await res.json();
        setQueueCount(data.pagination?.total || 0);
      } catch (e) {
        console.error('Failed to fetch queue count:', e);
      }
    };
    fetchQueueCount();
    const interval = setInterval(fetchQueueCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    if (href === '/dashboard/queue') return pathname === '/dashboard/queue';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Dark Sidebar */}
      <nav style={{
        width: '260px',
        minWidth: '260px',
        background: '#1C1917',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        overflowY: 'auto',
        zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Link href="/" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textDecoration: 'none',
          }}>
            <span style={{
              width: '36px',
              height: '36px',
              background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}>⚡</span>
            <span style={{
              color: 'white',
              fontWeight: 700,
              fontSize: '16px',
            }}>Virtual Cofounder</span>
          </Link>
        </div>

        {/* Main Navigation */}
        <div style={{ padding: '16px 0', flex: 1 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                color: isActive(item.href) ? '#8B5CF6' : '#D6D3D1',
                textDecoration: 'none',
                fontSize: '14px',
                background: isActive(item.href) ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                borderLeft: isActive(item.href) ? '3px solid #8B5CF6' : '3px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '16px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && queueCount > 0 && (
                <span style={{
                  background: '#8B5CF6',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}>{queueCount}</span>
              )}
            </Link>
          ))}
        </div>

        {/* Outputs Section */}
        <div style={{
          paddingTop: '16px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            padding: '8px 20px',
            fontSize: '11px',
            textTransform: 'uppercase',
            color: '#A8A29E',
            letterSpacing: '0.05em',
          }}>Outputs</div>
          {outputItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                color: isActive(item.href) ? '#8B5CF6' : '#D6D3D1',
                textDecoration: 'none',
                fontSize: '14px',
                background: isActive(item.href) ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                borderLeft: isActive(item.href) ? '3px solid #8B5CF6' : '3px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '16px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Settings */}
        <div style={{
          paddingTop: '16px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Link
            href="/settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 20px',
              color: isActive('/settings') ? '#8B5CF6' : '#D6D3D1',
              textDecoration: 'none',
              fontSize: '14px',
              background: isActive('/settings') ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              borderLeft: isActive('/settings') ? '3px solid #8B5CF6' : '3px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '16px', width: '24px', textAlign: 'center' }}>⚙️</span>
            <span style={{ flex: 1 }}>Settings</span>
          </Link>
        </div>

        {/* User Profile */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          marginTop: 'auto',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
            }}>M</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: 'white', fontWeight: 500, fontSize: '14px' }}>Miguel</span>
              <span style={{ color: '#A8A29E', fontSize: '12px' }}>Owner</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        marginLeft: '260px',
        background: '#FDF8F3',
        minHeight: '100vh',
      }}>
        {children}
      </main>
    </div>
  );
}
