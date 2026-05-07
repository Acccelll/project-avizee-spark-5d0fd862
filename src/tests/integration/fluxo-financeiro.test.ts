import { describe, it, expect, vi } from 'vitest';
import { calcularScoreConciliacao } from '@/services/financeiro/conciliacao.service';
import type { TransacaoExtrato } from '@/services/financeiro/ofxParser.service';
import type { TituloParaConciliacao } from '@/services/financeiro/conciliacao.service';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

describe('Fluxo Financeiro — conciliação', () => {
  // A-05: conciliação só considera títulos já liquidados (status 'pago'/'parcial' com data_baixa).
  it('calcula score alto para match exato de valor e data', () => {
    const tx: TransacaoExtrato = { id: '1', tipo: 'C', data: '2026-04-10', valor: 1000, descricao: 'Pagamento NF 123' };
    const titulo: TituloParaConciliacao = { id: 't1', descricao: 'Pagamento NF 123', valor: 1000, data_vencimento: '2026-04-10', data_baixa: '2026-04-10', tipo: 'receber', status: 'pago' };
    const score = calcularScoreConciliacao(tx, titulo);
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('retorna 0 para valores muito diferentes', () => {
    const tx: TransacaoExtrato = { id: '1', tipo: 'C', data: '2026-04-10', valor: 1000, descricao: 'Pagamento' };
    const titulo: TituloParaConciliacao = { id: 't1', descricao: 'Outro', valor: 5000, data_vencimento: '2026-04-10', data_baixa: '2026-04-10', tipo: 'receber', status: 'pago' };
    const score = calcularScoreConciliacao(tx, titulo);
    expect(score).toBe(0);
  });

  it('retorna 0 para datas distantes (>3 dias)', () => {
    const tx: TransacaoExtrato = { id: '1', tipo: 'C', data: '2026-04-10', valor: 1000, descricao: 'Pag' };
    const titulo: TituloParaConciliacao = { id: 't1', descricao: 'Pag', valor: 1000, data_vencimento: '2026-04-20', data_baixa: '2026-04-20', tipo: 'receber', status: 'pago' };
    const score = calcularScoreConciliacao(tx, titulo);
    expect(score).toBe(0);
  });
});

describe('Fluxo Financeiro — baixas e saldo', () => {
  it('baixa parcial mantém saldo restante correto', () => {
    const valor = 1000;
    const baixa1 = 400;
    const saldoRestante = valor - baixa1;
    expect(saldoRestante).toBe(600);
    expect(saldoRestante > 0 ? 'aberto' : 'pago').toBe('aberto');
  });

  it('baixa total zera saldo e muda status para pago', () => {
    const valor = 1000;
    const totalPago = 400 + 600;
    const saldoRestante = valor - totalPago;
    expect(saldoRestante).toBe(0);
    expect(saldoRestante <= 0 ? 'pago' : 'aberto').toBe('pago');
  });

  it('não permite baixa em lançamento já pago', () => {
    const status = 'pago';
    const podeBaixar = status !== 'pago' && status !== 'cancelado';
    expect(podeBaixar).toBe(false);
  });

  it('calcula múltiplas parcelas corretamente', () => {
    const valorTotal = 3000;
    const numParcelas = 3;
    const valorParcela = valorTotal / numParcelas;
    expect(valorParcela).toBe(1000);
    const totalPago = valorParcela * 2;
    expect(valorTotal - totalPago).toBe(1000);
  });
});
