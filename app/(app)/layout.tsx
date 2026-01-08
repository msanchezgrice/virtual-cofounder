import Link from 'next/link';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <span className="text-2xl">🤖</span>
              <h1 className="text-xl font-semibold text-dark-gray">Virtual Cofounder</h1>
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/dashboard" className="text-sm font-medium text-gray-700 hover:text-brand-blue transition-colors">
                Dashboard
              </Link>
              <Link href="/progress" className="text-sm font-medium text-gray-700 hover:text-brand-blue transition-colors">
                Progress
              </Link>
              <Link href="/dashboard/queue" className="text-sm font-medium text-gray-700 hover:text-brand-blue transition-colors">
                Queue
              </Link>
              <Link href="/dashboard/history" className="text-sm font-medium text-gray-700 hover:text-brand-blue transition-colors">
                History
              </Link>
              <Link href="/stories" className="text-sm font-medium text-gray-700 hover:text-brand-blue transition-colors">
                Stories
              </Link>
              <Link href="/agents" className="text-sm font-medium text-gray-700 hover:text-brand-blue transition-colors">
                Agents
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Miguel</span>
            <button className="text-sm text-gray-600 hover:text-brand-blue">Settings</button>
          </div>
        </div>
      </nav>
      <main className="min-h-screen bg-light-gray">
        {children}
      </main>
    </>
  )
}
