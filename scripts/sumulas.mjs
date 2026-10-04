// Extrai súmulas de texto corrido (vindo de PDF ou HTML dos tribunais).
import * as cheerio from 'cheerio';

const RE_CAB = /S[ÚU]MULA\s+(?:VINCULANTE\s+)?(?:N[º°o.]*\s*)?(\d{1,4})(?![\d/])/gi;
// Onde termina o enunciado e começam os metadados do tribunal
const RE_FIM = /\s(?:Data de Aprova[çc][ãa]o|Fonte de Publica[çc][ãa]o|Refer[êe]ncia Legislativa|Precedentes?(?: Representativos?)?\s*:|Observa[çc][ãa]o|Legisla[çc][ãa]o|Aprovada em|Jurisprud[êe]ncia selecionada|Indexa[çc][ãa]o|Doutrina|Tese definida|Debates de aprova[çc][ãa]o|Precedente)(?=\W|$)/i;
const RE_JULGADO = /\s*\((?:[^()]*?(?:julgad[oa]|DJe?|DOU|Primeira|Segunda|Terceira|Corte Especial|Se[çc][ãa]o)[^()]*)\)\s*\.?\s*$/i;

export function textoDeHtml(html) {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer').remove();
  $('br, p, div, li, tr, h1, h2, h3, h4').each((_, el) => { $(el).prepend('\n'); });
  return $('body').text();
}

function limpar(t) {
  t = t.replace(/\bVEJA\s+MAIS\b/gi, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[\s\-–—:.]+/, '').trim();
  const fim = t.search(RE_FIM);
  if (fim > 0) t = t.slice(0, fim).trim();
  let antes;
  do { antes = t; t = t.replace(RE_JULGADO, '').trim(); } while (t !== antes);
  return t.normalize('NFC');
}

export function parsearSumulas(texto) {
  texto = texto.replace(/\u00a0/g, ' ');
  // Ignora citações no meio do texto ("conforme a Súmula 7"): cabeçalho real não vem logo após uma palavra minúscula
  const achados = [...texto.matchAll(RE_CAB)].filter(m => !/[a-zà-ú,;]\s*$/.test(texto.slice(Math.max(0, m.index - 4), m.index)));
  const porNumero = new Map();
  achados.forEach((m, i) => {
    const ini = m.index + m[0].length;
    const fim = i + 1 < achados.length ? achados[i + 1].index : texto.length;
    const bruto = texto.slice(ini, fim);
    const inicio = bruto.slice(0, 160);
    const cancelada = /cancelad|superad|revogad/i.test(inicio);
    const enunciado = limpar(bruto.replace(/^\s*[-–—:.]?\s*\(?\s*(?:cancelad[oa]|superad[oa]|revogad[oa])[^)\n]*\)?/i, ''));
    const n = Number(m[1]);
    if (enunciado.length < 15 && !cancelada) return; // sumário, índice, referências cruzadas
    const atual = porNumero.get(n);
    // Quando o número aparece mais de uma vez, fica o trecho mais completo
    if (!atual || enunciado.length > atual.caput.length) {
      const item = { tipo: 'artigo', id: 'sum' + n, numero: String(n), caput: enunciado, dispositivos: [] };
      if (cancelada) item.revogado = true;
      porNumero.set(n, item);
    }
  });
  return [...porNumero.values()].sort((a, b) => Number(a.numero) - Number(b.numero));
}
