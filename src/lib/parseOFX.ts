export interface OFXTransaction {
  id: string;
  data: string;
  valor: number;
  descricao: string;
}

/**
 * Parses an OFX/QFX file (semi-XML format) and extracts transactions.
 * Returns an array of { id, data, valor, descricao }.
 */
export function parseOFX(text: string): OFXTransaction[] {
  const transactions: OFXTransaction[] = [];
  let counter = 0;

  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract all <STMTTRN>...</STMTTRN> blocks (case-insensitive)
  const stmtPattern = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = stmtPattern.exec(normalized)) !== null) {
    transactions.push(parseTransaction(match[1], counter++));
  }

  // Also handle OFX SGML format (no closing tags)
  if (transactions.length === 0) {
    const sgmlBlocks = extractSGMLBlocks(normalized, 'STMTTRN');
    for (const block of sgmlBlocks) {
      transactions.push(parseTransaction(block, counter++));
    }
  }

  return transactions;
}

function parseTransaction(block: string, index: number): OFXTransaction {
  const fitid = extractField(block, 'FITID') || extractField(block, 'REFNUM');
  const dtposted = extractField(block, 'DTPOSTED') || '';
  const trnamt = extractField(block, 'TRNAMT') || '0';
  const memo = extractField(block, 'MEMO') || extractField(block, 'NAME') || '';
  // Quando o banco não fornece FITID, gera um ID determinístico a partir
  // do conteúdo (data + valor + descrição) para evitar colisão de posição
  // em re-imports parciais (M-05).
  const id =
    fitid ||
    `ofx-${djb2(`${dtposted}|${trnamt}|${memo}|${index}`).toString(16)}`;

  return {
    id,
    data: parseOFXDate(dtposted),
    valor: parseFloat(trnamt.replace(',', '.')) || 0,
    descricao: memo.trim(),
  };
}

/** Hash determinístico (djb2) — leve, sem dependências, suficiente para deduplicação local. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/** Extracts a field value from an OFX block (handles both XML and SGML formats) */
function extractField(block: string, field: string): string | null {
  // XML format: <FIELD>value</FIELD>
  const xmlPattern = new RegExp(`<${field}>([^<]*)<\\/${field}>`, 'i');
  const xmlMatch = xmlPattern.exec(block);
  if (xmlMatch) return xmlMatch[1].trim();

  // SGML format: <FIELD>value\n (no closing tag)
  const sgmlPattern = new RegExp(`<${field}>([^\\n<]*)`, 'i');
  const sgmlMatch = sgmlPattern.exec(block);
  if (sgmlMatch) return sgmlMatch[1].trim();

  return null;
}

/**
 * Extracts blocks from SGML-style OFX (no closing tags).
 * Finds content between <TAG> markers of the same level.
 */
function extractSGMLBlocks(text: string, tag: string): string[] {
  const blocks: string[] = [];
  const upperTag = tag.toUpperCase();
  const lines = text.split('\n');
  let inBlock = false;
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toUpperCase() === `<${upperTag}>`) {
      inBlock = true;
      current = [];
    } else if (trimmed.toUpperCase() === `</${upperTag}>`) {
      if (inBlock) {
        blocks.push(current.join('\n'));
        inBlock = false;
        current = [];
      }
    } else if (inBlock) {
      current.push(line);
    }
  }

  return blocks;
}

/**
 * Converts OFX date string (YYYYMMDDHHMMSS or YYYYMMDD) to ISO date string (YYYY-MM-DD).
 */
function parseOFXDate(dtposted: string): string {
  // Remove timezone info if present (e.g., "20231015120000[-3:BRT]" -> "20231015")
  const cleaned = dtposted.replace(/\[.*\]/, '').trim();
  if (cleaned.length >= 8) {
    const year = cleaned.slice(0, 4);
    const month = cleaned.slice(4, 6);
    const day = cleaned.slice(6, 8);
    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().slice(0, 10);
}
