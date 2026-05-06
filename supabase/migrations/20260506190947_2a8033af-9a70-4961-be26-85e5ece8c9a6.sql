create or replace view public.vw_estoque_posicao
with (security_invoker = on) as
select
  p.id              as produto_id,
  p.nome            as produto_nome,
  p.sku,
  p.codigo_interno,
  p.unidade_medida,
  p.estoque_minimo,
  p.preco_custo,
  p.preco_venda,
  p.ativo,
  coalesce(
    (
      select m.saldo_atual
      from   public.estoque_movimentos m
      where  m.produto_id = p.id
      order  by m.created_at desc
      limit  1
    ),
    p.estoque_atual,
    0
  )                 as estoque_atual,
  coalesce(
    (
      select coalesce(sum(case when m2.tipo = 'reserva'           then  m2.quantidade
                               when m2.tipo = 'liberacao_reserva' then -m2.quantidade
                               else 0 end), 0)
      from   public.estoque_movimentos m2
      where  m2.produto_id = p.id
    ),
    0
  )                 as estoque_reservado
from public.produtos p
where p.ativo = true;

grant select on public.vw_estoque_posicao to authenticated;