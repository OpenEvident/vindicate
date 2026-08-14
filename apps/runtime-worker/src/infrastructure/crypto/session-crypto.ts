/**
 * @file AES-256-GCM via OS keyring, or plaintext mode for local debugging.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Entry } from "@napi-rs/keyring";

import type { ISessionCrypto } from "./session-crypto.interface.js";

const MAGIC = Buffer.from("ORD1", "ascii");
const IV_LEN = 12;
const TAG_LEN = 16;
const KEYRING_SERVICE = "vindicate-runtime-worker";
const KEYRING_USER = "session-aes-256-key-v1";

export class PlaintextSessionCrypto implements ISessionCrypto {
  encrypt(plaintext: string): Promise<Buffer> {
    return Promise.resolve(Buffer.from(plaintext, "utf8"));
  }

  decrypt(ciphertext: Buffer): Promise<string | null> {
    try {
      return Promise.resolve(ciphertext.toString("utf8"));
    } catch {
      return Promise.resolve(null);
    }
  }
}

export class KeyringSessionCrypto implements ISessionCrypto {
  private readonly entry = new Entry(KEYRING_SERVICE, KEYRING_USER);

  private getOrCreateKey(): Buffer {
    const existing = this.entry.getPassword();
    if (existing !== null && existing.length > 0) {
      return Buffer.from(existing, "hex");
    }
    const key = randomBytes(32);
    this.entry.setPassword(key.toString("hex"));
    return key;
  }

  encrypt(plaintext: string): Promise<Buffer> {
    const key = this.getOrCreateKey();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Promise.resolve(Buffer.concat([MAGIC, iv, tag, enc]));
  }

  decrypt(ciphertext: Buffer): Promise<string | null> {
    try {
      if (ciphertext.length < MAGIC.length + IV_LEN + TAG_LEN + 1) {
        return Promise.resolve(null);
      }
      if (!ciphertext.subarray(0, MAGIC.length).equals(MAGIC)) {
        return Promise.resolve(null);
      }
      const key = this.getOrCreateKey();
      const iv = ciphertext.subarray(MAGIC.length, MAGIC.length + IV_LEN);
      const tag = ciphertext.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
      const data = ciphertext.subarray(MAGIC.length + IV_LEN + TAG_LEN);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(data), decipher.final()]);
      return Promise.resolve(plain.toString("utf8"));
    } catch {
      return Promise.resolve(null);
    }
  }
}
