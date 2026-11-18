# Plano — controle financeiro 50/30/20

Aplicativo simples para organizar a renda mensal, acompanhar lançamentos e visualizar metas de reserva de emergência e renda passiva.

## Como abrir

Abra `index.html` em um navegador moderno. Não precisa instalar pacotes nem configurar servidor. Para publicar gratuitamente, envie os arquivos deste diretório para um repositório GitHub e habilite **Settings → Pages → Deploy from a branch → main → /(root)**.

## O que está incluído

- Divisão mensal editável, inicialmente em 50% para essenciais, 30% para lazer e 20% para o futuro.
- Registro, filtro e exclusão de entradas e despesas.
- Visão mensal dos lançamentos e comparação dos gastos com os limites planejados.
- Meta de reserva de emergência calculada em seis meses da renda base.
- Estimativa de patrimônio para renda passiva a partir de uma taxa mensal hipotética editável.
- Exportação e importação de cópia dos dados em JSON.
- Layout adaptado para celular e computador.

## Privacidade

Os dados são guardados no `localStorage` do navegador e não são enviados para um servidor. Use **Configurações → Baixar cópia dos dados** antes de limpar os dados do navegador ou trocar de aparelho.

## Premissa da meta de renda passiva

O patrimônio projetado é calculado como renda mensal desejada ÷ taxa mensal estimada. Por exemplo, R$ 3.000 ÷ 1,08% ≈ R$ 277.778. Essa conta é apenas ilustrativa: rendimentos variam, podem ser negativos e sofrem efeitos de impostos e inflação. O sistema não recomenda investimentos nem promete rentabilidade.
