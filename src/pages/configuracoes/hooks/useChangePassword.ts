import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { notifyError } from '@/utils/errorMessages';
import { getPasswordCriteriaWithMatch, getPasswordStrength, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';
import {
  verifyPasswordReauth,
  updateUserPassword,
  signOutOtherSessions,
  logSelfUpdateAudit,
} from '@/services/auth.service';

export interface PasswordErrors {
  current?: string;
  new?: string;
  confirm?: string;
}

/**
 * Encapsula o fluxo "Alterar senha":
 *  1. Re-autentica com a senha atual.
 *  2. Atualiza a senha via `auth.updateUser`.
 *  3. Mapeia erros comuns da política do servidor.
 *  4. Registra auditoria self-update.
 *  5. Sinaliza ao caller que o diálogo "encerrar outras sessões" deve abrir.
 */
export function useChangePassword() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [changing, setChanging] = useState(false);
  const [changedAt, setChangedAt] = useState<Date | null>(null);
  const [showSignOutOthers, setShowSignOutOthers] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  const change = async () => {
    const criteria = getPasswordCriteriaWithMatch(newPassword, confirmPassword);
    // Lookup por chave: a lista inclui o critério visual `special` que
    // não entra na validação dura, então destructuring posicional quebraria.
    const get = (k: string) => criteria.find((c) => c.key === k)?.met ?? false;
    const lengthOk = get('length');
    const caseOk = get('case');
    const digitOk = get('digit');
    const matchOk = get('match');
    const strength = getPasswordStrength(newPassword);
    const next: PasswordErrors = {};
    if (!currentPassword) next.current = 'Informe a senha atual';
    if (!newPassword || !lengthOk) next.new = `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`;
    else if (!caseOk) next.new = 'Use letras maiúsculas e minúsculas';
    else if (!digitOk) next.new = 'Inclua ao menos um número';
    else if (strength.level < 2) next.new = 'Senha muito fraca — combine maiúsculas, minúsculas, números e mais caracteres.';
    if (newPassword && confirmPassword && !matchOk) next.confirm = 'As senhas não coincidem';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    setChanging(true);
    try {
      const signInError = await verifyPasswordReauth({
        email: user!.email!,
        password: currentPassword,
      });
      if (signInError) {
        setErrors({ current: 'Senha atual incorreta' });
        setChanging(false);
        return;
      }
      try {
        await updateUserPassword(newPassword);
      } catch (error: unknown) {
        const msg = (error instanceof Error ? error.message : '').toLowerCase();
        if (msg.includes('weak') || (msg.includes('password') && msg.includes('short'))) {
          setErrors({ new: 'A senha não atende à política mínima do servidor. Use uma senha mais forte.' });
          setChanging(false);
          return;
        }
        if (msg.includes('same') || msg.includes('different')) {
          setErrors({ new: 'A nova senha precisa ser diferente da senha atual.' });
          setChanging(false);
          return;
        }
        throw error;
      }
      toast.success('Senha alterada com sucesso!');
      try {
        await logSelfUpdateAudit({
          tipoAcao: 'self_password_change',
          entidade: 'auth.users',
          entidadeId: user!.id,
          alteracao: { evento: 'password_changed' },
          motivo: 'troca de senha pelo próprio usuário',
        });
      } catch (auditErr) {
        console.warn('[perfil] auditoria self-password falhou:', auditErr);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangedAt(new Date());
      setShowSignOutOthers(true);
    } catch (err: unknown) {
      console.error('[perfil] password:', err);
      notifyError(err);
    }
    setChanging(false);
  };

  const signOutOthers = async () => {
    setSigningOutOthers(true);
    try {
      await signOutOtherSessions();
      toast.success('Sessões em outros dispositivos foram encerradas.');
      setShowSignOutOthers(false);
    } catch (err: unknown) {
      console.error('[perfil] signOut others:', err);
      notifyError(err);
    }
    setSigningOutOthers(false);
  };

  return {
    currentPassword, setCurrentPassword,
    newPassword, setNewPassword,
    confirmPassword, setConfirmPassword,
    errors, setErrors,
    changing, changedAt,
    change,
    showSignOutOthers, setShowSignOutOthers,
    signingOutOthers,
    signOutOthers,
  };
}