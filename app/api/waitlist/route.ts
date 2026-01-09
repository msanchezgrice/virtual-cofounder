import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/db';

const resend = new Resend(process.env.RESEND_API_KEY);

// The email address that waitlist replies will go to
const FROM_EMAIL = 'Virtual Cofounder <miguel@virtualcofounder.ai>';
const REPLY_TO = 'miguel@virtualcofounder.ai';

export async function POST(request: NextRequest) {
  try {
    const { email, source = 'landing_page' } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Check if already signed up
    const existing = await prisma.waitlistSignup.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { success: true, message: 'Already on the waitlist!' },
        { status: 200 }
      );
    }

    // Send the welcome email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject: "You're on the list! 🚀",
      html: getWelcomeEmailHtml(email),
      text: getWelcomeEmailText(email),
    });

    if (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Still save the signup even if email fails
    }

    // Save to database
    const signup = await prisma.waitlistSignup.create({
      data: {
        email: email.toLowerCase(),
        source,
        welcomeEmailSentAt: emailError ? null : new Date(),
        resendEmailId: emailData?.id || null,
      },
    });

    console.log(`✅ Waitlist signup: ${email} (id: ${signup.id})`);

    return NextResponse.json({
      success: true,
      message: "You're on the list!",
    });
  } catch (error) {
    console.error('Waitlist signup error:', error);
    
    // Handle unique constraint violation (race condition)
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json(
        { success: true, message: 'Already on the waitlist!' },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

function getWelcomeEmailHtml(email: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're on the list!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #fefdfb; color: #1d1c1a;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; width: 100%; border-collapse: collapse;">
          
          <!-- Logo -->
          <tr>
            <td style="padding-bottom: 32px; text-align: center;">
              <span style="font-size: 32px;">🚀</span>
              <span style="font-size: 20px; font-weight: 600; color: #1d1c1a; margin-left: 8px;">Virtual Cofounder</span>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
              <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 600; color: #1d1c1a;">
                You're on the list! ✅
              </h1>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #5c5a56;">
                Thanks for signing up for Virtual Cofounder. We're building something special—a team of AI agents that handles the work you've been putting off, while you focus on what matters most.
              </p>
              
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #5c5a56;">
                We're currently sorting through the waitlist and onboarding founders in small batches to ensure everyone gets an amazing experience.
              </p>
              
              <!-- Call to Action Box -->
              <div style="background: #fff8f3; border-left: 4px solid #e85d04; padding: 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #1d1c1a;">
                  Want to jump ahead in line? 👀
                </p>
                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #5c5a56;">
                  Just hit reply and tell us a bit about yourself: What are you building? Where are you getting stuck? What would you use your virtual cofounder for first?
                </p>
              </div>
              
              <p style="margin: 24px 0 0; font-size: 16px; line-height: 1.6; color: #5c5a56;">
                The more we understand about your projects and pain points, the faster we can get you set up with the right agent team.
              </p>
              
              <p style="margin: 24px 0 0; font-size: 16px; line-height: 1.6; color: #5c5a56;">
                Talk soon,<br>
                <strong>Miguel</strong><br>
                <span style="color: #8a8784;">Founder, Virtual Cofounder</span>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #8a8784;">
                Virtual Cofounder · A team that ships while you sleep
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getWelcomeEmailText(email: string): string {
  return `
You're on the list! ✅

Thanks for signing up for Virtual Cofounder. We're building something special—a team of AI agents that handles the work you've been putting off, while you focus on what matters most.

We're currently sorting through the waitlist and onboarding founders in small batches to ensure everyone gets an amazing experience.

---

WANT TO JUMP AHEAD IN LINE? 👀

Just hit reply and tell us a bit about yourself: What are you building? Where are you getting stuck? What would you use your virtual cofounder for first?

The more we understand about your projects and pain points, the faster we can get you set up with the right agent team.

---

Talk soon,
Miguel
Founder, Virtual Cofounder

---
Virtual Cofounder · A team that ships while you sleep
  `.trim();
}
