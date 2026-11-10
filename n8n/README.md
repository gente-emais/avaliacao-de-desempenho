# Automações no n8n

O sistema não manda e-mail sozinho: ele registra o que precisa ser avisado e o n8n envia pelo e-mail corporativo.

## 1. Link de primeiro acesso e troca de senha (obrigatório para os colaboradores entrarem)

1. No n8n, crie um fluxo com um nó **Webhook** (método POST). Copie a URL de produção.
2. Ligue o webhook a um nó de **e-mail** (SMTP corporativo ou Outlook/Gmail) com:
   - Para: `{{$json.body.email}}`
   - Assunto: `Seu acesso ao EMAIS Desempenho`
   - Texto: `Olá, {{$json.body.nome}}. Clique para criar sua senha: {{$json.body.link}}` (o link vale por 24 horas)
3. No Supabase: **Edge Functions > Secrets**, crie `N8N_WEBHOOK_ACESSO` com a URL do webhook.

## 2. Avisos e lembretes das rodadas (próxima etapa)

O n8n roda todo dia às 8h, consulta o Supabase e envia:

| Gatilho | Quem recebe |
| --- | --- |
| Abertura de etapa | Participantes com login e gestores |
| 7 e 2 dias antes do fim da etapa | Quem tem pendência |
| Prazo vencido | Quem tem pendência e o gestor |
| Operacional Obras com pendência | Só o gestor |
| Contratação sem aceite | Colaborador |
| Feedback registrado | Colaborador |
| Combinado de One a One vencendo | Responsável |
| Resultado liberado | Colaborador e gestor |
| Resumo semanal | RH |

Lembretes pedidos pela tela de Acompanhamento entram na tabela `notificacoes` com status `pendente`;
o fluxo lê essa fila, envia e marca `enviado`. Para pessoas com acesso assistido, o aviso vai ao gestor.
Os fluxos exportados ficam nesta pasta quando forem criados.
