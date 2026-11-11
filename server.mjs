import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_DIR = path.join(__dirname, '.certs');
const PFX_PATH = path.join(CERT_DIR, 'party.pfx');
const PFX_PASS = 'party';
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);
const HTTP_PORT = Number(process.env.HTTP_PORT || 8080);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function getLanIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function ensureWindowsCert(lanIPs) {
  const ipManifestPath = path.join(CERT_DIR, 'ips.json');
  const ipKey = JSON.stringify(lanIPs.slice().sort());
  if (fs.existsSync(PFX_PATH) && fs.existsSync(ipManifestPath)) {
    if (fs.readFileSync(ipManifestPath, 'utf8') === ipKey) {
      return fs.readFileSync(PFX_PATH);
    }
  }
  fs.mkdirSync(CERT_DIR, { recursive: true });

  const sanParts = ['DNS=localhost', 'IPAddress=127.0.0.1'];
  for (const ip of lanIPs) {
    sanParts.push(`IPAddress=${ip}`);
  }
  const sanText = sanParts.join('&');
  const escapedPath = PFX_PATH.replace(/'/g, "''");

  const psScript = [
    `$ErrorActionPreference = 'Stop'`,
    `$pwd = ConvertTo-SecureString -String '${PFX_PASS}' -Force -AsPlainText`,
    `$cert = New-SelfSignedCertificate -CertStoreLocation 'Cert:\\CurrentUser\\My' -Subject 'CN=BEAM-Party' -TextExtension @('2.5.29.17={text}${sanText}') -NotAfter (Get-Date).AddYears(2)`,
    `Export-PfxCertificate -Cert $cert -FilePath '${escapedPath}' -Password $pwd | Out-Null`,
    `Remove-Item -Path ("Cert:\\CurrentUser\\My\\" + $cert.Thumbprint) -Force`
  ].join('; ');

  execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
    stdio: 'pipe'
  });

  fs.writeFileSync(ipManifestPath, ipKey, 'utf8');
  return fs.readFileSync(PFX_PATH);
}

function serveStatic(req, res) {
  const rawUrl = (req.url || '/').split('?')[0];
  const relPath = rawUrl === '/' ? 'index.html' : rawUrl.replace(/^\/+/, '');
  const fullPath = path.resolve(__dirname, relPath);

  if (!fullPath.startsWith(__dirname) || relPath.startsWith('.certs')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

const lanIPs = getLanIPs();
let httpsServer = null;

try {
  const pfx = ensureWindowsCert(lanIPs);
  httpsServer = https.createServer({ pfx, passphrase: PFX_PASS }, serveStatic);
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log('\n=== BEAM Party Audio Visualiser ===');
    console.log(`Lokal am PC:          https://localhost:${HTTPS_PORT}`);
    for (const ip of lanIPs) {
      console.log(`iPad / iPhone / WLAN: https://${ip}:${HTTPS_PORT}`);
    }
    console.log('\nHinweis fuer iOS Safari beim ersten Aufruf im WLAN:');
    console.log('Bei Zertifikatswarnung -> "Details anzeigen" -> "Website besuchen".');
    console.log('Danach ueber Teilen -> "Zum Home-Bildschirm" als Vollbild-PWA speichern.\n');
  });
} catch (err) {
  console.warn('HTTPS-Server konnte nicht automatisch gestartet werden:', err.message);
}

const httpServer = http.createServer((req, res) => {
  const host = (req.headers.host || 'localhost').split(':')[0];
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  if (isLocalHost || !httpsServer) {
    serveStatic(req, res);
    return;
  }
  const target = `https://${host}:${HTTPS_PORT}${req.url || '/'}`;
  res.writeHead(302, { Location: target });
  res.end(`Redirecting to ${target}`);
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`PC-Fallback (localhost): http://localhost:${HTTP_PORT}`);
});
