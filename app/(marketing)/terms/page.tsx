'use client';

import Link from 'next/link';

/*
Metadata exported via generateMetadata in separate file for SEO.
Client component needed for styled-jsx.
*/

export default function TermsOfServicePage() {
  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <Link href="/" className="legal-back">
          ← Back to Home
        </Link>
      </nav>
      
      <main className="legal-content">
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: January 7, 2026</p>
        
        <section>
          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or using Virtual Cofounder (&quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the Service.
          </p>
          <p>
            These Terms constitute a legally binding agreement between you (&quot;User,&quot; &quot;you,&quot; or &quot;your&quot;) and Virtual Cofounder (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;).
          </p>
        </section>

        <section>
          <h2>2. Description of Service</h2>
          <p>
            Virtual Cofounder is an AI-powered service that helps software teams ship projects faster by:
          </p>
          <ul>
            <li>Scanning codebases for security, SEO, performance, and accessibility issues</li>
            <li>Automatically generating fixes and improvements</li>
            <li>Creating and submitting pull requests to your repositories</li>
            <li>Providing daily check-ins and progress updates via Slack</li>
            <li>Managing tasks through integration with project management tools</li>
          </ul>
        </section>

        <section>
          <h2>3. Eligibility</h2>
          <p>
            You must be at least 18 years old and have the authority to enter into contracts to use this Service. By using the Service, you represent that you meet these requirements and that you have the authority to bind any organization on whose behalf you are using the Service.
          </p>
        </section>

        <section>
          <h2>4. Account Registration</h2>
          <ul>
            <li>You must provide accurate, current, and complete information during registration.</li>
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>You must notify us immediately of any unauthorized access to your account.</li>
            <li>You are responsible for all activities that occur under your account.</li>
          </ul>
        </section>

        <section>
          <h2>5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose or in violation of any laws</li>
            <li>Attempt to gain unauthorized access to any systems or networks</li>
            <li>Use the Service to scan or modify code you do not have rights to</li>
            <li>Interfere with or disrupt the Service or servers</li>
            <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
            <li>Use the Service to develop a competing product</li>
            <li>Share account credentials or allow unauthorized access</li>
            <li>Submit malicious code or content through the Service</li>
          </ul>
        </section>

        <section>
          <h2>6. Code and Repository Access</h2>
          
          <h3>6.1 Authorization</h3>
          <p>
            By connecting your repositories to Virtual Cofounder, you authorize us to:
          </p>
          <ul>
            <li>Read and analyze your source code</li>
            <li>Create branches in your repositories</li>
            <li>Submit pull requests with proposed changes</li>
            <li>Access repository metadata and settings</li>
          </ul>

          <h3>6.2 Your Responsibilities</h3>
          <ul>
            <li>You must have the right to grant us access to any repositories you connect</li>
            <li>You are responsible for reviewing and approving all pull requests before merging</li>
            <li>You must ensure your use complies with any third-party licenses in your code</li>
            <li>You are responsible for maintaining backups of your code</li>
          </ul>

          <h3>6.3 Limitations</h3>
          <p>
            We do not guarantee that our suggested changes are free of errors or suitable for your specific use case. You are responsible for testing and validating all changes before deploying to production.
          </p>
        </section>

        <section>
          <h2>7. Intellectual Property</h2>
          
          <h3>7.1 Our IP</h3>
          <p>
            The Service, including its features, functionality, and all related intellectual property, is owned by Virtual Cofounder and protected by copyright, trademark, and other laws.
          </p>

          <h3>7.2 Your Code</h3>
          <p>
            You retain all ownership rights to your code and repositories. We do not claim any ownership over your intellectual property. The changes we generate become part of your codebase when you merge them.
          </p>

          <h3>7.3 Feedback</h3>
          <p>
            Any feedback, suggestions, or ideas you provide about the Service may be used by us without restriction or compensation.
          </p>
        </section>

        <section>
          <h2>8. Payment and Billing</h2>
          <ul>
            <li>Paid plans are billed in advance on a monthly or annual basis</li>
            <li>All fees are non-refundable except as required by law</li>
            <li>We may change prices with 30 days&apos; notice</li>
            <li>You are responsible for all taxes applicable to your use</li>
            <li>Failure to pay may result in suspension or termination of your account</li>
          </ul>
        </section>

        <section>
          <h2>9. Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul>
            <li>MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE</li>
            <li>NON-INFRINGEMENT</li>
            <li>ACCURACY, RELIABILITY, OR COMPLETENESS OF CONTENT</li>
            <li>UNINTERRUPTED OR ERROR-FREE OPERATION</li>
            <li>SECURITY OR FREEDOM FROM VIRUSES OR HARMFUL COMPONENTS</li>
          </ul>
          <p>
            WE DO NOT GUARANTEE THAT CODE CHANGES GENERATED BY THE SERVICE WILL BE ERROR-FREE, SECURE, OR SUITABLE FOR YOUR SPECIFIC USE CASE.
          </p>
        </section>

        <section>
          <h2>10. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, VIRTUAL COFOUNDER SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul>
            <li>LOSS OF PROFITS, DATA, OR GOODWILL</li>
            <li>SERVICE INTERRUPTION OR DOWNTIME</li>
            <li>COST OF PROCUREMENT OF SUBSTITUTE SERVICES</li>
            <li>BUGS OR ERRORS IN CODE GENERATED BY THE SERVICE</li>
            <li>SECURITY VULNERABILITIES INTRODUCED OR NOT DETECTED</li>
          </ul>
          <p>
            OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.
          </p>
        </section>

        <section>
          <h2>11. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless Virtual Cofounder and its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorneys&apos; fees) arising from:
          </p>
          <ul>
            <li>Your use of the Service</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any third-party rights</li>
            <li>Your code or content submitted through the Service</li>
          </ul>
        </section>

        <section>
          <h2>12. Termination</h2>
          <ul>
            <li>You may terminate your account at any time by contacting us</li>
            <li>We may terminate or suspend your account for violation of these Terms</li>
            <li>We may discontinue the Service at any time with reasonable notice</li>
            <li>Upon termination, your right to use the Service ceases immediately</li>
            <li>Provisions that should survive termination (such as IP rights, disclaimers, indemnification) will remain in effect</li>
          </ul>
        </section>

        <section>
          <h2>13. Changes to Terms</h2>
          <p>
            We may modify these Terms at any time. We will provide notice of material changes by posting the updated Terms and updating the &quot;Last updated&quot; date. Your continued use of the Service after changes take effect constitutes acceptance of the new Terms.
          </p>
        </section>

        <section>
          <h2>14. Governing Law and Disputes</h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of law principles. Any disputes arising from these Terms or the Service shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.
          </p>
        </section>

        <section>
          <h2>15. General Provisions</h2>
          <ul>
            <li><strong>Entire Agreement:</strong> These Terms constitute the entire agreement between you and us regarding the Service.</li>
            <li><strong>Severability:</strong> If any provision is found unenforceable, the remaining provisions remain in effect.</li>
            <li><strong>Waiver:</strong> Failure to enforce any right does not waive that right.</li>
            <li><strong>Assignment:</strong> You may not assign these Terms without our written consent.</li>
            <li><strong>Force Majeure:</strong> We are not liable for delays caused by circumstances beyond our reasonable control.</li>
          </ul>
        </section>

        <section>
          <h2>16. Contact Us</h2>
          <p>
            If you have questions about these Terms, please contact us at:
          </p>
          <p>
            <strong>Email:</strong> <a href="mailto:legal@virtualcofounder.ai">legal@virtualcofounder.ai</a><br />
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
