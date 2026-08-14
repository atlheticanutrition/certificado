# Atualizar os certificados a partir da planilha

O totem busca os certificados em `certificados-data.js` (na raiz do projeto),
um arquivo gerado a partir de `assets/Modelo Certificado.xlsx`. Ele **não** lê o
Excel em tempo real — é preciso regenerá-lo sempre que a planilha mudar.

## Colunas esperadas na planilha (aba "Planilha Modelo")

| Coluna | Exemplo |
| --- | --- |
| CPF | 47167140805 (11 dígitos, sem pontuação) |
| Ano de Nascimento | 2000 |
| Chave de Validação | 08052000 (opcional — só usada para conferência) |
| Nome Completo | Auderico Audérico da Silva |
| Treinamento/Curso | BPF |
| Data de Conclusão | 13/08/2026 |

> Dica: formate as colunas **CPF** e **Ano de Nascimento** como *Texto* no Excel
> para evitar perder zeros à esquerda.

A busca no totem usa os **últimos 4 dígitos do CPF** + o **ano de nascimento**
— exatamente o que a pessoa digita na tela de consulta.

## Como regenerar `certificados-data.js`

1. Abra um terminal nesta pasta (`tools/`).
2. Instale a dependência (só precisa fazer isso uma vez):
   ```
   npm install xlsx
   ```
3. Rode o script:
   ```
   node gerar-dados.js
   ```
4. Ele reescreve `../certificados-data.js`. Nenhuma outra alteração é necessária
   — é só recarregar a página do totem.

Se preferir, basta pedir para o Claude Code "atualizar os certificados a
partir da planilha" depois de editar o Excel.
