## Onda 33 — Refino do formulário de Transportadora

Escopo: apenas `src/pages/Transportadoras.tsx` (e, se necessário, `MaskedInput`/`useCnpjLookup` para feedbacks). Nada de mudança de schema ou regra de negócio nesta onda — `prazo_medio` continua `text` (estruturação numérica fica para uma onda futura, ver "Fora do escopo").

### Alta prioridade

1. **CNPJ formatado em todo lugar**
   - Header do FormModal: passar `identifier={cpfCnpjMask(selected.cpf_cnpj)}` em vez do valor cru.
   - Aba Clientes vinculados: aplicar `cpfCnpjMask(cv.clientes.cpf_cnpj)` na linha de cada vínculo.
   - Conferir `mobileIdentifierKey="cpf_cnpj"` do DataTable — se renderiza valor cru, trocar por `mobileIdentifier` formatado (callback) já que o grid mostra o número sem máscara em mobile.

2. **Botão "Consultar CNPJ" mais explícito**
   - No desktop, trocar o botão `size="icon"` por um botão com ícone + texto "Consultar CNPJ" (mantém `size="icon"` só em telas estreitas via `useIsMobile`, com `aria-label` e `title`).
   - Estados de feedback ao lado do campo (sob o helper text):
     - idle → texto auxiliar atual
     - `cnpjLoading` → "Consultando Receita Federal..." com `Loader2`
     - sucesso (resultado preenchido) → "Dados preenchidos automaticamente" (texto verde, some após 4s via `setTimeout`)
     - 404 / erro → já tratados em `useCnpjLookup` via toast; manter, sem duplicar.

3. **Aba Endereço — remover borda laranja sem contexto**
   - Investigar (durante a implementação) o que está causando a borda visível no print: provavelmente `:focus-visible` herdado do `TabsContent` ou algum wrapper. Normalizar para sem outline visual no painel inteiro; manter foco apenas nos campos.
   - Adicionar banner de **completude do endereço** quando faltar campo essencial (CEP, logradouro, número):
     - Bloco discreto (`bg-muted/40 border-l-4 border-warning`) com texto "Endereço incompleto — preencha CEP, logradouro e número para uso em remessas".
   - Acrescentar indicador `(!)` ao lado do label da aba Endereço quando o endereço estiver incompleto e a transportadora estiver em modo edit.

4. **Ações nos clientes vinculados**
   - Cada linha passa a expor (sempre visível, não só no hover):
     - botão "Tornar preferencial" / "Remover preferência" (alterna `prioridade` 1 ↔ próxima posição) — já existe `Star`, falta o toggle clicável.
     - botão "Abrir cliente" (navega para `/clientes?editId=...` via `useNavigate`).
     - botão "Remover vínculo" (mantém o atual, sem `opacity-0`).
   - CNPJ do cliente formatado (vide item 1).

### Média prioridade

5. **Renomear "Tipo" → "Tipo de Pessoa"** na aba Dados Gerais (apenas o `<Label>`).

6. **Renomear "Status" → "Situação da transportadora"** na aba Dados Gerais (apenas o `<Label>`). Badge do header continua só leitura.

7. **Botão "Vincular" — contraste e mensagem**
   - Quando desabilitado por falta de seleção, exibir hint inline: "Selecione um cliente para vincular" (texto pequeno ao lado/abaixo do botão).
   - Quando habilitado, garantir variant default (já é) e remover qualquer classe que esteja apagando o tom (verificar se `disabled` está vazando estilo).

8. **Telefone — confirmar máscara**
   - O campo já usa `MaskedInput mask="telefone"`. Verificar se ao salvar e reabrir o valor é re-mascarado (problema reportado `(11) 21889000`); se vier cru do banco, aplicar `phoneMask` no carregamento do form (linha ~222 e ~286).

9. **Placeholder da aba Obs.**
   - Trocar para: `Registre observações internas sobre atendimento, restrições, preferências ou histórico.`

### Baixa prioridade

10. **Microcopy**
    - Helper text do prazo médio: incluir "(ex.: 3, 5 ou 3-5)" para padronizar entrada enquanto o campo continua texto.

### Fora do escopo (registrar para próxima onda)

- **Estruturação numérica do `prazo_medio`** (mín/máx + unidade): exige migração de schema (`prazo_medio_min int`, `prazo_medio_max int`, `prazo_medio_unidade`), backfill dos textos atuais e ajuste em remessas/relatórios. Anotar em `.lovable/plan.md` como "Onda 34 — Prazo estruturado".
- **WhatsApp/celular separados**: também exige coluna nova; deixar para onda dedicada de "Canais de contato".
- **Validação de e-mail visível**: já existe em `transportadoraSchema`; reforço de UX inline fica para a onda de validação client-side global.

### Detalhes técnicos

- Arquivos tocados: `src/pages/Transportadoras.tsx` (principal). Possível ajuste mínimo em `src/components/ui/MaskedInput` se necessário para reformatar valor inicial — só se o item 8 confirmar o bug.
- Imports adicionais previstos: `useNavigate` (react-router-dom), `Star`/`StarOff`, `ExternalLink` de lucide-react, `cpfCnpjMask`/`phoneMask` (já importados).
- Sem mudanças em RLS, edge functions ou tipos do Supabase.
- Atualizar `.lovable/plan.md` com a Onda 33 e listar Onda 34 (prazo estruturado) como follow-up.