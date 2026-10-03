// Robô de atualização: baixa cada lei do Planalto, compara com a versão salva
// e grava data/leis/<id>.json, data/indice.json e data/mudancas.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parsearHtml } from './parser.mjs';
import { parsearSumulas, textoDeHtml } from './sumulas.mjs';

const RAIZ = new URL('../', import.meta.url);
const DADOS = new URL('data/', RAIZ);
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Manaus' }); // AAAA-MM-DD
const DIAS_RECENTE = 30;
const apenas = process.argv.slice(2); // ex.: node scripts/atualizar.mjs cf88

async function lerJson(url, padrao = null) {
  try { return JSON.parse(await readFile(url, 'utf8')); } catch { return padrao; }
}
const gravarJson = (url, obj) => writeFile(url, JSON.stringify(obj, null, 0) + '\n', 'utf8');

function decodificar(buf, contentType) {
  let cs = (contentType || '').match(/charset=([\w-]+)/i)?.[1];
  if (!cs) cs = new TextDecoder('latin1').decode(buf.slice(0, 4096)).match(/charset=["']?([\w-]+)/i)?.[1];
  if (!cs) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { cs = 'windows-1252'; } }
  cs = cs.toLowerCase();
  if (cs === 'iso-8859-1' || cs === 'latin1') cs = 'windows-1252';
  return new TextDecoder(cs).decode(buf);
}

async function baixar(url) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VadeMecumBot/1.0)', 'Accept-Language': 'pt-BR' },
        signal: AbortSignal.timeout(90_000)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return { bytes: new Uint8Array(await r.arrayBuffer()), tipo: r.headers.get('content-type') || '' };
    } catch (e) {
      if (tentativa >= 3) throw e;
      await new Promise(ok => setTimeout(ok, 8000 * tentativa));
    }
  }
}

async function obterBlocos(f) {
  const { bytes, tipo } = await baixar(f.url);
  if (f.tipo !== 'sumulas') return parsearHtml(decodificar(bytes, tipo));
  let texto;
  if (f.formato === 'pdf' || /pdf/i.test(tipo)) {
    const { getDocumentProxy, extractText } = await import('unpdf');
    texto = (await extractText(await getDocumentProxy(bytes), { mergePages: true })).text;
  } else texto = textoDeHtml(decodificar(bytes, tipo));
  return parsearSumulas(texto);
}

const assinatura = a => JSON.stringify([a.caput, !!a.revogado, (a.dispositivos || []).map(d => [d.rotulo, d.texto])]);
const recente = a => a.alteradoEm && (new Date(hoje) - new Date(a.alteradoEm)) / 864e5 <= DIAS_RECENTE;

function mesclar(blocos, anterior) {
  const antigos = new Map((anterior?.blocos || []).filter(b => b.tipo === 'artigo').map(a => [a.id, a]));
  const mudancas = [];
  for (const b of blocos) {
    if (b.tipo !== 'artigo') continue;
    const a = antigos.get(b.id);
    if (!a) {
      if (anterior) { b.alteradoEm = hoje; mudancas.push({ tipo: 'incluido', id: b.id, numero: b.numero }); }
      continue;
    }
    antigos.delete(b.id);
    if (assinatura(a) !== assinatura(b)) {
      b.alteradoEm = hoje;
      b.historico = [{ ate: hoje, caput: a.caput, nota: a.nota, dispositivos: a.dispositivos }, ...(a.historico || [])].slice(0, 5);
      mudancas.push({ tipo: b.revogado && !a.revogado ? 'revogado' : 'alterado', id: b.id, numero: b.numero });
    } else {
      if (a.alteradoEm) b.alteradoEm = a.alteradoEm;
      if (a.historico) b.historico = a.historico;
    }
  }
  for (const a of antigos.values()) mudancas.push({ tipo: 'removido', id: a.id, numero: a.numero });
  return mudancas;
}

async function main() {
  await mkdir(new URL('leis/', DADOS), { recursive: true });
  const fontes = JSON.parse(await readFile(new URL('scripts/fontes.json', RAIZ), 'utf8'));
  const log = await lerJson(new URL('mudancas.json', DADOS), []);
  let falhas = 0;

  for (const f of fontes) {
    if (apenas.length && !apenas.includes(f.id)) continue;
    const arquivo = new URL(`leis/${f.id}.json`, DADOS);
    try {
      console.log(`→ ${f.sigla}: baixando ${f.url}`);
      const blocos = await obterBlocos(f);
      const nArt = blocos.filter(b => b.tipo === 'artigo').length;
      const anterior = await lerJson(arquivo);
      const nAnt = anterior ? anterior.blocos.filter(b => b.tipo === 'artigo').length : 0;

      // Trava de segurança: se a página veio quebrada, não sobrescreve o que já temos
      const minimo = f.minimo || 5;
      if (nArt < minimo) throw new Error(`só ${nArt} itens reconhecidos (mínimo ${minimo}); a fonte pode ter mudado de formato ou de endereço`);
      if (nAnt && nArt < nAnt * 0.8) throw new Error(`${nArt} artigos agora contra ${nAnt} antes; atualização suspensa por segurança`);

      const mudancas = mesclar(blocos, anterior);
      if (anterior && !mudancas.length) { console.log(`  sem mudanças (${nArt} itens)`); continue; }

      const { url, formato, minimo: _m, ...meta } = f;
      await gravarJson(arquivo, { ...meta, fonte: url, alteradoEm: anterior ? hoje : undefined, verificadoEm: hoje, blocos });
      if (anterior) log.unshift(...mudancas.map(m => ({ data: hoje, lei: f.id, sigla: f.sigla, ...m })));
      console.log(anterior ? `  ${mudancas.length} mudança(s) registrada(s)` : `  primeira carga: ${nArt} itens`);
    } catch (e) {
      falhas++;
      console.error(`  ✗ ${f.sigla}: ${e.message}`);
    }
  }

  // Índice usado pela tela inicial do app
  const leis = [];
  for (const f of fontes) {
    const L = await lerJson(new URL(`leis/${f.id}.json`, DADOS));
    if (!L) continue;
    const arts = L.blocos.filter(b => b.tipo === 'artigo');
    leis.push({ id: L.id, grupo: L.grupo, rotuloItem: L.rotuloItem, sigla: L.sigla, nomeCurto: L.nomeCurto, titulo: L.titulo, cor: L.cor, apelidos: L.apelidos,
      alteradoEm: L.alteradoEm, totalArtigos: arts.length, alteracoesRecentes: arts.filter(recente).length });
  }
  if (leis.length) await gravarJson(new URL('indice.json', DADOS), { verificadoEm: hoje, leis });
  await gravarJson(new URL('mudancas.json', DADOS), log.slice(0, 300));

  if (falhas) process.exitCode = falhas === fontes.length ? 1 : 0;
}

main();
