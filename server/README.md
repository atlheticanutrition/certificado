# Servidor de envio do certificado (VPS próprio)

Backend mínimo em Node/Express: recebe o PDF do certificado (gerado no
navegador do totem) e manda por e-mail via **Microsoft Graph**, usando um
app registrado no Azure AD / Entra ID. Sem mensalidade de terceiros — só
usa o e-mail da empresa.

## 1. Configurar o app no Azure AD / Entra ID

App já registrado (portal Azure → **Entra ID** → **Registros de
aplicativo**), com estes valores (já preenchidos em `AZURE_TENANT_ID` e
`AZURE_CLIENT_ID` no `.env`):

- **Directory (tenant) ID:** `2408fe10-48e1-472e-bfb1-0ac7683da3d2`
- **Application (client) ID:** `1cf73857-9528-4960-90d6-51af33c94b82`
- Object ID (`4d065500-6d85-49e2-8b5c-440eee073015`) é só o identificador
  interno do registro no Azure — não é usado em lugar nenhum do `.env`
  nem na autenticação.

Faltam dois passos — nenhum dos IDs acima sozinho autentica:

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
   (já preenchido no `.env` como `endomarketing@adslab.com.br`). Essa
   caixa precisa existir de verdade (licenciada) no Microsoft 365.
   - *Opcional, mais seguro:* restrinja via uma **Application Access
     Policy** (PowerShell do Exchange Online) para que o app só possa
     enviar por essa caixa específica, em vez de qualquer uma do tenant.

Só falta gerar o `AZURE_CLIENT_SECRET` (passo 1 acima) e colar no `.env`.

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
  baseUrl: 'https://certificados-api.suaempresa.com', // URL do SERVIDOR (passo 2), não do site do totem
  apiKey: 'a-mesma-api-key-que-voce-colocou-no-.env-do-servidor'
};
```

⚠️ `baseUrl` é o endereço do **backend Node** (`server/`, passo 2 acima),
rodando no VPS — não a URL onde o totem em si é hospedado (ex:
`atlheticanutrition.github.io/...`, se o front-end for publicado no
GitHub Pages). São duas coisas diferentes: o totem (front-end estático)
chama esse `baseUrl` para enviar o e-mail; o `baseUrl` não pode apontar
para o próprio totem.

Recarregue a página do totem e teste o fluxo completo (buscar
certificado → digitar e-mail → ENVIAR).

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
