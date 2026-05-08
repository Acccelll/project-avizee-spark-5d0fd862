import { CalendarDays, Clock, Loader2, Lock, Mail, Save, Shield } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProfileForm } from '../hooks/useProfileForm';
import { ROLE_LABELS } from '@/lib/permissions';

export function MeuPerfilSection() {
  const { user, roles } = useAuth();
  const { nome, setNome, cargo, setCargo, saving, savedAt, dirty, save, validationError } = useProfileForm();
  const isMobile = useIsMobile();

  const initials = nome.trim()
    ? nome.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : (user?.email || 'U').substring(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold truncate">{nome || 'Usuário'}</h3>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {cargo && <Badge variant="secondary">{cargo}</Badge>}
                {roles.map((role) => (
                  <Badge key={role} variant="outline" className="gap-1">
                    <Shield className="h-3 w-3" />
                    {ROLE_LABELS[role] ?? role}
                  </Badge>
                ))}
                {user?.email_confirmed_at && (
                  <Badge variant="outline" className="text-success border-success/30 bg-success/10">
                    Ativo
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0" />
              <span className="truncate">{user?.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span>
                Membro desde{' '}
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                  : '—'}
              </span>
            </div>
            {user?.last_sign_in_at && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  Último acesso{' '}
                  {new Date(user.last_sign_in_at).toLocaleString('pt-BR', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados pessoais editáveis</CardTitle>
          <CardDescription>
            Atualize como você é identificado internamente no sistema. Dados de conta e permissões ficam em blocos separados para evitar confusão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome"
                maxLength={80}
                aria-invalid={!!validationError && nome.trim().length < 2}
              />
              {validationError && nome.trim().length < 2 && (
                <p className="text-xs text-destructive">{validationError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Ex: Gerente Comercial"
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">Exibido no sistema em contextos internos, quando aplicável.</p>
            </div>
          </div>
          <div className="hidden md:flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {savedAt
                ? `Último salvamento: ${savedAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                : 'Sem alterações salvas nesta sessão.'}
            </p>
            <Button onClick={save} disabled={saving || !dirty} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {dirty ? 'Salvar perfil' : 'Perfil atualizado'}
            </Button>
          </div>
          {/* Mobile: status compacto inline; o botão real fica em sticky bar abaixo */}
          <p className="md:hidden text-xs text-muted-foreground">
            {savedAt
              ? `Último: ${savedAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
              : 'Sem alterações salvas.'}
          </p>
        </CardContent>
      </Card>

      {/* Mobile: corporativos colapsado por padrão */}
      <div className="md:hidden">
        <Accordion type="single" collapsible>
          <AccordionItem value="corporativos" className="border rounded-lg px-4">
            <AccordionTrigger className="min-h-11 text-sm">
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Dados corporativos e de acesso
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    E-mail de acesso
                  </Label>
                  <div className="relative">
                    <Input value={user?.email || ''} disabled className="bg-muted pr-9" />
                    <Lock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                {roles.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      Perfil de acesso
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role) => (
                        <Badge key={role} variant="secondary">
                          {ROLE_LABELS[role] ?? role}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Gerenciado pelo administrador.
                    </p>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Dados corporativos e de acesso
          </CardTitle>
          <CardDescription>
            Esses dados são globais ou administrativos. Você visualiza aqui, mas a alteração não ocorre na tela pessoal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              E-mail de acesso
            </Label>
            <div className="relative">
              <Input value={user?.email || ''} disabled className="bg-muted pr-9" />
              <Lock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              Este é o e-mail de acesso da sua conta. Não pode ser alterado por aqui.
            </p>
          </div>
          {roles.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Perfil de acesso
              </Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {ROLE_LABELS[role] ?? role}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Seu perfil de acesso é gerenciado pelo administrador do sistema.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky save bar mobile — aparece quando dirty */}
      {isMobile && dirty && (
        <>
          <div className="h-20" aria-hidden="true" />
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-4px_8px_-4px_rgba(0,0,0,0.08)]">
            <Button onClick={save} disabled={saving} className="w-full min-h-11 gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar perfil
            </Button>
          </div>
        </>
      )}
    </div>
  );
}