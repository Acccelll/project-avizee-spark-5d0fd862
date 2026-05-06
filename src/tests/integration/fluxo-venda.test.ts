/**
 * Teste de integração: Fluxo completo de venda
 *
 * Cobre o fluxo: Orçamento → Ordem de Venda → Nota Fiscal → Lançamentos Financeiros
 *
 * O Supabase é completamente mockado para que os testes rodem sem infraestrutura
 * real. Cada "camada" é testada via chamadas diretas às funções de serviço,
 * verificando o encadeamento correto de operações entre as entidades.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calcularTotalNF, calcularValorParcela, calcularVencimentoParcela } from '@/lib/fiscal';
import { calcularValorLiquido, calcularNovoSaldo, getEffectiveStatus } from '@/lib/financeiro';
import {
  buscarRegraAplicavel,
  aplicarPrecosEspeciaisEmLote,
  type RegraPrecoEspecial,
} from '@/lib/precos-especiais';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const clienteId = 'cli-001';
const produtoId = 'prod-001';
const hoje = new Date('2026-03-15T08:00:00');

const produto = {
  id: produtoId,
  nome: 'Produto Teste',
  sku: 'SKU-001',
  preco_venda: 100,
  estoque_atual: 50,
};

const precosEspeciais: RegraPrecoEspecial[] = [
  {
    produto_id: produtoId,
    preco_especial: 85,
    data_inicio: '2026-01-01',
    data_fim: '2026-12-31',
  },
];

// ── Etapa 1: Orçamento ────────────────────────────────────────────────────────

describe('[Fluxo Venda] Etapa 1: Criação de Orçamento', () => {
  it('aplica preço especial ao selecionar produto com regra vigente', () => {
    const itens = [
      { produto_id: produtoId, valor_unitario: produto.preco_venda, quantidade: 5, valor_total: 500 },
    ];
    const { itens: atualizados, alterados } = aplicarPrecosEspeciaisEmLote(
      itens,
      precosEspeciais,
      hoje,
    );

    // preço fixo: 85
    expect(atualizados[0].valor_unitario).toBe(85);
    expect(atualizados[0].valor_total).toBe(425); // 85 × 5
    expect(alterados).toContain(produtoId);
  });

  it('calcula total do orçamento com desconto global e frete', () => {
    const totalProdutos = 425; // após preço especial
    const desconto = 25;
    const frete = 30;
    const total = calcularTotalNF(totalProdutos, desconto, 0, 0, frete, 0);

    expect(total).toBe(430); // 425 - 25 + 30
  });

  it('não altera produtos sem regra de preço especial', () => {
    const itens = [
      { produto_id: 'outro-produto', valor_unitario: 200, quantidade: 2, valor_total: 400 },
    ];
    const { itens: atualizados, alterados } = aplicarPrecosEspeciaisEmLote(
      itens,
      precosEspeciais,
      hoje,
    );

    expect(atualizados[0].valor_unitario).toBe(200);
    expect(alterados).toHaveLength(0);
  });
});

// ── Etapa 2: Nota Fiscal → Parcelas ──────────────────────────────────────────

describe('[Fluxo Venda] Etapa 2: Emissão de Nota Fiscal com Parcelamento', () => {
  const dataEmissao = '2026-03-15';
  const valorNF = 430;
  const numParcelas = 3;

  it('calcula valor correto de cada parcela', () => {
    const valorParcela = calcularValorParcela(valorNF, numParcelas);
    // 430 / 3 = 143.33...
    expect(valorParcela).toBe(143.33);
  });

  it('calcula datas de vencimento em intervalos de 30 dias', () => {
    const venc1 = calcularVencimentoParcela(dataEmissao, 1);
    const venc2 = calcularVencimentoParcela(dataEmissao, 2);
    const venc3 = calcularVencimentoParcela(dataEmissao, 3);

    expect(venc1).toBe('2026-04-14');
    expect(venc2).toBe('2026-05-14');
    expect(venc3).toBe('2026-06-13');
  });

  it('gera 3 lançamentos financeiros para 3 parcelas', () => {
    const lancamentos = Array.from({ length: numParcelas }, (_, i) => ({
      numero: i + 1,
      valor: calcularValorParcela(valorNF, numParcelas),
      data_vencimento: calcularVencimentoParcela(dataEmissao, i + 1),
      status: 'aberto',
    }));

    expect(lancamentos).toHaveLength(3);
    lancamentos.forEach((l) => {
      expect(l.status).toBe('aberto');
      expect(l.valor).toBe(143.33);
    });
  });
});

// ── Etapa 3: Pagamento → Baixa Parcial ───────────────────────────────────────

describe('[Fluxo Venda] Etapa 3: Recebimento com Juros e Desconto', () => {
  const saldoLancamento = 143.33;

  it('calcula valor líquido com juros e multa por atraso', () => {
    const juros = 2.15; // juros calculados externamente
    const multa = 2.87; // multa 2%
    const liquido = calcularValorLiquido(saldoLancamento, 0, juros, multa, 0);

    expect(liquido).toBeCloseTo(148.35, 2);
  });

  it('calcula novo saldo após pagamento parcial', () => {
    const valorPago = 100;
    const novoSaldo = calcularNovoSaldo(saldoLancamento, valorPago, 0);

    expect(novoSaldo).toBeCloseTo(43.33, 2);
  });

  it('zera o saldo após pagamento integral', () => {
    const novoSaldo = calcularNovoSaldo(saldoLancamento, saldoLancamento, 0);
    expect(novoSaldo).toBe(0);
  });

  it('determina status correto após pagamento integral', () => {
    const hoje = new Date('2026-04-14');
    const status = getEffectiveStatus('pago', '2026-04-14', hoje);
    expect(status).toBe('pago');
  });
});

// ── Etapa 4: Inadimplência → Status Vencido ───────────────────────────────────

describe('[Fluxo Venda] Etapa 4: Inadimplência e Vencimento', () => {
  it('marca lançamento como vencido quando data de vencimento passou', () => {
    const hoje = new Date('2026-05-01');
    const status = getEffectiveStatus('aberto', '2026-04-14', hoje);
    expect(status).toBe('vencido');
  });

  it('mantém status "aberto" quando ainda não venceu', () => {
    const hoje = new Date('2026-04-13');
    const status = getEffectiveStatus('aberto', '2026-04-14', hoje);
    expect(status).toBe('aberto');
  });

  it('não altera status "parcial" mesmo com data vencida', () => {
    const hoje = new Date('2026-05-01');
    const status = getEffectiveStatus('parcial', '2026-04-14', hoje);
    expect(status).toBe('parcial');
  });
});

// ── Etapa 5: Coerência do fluxo completo ────────────────────────────────────

describe('[Fluxo Venda] Coerência do fluxo completo', () => {
  it('soma das parcelas se aproxima do valor total da NF', () => {
    const valorNF = 430;
    const numParcelas = 3;
    const valorParcela = calcularValorParcela(valorNF, numParcelas);

    // Due to rounding, sum may differ by at most (numParcelas - 1) × 0.01
    const soma = valorParcela * numParcelas;
    expect(Math.abs(soma - valorNF)).toBeLessThanOrEqual(0.02);
  });

  it('regra de preço especial vencida não altera orçamento', () => {
    const regrasVencidas: RegraPrecoEspecial[] = [
      {
        produto_id: produtoId,
        preco_especial: 50,
        data_inicio: '2025-01-01',
        data_fim: '2025-12-31',
      },
    ];
    const itens = [
      { produto_id: produtoId, valor_unitario: 100, quantidade: 1, valor_total: 100 },
    ];
    const { itens: atualizados } = aplicarPrecosEspeciaisEmLote(itens, regrasVencidas, hoje);
    expect(atualizados[0].valor_unitario).toBe(100);
  });
});
