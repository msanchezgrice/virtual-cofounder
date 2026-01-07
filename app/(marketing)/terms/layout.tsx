import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Virtual Cofounder terms of service. Review our terms and conditions for using our service.',
  openGraph: {
    title: 'Terms of Service | Virtual Cofounder',
    description: 'Virtual Cofounder terms of service. Review our terms and conditions for using our service.',
  },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>;
}
