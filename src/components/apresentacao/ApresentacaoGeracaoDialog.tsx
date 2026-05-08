import { useEffect, useMemo, useState } from 'react';
import { Loader2, BarChart3, LineChart, PieChart, Table as TableIcon, LayoutGrid, TrendingUp, Layers, AlignLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { ApresentacaoModoGeracao, ApresentacaoTemplate, SlideConfigItem } from '@/types/apresentacao';
import { APRESENTACAO_SLIDES_V2, SECAO_LABELS, SECAO_ORDEM, type SlideSecao } from '@/lib/apresentacao/slideDefinitions';
import { carregarPreferenciasApresentacao } from '@/services/apresentacaoService';

const CHART_ICON: Record<string, typeof BarChart3> = {
  coluna: BarChart3,
  linha: LineChart,
  barra_horizontal: AlignLeft,
  donut: PieChart,
  tabela: TableIcon,
  cards: LayoutGrid,
  texto: FileText,
  waterfall: TrendingUp,
  stacked: Layers,
};

const SECAO_ACCENT: Record<SlideSecao, string> = {
  capa: 'bg-slate-500',
  financeiro: 'bg-info',
  pessoas: 'bg-warning',
  comercial: 'bg-success',
  operacoes: 'bg-accent',
  risco: 'bg-destructive',
  marketing: 'bg-accent',
  encerramento: 'bg-slate-600',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: ApresentacaoTemplate[];
  onGerar: (params: {
    templateId: string;
    competenciaInicial: string;
    competenciaFinal: string;
    modoGeracao: ApresentacaoModoGeracao;
    slideConfig: SlideConfigItem[];
    exigirRevisao: boolean;
  }) => Promise<void>;
  isGenerating: boolean;
  /** Onda 9.2 (A-04) — cancela a geração em andamento. */
  onCancel?: () => void;
}

export function ApresentacaoGeracaoDialog({ open, onOpenChange, templates, onGerar, isGenerating, onCancel }: Props) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [competenciaInicial, setCompetenciaInicial] = useState(currentMonth);
  const [competenciaFinal, setCompetenciaFinal] = useState(currentMonth);
  const [modoGeracao, setModoGeracao] = useState<ApresentacaoModoGeracao>('dinamico');
  const [exigirRevisao, setExigirRevisao] = useState(true);
  const [enabledSlides, setEnabledSlides] = useState<Record<string, boolean>>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Carrega últimas preferências do usuário ao abrir o diálogo
  useEffect(() => {
    if (!open || prefsLoaded) return;
    let cancelled = false;
    void carregarPreferenciasApresentacao().then((prefs) => {
      if (cancelled || !prefs) { setPrefsLoaded(true); return; }
      if (prefs.ultimo_template_id && templates.some((t) => t.id === prefs.ultimo_template_id)) {
        setTemplateId(prefs.ultimo_template_id);
      }
      if (prefs.ultimo_modo_geracao) setModoGeracao(prefs.ultimo_modo_geracao);
      if (prefs.ultima_competencia_inicial) setCompetenciaInicial(prefs.ultima_competencia_inicial);
      if (prefs.ultima_competencia_final) setCompetenciaFinal(prefs.ultima_competencia_final);
      setExigirRevisao(prefs.exigir_revisao_padrao);
      if (prefs.ultimos_slides_codigos?.length) {
        const map: Record<string, boolean> = {};
        prefs.ultimos_slides_codigos.forEach((c) => { map[c] = true; });
        setEnabledSlides(map);
      }
      setPrefsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [open, prefsLoaded, templates]);

  const slideConfig = useMemo<SlideConfigItem[]>(() => APRESENTACAO_SLIDES_V2.map((s) => ({
    codigo: s.codigo,
    enabled: s.required || enabledSlides[s.codigo] === true,
    order: s.order,
  })), [enabledSlides]);

  const optionalBySection = useMemo(() => {
    const map = new Map<SlideSecao, typeof APRESENTACAO_SLIDES_V2>();
    APRESENTACAO_SLIDES_V2.filter((s) => s.optional).forEach((s) => {
      const arr = map.get(s.secao) ?? [];
      arr.push(s);
      map.set(s.secao, arr);
    });
    return SECAO_ORDEM.filter((sec) => map.has(sec)).map((sec) => ({ secao: sec, slides: map.get(sec)! }));
  }, []);

  const totalEnabled = slideConfig.filter((s) => s.enabled).length;
  const requiredCount = APRESENTACAO_SLIDES_V2.filter((s) => s.required).length;
  const optionalCount = APRESENTACAO_SLIDES_V2.filter((s) => s.optional).length;
  const optionalEnabled = totalEnabled - requiredCount;

  const coverageBySection = useMemo(() => {
    return SECAO_ORDEM.map((sec) => {
      const all = APRESENTACAO_SLIDES_V2.filter((s) => s.secao === sec);
      if (all.length === 0) return null;
      const enabled = all.filter((s) => s.required || enabledSlides[s.codigo] === true).length;
      return { secao: sec, enabled, total: all.length };
    }).filter((g): g is { secao: SlideSecao; enabled: number; total: number } => g !== null);
  }, [enabledSlides]);

  const toggleSection = (secao: SlideSecao, value: boolean) => {
    const codes = optionalBySection.find((g) => g.secao === secao)?.slides.map((s) => s.codigo) ?? [];
    setEnabledSlides((prev) => {
      const next = { ...prev };
      codes.forEach((c) => { next[c] = value; });
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Gerar Apresentação Gerencial (V2)</DialogTitle>
          <DialogDescription>Configure período, modo e slides opcionais antes de gerar.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome} ({t.versao})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="grid gap-1"><Label>Competência inicial</Label><Input type="month" value={competenciaInicial} onChange={(e) => setCompetenciaInicial(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Competência final</Label><Input type="month" value={competenciaFinal} onChange={(e) => setCompetenciaFinal(e.target.value)} /></div>
          </div>
          <div className="grid gap-1">
            <Label>Modo de geração</Label>
            <Select value={modoGeracao} onValueChange={(v) => setModoGeracao(v as ApresentacaoModoGeracao)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="dinamico">dinâmico</SelectItem><SelectItem value="fechado">fechado</SelectItem></SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={exigirRevisao} onChange={(e) => setExigirRevisao(e.target.checked)} />
            Exigir revisão/aprovação antes da geração final
          </label>
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Slides opcionais por seção</p>
              <span className="text-xs text-muted-foreground">
                {totalEnabled} de {requiredCount + optionalCount} slides ({requiredCount} fixos + {optionalEnabled}/{optionalCount} opcionais)
              </span>
            </div>
            <div className="mb-3 flex flex-wrap gap-1">
              {coverageBySection.map(({ secao, enabled, total }) => (
                <Badge key={secao} variant={enabled === total ? 'default' : enabled > 0 ? 'secondary' : 'outline'} className="text-[10px] gap-1">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${SECAO_ACCENT[secao]}`} />
                  {SECAO_LABELS[secao]} {enabled}/{total}
                </Badge>
              ))}
            </div>
            <div className="grid gap-3 max-h-[50vh] sm:max-h-72 overflow-auto pr-1">
              {optionalBySection.map(({ secao, slides }) => {
                const allOn = slides.every((s) => enabledSlides[s.codigo] === true);
                return (
                  <div key={secao} className="rounded border bg-muted/30 p-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${SECAO_ACCENT[secao]}`} />
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{SECAO_LABELS[secao]}</p>
                      </div>
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline px-2 py-1 -mr-2"
                        onClick={() => toggleSection(secao, !allOn)}
                      >
                        {allOn ? 'Desmarcar todos' : 'Selecionar todos'}
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-1">
                      {slides.map((s) => {
                        const Icon = CHART_ICON[s.chartType] ?? FileText;
                        return (
                          <label key={s.codigo} className="text-xs flex items-center gap-2 rounded px-2 py-1.5 hover:bg-background/60 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={enabledSlides[s.codigo] === true}
                              onChange={(e) => setEnabledSlides((prev) => ({ ...prev, [s.codigo]: e.target.checked }))}
                            />
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{s.titulo}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          {isGenerating && onCancel ? (
            <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">Cancelar geração</Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating} className="w-full sm:w-auto">Fechar</Button>
          )}
          <Button disabled={isGenerating || !templateId} className="w-full sm:w-auto" onClick={() => onGerar({ templateId, competenciaInicial, competenciaFinal, modoGeracao, slideConfig, exigirRevisao })}>
            {isGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</> : 'Gerar apresentação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
