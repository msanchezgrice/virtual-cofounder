import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Virtual Cofounder privacy policy. Learn how we collect, use, and protect your personal information.',
  openGraph: {
    title: 'Privacy Policy | Virtual Cofounder',
    description: 'Virtual Cofounder privacy policy. Learn how we collect, use, and protect your personal information.',
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>;
}
