/**
 * Política de senha centralizada — fonte única de verdade para Login,
 * Signup, ResetPassword e a aba "Segurança" das Configurações.
 *
 * Mantém a UX consistente: mesmo mínimo, mesmas regras de complexidade,
 * mesmas mensagens. Antes deste módulo, cada tela tinha sua própria régua
 * (Login/Signup/Reset = 6 chars; Configurações = 8 + complexa) — usuário
 * podia criar senha que não passaria na troca posterior.
 */

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordCriterion {
  key: string;
  label: string;
  met: boolean;
}

export interface PasswordStrength {
  /** Rótulo legível para humanos. */
  label: 'Fraca' | 'Razoável' | 'Boa' | 'Forte' | '';
  /** Nível 0–4 para uso em barras de progresso. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Classe Tailwind (token semântico) sugerida para a barra. */
  bar: string;
}

export interface PasswordValidationResult {
  valid: boolean;
  /** Primeira mensagem de erro relevante (para inline error). */
  error?: string;
  criteria: PasswordCriterion[];
}

/**
 * Avalia critérios estruturais (length, case, digit) sem depender de match.
 * Use `getPasswordCriteriaWithMatch` quando houver campo "confirmar".
 */
export function getPasswordCriteria(pwd: string): PasswordCriterion[] {
  return [
    { key: 'length', label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`, met: pwd.length >= PASSWORD_MIN_LENGTH },
    { key: 'case', label: 'Letras maiúsculas e minúsculas', met: /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) },
    { key: 'digit', label: 'Pelo menos um número', met: /\d/.test(pwd) },
    // Não-obrigatório, apenas visual — alinha com `getPasswordStrength`,
    // que pontua caracteres especiais para chegar a "Forte".
    { key: 'special', label: 'Caractere especial (recomendado)', met: /[^A-Za-z0-9]/.test(pwd) },
  ];
}

/** Versão com critério "confirmação confere" — usado em Signup/Reset/Change. */
export function getPasswordCriteriaWithMatch(pwd: string, confirm: string): PasswordCriterion[] {
  return [
    ...getPasswordCriteria(pwd),
    { key: 'match', label: 'Confirmação confere', met: !!pwd && pwd === confirm },
  ];
}

/** Valida e retorna a primeira mensagem de erro adequada para um inline alert. */
export function validatePassword(pwd: string): PasswordValidationResult {
  const criteria = getPasswordCriteria(pwd);
  // O critério "special" é apenas visual — não entra na validação dura.
  const lengthOk = criteria.find((c) => c.key === 'length')?.met ?? false;
  const caseOk = criteria.find((c) => c.key === 'case')?.met ?? false;
  const digitOk = criteria.find((c) => c.key === 'digit')?.met ?? false;
  if (!pwd) return { valid: false, error: 'Informe uma senha', criteria };
  if (!lengthOk) return { valid: false, error: `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`, criteria };
  if (!caseOk) return { valid: false, error: 'Use letras maiúsculas e minúsculas', criteria };
  if (!digitOk) return { valid: false, error: 'Inclua ao menos um número', criteria };
  return { valid: true, criteria };
}

/** Calcula força visual (independente da validação dura). */
export function getPasswordStrength(pwd: string): PasswordStrength {
  if (!pwd) return { label: '', level: 0, bar: '' };
  let score = 0;
  if (pwd.length >= PASSWORD_MIN_LENGTH) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { label: 'Fraca', level: 1, bar: 'bg-destructive' };
  if (score === 2) return { label: 'Razoável', level: 2, bar: 'bg-warning' };
  if (score === 3) return { label: 'Boa', level: 3, bar: 'bg-warning' };
  return { label: 'Forte', level: 4, bar: 'bg-success' };
}