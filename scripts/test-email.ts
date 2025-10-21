#!/usr/bin/env tsx
/**
 * Test email sending through SES
 * Usage: npm run test:email <recipient@example.com>
 */

import { sendEmail } from '../server/utils/email-service'

const TEST_EMAIL = process.argv[2]

if (!TEST_EMAIL) {
  console.error('❌ Error: Recipient email address required')
  console.error('')
  console.error('Usage: npm run test:email <recipient@example.com>')
  console.error('Example: npm run test:email john@example.com')
  process.exit(1)
}

async function testEmail() {
  console.log(`📧 Sending test email to ${TEST_EMAIL}...`)
  console.log('')

  try {
    const result = await sendEmail({
      to: [TEST_EMAIL],
      subject: 'GHOST Scheduled Reports - Test Email',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .success { color: #059669; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Test Email Successful</h1>
            </div>
            <div class="content">
              <p class="success">Congratulations! Your email configuration is working correctly.</p>
              <p>This is a test email from the GHOST Scheduled Reports system.</p>
              <p>If you received this email, it means:</p>
              <ul>
                <li>✓ AWS SES is properly configured</li>
                <li>✓ Email sending permissions are correct</li>
                <li>✓ The email service is operational</li>
              </ul>
              <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>From:</strong> GHOST Cost Dashboard</p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 12px; color: #666;">
                This is an automated test email. You can now proceed to create scheduled cost reports.
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    })

    if (result.success) {
      console.log('✅ Email sent successfully!')
      console.log(`   Message ID: ${result.messageId}`)
      console.log('')
      console.log('📬 Check your inbox (and spam folder)')
      console.log('')
      console.log('Next steps:')
      console.log('  1. Verify you received the email')
      console.log('  2. Run: npm run test:scheduled-report <your-email>')
      console.log('  3. Start creating scheduled reports in the UI')
    } else {
      console.error('❌ Failed to send email')
      console.error(`   Error: ${result.error}`)
      console.error('')
      console.error('Troubleshooting:')
      console.error('  • Check SES identity is verified in AWS Console')
      console.error('  • Verify IAM permissions for ses:SendEmail')
      console.error('  • If in sandbox mode, verify recipient email address')
      console.error('  • Check environment variables in .env file')
      process.exit(1)
    }
  } catch (error: any) {
    console.error('❌ Fatal error sending email:', error.message)
    console.error('')
    console.error('Stack trace:', error.stack)
    process.exit(1)
  }
}

testEmail()
