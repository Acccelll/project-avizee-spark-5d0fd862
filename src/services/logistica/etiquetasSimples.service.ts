/**
 * etiquetasSimples.service — Geração de etiquetas operacionais simples
 * para impressão em A4 (4 etiquetas por página, layout 2x2).
 *
 * Esta funcionalidade é puramente operacional:
 *   - NÃO chama API dos Correios.
 *   - NÃO gera código de rastreio.
 *   - NÃO grava em `remessa_etiquetas` nem em Storage.
 *   - NÃO altera status da remessa, financeiro, fiscal ou estoque.
 *
 * Conteúdo de cada etiqueta: REMETENTE (empresa_config) e DESTINATÁRIO
 * (cliente vinculado à remessa), conforme regras do projeto.
 */

import { supabase } from "@/integrations/supabase/client";

export interface EnderecoEtiqueta {
  nome: string;
  documento?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  telefone?: string | null;
}

export interface EtiquetaSimplesItem {
  remessaId: string;
  remessaRef?: string | null; // codigo_rastreio ou id curto, apenas para mensagens
  remetente: EnderecoEtiqueta;
  destinatario: EnderecoEtiqueta;
  logoDataUrl?: string | null;
}

export interface EtiquetaInvalida {
  remessaId: string;
  remessaRef: string | null;
  faltando: string[];
}

const CAMPOS_OBRIGATORIOS: Array<keyof EnderecoEtiqueta> = [
  "nome",
  "logradouro",
  "cidade",
  "uf",
  "cep",
];

function validarEndereco(end: EnderecoEtiqueta, prefixo: string): string[] {
  const faltando: string[] = [];
  for (const campo of CAMPOS_OBRIGATORIOS) {
    const val = (end[campo] ?? "").toString().trim();
    if (!val) faltando.push(`${prefixo}: ${campo}`);
  }
  const cep = (end.cep ?? "").replace(/\D/g, "");
  if (cep && cep.length !== 8) faltando.push(`${prefixo}: CEP inválido`);
  const uf = (end.uf ?? "").trim();
  if (uf && uf.length !== 2) faltando.push(`${prefixo}: UF inválida`);
  return faltando;
}

export function validarEtiquetas(items: EtiquetaSimplesItem[]): {
  validas: EtiquetaSimplesItem[];
  invalidas: EtiquetaInvalida[];
} {
  const validas: EtiquetaSimplesItem[] = [];
  const invalidas: EtiquetaInvalida[] = [];
  for (const it of items) {
    const faltando = [
      ...validarEndereco(it.remetente, "Remetente"),
      ...validarEndereco(it.destinatario, "Destinatário"),
    ];
    if (faltando.length === 0) validas.push(it);
    else invalidas.push({ remessaId: it.remessaId, remessaRef: it.remessaRef ?? null, faltando });
  }
  return { validas, invalidas };
}

/** Carrega remetente padrão a partir de `empresa_config`. */
export async function getRemetentePadrao(): Promise<EnderecoEtiqueta & { logoUrl?: string | null }> {
  const { data, error } = await supabase
    .from("empresa_config")
    .select(
      "razao_social,nome_fantasia,cnpj,logradouro,numero,complemento,bairro,cidade,uf,cep,telefone,logo_url",
    )
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { nome: "" };
  }
  return {
    nome: data.razao_social || data.nome_fantasia || "",
    documento: data.cnpj,
    logradouro: data.logradouro,
    numero: data.numero,
    complemento: data.complemento,
    bairro: data.bairro,
    cidade: data.cidade,
    uf: data.uf,
    cep: data.cep,
    telefone: data.telefone,
    logoUrl: data.logo_url,
  };
}

interface RemessaComCliente {
  id: string;
  codigo_rastreio: string | null;
  cliente_id: string | null;
  clientes: {
    nome_razao_social: string;
    cpf_cnpj: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
    telefone: string | null;
    celular: string | null;
  } | null;
}

/** Monta os itens (remetente + destinatário) para uma lista de remessas. */
export async function montarItensEtiqueta(
  remessaIds: string[],
): Promise<EtiquetaSimplesItem[]> {
  if (remessaIds.length === 0) return [];
  const remetente = await getRemetentePadrao();
  const logoDataUrl = remetente.logoUrl ? await carregarLogoDataUrl(remetente.logoUrl) : null;

  const { data, error } = await supabase
    .from("remessas")
    .select(
      "id,codigo_rastreio,cliente_id,clientes!inner(nome_razao_social,cpf_cnpj,logradouro,numero,complemento,bairro,cidade,uf,cep,telefone,celular)",
    )
    .in("id", remessaIds);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as RemessaComCliente[];
  const map = new Map(rows.map((r) => [r.id, r]));

  return remessaIds.map((id) => {
    const r = map.get(id);
    const cli = r?.clientes ?? null;
    return {
      remessaId: id,
      remessaRef: r?.codigo_rastreio ?? id.slice(0, 8),
      logoDataUrl,
      remetente: {
        nome: remetente.nome,
        documento: remetente.documento,
        logradouro: remetente.logradouro,
        numero: remetente.numero,
        complemento: remetente.complemento,
        bairro: remetente.bairro,
        cidade: remetente.cidade,
        uf: remetente.uf,
        cep: remetente.cep,
        telefone: remetente.telefone,
      },
      destinatario: cli
        ? {
            nome: cli.nome_razao_social,
            documento: cli.cpf_cnpj,
            logradouro: cli.logradouro,
            numero: cli.numero,
            complemento: cli.complemento,
            bairro: cli.bairro,
            cidade: cli.cidade,
            uf: cli.uf,
            cep: cli.cep,
            telefone: cli.telefone || cli.celular,
          }
        : { nome: "" },
    };
  });
}

async function carregarLogoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatarCep(cep?: string | null): string {
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return cep ?? "";
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function linhaEndereco(end: EnderecoEtiqueta): string[] {
  const linhas: string[] = [];
  const l1 = [end.logradouro, end.numero].filter(Boolean).join(", ");
  const l1c = [l1, end.complemento].filter(Boolean).join(" — ");
  if (l1c) linhas.push(l1c);
  if (end.bairro) linhas.push(end.bairro);
  const cidadeUf = [end.cidade, end.uf].filter(Boolean).join("/");
  const cep = formatarCep(end.cep);
  const l3 = [cep, cidadeUf].filter(Boolean).join("  ");
  if (l3) linhas.push(l3);
  if (end.telefone) linhas.push(`Tel.: ${end.telefone}`);
  return linhas;
}

/**
 * Gera o PDF A4 retrato com 4 etiquetas por página (grade 2x2).
 * Usa jsPDF em mm.
 */
export async function gerarPdfEtiquetasSimplesA4(
  items: EtiquetaSimplesItem[],
): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // A4: 210 x 297 mm
  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 8;
  const GAP = 4;
  const COLS = 2;
  const ROWS = 2;
  const PER_PAGE = COLS * ROWS;
  const ETI_W = (PAGE_W - MARGIN * 2 - GAP) / COLS;
  const ETI_H = (PAGE_H - MARGIN * 2 - GAP) / ROWS;

  items.forEach((item, idx) => {
    const posInPage = idx % PER_PAGE;
    if (idx > 0 && posInPage === 0) doc.addPage();
    const col = posInPage % COLS;
    const row = Math.floor(posInPage / COLS);
    const x = MARGIN + col * (ETI_W + GAP);
    const y = MARGIN + row * (ETI_H + GAP);
    desenharEtiqueta(doc, item, x, y, ETI_W, ETI_H);
  });

  return doc.output("blob");
}

function desenharEtiqueta(
  doc: import("jspdf").jsPDF,
  item: EtiquetaSimplesItem,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const PAD = 4;
  // Borda
  doc.setDrawColor(120);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);

  // Logo (canto superior direito)
  const LOGO_H = 10;
  const LOGO_W = 24;
  if (item.logoDataUrl) {
    try {
      const fmt = item.logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(
        item.logoDataUrl,
        fmt,
        x + w - PAD - LOGO_W,
        y + PAD,
        LOGO_W,
        LOGO_H,
        undefined,
        "FAST",
      );
    } catch {
      /* ignora erro de imagem */
    }
  }

  // ── REMETENTE ───────────────────────────
  let cy = y + PAD + 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text("REMETENTE", x + PAD, cy);
  cy += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20);
  const nomeRem = doc.splitTextToSize(item.remetente.nome || "—", w - PAD * 2 - LOGO_W - 2);
  doc.text(nomeRem, x + PAD, cy);
  cy += nomeRem.length * 3.5;

  if (item.remetente.documento) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(60);
    doc.text(`CNPJ: ${item.remetente.documento}`, x + PAD, cy);
    cy += 3;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(40);
  for (const linha of linhaEndereco(item.remetente)) {
    const wrapped = doc.splitTextToSize(linha, w - PAD * 2);
    doc.text(wrapped, x + PAD, cy);
    cy += wrapped.length * 3.2;
  }

  // Separador
  cy += 2;
  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.line(x + PAD, cy, x + w - PAD, cy);
  cy += 4;

  // ── DESTINATÁRIO ────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.text("DESTINATÁRIO", x + PAD, cy);
  cy += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0);
  const nomeDest = doc.splitTextToSize(item.destinatario.nome || "—", w - PAD * 2);
  doc.text(nomeDest, x + PAD, cy);
  cy += nomeDest.length * 5;

  if (item.destinatario.documento) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(item.destinatario.documento, x + PAD, cy);
    cy += 4;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20);
  for (const linha of linhaEndereco(item.destinatario)) {
    const wrapped = doc.splitTextToSize(linha, w - PAD * 2);
    doc.text(wrapped, x + PAD, cy);
    cy += wrapped.length * 4.4;
  }

  // CEP destacado no rodapé
  if (item.destinatario.cep) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`CEP: ${formatarCep(item.destinatario.cep)}`, x + PAD, y + h - PAD);
  }
}

/**
 * Orquestra a geração: monta itens, valida, e devolve resultado.
 * Não persiste nada e não dispara download — quem chama decide.
 */
export async function prepararEtiquetasSimples(remessaIds: string[]): Promise<{
  itens: EtiquetaSimplesItem[];
  invalidas: EtiquetaInvalida[];
  blob: Blob | null;
}> {
  const itens = await montarItensEtiqueta(remessaIds);
  const { validas, invalidas } = validarEtiquetas(itens);
  if (validas.length === 0) {
    return { itens, invalidas, blob: null };
  }
  const blob = await gerarPdfEtiquetasSimplesA4(validas);
  return { itens: validas, invalidas, blob };
}