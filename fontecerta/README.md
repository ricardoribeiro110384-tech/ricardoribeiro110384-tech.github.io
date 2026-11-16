# FonteCerta — versão web publicada

O **FonteCerta** conecta o consumidor às informações e instruções disponibilizadas pelo fabricante de um produto.

## Acesso
Endereço de publicação esperado no GitHub Pages:
https://ricardoribeiro110384-tech.github.io/fontecerta/

> A disponibilidade depende do GitHub Pages estar ativado no repositório e publicado a partir de `main` na pasta raiz (`/root`).

## Funcionalidades desta versão
- Pesquisa por produto, fabricante ou EAN/GTIN.
- Leitura de código de barras e QR Code pela câmera (necessita HTTPS, permissão e biblioteca externa).
- Cadastro local de produtos com verificação do dígito do GTIN.
- Registro de página oficial, link de manual ou bula e vídeo oficial.
- QR Code estático que abre diretamente a página oficial.
- Impressão, download PNG e backup/importação JSON do catálogo.
- Layout adaptado para celular e computador.

## Limitações importantes
- Os cadastros são locais (`localStorage`): não sincronizam entre dispositivos.
- O QR gerado **não aponta para a ficha local**; ele abre o site oficial cadastrado.
- A seleção das fontes e a conferência do produto são manuais.
- Uma URL marcada como conferida foi revisada pelo operador, não certificada pelo fabricante.
- A leitura pela câmera e a geração de QR dependem das bibliotecas carregadas por CDN.
- A versão com banco online, autenticação e fichas compartilhadas exige Supabase dedicado e configuração separada.

## Segurança e medicamentos
Aceita apenas URLs HTTPS. Não oferece instruções médicas e não substitui bulas. Para medicamentos, confira a correspondência exata com o produto e o Bulário da Anvisa.

## Organização
Esta pasta é isolada do restante do repositório GitHub Pages. Os arquivos existentes na raiz não foram modificados.

## Próxima etapa
Criar repositório dedicado e conectar o catálogo online ao Supabase com acesso administrativo protegido, revisão dos links e QR de ficha persistente.
