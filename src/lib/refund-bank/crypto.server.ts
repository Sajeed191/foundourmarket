/**
 * Returns & Refunds v2.0 — envelope encryption for customer bank details.
 *
 * AES-256-GCM at rest. The key is derived from REFUND_BANK_ENCRYPTION_KEY
 * (read inside functions, never at module scope). Plain-text account numbers,
 * IFSC codes and UPI IDs never touch the database, logs or audit rows.
 *
 * SERVER ONLY.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const KEY_VERSION = 1;

export type SensitivePayload = {
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
};

function key(): Buffer {
  const secret = process.env.REFUND_BANK_ENCRYPTION_KEY;
  if (!secret) throw new Error("Refund bank encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}

export function encryptPayload(payload: SensitivePayload): {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

export function decryptPayload(
  ciphertext: string | null,
  iv: string | null,
  tag: string | null,
): SensitivePayload | null {
  if (!ciphertext || !iv || !tag) return null;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString("utf8")) as SensitivePayload;
}
