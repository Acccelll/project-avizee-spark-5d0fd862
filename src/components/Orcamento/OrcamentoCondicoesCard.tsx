import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface CondicoesForm {
  quantidade_total: number;
  peso_total: number;
  pagamento: string;
  prazo_pagamento: string;
  prazo_entrega: string;
  servico_frete: string;
  modalidade: string;
}

interface Props {
  form: CondicoesForm;
  onChange: (field: keyof CondicoesForm, value: string | number) => void;
}

export function OrcamentoCondicoesCard({ form, onChange }: Props) {
  return (
    <div className="bg-card rounded-xl border shadow-soft p-5">
      <h3 className="font-semibold text-foreground mb-4">Condições Comerciais</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs h-4 flex items-center">Quantidade Total</Label>
          <div className="h-10 flex items-center px-3 bg-accent/30 rounded-md font-mono text-sm">
            {form.quantidade_total}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs h-4 flex items-center">Peso Total (kg)</Label>
          <div className="h-10 flex items-center px-3 bg-accent/30 rounded-md font-mono text-sm">
            {form.peso_total.toFixed(2)}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs h-4 flex items-center">Pagamento</Label>
          <Select value={form.pagamento} onValueChange={(v) => onChange("pagamento", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="a_vista">À Vista</SelectItem>
              <SelectItem value="a_prazo">A Prazo</SelectItem>
              <SelectItem value="boleto_dda">Boleto/DDA</SelectItem>
              <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
              <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="transferencia">Transferência</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs h-4 flex items-center">Prazo</Label>
          <Input
            value={form.prazo_pagamento}
            onChange={(e) => onChange("prazo_pagamento", e.target.value)}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && /^[\d/]+$/.test(v)) onChange("prazo_pagamento", `${v} DDL`);
            }}
            placeholder="Ex: 30/60/90 DDL"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs h-4 flex items-center">Prazo de Entrega</Label>
          <Input
            value={form.prazo_entrega}
            onChange={(e) => onChange("prazo_entrega", e.target.value)}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && /^\d+$/.test(v)) onChange("prazo_entrega", `${v} dias úteis`);
            }}
            placeholder="Ex: 12 dias úteis"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs h-4 flex items-center">Frete</Label>
          <Input value={form.servico_frete} onChange={(e) => onChange("servico_frete", e.target.value)} placeholder="Ex.: SEDEX, Transportadora X" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs h-4 flex items-center">Modalidade</Label>
          <Select value={form.modalidade} onValueChange={(v) => onChange("modalidade", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FOB">FOB</SelectItem>
              <SelectItem value="CIF">CIF</SelectItem>
              <SelectItem value="sem_frete">Sem frete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
