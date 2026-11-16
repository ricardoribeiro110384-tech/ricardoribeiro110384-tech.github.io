# OfertaFlash 2.0 — Central de campanhas

**Abrir:** https://ricardoribeiro110384-tech.github.io/ofertaflash/

Aplicativo estático para pequenos comércios criarem campanhas a partir de dados de produtos e preços.

## Funcionalidades da versão 2.0

- Cadastro de produtos com código, nome, categoria, preço, preço anterior, custo, estoque e foto.
- Importação CSV/Excel com detecção automática e escolha manual das colunas; atualizar por código/nome, apenas adicionar ou substituir.
- Análise de margem bruta, alertas de estoque zerado, preço abaixo do custo, margem abaixo da meta e preço anterior inconsistente.
- Campanhas de até 48 produtos, com 4, 6, 9 ou 12 itens por página e paginação automática.
- Encartes A4, Stories, posts quadrados e artes para TV.
- Exportação PNG, impressão A4/PDF, texto para WhatsApp e kit ZIP com as artes de todos os formatos.
- Identidade visual configurável (nome, logotipo, telefone, cor).

## Como começar

1. Abra o aplicativo, remova os produtos demonstrativos e importe um CSV/Excel real (há modelo CSV disponível).
2. Confira preços, estoque e custo, e revise os alertas no painel.
3. Selecione produtos, escolha a quantidade por página e configure título, data, cor e formato.
4. Exporte a campanha.

## Limitações

Os dados ficam apenas no navegador (localStorage), sem sincronização ou contas. A margem bruta é estimada: não inclui frete, taxas ou impostos. O sistema não pesquisa preços de concorrentes, não publica automaticamente em redes e não substitui conferência humana. Nunca publique preços de demonstração. Leitura Excel e criação ZIP dependem de bibliotecas externas carregadas por internet; CSV, PNG e impressão funcionam sem elas.

Para desenvolvimento local, abra `index.html` em um navegador moderno.
