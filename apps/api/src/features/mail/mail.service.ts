import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { AppConfig } from '../../config/configuration';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text paragraphs; the HTML version is built from them. */
  paragraphs: string[];
  action?: { label: string; url: string };
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Sends transactional email over SMTP. Without SMTP_HOST (local development) messages are
 * written to the log instead, so invitation and reset links can still be followed.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const mail = config.get('mail', { infer: true });
    this.transporter = mail.host
      ? nodemailer.createTransport({
          host: mail.host,
          port: mail.port,
          secure: mail.secure,
          auth: mail.user ? { user: mail.user, pass: mail.pass } : undefined,
        })
      : null;
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Absolute link into the web app; falls back to the request origin when APP_URL is not set. */
  link(path: string, origin?: string): string {
    const base = this.config.get('app', { infer: true }).url || (origin ?? '').replace(/\/+$/, '');
    return `${base}${path}`;
  }

  async send(message: MailMessage): Promise<void> {
    const appName = this.config.get('app', { infer: true }).name;
    const text = [...message.paragraphs, ...(message.action ? [`${message.action.label}: ${message.action.url}`] : [])].join('\n\n');

    if (!this.transporter) {
      if (this.config.get('app', { infer: true }).isProduction) {
        throw new ServiceUnavailableException('Email is not configured on this server. Ask the administrator to set up SMTP.');
      }
      this.logger.warn(`SMTP is not configured; email to ${message.to} not sent.\nSubject: ${message.subject}\n${text}`);
      return;
    }

    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;line-height:1.55">
  <h2 style="font-size:18px;margin:0 0 16px">${escapeHtml(appName)}</h2>
  ${message.paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`).join('\n  ')}
  ${
    message.action
      ? `<p style="margin:22px 0"><a href="${escapeHtml(message.action.url)}" style="background:#0b5cad;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(message.action.label)}</a></p>
  <p style="font-size:12px;color:#6b7280;word-break:break-all">Or paste this link into your browser: ${escapeHtml(message.action.url)}</p>`
      : ''
  }
</div>`;

    try {
      await this.transporter.sendMail({ from: this.config.get('mail', { infer: true }).from, to: message.to, subject: message.subject, text, html });
    } catch (error) {
      this.logger.error(`Could not send email to ${message.to}: ${error}`);
      throw new ServiceUnavailableException('The email could not be sent. Check the SMTP settings and try again.');
    }
  }
}
