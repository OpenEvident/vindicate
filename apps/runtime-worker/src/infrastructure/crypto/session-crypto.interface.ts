/**
 * @file Session payload encryption seam — disk store depends on this interface only.
 */
export interface ISessionCrypto {
  encrypt(plaintext: string): Promise<Buffer>;
  /** Returns `null` when ciphertext is unreadable (key loss, corruption, wrong version). */
  decrypt(ciphertext: Buffer): Promise<string | null>;
}
