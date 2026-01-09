'use client';

import { useState } from 'react';
import Link from 'next/link';

// Loom video URL - replace with actual demo video
const LOOM_VIDEO_URL = 'https://www.loom.com/share/your-demo-video-id';

export default function LandingPage() {
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'landing_page' }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }
      
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav>
        <div className="nav-content">
          <div className="logo">
            <div className="logo-icon">🚀</div>
            Virtual Cofounder
          </div>
          <ul className="nav-links">
            <li><a href="#agents">Your team</a></li>
            <li><a href="#scanning">How we help</a></li>
            <li><a href="#kanban">Your board</a></li>
            <li><a href="#how">Daily rhythm</a></li>
          </ul>
          <button onClick={() => setIsWaitlistOpen(true)} className="btn btn-primary">
            Join Waitlist
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="dot"></span>
            Working in the background right now
          </div>
          <h1>A team that <em>ships</em> while you sleep</h1>
          <p className="hero-description">
            The cofounder you always dreamed of. Whether it&apos;s technical debt, growth experiments, or launch prep—your virtual cofounder handles the work you&apos;ve been putting off, overnight.
          </p>
          <div className="hero-cta">
            <button onClick={() => setIsWaitlistOpen(true)} className="btn btn-primary">
              Get your cofounder →
            </button>
            <a href={LOOM_VIDEO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Watch demo
            </a>
          </div>
        </div>

        <div className="slack-preview">
          <div className="slack-header">
            <div className="slack-channel">
              <span>#</span> cofounder-updates
            </div>
          </div>
          <div className="slack-body">
            <div className="slack-message">
              <div className="slack-avatar">VC</div>
              <div className="slack-content">
                <div className="slack-meta">
                  <span className="slack-name">Virtual Cofounder</span>
                  <span className="slack-app">APP</span>
                  <span className="slack-time">7:32 AM</span>
                </div>
                <div className="slack-text">
                  ☀️ <strong>Good morning!</strong> I scanned all 12 of your projects overnight and ranked them by impact. Here&apos;s what I can help with most today:
                  <br /><br />
                  🥇 <strong>startup-landing</strong> — Missing analytics + 3 SEO issues (high impact)<br />
                  🥈 <strong>saas-dashboard</strong> — 2 security vulnerabilities (urgent)<br />
                  🥉 <strong>portfolio-site</strong> — SSL expiring in 5 days
                </div>
                <div className="slack-options">
                  <div className="slack-options-label">I can approach the SEO fixes two ways:</div>
                  <div className="slack-option">
                    <div className="slack-option-radio"></div>
                    <strong>Option A:</strong> Quick fix — add meta descriptions to all 8 pages (30 min)
                  </div>
                  <div className="slack-option">
                    <div className="slack-option-radio"></div>
                    <strong>Option B:</strong> Full audit — rewrite titles, add schema markup, optimize images (2 hrs)
                  </div>
                </div>
                <div className="slack-buttons">
                  <button className="slack-btn primary">Go with Option B</button>
                  <button className="slack-btn">Option A is fine</button>
                  <button className="slack-btn">Different priority</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tagline */}
      <section className="tagline">
        <div className="tagline-content">
          <h2>
            Like having a team. <em>Without the meetings.</em><br />
            The cofounder who handles everything you know you should do—but never get to.
          </h2>
        </div>
      </section>

      {/* Value Props */}
      <section className="value-props">
        <div className="value-props-content">
          <div className="value-header">
            <div className="section-label">Why it works</div>
            <h2>Your dream cofounder, automated</h2>
            <p>All the benefits of a technical partner, working in the background around your schedule.</p>
          </div>
          <div className="value-grid">
            <div className="value-card">
              <div className="value-icon">🌙</div>
              <h3>Ships while you sleep</h3>
              <p>Scans run overnight. Fixes ship by morning. Wake up to progress, not a growing backlog of tedious tasks.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">💬</div>
              <h3>Slack is your interface</h3>
              <p>No new tools to learn. Morning check-ins, priority discussions, and approvals—all in the channel you already use.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">📋</div>
              <h3>Your priorities, every day</h3>
              <p>Tell your cofounder what matters. It factors your input into everything it works on. Change direction anytime.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">🎯</div>
              <h3>Does what you delay</h3>
              <p>SEO tags? Security patches? Analytics setup? Important-but-not-urgent work that never quite makes the cut.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">🔍</div>
              <h3>Reviews before sharing</h3>
              <p>Your cofounder spins up specialist agents, reviews their work, and only shows you polished, ready-to-approve PRs.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">🚢</div>
              <h3>Gets you to launch</h3>
              <p>Technical issues, growth tasks, polish work—everything you need to go live, handled by your always-on team.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Agent System */}
      <section className="agent-system" id="agents">
        <div className="agent-system-content">
          <div className="agent-header">
            <div className="section-label">How it works</div>
            <h2>Your cofounder manages <em>the team</em></h2>
            <p>Behind the scenes, specialized agents do the work. Your cofounder orchestrates, reviews, and only surfaces what&apos;s ready for you.</p>
          </div>

          <div className="agent-flow">
            <div className="agent-flow-step">
              <div className="agent-flow-icon">📊</div>
              <h3>Scan & Rank</h3>
              <p>All projects scanned. Issues ranked by impact.</p>
            </div>
            <div className="agent-flow-arrow">→</div>
            <div className="agent-flow-step highlight">
              <div className="agent-flow-icon">🧠</div>
              <h3>Spawn Agents</h3>
              <p>Specialists assigned to each task.</p>
            </div>
            <div className="agent-flow-arrow">→</div>
            <div className="agent-flow-step">
              <div className="agent-flow-icon">✅</div>
              <h3>Review & Ship</h3>
              <p>Work reviewed. PRs ready for you.</p>
            </div>
          </div>

          <div className="agent-grid">
            <div className="agent-card">
              <div className="agent-card-header">
                <div className="agent-card-icon" style={{background: 'var(--blue-soft)'}}>🛡️</div>
                <h4>Security Agent</h4>
                <span className="agent-category-label category-tech">Tech</span>
              </div>
              <p>API key exposure, npm vulnerabilities, missing headers, dependency audits.</p>
            </div>
            <div className="agent-card">
              <div className="agent-card-header">
                <div className="agent-card-icon" style={{background: 'var(--purple-soft)'}}>🔍</div>
                <h4>SEO Agent</h4>
                <span className="agent-category-label category-growth">Growth</span>
              </div>
              <p>Meta tags, schema markup, sitemaps, canonical URLs, content optimization.</p>
            </div>
            <div className="agent-card">
              <div className="agent-card-header">
                <div className="agent-card-icon" style={{background: 'var(--blue-soft)'}}>⚡</div>
                <h4>Performance Agent</h4>
                <span className="agent-category-label category-tech">Tech</span>
              </div>
              <p>Core Web Vitals, Lighthouse scores, image optimization, bundle analysis.</p>
            </div>
            <div className="agent-card">
              <div className="agent-card-header">
                <div className="agent-card-icon" style={{background: 'var(--purple-soft)'}}>📊</div>
                <h4>Analytics Agent</h4>
                <span className="agent-category-label category-growth">Growth</span>
              </div>
              <p>PostHog setup, event tracking, dashboards, funnel configuration.</p>
            </div>
            <div className="agent-card">
              <div className="agent-card-header">
                <div className="agent-card-icon" style={{background: 'var(--blue-soft)'}}>🚀</div>
                <h4>Deployment Agent</h4>
                <span className="agent-category-label category-tech">Tech</span>
              </div>
              <p>Vercel issues, build errors, environment variables, domain configuration.</p>
            </div>
            <div className="agent-card">
              <div className="agent-card-header">
                <div className="agent-card-icon" style={{background: 'var(--purple-soft)'}}>✉️</div>
                <h4>Email Agent</h4>
                <span className="agent-category-label category-growth">Growth</span>
              </div>
              <p>Resend integration, transactional emails, deliverability, templates.</p>
            </div>
            <div className="agent-card">
              <div className="agent-card-header">
                <div className="agent-card-icon" style={{background: 'var(--blue-soft)'}}>♿</div>
                <h4>Accessibility Agent</h4>
                <span className="agent-category-label category-tech">Tech</span>
              </div>
              <p>WCAG compliance, screen reader support, keyboard navigation, ARIA labels.</p>
            </div>
            <div className="agent-card">
              <div className="agent-card-header">
                <div className="agent-card-icon" style={{background: 'var(--purple-soft)'}}>📈</div>
                <h4>Growth Agent</h4>
                <span className="agent-category-label category-growth">Growth</span>
              </div>
              <p>Conversion optimization, A/B test ideas, funnel analysis, retention.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Scanning Section */}
      <section className="scanning" id="scanning">
        <div className="scanning-content">
          <div className="scanning-text">
            <div className="section-label" style={{color: 'var(--accent)'}}>Intelligent prioritization</div>
            <h2>We scan everything. Then rank how to help most.</h2>
            <p>
              Your cofounder doesn&apos;t just find issues—it ranks them by impact. So you always know what will move the needle most, and can focus your limited time where it matters.
            </p>
            <ul className="scanning-features">
              <li>All projects scanned daily—domain, SEO, security, performance, analytics</li>
              <li>Issues ranked by severity, effort, and business impact</li>
              <li>Your priorities factored in—tell us what matters and we&apos;ll weight it</li>
              <li>Multiple options when there&apos;s more than one good approach</li>
              <li>Auto-fix safe changes; PR for anything that needs your eyes</li>
            </ul>
          </div>
          <div className="project-ranking">
            <div className="ranking-header">
              <div className="ranking-title">📊 Your Projects, Ranked</div>
              <div className="ranking-badge">Updated 7:30 AM</div>
            </div>
            <div className="ranking-list">
              <div className="ranking-item">
                <div className="ranking-position">1</div>
                <div className="ranking-info">
                  <div className="ranking-name">startup-landing</div>
                  <div className="ranking-issues">Missing analytics • 3 SEO issues • No schema</div>
                </div>
                <div className="ranking-score">
                  <div className="ranking-score-value">94</div>
                  <div className="ranking-score-label">impact score</div>
                </div>
              </div>
              <div className="ranking-item">
                <div className="ranking-position">2</div>
                <div className="ranking-info">
                  <div className="ranking-name">saas-dashboard</div>
                  <div className="ranking-issues">2 npm vulnerabilities • Outdated deps</div>
                </div>
                <div className="ranking-score">
                  <div className="ranking-score-value">87</div>
                  <div className="ranking-score-label">impact score</div>
                </div>
              </div>
              <div className="ranking-item">
                <div className="ranking-position">3</div>
                <div className="ranking-info">
                  <div className="ranking-name">portfolio-site</div>
                  <div className="ranking-issues">SSL expiring • Lighthouse 72</div>
                </div>
                <div className="ranking-score">
                  <div className="ranking-score-value">76</div>
                  <div className="ranking-score-label">impact score</div>
                </div>
              </div>
              <div className="ranking-item">
                <div className="ranking-position">4</div>
                <div className="ranking-info">
                  <div className="ranking-name">docs-portal</div>
                  <div className="ranking-issues">Missing meta descriptions</div>
                </div>
                <div className="ranking-score">
                  <div className="ranking-score-value">45</div>
                  <div className="ranking-score-label">impact score</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Kanban Section */}
      <section className="kanban-section" id="kanban">
        <div className="kanban-content">
          <div className="kanban-header">
            <div className="section-label">Full visibility</div>
            <h2>See all work in progress. Anytime.</h2>
            <p>Your cofounder isn&apos;t a black box. Every task, every PR, every piece of agent thinking—visible in your Linear workspace or our dashboard.</p>
          </div>

          <div className="kanban-preview">
            <div className="kanban-toolbar">
              <div className="kanban-title">📋 startup-landing</div>
              <div className="kanban-tabs">
                <button className="kanban-tab active">Board</button>
                <button className="kanban-tab">Timeline</button>
                <button className="kanban-tab">Activity</button>
              </div>
            </div>
            <div className="kanban-columns">
              <div className="kanban-column">
                <h4>Queued <span className="kanban-count">3</span></h4>
                <div className="kanban-card">
                  <div className="kanban-card-title">Add schema markup</div>
                  <div className="kanban-card-meta">
                    <span>SEO</span> • <span>Low effort</span>
                  </div>
                </div>
                <div className="kanban-card">
                  <div className="kanban-card-title">Fix mobile nav overflow</div>
                  <div className="kanban-card-meta">
                    <span>UX</span> • <span>Medium effort</span>
                  </div>
                </div>
                <div className="kanban-card">
                  <div className="kanban-card-title">Optimize hero image</div>
                  <div className="kanban-card-meta">
                    <span>Performance</span> • <span>Low effort</span>
                  </div>
                </div>
              </div>
              <div className="kanban-column">
                <h4>In Progress <span className="kanban-count">2</span></h4>
                <div className="kanban-card">
                  <div className="kanban-card-title">Add PostHog analytics</div>
                  <div className="kanban-card-meta">
                    <span>Analytics</span> • <span>High impact</span>
                  </div>
                  <div className="kanban-card-agent">
                    <div className="kanban-card-agent-avatar">📊</div>
                    Analytics Agent working...
                  </div>
                </div>
                <div className="kanban-card">
                  <div className="kanban-card-title">Rewrite meta descriptions</div>
                  <div className="kanban-card-meta">
                    <span>SEO</span> • <span>8 pages</span>
                  </div>
                  <div className="kanban-card-agent">
                    <div className="kanban-card-agent-avatar">🔍</div>
                    SEO Agent working...
                  </div>
                </div>
              </div>
              <div className="kanban-column">
                <h4>In Review <span className="kanban-count">1</span></h4>
                <div className="kanban-card in-review">
                  <div className="kanban-card-title">Fix npm vulnerabilities</div>
                  <div className="kanban-card-meta">
                    <span>Security</span> • <span>PR #142</span>
                  </div>
                  <div className="kanban-card-agent">
                    <div className="kanban-card-agent-avatar">🧠</div>
                    Cofounder reviewing...
                  </div>
                </div>
              </div>
              <div className="kanban-column">
                <h4>Done <span className="kanban-count">4</span></h4>
                <div className="kanban-card done">
                  <div className="kanban-card-title">SSL certificate renewal</div>
                  <div className="kanban-card-meta">Shipped 2h ago</div>
                </div>
                <div className="kanban-card done">
                  <div className="kanban-card-title">Add OG images</div>
                  <div className="kanban-card-meta">Shipped yesterday</div>
                </div>
                <div className="kanban-card done">
                  <div className="kanban-card-title">Fix broken links</div>
                  <div className="kanban-card-meta">Shipped yesterday</div>
                </div>
                <div className="kanban-card done">
                  <div className="kanban-card-title">Update dependencies</div>
                  <div className="kanban-card-meta">Shipped 2 days ago</div>
                </div>
              </div>
            </div>
          </div>

          <div className="kanban-features">
            <div className="kanban-feature">
              <div className="kanban-feature-icon">🔗</div>
              <h4>Synced with Linear</h4>
              <p>Every task appears in your existing Linear workspace. Bidirectional—changes flow both ways.</p>
            </div>
            <div className="kanban-feature">
              <div className="kanban-feature-icon">💭</div>
              <h4>Agent thinking visible</h4>
              <p>See exactly how each agent approached the problem. Full reasoning in ticket comments.</p>
            </div>
            <div className="kanban-feature">
              <div className="kanban-feature-icon">📎</div>
              <h4>PRs linked to tasks</h4>
              <p>Every pull request connected to its task. One-click review from Slack or Linear.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Work Types */}
      <section className="work-types" id="work">
        <div className="work-types-content">
          <div className="work-header">
            <div className="section-label">What we handle</div>
            <h2>Technical <em>and</em> growth. All of it.</h2>
            <p>Your cofounder helps with any part of getting live—from security patches to conversion optimization.</p>
          </div>
          <div className="work-categories">
            <div className="work-category">
              <div className="work-category-header">
                <div className="work-category-icon" style={{background: 'var(--blue-soft)'}}>🔧</div>
                <div>
                  <h3>Technical</h3>
                  <div className="work-category-desc">The infrastructure that keeps you running</div>
                </div>
              </div>
              <div className="work-list">
                <div className="work-item">Security vulnerabilities</div>
                <div className="work-item">SSL & domain health</div>
                <div className="work-item">Deployment issues</div>
                <div className="work-item">Performance optimization</div>
                <div className="work-item">Dependency updates</div>
                <div className="work-item">Accessibility fixes</div>
                <div className="work-item">Build errors</div>
                <div className="work-item">Environment config</div>
              </div>
            </div>
            <div className="work-category">
              <div className="work-category-header">
                <div className="work-category-icon" style={{background: 'var(--purple-soft)'}}>📈</div>
                <div>
                  <h3>Growth</h3>
                  <div className="work-category-desc">The work that gets you discovered and converts</div>
                </div>
              </div>
              <div className="work-list">
                <div className="work-item">SEO optimization</div>
                <div className="work-item">Analytics setup</div>
                <div className="work-item">Meta tags & OG images</div>
                <div className="work-item">Schema markup</div>
                <div className="work-item">Email integration</div>
                <div className="work-item">Conversion tracking</div>
                <div className="work-item">Landing page polish</div>
                <div className="work-item">Content optimization</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works" id="how">
        <div className="how-content">
          <div className="how-header">
            <div className="section-label">Your daily rhythm</div>
            <h2>A cofounder that works around you</h2>
            <p>Check in when you want. Set priorities in plain English. Watch progress happen.</p>
          </div>
          <div className="timeline">
            <div className="timeline-item">
              <div className="timeline-icon">☀️</div>
              <div className="timeline-time">Morning</div>
              <h3>Check-in</h3>
              <p>Your cofounder shares overnight progress, ranked opportunities, and asks what to prioritize.</p>
            </div>
            <div className="timeline-item">
              <div className="timeline-icon">💬</div>
              <div className="timeline-time">You reply</div>
              <h3>Set focus</h3>
              <p>&quot;Focus on the launch&quot; or &quot;Security first&quot;—plain English. Your cofounder adapts.</p>
            </div>
            <div className="timeline-item">
              <div className="timeline-icon">⚡</div>
              <div className="timeline-time">All day</div>
              <h3>Work ships</h3>
              <p>Agents work. PRs appear. Check your board anytime. Approve with one click.</p>
            </div>
            <div className="timeline-item">
              <div className="timeline-icon">🌙</div>
              <div className="timeline-time">Evening</div>
              <h3>Recap & plan</h3>
              <p>Summary of the day. What&apos;s shipping overnight. Repeat tomorrow.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="cta-content">
          <h2>The cofounder you&apos;ve <em>always</em> wanted</h2>
          <p>Stop putting off the work that matters. Get a partner who handles it—technical and growth, overnight and in the background.</p>
          <div className="cta-buttons">
            <button onClick={() => setIsWaitlistOpen(true)} className="btn btn-primary">
              Join the waitlist →
            </button>
            <a href={LOOM_VIDEO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Watch demo
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-content">
          <div className="footer-main">
            <div className="footer-logo">
              <div className="logo-icon" style={{width: '24px', height: '24px', fontSize: '0.75rem'}}>🚀</div>
              Virtual Cofounder
            </div>
            <p className="footer-tagline">A team that ships while you sleep.</p>
          </div>
          <div className="footer-links">
            <div className="footer-links-group">
              <h4>Product</h4>
              <a href="#agents">How it works</a>
              <a href="#scanning">Features</a>
              <a href={LOOM_VIDEO_URL} target="_blank" rel="noopener noreferrer">Demo</a>
            </div>
            <div className="footer-links-group">
              <h4>Legal</h4>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
            </div>
            <div className="footer-links-group">
              <h4>Connect</h4>
              <a href="https://twitter.com/virtualcofounder" target="_blank" rel="noopener noreferrer">Twitter</a>
              <a href="mailto:hello@virtualcofounder.ai">Contact</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Virtual Cofounder. All rights reserved.</p>
        </div>
      </footer>

      {/* Waitlist Modal */}
      {isWaitlistOpen && (
        <div className="modal-overlay" onClick={() => setIsWaitlistOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setIsWaitlistOpen(false)}>×</button>
            
            {!submitted ? (
              <>
                <div className="modal-header">
                  <div className="modal-icon">🚀</div>
                  <h2>Get early access</h2>
                  <p>Join the waitlist and be first to know when we launch. We&apos;re onboarding founders in batches.</p>
                </div>
                <form onSubmit={handleWaitlistSubmit} className="modal-form">
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="modal-input"
                  />
                  {error && <p className="modal-error">{error}</p>}
                  <button type="submit" className="btn btn-primary modal-submit" disabled={loading}>
                    {loading ? 'Joining...' : 'Join waitlist'}
                  </button>
                </form>
                <p className="modal-note">No spam. We&apos;ll only email you about Virtual Cofounder.</p>
              </>
            ) : (
              <div className="modal-success">
                <div className="modal-icon">✅</div>
                <h2>You&apos;re on the list!</h2>
                <p>Thanks for joining! We&apos;ll reach out soon with early access.</p>
                <button onClick={() => setIsWaitlistOpen(false)} className="btn btn-secondary">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .landing-page {
          --bg: #fefdfb;
          --bg-soft: #f8f6f3;
          --bg-slack: #4a154b;
          --text: #1d1c1a;
          --text-secondary: #5c5a56;
          --text-muted: #8a8784;
          --accent: #e85d04;
          --accent-soft: #fff0e6;
          --success: #16a34a;
          --success-soft: #dcfce7;
          --blue: #2563eb;
          --blue-soft: #dbeafe;
          --purple: #7c3aed;
          --purple-soft: #ede9fe;
          --border: #e8e6e1;
          font-family: 'Inter', system-ui, sans-serif;
          background: var(--bg);
          color: var(--text);
          line-height: 1.6;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal {
          background: white;
          border-radius: 16px;
          padding: 2.5rem;
          max-width: 440px;
          width: 100%;
          position: relative;
          animation: modalIn 0.2s ease;
        }

        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .modal-close {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: none;
          border: none;
          font-size: 1.5rem;
          color: var(--text-muted);
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .modal-close:hover {
          background: var(--bg-soft);
          color: var(--text);
        }

        .modal-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .modal-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .modal-header h2 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 1.75rem;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }

        .modal-header p {
          color: var(--text-secondary);
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .modal-input {
          width: 100%;
          padding: 1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 1rem;
          transition: all 0.2s;
        }

        .modal-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }

        .modal-submit {
          width: 100%;
          justify-content: center;
        }

        .modal-note {
          text-align: center;
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-top: 1rem;
        }

        .modal-error {
          color: #dc2626;
          font-size: 0.9rem;
          margin: 0;
          padding: 0.75rem;
          background: #fef2f2;
          border-radius: 6px;
          text-align: center;
        }

        .modal-success {
          text-align: center;
        }

        .modal-success h2 {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 1.75rem;
          font-weight: 500;
          margin: 1rem 0 0.5rem;
        }

        .modal-success p {
          color: var(--text-secondary);
          margin-bottom: 1.5rem;
        }

        /* Footer Enhanced */
        .footer-content {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 4rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .footer-main {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .footer-tagline {
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        .footer-links {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2rem;
        }

        .footer-links-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .footer-links-group h4 {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 0.25rem;
        }

        .footer-links-group a {
          font-size: 0.9rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color 0.2s;
        }

        .footer-links-group a:hover {
          color: var(--text);
        }

        .footer-bottom {
          max-width: 1200px;
          margin: 2rem auto 0;
          padding-top: 2rem;
          border-top: 1px solid var(--border);
          text-align: center;
        }

        .footer-bottom p {
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        @media (max-width: 768px) {
          .footer-content {
            grid-template-columns: 1fr;
            gap: 2rem;
          }

          .footer-links {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 480px) {
          .footer-links {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
