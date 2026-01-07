'use client';

import Link from 'next/link';

/*
Metadata exported via generateMetadata in separate file for SEO.
Client component needed for styled-jsx.
*/

export default function PrivacyPolicyPage() {
  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <Link href="/" className="legal-back">
          ← Back to Home
        </Link>
      </nav>
      
      <main className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: January 7, 2026</p>
        
        <section>
          <h2>1. Introduction</h2>
          <p>
            Virtual Cofounder (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.
          </p>
          <p>
            By using Virtual Cofounder, you agree to the collection and use of information in accordance with this policy.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          
          <h3>2.1 Information You Provide</h3>
          <ul>
            <li><strong>Account Information:</strong> Email address, name, and company name when you sign up or join our waitlist.</li>
            <li><strong>Integration Data:</strong> Access tokens and credentials for services you connect (Slack, GitHub, Linear, etc.).</li>
            <li><strong>Communication:</strong> Messages you send through Slack channels where our bot is present.</li>
            <li><strong>Project Information:</strong> Repository URLs, domain names, and project configurations you provide.</li>
          </ul>

          <h3>2.2 Information We Collect Automatically</h3>
          <ul>
            <li><strong>Usage Data:</strong> How you interact with our service, including features used and time spent.</li>
            <li><strong>Log Data:</strong> IP address, browser type, device information, and access times.</li>
            <li><strong>Scan Results:</strong> Technical analysis of your projects including SEO, security, and performance metrics.</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve our services</li>
            <li>Scan your projects and identify opportunities for improvement</li>
            <li>Generate and submit pull requests to your repositories</li>
            <li>Send you notifications and updates via Slack</li>
            <li>Respond to your inquiries and provide customer support</li>
            <li>Analyze usage patterns to enhance our product</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2>4. Code and Repository Access</h2>
          <p>
            To function effectively, Virtual Cofounder requires access to your code repositories. We want to be transparent about how we handle this sensitive data:
          </p>
          <ul>
            <li><strong>Read Access:</strong> We read your codebase to analyze it for security vulnerabilities, SEO issues, performance problems, and other optimization opportunities.</li>
            <li><strong>Write Access:</strong> We create branches and submit pull requests to implement fixes. All changes go through PRs—we never commit directly to your main branch.</li>
            <li><strong>Code Processing:</strong> Code is processed by our AI systems to generate improvements. We do not use your code to train AI models.</li>
            <li><strong>Data Retention:</strong> We do not store copies of your source code beyond what&apos;s necessary for active analysis and PR creation.</li>
          </ul>
        </section>

        <section>
          <h2>5. Data Sharing and Disclosure</h2>
          <p>We do not sell your personal information. We may share your information in the following circumstances:</p>
          <ul>
            <li><strong>Service Providers:</strong> With third-party vendors who help us operate our service (hosting, analytics, communication tools).</li>
            <li><strong>AI Processing:</strong> With AI providers (e.g., Anthropic) for code analysis and improvement generation. These providers are contractually bound to protect your data.</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect our rights, safety, or property.</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
          </ul>
        </section>

        <section>
          <h2>6. Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your information, including:
          </p>
          <ul>
            <li>Encryption of data in transit and at rest</li>
            <li>Regular security assessments and audits</li>
            <li>Access controls and authentication requirements</li>
            <li>Secure deletion of data when no longer needed</li>
          </ul>
          <p>
            However, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>7. Data Retention</h2>
          <p>
            We retain your information for as long as your account is active or as needed to provide services. You may request deletion of your data at any time. Some information may be retained as required by law or for legitimate business purposes.
          </p>
        </section>

        <section>
          <h2>8. Your Rights</h2>
          <p>Depending on your location, you may have the right to:</p>
          <ul>
            <li>Access the personal information we hold about you</li>
            <li>Correct inaccurate or incomplete information</li>
            <li>Delete your personal information</li>
            <li>Restrict or object to certain processing</li>
            <li>Data portability</li>
            <li>Withdraw consent where processing is based on consent</li>
          </ul>
          <p>
            To exercise these rights, please contact us at <a href="mailto:privacy@virtualcofounder.ai">privacy@virtualcofounder.ai</a>.
          </p>
        </section>

        <section>
          <h2>9. Third-Party Services</h2>
          <p>
            Our service integrates with third-party platforms including Slack, GitHub, Linear, Vercel, and others. Each has its own privacy policy governing their use of your information. We encourage you to review their policies.
          </p>
        </section>

        <section>
          <h2>10. Children&apos;s Privacy</h2>
          <p>
            Virtual Cofounder is not intended for use by anyone under the age of 18. We do not knowingly collect information from children under 18.
          </p>
        </section>

        <section>
          <h2>11. International Data Transfers</h2>
          <p>
            Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place for such transfers in accordance with applicable laws.
          </p>
        </section>

        <section>
          <h2>12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the &quot;Last updated&quot; date. Continued use of the service after changes constitutes acceptance.
          </p>
        </section>

        <section>
          <h2>13. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at:
          </p>
          <p>
            <strong>Email:</strong> <a href="mailto:privacy@virtualcofounder.ai">privacy@virtualcofounder.ai</a><br />
            <strong>Website:</strong> <a href="https://virtualcofounder.ai">virtualcofounder.ai</a>
          </p>
        </section>
      </main>

      <style jsx>{`
        .legal-page {
          min-height: 100vh;
          background: #fefdfb;
          font-family: 'Inter', system-ui, sans-serif;
        }

        .legal-nav {
          padding: 1.5rem 2rem;
          border-bottom: 1px solid #e8e6e1;
        }

        .legal-back {
          color: #5c5a56;
          text-decoration: none;
          font-size: 0.9rem;
          transition: color 0.2s;
        }

        .legal-back:hover {
          color: #1d1c1a;
        }

        .legal-content {
          max-width: 800px;
          margin: 0 auto;
          padding: 4rem 2rem;
        }

        h1 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 2.5rem;
          font-weight: 500;
          margin-bottom: 0.5rem;
          color: #1d1c1a;
        }

        .legal-updated {
          color: #8a8784;
          font-size: 0.9rem;
          margin-bottom: 3rem;
        }

        section {
          margin-bottom: 2.5rem;
        }

        h2 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 1.5rem;
          font-weight: 500;
          margin-bottom: 1rem;
          color: #1d1c1a;
        }

        h3 {
          font-size: 1rem;
          font-weight: 600;
          margin: 1.5rem 0 0.75rem;
          color: #1d1c1a;
        }

        p {
          color: #5c5a56;
          line-height: 1.7;
          margin-bottom: 1rem;
        }

        ul {
          color: #5c5a56;
          line-height: 1.7;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }

        li {
          margin-bottom: 0.5rem;
        }

        a {
          color: #e85d04;
          text-decoration: none;
        }

        a:hover {
          text-decoration: underline;
        }

        strong {
          color: #1d1c1a;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
