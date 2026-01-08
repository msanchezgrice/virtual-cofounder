'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/dashboard/queue', icon: '📋', label: 'Queue', badge: true },
  { href: '/dashboard/history', icon: '💬', label: 'Chat' },
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

  return (
    <div className="app-shell">
      {/* Dark Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <Link href="/" className="logo-link">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">Virtual Cofounder</span>
          </Link>
        </div>

        <div className="nav-main">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)) ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.badge && <span className="nav-badge">7</span>}
            </Link>
          ))}
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Outputs</div>
          {outputItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="nav-section">
          <Link
            href="/settings"
            className={`nav-item ${pathname === '/settings' ? 'active' : ''}`}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Settings</span>
          </Link>
        </div>

        {/* User Profile at Bottom */}
        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">M</div>
            <div className="user-info">
              <span className="user-name">Miguel</span>
              <span className="user-role">Owner</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        {children}
      </main>

      <style jsx>{`
        .app-shell {
          display: grid;
          grid-template-columns: 260px 1fr;
          min-height: 100vh;
        }

        .sidebar {
          background: #1C1917;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: 260px;
          overflow-y: auto;
        }

        .sidebar-logo {
          padding: 24px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .logo-link {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
        }

        .logo-icon {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #8B5CF6, #7C3AED);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .logo-text {
          color: white;
          font-weight: 700;
          font-size: 16px;
        }

        .nav-main {
          padding: 16px 0;
          flex: 1;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 20px;
          color: #D6D3D1;
          text-decoration: none;
          font-size: 14px;
          transition: all 0.2s;
          border-left: 3px solid transparent;
        }

        .nav-item:hover {
          background: rgba(255,255,255,0.05);
        }

        .nav-item.active {
          background: rgba(139, 92, 246, 0.2);
          color: #8B5CF6;
          border-left-color: #8B5CF6;
        }

        .nav-icon {
          font-size: 16px;
          width: 24px;
          text-align: center;
        }

        .nav-label {
          flex: 1;
        }

        .nav-badge {
          background: #8B5CF6;
          color: white;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 600;
        }

        .nav-section {
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.1);
          margin-top: auto;
        }

        .nav-section:first-of-type {
          margin-top: 0;
        }

        .nav-section-title {
          padding: 8px 20px;
          font-size: 11px;
          text-transform: uppercase;
          color: #A8A29E;
          letter-spacing: 0.05em;
        }

        .sidebar-footer {
          padding: 16px 20px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #8B5CF6, #7C3AED);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 14px;
        }

        .user-info {
          display: flex;
          flex-direction: column;
        }

        .user-name {
          color: white;
          font-weight: 500;
          font-size: 14px;
        }

        .user-role {
          color: #A8A29E;
          font-size: 12px;
        }

        .main-content {
          background: #FDF8F3;
          margin-left: 260px;
          min-height: 100vh;
        }

        @media (max-width: 1024px) {
          .app-shell {
            grid-template-columns: 1fr;
          }
          .sidebar {
            display: none;
          }
          .main-content {
            margin-left: 0;
          }
        }
      `}</style>
    </div>
  );
}
