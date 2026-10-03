# Vade Mecum

App (PWA) de legislação brasileira com atualização automática a partir do site do Planalto.

Leis incluídas: CF/88, Código Civil, CPC, Código Penal, CPP, CLT, CDC, CTN e ECA.

Súmulas: Vinculantes do STF, STF e STJ (scripts/sumulas.mjs lê PDF ou HTML dos tribunais). Os endereços estão em scripts/fontes.json; se um tribunal mudar o link, a Action mostra o erro e os dados antigos são mantidos. Basta trocar a url e rodar de novo.

Leitura: o app guarda onde você parou em cada lei e retoma ao abrir. Em Ajustes de leitura dá para trocar o fundo para branco.

Marcações: selecione um trecho e escolha uma das quatro cores. Toque numa marcação para trocar a cor ou removê-la. Ficam salvas no aparelho (localStorage) e se reposicionam sozinhas se o texto da lei mudar; se o trecho deixar de existir, a marcação some.

## Como publicar no GitHub Pages

1. Crie um repositório novo e envie todos os arquivos desta pasta (inclusive `.github`, `.gitignore` e `.nojekyll`). Não envie `node_modules`.
2. Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. Em **Settings → Actions → General → Workflow permissions**, marque *Read and write permissions*.
4. Na aba **Actions**, abra *Atualizar leis* e clique em **Run workflow** para fazer a primeira carga.
5. Depois disso o robô roda sozinho todo dia às 6h (horário de Manaus).

Enquanto `data/indice.json` não existir, o app mostra uma amostra embutida com alguns artigos.

## Como funciona

```
Planalto (HTML) ──► scripts/parser.mjs ──► data/leis/<id>.json
                         │
       scripts/atualizar.mjs compara com a versão anterior
                         │
          data/indice.json  +  data/mudancas.json  ──►  app (index.html)
```

- Texto riscado no Planalto (redação revogada) é descartado; notas como "(Redação dada pela…)" viram o campo `nota`.
- Artigos que mudaram ganham `alteradoEm` e guardam as 5 últimas redações em `historico`.
- Trava de segurança: se a página vier com menos de 80% dos artigos da versão anterior, a lei não é sobrescrita e o erro aparece no log da Action.

## Adicionar uma lei

Inclua um item em `scripts/fontes.json` com `id`, `sigla`, `nomeCurto`, `titulo`, `cor`, `apelidos` (palavras usadas na busca, sem acento) e `url` da versão compilada no Planalto.

## Rodar no computador

```bash
npm install
npm run testar            # testa o parser
npm run atualizar         # baixa todas as leis
npm run atualizar -- cf88 # só uma lei
python3 -m http.server    # abre o app em http://localhost:8000
```

## Avisos

- O texto vem da compilação do Planalto, que às vezes atrasa alguns dias em relação ao Diário Oficial. O app informa que vale a publicação oficial.
- Se o Planalto mudar o formato das páginas, o teste do parser e a trava de segurança evitam que dados quebrados sejam publicados.
