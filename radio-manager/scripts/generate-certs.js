#!/usr/bin/env node
/**
 * Generate HTTPS certificates for StreamPi.
 * Creates a local CA and a server certificate so browsers can trust the site
 * after installing the CA certificate (one-time per device/browser).
 *
 * Usage: node scripts/generate-certs.js [output-dir]
 * Default output: ~/.radio-manager/certs or RADIO_MANAGER_DATA/certs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dataDir = process.env.RADIO_MANAGER_DATA || path.join(process.env.HOME || '/home/user', '.radio-manager');
const certDir = process.argv[2] || path.join(dataDir, 'certs');
const caDir = path.join(certDir, 'ca');

const HOSTNAME = process.env.CERT_HOSTNAME || 'raspberrypizero.local';
const CERT_IP_RAW = process.env.CERT_IP || '';
const CERT_IPS = CERT_IP_RAW ? CERT_IP_RAW.split(',').map((s) => s.trim()).filter(Boolean) : [];

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function main() {
  fs.mkdirSync(caDir, { recursive: true });
  fs.mkdirSync(certDir, { recursive: true });

  const caKey = path.join(caDir, 'ca.key');
  const caCert = path.join(caDir, 'ca.pem');
  const serverKey = path.join(certDir, 'server.key');
  const serverCsr = path.join(certDir, 'server.csr');
  const serverCert = path.join(certDir, 'server.pem');
  const extFile = path.join(certDir, 'server.ext');

  if (!fs.existsSync(caKey)) {
    console.log('Creating local CA...');
    run(`openssl genrsa -out "${caKey}" 4096`);
    run(`openssl req -x509 -new -nodes -key "${caKey}" -sha256 -days 3650 -out "${caCert}" -subj "/CN=StreamPi Local CA"`);
  } else {
    console.log('Using existing CA.');
  }

  console.log('Creating server key and certificate...');
  run(`openssl genrsa -out "${serverKey}" 2048`);

  const san = ['DNS:' + HOSTNAME, 'DNS:localhost', 'IP:127.0.0.1'];
  CERT_IPS.forEach((ip) => san.push('IP:' + ip));
  const ext = `authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
subjectAltName=${san.join(',')}`;
  writeFile(extFile, ext);

  run(`openssl req -new -key "${serverKey}" -out "${serverCsr}" -subj "/CN=${HOSTNAME}"`);
  run(`openssl x509 -req -in "${serverCsr}" -CA "${caCert}" -CAkey "${caKey}" -CAcreateserial -out "${serverCert}" -days 3650 -sha256 -extfile "${extFile}"`);

  fs.unlinkSync(serverCsr);
  fs.unlinkSync(extFile);

  console.log('');
  console.log('Certificates written to:', certDir);
  console.log('  server.key, server.pem - used by StreamPi');
  console.log('  ca/ca.pem - install this in your browser/OS to avoid security warnings');
  console.log('');
  console.log('To trust the site:');
  console.log('  1. Copy ca/ca.pem to your computer.');
  console.log('  2. Install as trusted root CA (e.g. Chrome: Settings > Privacy > Security > Manage certificates > Authorities > Import).');
  console.log('  3. Access https://' + HOSTNAME + ':8443');
}

main();
