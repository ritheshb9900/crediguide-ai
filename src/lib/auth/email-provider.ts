import {
  IEmailProvider,
  EmailPayload,
  EmailDeliveryResult,
  DevEmailSinkRecord,
} from "./types";
import { maskEmail, maskTokenPrefix } from "./tokens";

/**
 * Isolated development in-memory sink storing dispatched test email records.
 * Accessible ONLY within test suites and server-side evaluation scripts.
 * NO public HTTP retrieval endpoint is exposed.
 */
class DevEmailSinkManager {
  private sink: DevEmailSinkRecord[] = [];

  record(email: DevEmailSinkRecord): void {
    this.sink.unshift(email);
    // Keep at most 50 recent records in memory
    if (this.sink.length > 50) {
      this.sink.pop();
    }
  }

  getRecords(): readonly DevEmailSinkRecord[] {
    return [...this.sink];
  }

  getLatest(): DevEmailSinkRecord | undefined {
    return this.sink[0];
  }

  findLatestFor(email: string): DevEmailSinkRecord | undefined {
    const normalized = email.toLowerCase().trim();
    return this.sink.find((record) => record.to.toLowerCase() === normalized);
  }

  clearFor(email: string): number {
    const normalized = email.toLowerCase().trim();
    const initialCount = this.sink.length;
    this.sink = this.sink.filter((record) => record.to.toLowerCase() !== normalized);
    return initialCount - this.sink.length;
  }

  clear(): void {
    this.sink = [];
  }
}

export const DevEmailSink = new DevEmailSinkManager();

/**
 * Development email provider for local development and offline automated testing.
 *
 * SECURITY POLICY:
 * - NEVER prints raw tokens, plaintext passwords, or complete actionable reset URLs to stdout.
 * - Emits sanitized, masked metadata logs.
 * - Stores the full record in `DevEmailSink` so automated test suites can verify links.
 */
export class DevelopmentEmailProvider implements IEmailProvider {
  readonly providerName = "DevelopmentEmailProvider";

  async sendPasswordReset(payload: EmailPayload): Promise<EmailDeliveryResult> {
    const maskedRecipient = maskEmail(payload.to);
    const maskedToken = payload.tokenHashPrefix ? maskTokenPrefix(payload.tokenHashPrefix) : "****";

    // Safe, masked console logging (Zero raw token leakage)
    if (process.env.NODE_ENV !== "test") {
      console.log(
        `[DEV EMAIL SINK] Type: PASSWORD_RESET | Recipient: ${maskedRecipient} | ` +
        `TokenPrefix: ${maskedToken} | ExpiresIn: ${payload.expiresInMinutes}m (Raw token masked)`
      );
    }

    const messageId = `dev-reset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Store in isolated test sink
    DevEmailSink.record({
      id: messageId,
      type: "PASSWORD_RESET",
      to: payload.to,
      recipientName: payload.recipientName,
      actionUrl: payload.actionUrl,
      expiresInMinutes: payload.expiresInMinutes,
      timestamp: new Date(),
    });

    return {
      success: true,
      messageId,
    };
  }

  async sendEmailVerification(payload: EmailPayload): Promise<EmailDeliveryResult> {
    const maskedRecipient = maskEmail(payload.to);
    const maskedToken = payload.tokenHashPrefix ? maskTokenPrefix(payload.tokenHashPrefix) : "****";

    // Safe, masked console logging (Zero raw token leakage)
    if (process.env.NODE_ENV !== "test") {
      console.log(
        `[DEV EMAIL SINK] Type: EMAIL_VERIFICATION | Recipient: ${maskedRecipient} | ` +
        `TokenPrefix: ${maskedToken} | ExpiresIn: ${payload.expiresInMinutes}m (Raw token masked)`
      );
    }

    const messageId = `dev-verify-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Store in isolated test sink
    DevEmailSink.record({
      id: messageId,
      type: "EMAIL_VERIFICATION",
      to: payload.to,
      recipientName: payload.recipientName,
      actionUrl: payload.actionUrl,
      expiresInMinutes: payload.expiresInMinutes,
      timestamp: new Date(),
    });

    return {
      success: true,
      messageId,
    };
  }
}

/**
 * Disabled email provider used in production when no production outbound service is configured.
 *
 * SECURITY POLICY:
 * - NEVER claims successful delivery when no email was sent.
 * - Honestly reports failure with a descriptive error code.
 */
export class DisabledEmailProvider implements IEmailProvider {
  readonly providerName = "DisabledEmailProvider";

  async sendPasswordReset(_payload: EmailPayload): Promise<EmailDeliveryResult> {
    void _payload;
    return {
      success: false,
      error: "OUTBOUND_EMAIL_DISABLED: No production outbound email service is configured. Password reset email was not dispatched.",
    };
  }

  async sendEmailVerification(_payload: EmailPayload): Promise<EmailDeliveryResult> {
    void _payload;
    return {
      success: false,
      error: "OUTBOUND_EMAIL_DISABLED: No production outbound email service is configured. Verification email was not dispatched.",
    };
  }
}

let cachedEmailProvider: IEmailProvider | null = null;

/**
 * Factory returning the active email provider.
 * Selects `DevelopmentEmailProvider` in development/test, or `DisabledEmailProvider`
 * in production if no real provider is configured.
 */
export function getEmailProvider(): IEmailProvider {
  if (cachedEmailProvider) {
    return cachedEmailProvider;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const configuredProvider = process.env.EMAIL_PROVIDER?.toUpperCase();

  if (isProduction) {
    if (configuredProvider === "DISABLED" || !configuredProvider) {
      cachedEmailProvider = new DisabledEmailProvider();
      return cachedEmailProvider;
    }
    // Future production providers (e.g. SMTP, SES, SendGrid) will hook in here
    cachedEmailProvider = new DisabledEmailProvider();
    return cachedEmailProvider;
  }

  // Development and test environments
  cachedEmailProvider = new DevelopmentEmailProvider();
  return cachedEmailProvider;
}

/**
 * Resets the cached email provider instance (useful for test isolation).
 */
export function resetEmailProviderInstance(instance?: IEmailProvider): void {
  cachedEmailProvider = instance ?? null;
}
