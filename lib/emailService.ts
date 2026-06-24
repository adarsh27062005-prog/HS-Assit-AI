import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer';
import type { AnomalyResult } from '@/types';

/**
 * Dispatches an automated email with HTML formatting and an attached PDF report ledger.
 */
export async function sendDailyReport(
  subject: string, 
  htmlBody: string, 
  pdfBuffer: Buffer
) {
  // Configured using the Gmail shorthand 'service' connection layer to bypass local network firewalls
  const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
      user: process.env.EMAIL_USER, // harini16018@gmail.com
      pass: process.env.EMAIL_PASS, // Your 16-character Google App Password
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Data Quality Engine" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_RECEIVER, // Sending to keerthusara2007@gmail.com
      subject: subject,
      html: htmlBody,
      attachments: [
        {
          filename: `Data_Quality_Report_${new Date().toISOString().split('T')[0]}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    console.log(`✅ SMTP Success: Email successfully sent to ${process.env.EMAIL_RECEIVER}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ SMTP Error: Transmission framework failure:', error);
    throw error;
  }
}

/**
 * Compiles dynamic HTML template trees into automated standalone PDF Binary Buffers via Headless Puppeteer.
 */
export async function generatePdfBuffer(htmlContent: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  
  try {
    const page = await browser.newPage();
    // Use 'load' tracking strategy to ensure fonts and layouts paint completely before snapshotting
    await page.setContent(htmlContent, { waitUntil: 'load' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Generates a static image URL for the email doughnut chart using QuickChart API
 */
export function buildStaticChartUrl(passCount: number, failCount: number): string {
  const chartConfig = {
    type: 'doughnut',
    data: {
      labels: ['Passed Rules', 'Anomalies Detected'],
      datasets: [{ 
        data: [passCount, failCount], 
        backgroundColor: ['#10B981', '#EF4444'] // Tailwind Emerald-500 and Red-500
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        datalabels: { color: '#ffffff', font: { weight: 'bold', size: 14 } }
      }
    }
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=400&h=250`;
}

/**
 * Builds the responsive corporate HTML layout body content for the notification payload template
 */
export function buildReportHtml(results: AnomalyResult[], chartUrl: string): string {
  const totalChecks = results.length;
  const failedChecks = results.filter(r => r.status === 'fail' || r.status === 'warning');
  const passCount = totalChecks - failedChecks.length;

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #333; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background-color: #0f172a; padding: 24px; border-bottom: 4px solid #ea580c; color: #ffffff;">
        <h2 style="margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 0.5px;">Data Quality Audit Ledger</h2>
        <p style="margin: 6px 0 0 0; color: #94a3b8; font-family: monospace; font-size: 12px;">COMPILED ON: ${new Date().toLocaleDateString()} // EXECUTIVE COPY</p>
      </div>
      
      <div style="padding: 24px; background-color: #ffffff;">
        <p style="font-size: 15px; line-height: 1.6; color: #334155;">
          <strong>Execution Matrix Summary:</strong> Automated evaluation engine completed scanning framework rules. <strong>${passCount}</strong> out of <strong>${totalChecks}</strong> constraints verified clean.
        </p>
        
        <div style="text-align: center; margin: 25px 0;">
          <img src="${chartUrl}" alt="Data Quality Summary Chart" style="max-width: 100%; height: auto; border-radius: 8px;" />
        </div>

        <h3 style="color: #0f172a; border-b: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Detected Exceptions Register:</h3>
        <ul style="padding: 0; margin: 15px 0; list-style-type: none;">
          ${failedChecks.length > 0 
            ? failedChecks.map(f => `
                <li style="margin-bottom: 14px; padding: 12px; background-color: #fffafb; border-left: 4px solid ${f.status === 'fail' ? '#ef4444' : '#f59e0b'}; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                  <strong style="color: ${f.status === 'fail' ? '#b91c1c' : '#b45309'}; font-family: monospace; font-size: 13px; display: block; margin-bottom: 3px;">
                    [${f.status.toUpperCase()}] ${f.checkId} // ${f.checkName}
                  </strong> 
                  <span style="font-size: 13px; color: #475569; display: block; font-weight: 500;">${f.message}</span>
                </li>
              `).join('') 
            : '<li style="color: #10b981; font-weight: bold; background-color: #f0fdf4; padding: 16px; border-radius: 6px; text-align: center;">✅ No anomalies detected. System data integrity maps matching 100% precision rules.</li>'}
        </ul>
        
        <div style="text-align: center; margin-top: 35px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}" 
             style="background-color: #ea580c; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px; box-shadow: 0 2px 4px rgba(234,88,12,0.2);">
             Access Action Workspace Dashboard →
          </a>
        </div>
      </div>
    </div>
  `;
}