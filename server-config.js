/* ===================================================================
   Configuração do backend de envio do certificado (VPS próprio).

   Preencha os 2 valores abaixo depois de colocar o servidor no ar.
   Passo a passo completo em: server/README.md

   Enquanto "baseUrl" estiver com o valor de exemplo, o botão ENVIAR
   gera o PDF normalmente mas mostra um aviso em vez de enviar.
   =================================================================== */
window.TOTEM_API_CONFIG = {
  baseUrl: 'COLE_AQUI_A_URL_DO_SERVIDOR', // ex: https://certificados-api.suaempresa.com
  apiKey: 'COLE_AQUI_A_MESMA_API_KEY_DO_ENV_DO_SERVIDOR'
};
