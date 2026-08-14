/* ===================================================================
   Envio do certificado por WhatsApp usando Baileys (não-oficial).

   ⚠️ Isso conecta como um cliente WhatsApp Web comum, usando o número
   de telefone da empresa. Não é a API oficial da Meta — funciona sem
   aprovação prévia e sem custo por mensagem, mas está fora dos Termos
   de Uso do WhatsApp para automação e carrega risco real de o número
   ser banido, principalmente com uso contínuo. Ver server/README.md.

   Sessão fica salva em ./whatsapp-auth (gitignored). Na primeira vez
   (ou sempre que a sessão for encerrada), um QR code aparece no
   terminal — escaneie com o WhatsApp do celular da empresa em
   Aparelhos conectados.
   =================================================================== */
const path = require('path');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const AUTH_DIR = path.join(__dirname, 'whatsapp-auth');
const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || 'silent' });

var sock = null;
var connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
var lastQrDataUrl = null;

async function connect() {
  connectionStatus = 'connecting';
  var authState = await useMultiFileAuthState(AUTH_DIR);
  var state = authState.state;
  var saveCreds = authState.saveCreds;
  var version = (await fetchLatestBaileysVersion()).version;

  sock = makeWASocket({
    auth: state,
    version: version,
    logger: logger,
    browser: ['Totem Certificados', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', function (update) {
    if (update.qr) {
      lastQrDataUrl = null;
      console.log('\n=== Escaneie este QR code no WhatsApp do celular da empresa (Aparelhos conectados) ===\n');
      qrcodeTerminal.generate(update.qr, { small: true });
      QRCode.toDataURL(update.qr).then(function (dataUrl) {
        lastQrDataUrl = dataUrl;
      }).catch(function () {});
    }

    if (update.connection === 'open') {
      connectionStatus = 'connected';
      lastQrDataUrl = null;
      console.log('WhatsApp conectado.');
    }

    if (update.connection === 'close') {
      connectionStatus = 'disconnected';
      var statusCode = update.lastDisconnect &&
        update.lastDisconnect.error &&
        update.lastDisconnect.error.output &&
        update.lastDisconnect.error.output.statusCode;
      var loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        console.error('Sessão do WhatsApp encerrada (logout). Apague a pasta whatsapp-auth/ e reinicie o servidor para escanear um novo QR code.');
      } else {
        console.warn('Conexão com o WhatsApp caiu, reconectando...');
        connect().catch(function (err) {
          console.error('Falha ao reconectar ao WhatsApp:', err);
        });
      }
    }
  });
}

function getStatus() {
  return connectionStatus;
}

function getQrDataUrl() {
  return lastQrDataUrl;
}

// Aceita número com ou sem "55" na frente; tenta variações comuns de
// telefone brasileiro (com/sem o 9º dígito) até achar uma que exista
// no WhatsApp.
async function resolveJid(telefoneDigitado) {
  var digits = String(telefoneDigitado || '').replace(/\D/g, '');
  if (!digits) return null;

  var candidates = [];
  var comCodigoPais = digits.indexOf('55') === 0 ? digits : '55' + digits;
  candidates.push(comCodigoPais);

  // Número brasileiro: 55 + DDD (2) + 9 dígitos (celular moderno).
  // Se vier sem o "9" (55 + DDD + 8 dígitos), tenta também com o 9.
  var semPais = comCodigoPais.slice(2);
  if (semPais.length === 10) {
    candidates.push('55' + semPais.slice(0, 2) + '9' + semPais.slice(2));
  } else if (semPais.length === 11 && semPais.charAt(2) === '9') {
    candidates.push('55' + semPais.slice(0, 2) + semPais.slice(3));
  }

  var results = await sock.onWhatsApp.apply(sock, candidates);
  var found = (results || []).find(function (r) { return r.exists; });
  return found ? found.jid : null;
}

async function sendCertificado(telefoneDigitado, dados) {
  if (connectionStatus !== 'connected' || !sock) {
    var err = new Error('WhatsApp não está conectado no momento.');
    err.code = 'WHATSAPP_NOT_CONNECTED';
    throw err;
  }

  var jid = await resolveJid(telefoneDigitado);
  if (!jid) {
    var err2 = new Error('Esse número não tem WhatsApp ativo.');
    err2.code = 'NUMBER_NOT_ON_WHATSAPP';
    throw err2;
  }

  var caption = 'Olá ' + (dados.nome || '') + ',\n\n' +
    'Segue o certificado do curso/treinamento "' + (dados.curso || '') + '", ' +
    'concluído em ' + (dados.dataConclusao || '') + '.\n\n' +
    'Atlhetica Nutrition';

  await sock.sendMessage(jid, {
    document: dados.pdfBuffer,
    mimetype: 'application/pdf',
    fileName: 'certificado.pdf',
    caption: caption
  });
}

module.exports = {
  connect: connect,
  getStatus: getStatus,
  getQrDataUrl: getQrDataUrl,
  sendCertificado: sendCertificado
};
