import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CERTS_DIR = path.join(__dirname, 'data', 'certs');
const KEY_PATH = path.join(CERTS_DIR, 'server.key');
const CERT_PATH = path.join(CERTS_DIR, 'server.crt');
const PEM_PATH = path.join(CERTS_DIR, 'server.pem');

export class CertManager {
  constructor(certsDir = CERTS_DIR) {
    this.certsDir = certsDir;
    this.keyPath = path.join(certsDir, 'server.key');
    this.certPath = path.join(certsDir, 'server.crt');
    this.pemPath = path.join(certsDir, 'server.pem');
  }

  getAvailableIps() {
    const ips = ['127.0.0.1', 'localhost'];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return Array.from(new Set(ips));
  }

  async ensureCertificates(forceRegenerate = false) {
    if (!fs.existsSync(this.certsDir)) {
      fs.mkdirSync(this.certsDir, { recursive: true });
    }

    if (!forceRegenerate && fs.existsSync(this.keyPath) && fs.existsSync(this.certPath)) {
      try {
        const key = fs.readFileSync(this.keyPath, 'utf8');
        const cert = fs.readFileSync(this.certPath, 'utf8');
        const fingerprint = this.computeFingerprint(cert);
        return { key, cert, fingerprint, fromCache: true };
      } catch (err) {
        console.warn('Existing certificates could not be read, regenerating:', err.message);
      }
    }

    console.log('Generating fresh TLS certificates with Subject Alternative Names (SAN)...');
    const ips = this.getAvailableIps();
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' }
    ];

    for (const ip of ips) {
      if (ip !== 'localhost' && ip !== '127.0.0.1') {
        altNames.push({ type: 7, ip });
      }
    }

    const attrs = [
      { name: 'commonName', value: 'Lumino Flashcard MCP' },
      { name: 'countryName', value: 'US' },
      { name: 'organizationName', value: 'Lumino Open Source' },
      { shortName: 'OU', value: 'MCP Server' }
    ];

    const pems = await selfsigned.generate(attrs, {
      keySize: 2048,
      days: 3650, // 10 years validity
      algorithm: 'sha256',
      extensions: [
        {
          name: 'basicConstraints',
          cA: true
        },
        {
          name: 'keyUsage',
          keyCertSign: true,
          digitalSignature: true,
          nonRepudiation: true,
          keyEncipherment: true,
          dataEncipherment: true
        },
        {
          name: 'subjectAltName',
          altNames
        }
      ]
    });

    const privateKey = pems.private;
    const cert = pems.cert;

    fs.writeFileSync(this.keyPath, privateKey, 'utf8');
    fs.writeFileSync(this.certPath, cert, 'utf8');
    fs.writeFileSync(this.pemPath, `${cert}\n${privateKey}`, 'utf8');

    const fingerprint = this.computeFingerprint(cert);
    console.log(`✓ TLS Certificates generated successfully! SHA-256 Fingerprint: ${fingerprint}`);

    return {
      key: privateKey,
      cert,
      fingerprint,
      fromCache: false
    };
  }

  computeFingerprint(certPem) {
    const cleanBase64 = certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
    const der = Buffer.from(cleanBase64, 'base64');
    return crypto.createHash('sha256').update(der).digest('hex').match(/.{1,2}/g).join(':').toUpperCase();
  }

  async getCertificatePem() {
    if (fs.existsSync(this.certPath)) {
      return fs.readFileSync(this.certPath, 'utf8');
    }
    const res = await this.ensureCertificates();
    return res.cert;
  }
}
