-- 0) Remover constraint antiga primeiro
ALTER TABLE public.formas_pagamento DROP CONSTRAINT IF EXISTS chk_forma_pagamento_tipo;

-- 1) financeiro_lancamentos
UPDATE public.financeiro_lancamentos SET forma_pagamento='boleto_dda' WHERE forma_pagamento IN ('boleto','DDA','Boleto');
UPDATE public.financeiro_lancamentos SET forma_pagamento='cartao_credito' WHERE forma_pagamento IN ('cartao','Cartão','Cartao');

-- 2) financeiro_baixas
UPDATE public.financeiro_baixas SET forma_pagamento='boleto_dda' WHERE forma_pagamento IN ('boleto','DDA','Boleto');
UPDATE public.financeiro_baixas SET forma_pagamento='cartao_credito' WHERE forma_pagamento IN ('cartao','Cartão','Cartao');
UPDATE public.financeiro_baixas SET forma_pagamento='pix' WHERE forma_pagamento IN ('PIX','Pix');
UPDATE public.financeiro_baixas SET forma_pagamento='debito_automatico' WHERE forma_pagamento IN ('Débito Automático','debito automatico');
UPDATE public.financeiro_baixas SET forma_pagamento='transferencia' WHERE forma_pagamento IN ('Transferência','transferencia');
UPDATE public.financeiro_baixas SET forma_pagamento='dinheiro' WHERE forma_pagamento IN ('Dinheiro');

-- 3) formas_pagamento
UPDATE public.formas_pagamento SET tipo='boleto_dda' WHERE tipo IN ('boleto','Boleto');
UPDATE public.formas_pagamento SET tipo='cartao_credito' WHERE tipo IN ('cartao','Cartão','Cartao');
UPDATE public.formas_pagamento SET tipo='outros' WHERE tipo IN ('outro','Outro');

-- 4) Adicionar constraint canônica
ALTER TABLE public.formas_pagamento ADD CONSTRAINT chk_forma_pagamento_tipo CHECK (
  tipo = ANY (ARRAY[
    'dinheiro','pix','boleto_dda','cartao_credito','cartao_debito',
    'transferencia','cobranca_automatica','debito_automatico','outros'
  ])
);