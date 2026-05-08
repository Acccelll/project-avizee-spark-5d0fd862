/**
 * Utilitários da aba Configurações.
 *
 * A política de senha foi unificada em `@/lib/passwordPolicy` para que
 * Login, Signup, Reset e a aba Segurança usem a mesma régua. Este arquivo
 * mantém apenas helpers visuais de Aparência. `ROLE_LABELS` foi removido
 * (estava desatualizado com 4 roles) — importe de `@/lib/permissions`.
 */

export function getFontLabel(scale: number): string {
  if (scale <= 16) return 'Padrão';
  if (scale <= 18) return 'Médio';
  if (scale <= 20) return 'Grande';
  return 'Máximo';
}

export interface AppearanceDefaults {
  theme: string;
  densidade: string;
  fontScale: number;
  menuCompacto: boolean;
  reduceMotion: boolean;
  corPrimaria: string;
  corSecundaria: string;
}

export const APPEARANCE_DEFAULTS: AppearanceDefaults = {
  theme: 'system',
  densidade: 'confortavel',
  fontScale: 16,
  menuCompacto: true,
  reduceMotion: false,
  corPrimaria: '#6b0d0d',
  corSecundaria: '#b85b2d',
};