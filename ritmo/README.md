# Ritmo+ — Alta Performance (MVP)

Um aplicativo de produtividade com Dashboard, Minha Semana, Metas, Agenda, Análise e Configurações.

## Como utilizar

- Abra `index.html` na pasta `ritmo/` ou acesse a versão hospedada, quando o GitHub Pages estiver ativo. É a versão em arquivo único, sem necessidade de instalar bibliotecas.
- Este repositório hospeda a versão HTML autocontida em `ritmo/index.html`.
- Crie tarefas, marque como concluídas, defina metas, agende compromissos e acompanhe indicadores.
- Em Configurações, use **Exportar backup** para salvar os registros em JSON e **Importar backup** para restaurá-los.
- O botão "Ver exemplo" só cria dados fictícios quando você solicitar; podem ser removidos nos ajustes.

## Limitações reais

- Os registros ficam no localStorage do navegador. Não há conta, sincronização entre dispositivos ou armazenamento na nuvem. Limpar dados do site ou mudar de navegador pode apagar os registros. Faça backups.
- O arquivo único permite testar sem servidor; para uso constante, hospede o conteúdo por HTTPS para obter uma origem web estável.
- A agenda ainda **não sincroniza com Google Agenda**.
- `Minutos previstos concluídos` é a soma da duração estimada de tarefas marcadas concluídas, não um cronômetro.
- Conclusão semanal = feitas / planejadas desde segunda até hoje. Tarefas futuras não são penalizadas.
- Consistência = dias com pelo menos 80% concluído / dias com tarefas nos últimos sete dias.
- Ainda é um MVP para validação, não um SaaS comercial pronto.

## Próximos passos para um SaaS

1. Autenticação individual, banco Postgres e políticas de acesso por usuário.
2. Backups automatizados, privacidade e validação de segurança.
3. Sincronização Google Agenda com OAuth e controles de consentimento.
4. Lembretes e notificações, planos e cobrança após testes com usuários.

## Testes

O arquivo-fonte local foi verificado com `node test.js` antes da publicação. O teste não está incluído nesta pasta publicada.

Copyright (c) 2026. Protótipo original para evolução do projeto.