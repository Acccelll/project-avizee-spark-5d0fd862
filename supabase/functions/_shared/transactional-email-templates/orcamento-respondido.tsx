/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'AviZee'

const brand = {
  primary: '#690500',
  secondary: '#b2592c',
  ok: '#16a34a',
  warn: '#ea580c',
  bg: '#FFF8E5',
  card: '#ffffff',
  text: '#1a1815',
  muted: '#5a5852',
  border: '#ecdfc4',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

interface OrcamentoRespondidoProps {
  numero?: string
  clienteNome?: string
  acao?: 'aprovado' | 'rejeitado'
  comentario?: string
  respondidoEm?: string
  linkInterno?: string
}

const OrcamentoRespondidoEmail = ({
  numero = '0000',
  clienteNome,
  acao = 'aprovado',
  comentario,
  respondidoEm,
  linkInterno = '#',
}: OrcamentoRespondidoProps) => {
  const aprovado = acao === 'aprovado'
  const titulo = aprovado
    ? `Orçamento ${numero} foi aceito pelo cliente`
    : `Cliente solicitou revisão do orçamento ${numero}`
  const cor = aprovado ? brand.ok : brand.warn
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{titulo}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: brand.fontFamily, margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
          <Section style={{ background: brand.card, border: `1px solid ${brand.border}`, borderLeft: `6px solid ${cor}`, borderRadius: 10, padding: '24px 24px 18px' }}>
            <Text style={{ fontSize: 11, letterSpacing: 1.5, color: cor, fontWeight: 700, margin: 0 }}>
              {aprovado ? 'RESPOSTA DO CLIENTE · ACEITE' : 'RESPOSTA DO CLIENTE · REVISÃO'}
            </Text>
            <Heading style={{ fontSize: 20, color: brand.text, margin: '6px 0 14px', lineHeight: 1.3 }}>
              {titulo}
            </Heading>
            {clienteNome && (
              <Text style={{ fontSize: 14, color: brand.muted, margin: '0 0 6px' }}>
                <strong style={{ color: brand.text }}>Cliente:</strong> {clienteNome}
              </Text>
            )}
            {respondidoEm && (
              <Text style={{ fontSize: 14, color: brand.muted, margin: '0 0 14px' }}>
                <strong style={{ color: brand.text }}>Respondido em:</strong> {respondidoEm}
              </Text>
            )}
            {comentario && (
              <Section style={{ background: brand.bg, border: `1px solid ${brand.border}`, borderRadius: 8, padding: '12px 14px', margin: '6px 0 18px' }}>
                <Text style={{ fontSize: 11, letterSpacing: 1.2, color: brand.primary, fontWeight: 700, margin: '0 0 6px' }}>
                  COMENTÁRIO DO CLIENTE
                </Text>
                <Text style={{ fontSize: 14, color: brand.text, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                  {comentario}
                </Text>
              </Section>
            )}
            <Hr style={{ border: 'none', borderTop: `1px solid ${brand.border}`, margin: '14px 0' }} />
            <Text style={{ fontSize: 13, color: brand.muted, margin: '0 0 14px' }}>
              {aprovado
                ? 'Avance no ERP para converter em pedido.'
                : 'Abra no ERP para criar uma nova revisão e reenviar.'}
            </Text>
            <Button
              href={linkInterno}
              style={{ background: cor, color: '#fff', padding: '11px 18px', borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Abrir orçamento no {SITE_NAME}
            </Button>
          </Section>
          <Text style={{ fontSize: 11, color: brand.muted, textAlign: 'center', marginTop: 16 }}>
            Notificação automática · {SITE_NAME}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OrcamentoRespondidoEmail,
  subject: (data: Record<string, unknown>) => {
    const numero = (data?.numero as string) ?? ''
    const acao = (data?.acao as string) ?? 'aprovado'
    return acao === 'aprovado'
      ? `Orçamento ${numero} aceito pelo cliente`
      : `Orçamento ${numero} — cliente solicitou revisão`
  },
  displayName: 'Resposta do cliente ao orçamento',
  previewData: {
    numero: '2025-0123',
    clienteNome: 'Cliente Exemplo Ltda',
    acao: 'rejeitado',
    comentario: 'Por favor revisar o prazo de entrega para 10 dias úteis.',
    respondidoEm: '07/05/2026 14:30',
    linkInterno: 'https://app.example.com/orcamentos/123',
  },
} satisfies TemplateEntry