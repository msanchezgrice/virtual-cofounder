import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/db';

const resend = new Resend(process.env.RESEND_API_KEY);

// Your personal email for forwarded replies
const FORWARD_TO = 'msanchezgrice@gmail.com';

// Resend inbound webhook for email replies
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    
    console.log('📧 Inbound email received:', {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
    });

    const fromEmail = payload.from?.toLowerCase();
    const subject = payload.subject || '(no subject)';
    const textBody = payload.text || '';
    const htmlBody = payload.html || '';

    // Try to find this person in the waitlist
    const waitlistEntry = fromEmail ? await prisma.waitlistSignup.findUnique({
      where: { email: fromEmail },
    }) : null;

    // If they're on the waitlist and replying with background info, save it
    if (waitlistEntry && textBody && !waitlistEntry.backgroundInfo) {
      await prisma.waitlistSignup.update({
        where: { email: fromEmail },
        data: { backgroundInfo: textBody },
      });
      console.log(`✅ Saved background info for ${fromEmail}`);
    }

    // Forward the email to your personal inbox
    await resend.emails.send({
      from: 'Virtual Cofounder <miguel@virtualcofounder.ai>',
      to: FORWARD_TO,
      replyTo: fromEmail || undefined,
      subject: `[Waitlist Reply] ${subject}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f6f3; padding: 16px 20px; border-radius: 8px 8px 0 0; border-bottom: 1px solid #e8e6e1;">
            <p style="margin: 0; font-size: 14px; color: #5c5a56;">
              <strong>From:</strong> ${payload.from || 'Unknown'}<br>
              <strong>Subject:</strong> ${subject}
              ${waitlistEntry ? '<br><span style="color: #16a34a;">✓ On waitlist</span>' : ''}
            </p>
          </div>
          <div style="background: white; padding: 20px; border-radius: 0 0 8px 8px;">
            ${htmlBody || `<pre style="white-space: pre-wrap; font-family: inherit;">${textBody}</pre>`}
          </div>
        </div>
      `,
      text: `From: ${payload.from || 'Unknown'}\nSubject: ${subject}\n${waitlistEntry ? '✓ On waitlist\n' : ''}\n---\n\n${textBody}`,
    });

    console.log(`✅ Forwarded reply from ${fromEmail} to ${FORWARD_TO}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Inbound email error:', error);
    return NextResponse.json(
      { error: 'Failed to process inbound email' },
      { status: 500 }
    );
  }
}
