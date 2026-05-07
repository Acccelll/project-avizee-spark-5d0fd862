create or replace function public.get_dre_periodo(
  p_modo text default 'caixa',
  p_data_inicio date default null,
  p_data_fim    date default null
)
returns table (
  ordem int,
  linha text,
  tipo  text,
  valor numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid := current_empresa_id();
  v_receita numeric := 0;
  v_deducoes numeric := 0;
  v_cmv numeric := 0;
  v_despesas numeric := 0;
  v_modo text := coalesce(lower(p_modo), 'caixa');
begin
  if v_modo not in ('caixa', 'competencia') then
    raise exception 'p_modo deve ser caixa ou competencia, recebeu: %', p_modo
      using errcode = '22023';
  end if;

  if v_modo = 'caixa' then
    select coalesce(sum(
      case when status = 'parcial' and valor_pago is not null then valor_pago
           else valor end), 0)
      into v_receita
      from financeiro_lancamentos
     where ativo = true
       and tipo = 'receber'
       and status in ('pago','parcial')
       and (v_empresa is null or empresa_id = v_empresa)
       and (p_data_inicio is null or data_pagamento >= p_data_inicio)
       and (p_data_fim    is null or data_pagamento <= p_data_fim);
  else
    select coalesce(sum(valor), 0)
      into v_receita
      from financeiro_lancamentos
     where ativo = true
       and tipo = 'receber'
       and status not in ('cancelado','estornado')
       and (v_empresa is null or empresa_id = v_empresa)
       and (p_data_inicio is null or data_emissao >= p_data_inicio)
       and (p_data_fim    is null or data_emissao <= p_data_fim);
  end if;

  select coalesce(sum(coalesce(icms_valor,0) + coalesce(pis_valor,0)
                    + coalesce(cofins_valor,0) + coalesce(ipi_valor,0)), 0)
    into v_deducoes
    from notas_fiscais
   where ativo = true
     and tipo = 'saida'
     and (v_empresa is null or empresa_id = v_empresa)
     and (p_data_inicio is null or data_emissao >= p_data_inicio)
     and (p_data_fim    is null or data_emissao <= p_data_fim);

  with base as (
    select
      case when v_modo = 'caixa' and status = 'parcial' and valor_pago is not null
           then valor_pago else valor end as v,
      (nota_fiscal_id is not null
         or pedido_compra_id is not null
         or lower(coalesce(origem_tabela,'')) in ('notas_fiscais','pedidos_compra')
      ) as is_cmv
    from financeiro_lancamentos
    where ativo = true
      and tipo = 'pagar'
      and (v_empresa is null or empresa_id = v_empresa)
      and (
        (v_modo = 'caixa'
          and status in ('pago','parcial')
          and (p_data_inicio is null or data_pagamento >= p_data_inicio)
          and (p_data_fim    is null or data_pagamento <= p_data_fim)
        ) or (v_modo = 'competencia'
          and status not in ('cancelado','estornado')
          and (p_data_inicio is null or data_emissao >= p_data_inicio)
          and (p_data_fim    is null or data_emissao <= p_data_fim)
        )
      )
  )
  select coalesce(sum(v) filter (where is_cmv), 0),
         coalesce(sum(v) filter (where not is_cmv), 0)
    into v_cmv, v_despesas
    from base;

  return query
    select 1, 'Receita Bruta'::text,              'header'::text,    v_receita
    union all select 2, '(–) Deduções s/ Receita',     'deducao',         v_deducoes
    union all select 3, '= Receita Líquida',           'subtotal',        v_receita - v_deducoes
    union all select 4, '(–) CMV / CPV',               'deducao',         v_cmv
    union all select 5, '= Lucro Bruto',               'subtotal',        v_receita - v_deducoes - v_cmv
    union all select 6, '(–) Despesas Operacionais',   'deducao',         v_despesas
    union all select 7, '= Resultado do Exercício',    'resultado',       v_receita - v_deducoes - v_cmv - v_despesas;
end;
$$;

grant execute on function public.get_dre_periodo(text, date, date) to authenticated;

comment on function public.get_dre_periodo(text, date, date) is
  'Cálculo canônico do DRE (regime caixa ou competência). Fonte única consumida por Relatórios.';