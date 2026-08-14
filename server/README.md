# Servidor de envio do certificado (VPS próprio)

Backend mínimo em Node/Express: recebe o PDF do certificado (gerado no
navegador do totem) e manda por e-mail via **Microsoft Graph**, usando um
app registrado no Azure AD / Entra ID. Sem mensalidade de terceiros — só
usa o e-mail da empresa.

## 1. Configurar o app no Azure AD / Entra ID

Se você já registrou o app (portal Azure → **Entra ID** → **Registros de
aplicativo**) e tem o **Application (client) ID** e o **Directory (tenant)
ID**, faltam dois passos — o Object ID sozinho não é suficiente para
autenticar:

1. **Criar o client secret:** no app → **Certificados e segredos** → **Novo
   segredo do cliente**. Copie o **Value** assim que for gerado (some da
   tela depois) — isso vai em `AZURE_CLIENT_SECRET`.
2. **Conceder a permissão de aplicativo `Mail.Send`:** no app → **Permissões
   de API** → **Adicionar uma permissão** → **Microsoft Graph** → **Permissões
   de aplicativo** (não "delegadas") → busque e marque `Mail.Send`. Depois
   clique em **Conceder consentimento do administrador** (precisa de um
   admin do tenant) — sem isso o envio falha com erro 403.
3. **Escolher a caixa de e-mail remetente:** app-only `Mail.Send` pode
   enviar como qualquer caixa do tenant, então defina em
   `GRAPH_SENDER_EMAIL` o endereço real que deve aparecer como remetente
   (ex: `certificados@suaempresa.com`). Essa caixa precisa existir de
   verdade (licenciada) no Microsoft 365.
   - *Opcional, mais seguro:* restrinja via uma **Application Access
     Policy** (PowerShell do Exchange Online) para que o app só possa
     enviar por essa caixa específica, em vez de qualquer uma do tenant.

Anote os 3 valores (tenant, client ID, client secret) e o
`GRAPH_SENDER_EMAIL` — eles vão no `.env` no passo seguinte.

## 2. Subir o servidor no VPS

```bash
# no VPS, dentro de uma pasta do projeto
git clone <seu-repo>   # ou copie a pasta server/ para o VPS
cd server
npm install
cp .env.example .env
nano .env               # preencha API_KEY, AZURE_TENANT_ID, AZURE_CLIENT_ID,
                        # AZURE_CLIENT_SECRET, GRAPH_SENDER_EMAIL
```

Gere uma `API_KEY` aleatória, por exemplo:
```bash
openssl rand -hex 32
```

Teste manualmente antes de colocar em produção:
```bash
node index.js
# em outro terminal:
curl http://localhost:3001/api/health
# deve responder {"ok":true}
```

### Manter rodando (pm2)

```bash
npm install -g pm2
pm2 start index.js --name toten-certificado
pm2 save
pm2 startup   # segue as instruções impressas para iniciar no boot
```

### Deixar acessível por HTTPS

O totem (JavaScript no navegador) vai chamar esse servidor por HTTPS.
Duas opções:

- **Já tem nginx/Caddy na frente de outros sites nesse VPS:** adicione
  um `proxy_pass` para `http://localhost:3001` num subdomínio (ex:
  `certificados-api.suaempresa.com`), com certificado (Certbot/Let's
  Encrypt ou Caddy automático).
- **Não tem nada na frente ainda:** instale o Caddy (mais simples —
  emite HTTPS sozinho):
  ```
  certificados-api.suaempresa.com {
    reverse_proxy localhost:3001
  }
  ```

Anote a URL pública final (ex: `https://certificados-api.suaempresa.com`)
— ela vai em `server-config.js` no totem.

## 3. Configurar o totem

No projeto do totem, abra `server-config.js` e preencha:

```js
window.TOTEM_API_CONFIG = {
  baseUrl: 'https://certificados-api.suaempresa.com',
  apiKey: 'a-mesma-api-key-que-voce-colocou-no-.env-do-servidor'
};
```

Recarregue a página do totem e teste o fluxo completo (buscar
certificado → digitar e-mail → ENVIAR).

## 4. WhatsApp (opcional)

> ⚠️ **Leia antes de ativar.** O envio por WhatsApp usa
> [Baileys](https://github.com/WhiskeySockets/Baileys), uma biblioteca
> **não-oficial** que conecta como um WhatsApp Web comum — não é a API
> oficial da Meta. Isso significa: sem aprovação prévia, sem custo por
> mensagem, envia o PDF livremente. Em troca, **está fora dos Termos de
> Uso do WhatsApp** para automação e há risco real do número ser
> banido, principalmente com uso contínuo. Recomendações:
> - Use um número **dedicado** ao totem, não o WhatsApp pessoal de
>   alguém nem o número principal da empresa.
> - Se o número for banido, o único remédio é trocar de número (ou
>   migrar pra API oficial da Meta — outra conversa, outro custo).
> - Mantenha o volume baixo (é um totem de certificados, não disparo em
>   massa) — isso reduz bastante o risco de detecção.

### Ativar

1. No `.env`, defina `WHATSAPP_ENABLED=true`.
2. Suba o servidor (`node index.js` ou `pm2 restart toten-certificado`)
   e acompanhe o log/terminal — um QR code aparece ali.
3. Escaneie com o WhatsApp do celular da empresa: **Aparelhos
   conectados → Conectar um aparelho**.
4. Quando aparecer `WhatsApp conectado.` no log, está pronto. A sessão
   fica salva em `server/whatsapp-auth/` (nunca comite essa pasta — dá
   acesso total à conta do WhatsApp).

Se preferir escanear pelo navegador em vez do terminal do VPS, acesse
(com o header `X-Totem-Key`, ex. via uma extensão de API ou
`curl -H "X-Totem-Key: SUA_CHAVE" https://.../api/whatsapp-qr -o qr.png`)
o endpoint `GET /api/whatsapp-qr`, que devolve o QR atual como PNG.

### Se a sessão cair ou for desconectada

- Queda de conexão normal: o servidor reconecta sozinho.
- **Logout** (desconectado manualmente pelo celular, ou banido): apague
  a pasta `server/whatsapp-auth/` e reinicie o servidor para escanear
  um QR code novo.

## Segurança — o que esse endpoint tem e o que ele não tem

- **Tem:** chave secreta obrigatória (`X-Totem-Key`), limite de 20
  envios por IP a cada 10 minutos, limite de tamanho do PDF (~3MB),
  validação de formato de e-mail.
- **Não tem:** checagem de origem (CORS liberado) — de propósito,
  porque o totem pode abrir o HTML como arquivo local (`file://`), que
  não manda uma origem utilizável para CORS. A proteção real é a API
  key. Se quiser travar por origem também (ex: se o totem for servido
  por um domínio fixo), me avise que eu adiciono.
- A `API_KEY` fica visível em `server-config.js` no navegador do totem
  (é inevitável em qualquer chamada feita do cliente) — ela serve para
  filtrar tráfego aleatório de bots na internet, não para segredo
  militar. Se um dia isso virar alvo de abuso, dá pra trocar a chave
  facilmente (.env do servidor + server-config.js do totem).
