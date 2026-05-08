import {
  AlertCircle, Check, CheckCircle2, Clock, Eye, EyeOff, Info, Loader2, Lock, Mail, Shield, ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useChangePassword } from '../hooks/useChangePassword';
import { getPasswordCriteriaWithMatch, getPasswordStrength } from '@/lib/passwordPolicy';
import { EmBreve } from '@/components/EmBreve';

export function SegurancaSection() {
  const { user } = useAuth();
  const cp = useChangePassword();
  const isMobile = useIsMobile();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const pwdStrength = getPasswordStrength(cp.newPassword);
  const pwdCriteria = getPasswordCriteriaWithMatch(cp.newPassword, cp.confirmPassword);
  const allCriteriaMet = pwdCriteria.every((c) => c.met);
  // Bloqueia submit em senhas com força "Fraca" (level 1) — alinhado com
  // `validatePassword` em Login/Signup/Reset.
  const strongEnough = pwdStrength.level >= 2;
  const canSubmit = !!cp.currentPassword && allCriteriaMet && strongEnough;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Dados de acesso
          </CardTitle>
          <CardDescription>
            Informações vinculadas à sua conta. O e-mail de acesso não pode ser alterado por aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                E-mail de acesso
              </Label>
              <div className="relative">
                <Input value={user?.email || ''} disabled className="bg-muted pr-9" />
                <Lock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Identificador único da sua conta no sistema.</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Status da conta
              </Label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                {user?.email_confirmed_at ? (
                  <><CheckCircle2 className="h-4 w-4 text-success shrink-0" /><span>Ativa e verificada</span></>
                ) : (
                  <><AlertCircle className="h-4 w-4 text-warning shrink-0" /><span>Aguardando verificação</span></>
                )}
              </div>
            </div>
          </div>
          {user?.last_sign_in_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
              <Clock className="h-4 w-4 shrink-0" />
              <span>
                Último acesso em{' '}
                {new Date(user.last_sign_in_at).toLocaleString('pt-BR', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          )}
          {cp.changedAt && (
            <div className="flex items-center gap-2 text-sm text-success pt-1">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Senha alterada em{' '}
                {cp.changedAt.toLocaleString('pt-BR', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Alterar senha
          </CardTitle>
          <CardDescription>
            Proteja sua conta com uma senha forte. A alteração exige confirmação da senha atual e é aplicada imediatamente após validação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            Para sua segurança, nunca exibimos nem armazenamos a senha atual neste formulário.
          </div>

          <div className="space-y-2 w-full md:max-w-sm">
            <Label htmlFor="current-password">Senha atual</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? 'text' : 'password'}
                value={cp.currentPassword}
                onChange={(e) => {
                  cp.setCurrentPassword(e.target.value);
                  cp.setErrors((p) => ({ ...p, current: undefined }));
                }}
                placeholder="Sua senha atual"
                autoComplete="current-password"
                className={cn('pr-12 min-h-11', cp.errors.current ? 'border-destructive focus-visible:ring-destructive' : '')}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-11 min-w-11 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showCurrent ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {cp.errors.current && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {cp.errors.current}
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-2 w-full md:max-w-sm">
            <Label htmlFor="new-password">Nova senha</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={cp.newPassword}
                onChange={(e) => {
                  cp.setNewPassword(e.target.value);
                  cp.setErrors((p) => ({ ...p, new: undefined }));
                }}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                className={cn('pr-12 min-h-11', cp.errors.new ? 'border-destructive focus-visible:ring-destructive' : '')}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-11 min-w-11 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showNew ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {cp.errors.new && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {cp.errors.new}
              </p>
            )}

            {cp.newPassword && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Força da senha</span>
                  <span className={cn(
                    'text-xs font-medium',
                    pwdStrength.level === 1 && 'text-destructive',
                    pwdStrength.level === 2 && 'text-warning',
                    pwdStrength.level === 3 && 'text-success',
                  )}>
                    {pwdStrength.label}
                  </span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3].map((seg) => (
                    <div
                      key={seg}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors',
                        pwdStrength.level >= seg ? pwdStrength.bar : 'bg-muted'
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 w-full md:max-w-sm">
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={cp.confirmPassword}
                onChange={(e) => {
                  cp.setConfirmPassword(e.target.value);
                  cp.setErrors((p) => ({ ...p, confirm: undefined }));
                }}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                className={cn('pr-12 min-h-11', cp.errors.confirm ? 'border-destructive focus-visible:ring-destructive' : '')}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-11 min-w-11 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showConfirm ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {cp.errors.confirm && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {cp.errors.confirm}
              </p>
            )}
          </div>

          {(cp.newPassword || cp.confirmPassword) && (
            <div className="rounded-lg border bg-muted/30 p-3 md:p-4 space-y-1.5 w-full md:max-w-sm">
              <p className="text-xs font-medium text-foreground mb-1">Critérios da senha</p>
              {pwdCriteria.map(({ key, label, met }) => (
                <div key={key} className={cn('flex items-center gap-2 text-[13px] md:text-xs', met ? 'text-success' : 'text-muted-foreground')}>
                  <Check className={cn('h-3.5 w-3.5 shrink-0', met ? 'opacity-100' : 'opacity-30')} />
                  {label}
                </div>
              ))}
            </div>
          )}

          <div className="hidden md:flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Button onClick={cp.change} disabled={cp.changing || !canSubmit} className="gap-2">
                {cp.changing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {cp.changing ? 'Alterando...' : 'Alterar senha'}
              </Button>
              {!canSubmit && (cp.currentPassword || cp.newPassword || cp.confirmPassword) && (
                <p className="text-xs text-muted-foreground">
                  {!cp.currentPassword ? 'Informe a senha atual para continuar.' : 'Preencha todos os critérios acima.'}
                </p>
              )}
            </div>
            {allCriteriaMet && cp.currentPassword && !cp.changing && (
              <p className="text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Requisitos atendidos. Clique em "Alterar senha" para concluir.
              </p>
            )}
          </div>

          {/* Mobile: spacer para o sticky bar não cobrir conteúdo */}
          {isMobile && cp.currentPassword && <div className="h-20" aria-hidden="true" />}
        </CardContent>
      </Card>

      {/* Mobile: collapsible. Desktop: sempre visível. */}
      <div className="md:hidden">
        <Accordion type="single" collapsible>
          <AccordionItem value="boas-praticas">
            <AccordionTrigger className="min-h-11 text-sm">
              <span className="flex items-center gap-2"><Info className="h-4 w-4" /> Boas práticas de segurança</span>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Use uma senha única, diferente das usadas em outros serviços.</li>
                <li>• Evite senhas óbvias como datas de nascimento ou sequências simples.</li>
                <li>• Não compartilhe sua senha com outras pessoas.</li>
                <li>• Em caso de suspeita de acesso não autorizado, altere a senha imediatamente.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <div className="hidden md:flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">Boas práticas de segurança</p>
          <ul className="space-y-0.5 text-xs">
            <li>• Use uma senha única, diferente das usadas em outros serviços.</li>
            <li>• Evite senhas óbvias como datas de nascimento ou sequências simples.</li>
            <li>• Não compartilhe sua senha com outras pessoas.</li>
            <li>• Em caso de suspeita de acesso não autorizado, altere a senha imediatamente.</li>
          </ul>
        </div>
      </div>

      {/* Sticky save bar mobile — aparece quando há senha atual digitada */}
      {isMobile && cp.currentPassword && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-4px_8px_-4px_rgba(0,0,0,0.08)]">
          <Button
            onClick={cp.change}
            disabled={cp.changing || !canSubmit}
            className="w-full min-h-11 gap-2"
          >
            {cp.changing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {cp.changing ? 'Alterando...' : 'Alterar senha'}
          </Button>
          {!canSubmit && (
            <p className="text-[11px] text-muted-foreground text-center mt-1.5">
              {!cp.currentPassword ? 'Informe a senha atual.' : 'Atenda aos critérios acima.'}
            </p>
          )}
        </div>
      )}

      <AlertDialog open={cp.showSignOutOthers} onOpenChange={cp.setShowSignOutOthers}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar sessões em outros dispositivos?</AlertDialogTitle>
            <AlertDialogDescription>
              Sua senha foi alterada com sucesso. Por segurança, você pode encerrar todas as sessões ativas em outros navegadores e dispositivos. Sua sessão atual permanecerá ativa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cp.signingOutOthers}>Manter sessões</AlertDialogCancel>
            <AlertDialogAction onClick={cp.signOutOthers} disabled={cp.signingOutOthers}>
              {cp.signingOutOthers ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Encerrando...</>
              ) : 'Encerrar outras sessões'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}