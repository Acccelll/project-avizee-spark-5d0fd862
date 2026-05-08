import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/format';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { SocialPost } from '@/types/social';
import { EmptyState } from '@/components/ui/empty-state';
import { Plug } from 'lucide-react';

interface Props {
  historicoComparativo: Array<{ plataforma: string; seguidores_novos: number; taxa_engajamento_media: number }>;
  melhoresPosts: SocialPost[];
  pioresPosts: SocialPost[];
  growthPercent: number;
  postingFrequency: number;
  contentDistribution: Array<{ tipo: string; total: number }>;
  trendLabel: 'alta' | 'estavel' | 'queda';
}

export function SocialDashboardTab({
  historicoComparativo,
  melhoresPosts,
  pioresPosts,
  growthPercent,
  postingFrequency,
  contentDistribution,
  trendLabel,
}: Props) {
  // Sem contas conectadas / sem dados no período → CTA dedicado em vez de zeros.
  if (!historicoComparativo.length) {
    return (
      <Card>
        <CardContent className="py-2">
          <EmptyState
            variant="firstUse"
            icon={Plug}
            title="Conecte uma conta para ver métricas"
            description="Sem contas conectadas, o dashboard fica vazio. Vá para a aba Contas conectadas e conecte um perfil do Instagram ou LinkedIn."
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Crescimento no período</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{growthPercent.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">Comparado com período anterior equivalente</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Frequência de postagem</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{postingFrequency.toFixed(2)} / dia</p>
            <p className="text-xs text-muted-foreground">Média de posts por dia no filtro ativo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Tendência</CardTitle></CardHeader>
          <CardContent>
            <Badge variant={trendLabel === 'alta' ? 'default' : trendLabel === 'queda' ? 'destructive' : 'secondary'}>
              {trendLabel}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Crescimento de seguidores por rede</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historicoComparativo}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="plataforma" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="seguidores_novos" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {contentDistribution.map((item) => (
                <div key={item.tipo} className="flex items-center justify-between text-sm border rounded p-2">
                  <span className="capitalize">{item.tipo}</span>
                  <Badge variant="outline">{item.total}</Badge>
                </div>
              ))}
              {!contentDistribution.length && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Melhor post</CardTitle></CardHeader>
          <CardContent>
            {melhoresPosts[0] ? (
              <div className="rounded border p-3">
                <p className="font-medium text-sm">{melhoresPosts[0].titulo_legenda || 'Sem título'}</p>
                <p className="text-xs text-muted-foreground">{formatDate(melhoresPosts[0].data_publicacao)} · {melhoresPosts[0].tipo_post}</p>
                <p className="text-xs mt-2">Engajamento: <strong>{formatNumber(melhoresPosts[0].engajamento_total || 0)}</strong></p>
              </div>
            ) : <p className="text-sm text-muted-foreground">Sem postagens no período.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pior post</CardTitle></CardHeader>
          <CardContent>
            {pioresPosts[0] ? (
              <div className="rounded border p-3">
                <p className="font-medium text-sm">{pioresPosts[0].titulo_legenda || 'Sem título'}</p>
                <p className="text-xs text-muted-foreground">{formatDate(pioresPosts[0].data_publicacao)} · {pioresPosts[0].tipo_post}</p>
                <p className="text-xs mt-2">Engajamento: <strong>{formatNumber(pioresPosts[0].engajamento_total || 0)}</strong></p>
              </div>
            ) : <p className="text-sm text-muted-foreground">Sem postagens no período.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
