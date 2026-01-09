'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    if (href === '/dashboard/queue') return pathname === '/dashboard/queue';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Get current page title for mobile header
  const getCurrentPageTitle = () => {
    const allItems = [...navItems, ...outputItems, { href: '/settings', label: 'Settings' }];
    const current = allItems.find(item => isActive(item.href));
    return current?.label || 'Dashboard';
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile Header */}
      <header className="mobile-header">
        <button 
          className="hamburger-btn touch-target"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
        <div className="mobile-header-logo">
          <span className="mobile-header-logo-icon">⚡</span>
          <span>{getCurrentPageTitle()}</span>
        </div>
        <Link 
          href="/settings" 
          className="hamburger-btn touch-target"
          style={{ fontSize: '20px' }}
          aria-label="Settings"
        >
          ⚙️
        </Link>
      </header>

      {/* Sidebar Overlay (mobile) */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* Dark Sidebar */}
      <nav 
        className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}
        style={{
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
        }}
      >
        {/* Logo */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
          {/* Close button for mobile */}
          <button
            onClick={closeSidebar}
            className="hamburger-btn"
            style={{ 
              display: 'none',
              marginRight: '-8px',
            }}
            aria-label="Close menu"
          >
            ✕
          </button>
          <style jsx>{`
            @media (max-width: 1023px) {
              button { display: flex !important; }
            }
          `}</style>
        </div>

        {/* Main Navigation */}
        <div style={{ padding: '16px 0', flex: 1 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="touch-target"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                minHeight: '44px',
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
              className="touch-target"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                minHeight: '44px',
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
            className="touch-target"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 20px',
              minHeight: '44px',
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
      <main 
        className="app-main"
        style={{
          flex: 1,
          marginLeft: '260px',
          background: '#FDF8F3',
          minHeight: '100vh',
        }}
      >
        {children}
      </main>
    </div>
  );
}
