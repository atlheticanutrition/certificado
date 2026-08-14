/* ===================================================================
   Envio de e-mail via Microsoft Graph, usando um app registrado no
   Azure AD / Entra ID (fluxo "client credentials" — app-only, sem
   depender de um usuário logado).

   Requer no .env:
     AZURE_TENANT_ID     - Directory (tenant) ID do app no Azure AD
     AZURE_CLIENT_ID     - Application (client) ID do app
     AZURE_CLIENT_SECRET - Client secret criado em "Certificados e segredos"
     GRAPH_SENDER_EMAIL  - caixa de e-mail que vai aparecer como remetente
                            (precisa existir de verdade no tenant, e o app
                            precisa ter a permissão de aplicativo Mail.Send
                            consentida por um administrador do tenant)

   Passo a passo completo em server/README.md.
   =================================================================== */

var TENANT_ID = process.env.AZURE_TENANT_ID;
var CLIENT_ID = process.env.AZURE_CLIENT_ID;
var CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
var SENDER_EMAIL = process.env.GRAPH_SENDER_EMAIL;

var cachedToken = null;
var cachedTokenExpiresAt = 0; // epoch ms

function isConfigured() {
  return !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET && SENDER_EMAIL);
}

async function getAccessToken() {
  var now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) {
    return cachedToken;
  }

  var url = 'https://login.microsoftonline.com/' + TENANT_ID + '/oauth2/v2.0/token';
  var params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  var data = await res.json();

  if (!res.ok) {
    throw new Error(
      'Falha ao obter token do Azure AD: ' + (data.error_description || data.error || res.status)
    );
  }

  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + (Number(data.expires_in || 3600) - 60) * 1000; // renova 60s antes de expirar
  return cachedToken;
}

/**
 * @param {{to: string, subject: string, text: string, attachments?: {filename: string, content: Buffer, contentType: string}[]}} options
 */
async function sendMail(options) {
  if (!isConfigured()) {
    throw new Error(
      'Microsoft Graph não configurado — defina AZURE_TENANT_ID, AZURE_CLIENT_ID, ' +
      'AZURE_CLIENT_SECRET e GRAPH_SENDER_EMAIL no .env.'
    );
  }

  var token = await getAccessToken();

  var message = {
    subject: options.subject,
    body: { contentType: 'Text', content: options.text },
    toRecipients: [{ emailAddress: { address: options.to } }],
    attachments: (options.attachments || []).map(function (att) {
      return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType,
        contentBytes: att.content.toString('base64')
      };
    })
  };

  var res = await fetch(
    'https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(SENDER_EMAIL) + '/sendMail',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: message, saveToSentItems: false })
    }
  );

  if (res.status !== 202) {
    var errBody = await res.text();
    throw new Error('Graph sendMail falhou (' + res.status + '): ' + errBody);
  }
}

module.exports = { sendMail: sendMail, isConfigured: isConfigured };
