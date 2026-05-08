/**
 * useRelatoriosFavoritos — persists report filter configurations per user.
 *
 * Storage strategy:
 *   - When the user is authenticated, favourites live in the
 *     `relatorios_favoritos` table protected by RLS (one row per user).
 *   - When the user is not authenticated, the hook gracefully falls back to
 *     `localStorage` so the UI keeps working in dev / unauthenticated flows.
 *
 * Migration: on first authenticated load, any legacy localStorage entries
 * for the same user are uploaded to the database and then cleared locally,
 * so existing favourites survive the upgrade transparently.
 *
 * Guards:
 *   - Favourites must have a valid `tipo` param to be saved or loaded.
 *   - Duplicate names are rejected (case-insensitive) at hook level and
 *     enforced by a unique index in the database.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  listRelatoriosFavoritos,
  insertRelatoriosFavoritos,
  insertRelatorioFavorito,
  deleteRelatorioFavorito,
  renameRelatorioFavorito,
} from "@/services/relatoriosFavoritos.service";

const STORAGE_KEY = "relatorios_favoritos_v1";

export interface RelatorioFavorito {
  id: string;
  nome: string;
  /** Serialised URLSearchParams string, e.g. "tipo=vendas&di=2024-01-01" */
  params: string;
  criadoEm: string;
}

interface DbRow {
  id: string;
  nome: string;
  params: string;
  criado_em: string;
}

function rowToFavorito(row: DbRow): RelatorioFavorito {
  return { id: row.id, nome: row.nome, params: row.params, criadoEm: row.criado_em };
}

function isValidFavorito(f: unknown): f is RelatorioFavorito {
  if (!f || typeof f !== "object") return false;
  const fav = f as Record<string, unknown>;
  if (!fav.id || !fav.nome || !fav.params || !fav.criadoEm) return false;
  return !!new URLSearchParams(String(fav.params)).get("tipo");
}

function loadLocal(): RelatorioFavorito[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed.filter(isValidFavorito) : [];
  } catch {
    return [];
  }
}

function saveLocal(items: RelatorioFavorito[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useRelatoriosFavoritos() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [favoritos, setFavoritos] = useState<RelatorioFavorito[]>(() => loadLocal());

  // ── Sync from server when authenticated; migrate localStorage one-shot ──
  useEffect(() => {
    if (!userId) {
      setFavoritos(loadLocal());
      return;
    }

    let cancelled = false;

    (async () => {
      // 1. Load existing rows for this user
      const { data, error } = await listRelatoriosFavoritos();

      if (cancelled) return;
      if (error) {
        console.error("[useRelatoriosFavoritos] load error", error);
        return;
      }

      const remote = (data ?? []).map(rowToFavorito);

      // 2. One-shot migration of legacy localStorage entries
      const local = loadLocal();
      if (local.length) {
        const remoteNames = new Set(remote.map((f) => f.nome.toLowerCase()));
        const toMigrate = local.filter((f) => !remoteNames.has(f.nome.toLowerCase()));
        if (toMigrate.length) {
          const { data: inserted, error: insertErr } = await insertRelatoriosFavoritos(
            toMigrate.map((f) => ({
              user_id: userId,
              nome: f.nome,
              params: f.params,
              criado_em: f.criadoEm,
            })),
          );
          if (!insertErr && inserted) {
            remote.push(...inserted.map(rowToFavorito));
            // Onda 9.2 (A-06) — feedback explícito após migração local→DB.
            const n = inserted.length;
            toast.success(
              n === 1
                ? '1 favorito de Relatórios migrado da máquina para a sua conta.'
                : `${n} favoritos de Relatórios migrados da máquina para a sua conta.`,
            );
          } else if (insertErr) {
            console.error('[useRelatoriosFavoritos] migration insert error', insertErr);
            toast.warning('Não foi possível migrar todos os favoritos locais. Eles continuam disponíveis nesta máquina.');
          }
        }
        // Clear local cache after the attempt to avoid repeated migration loops
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      }

      if (!cancelled) setFavoritos(remote);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  /**
   * Saves the current filter configuration as a named favourite.
   * Returns the created item, or null when:
   *   - nome is empty
   *   - searchParams has no `tipo`
   *   - a favourite with the same name already exists
   */
  const salvar = useCallback(
    async (nome: string, searchParams: URLSearchParams): Promise<RelatorioFavorito | null> => {
      const nomeClean = nome.trim();
      if (!nomeClean) return null;
      if (!searchParams.get("tipo")) return null;

      // Reject duplicate names locally (server enforces it via unique index too)
      if (favoritos.some((f) => f.nome.toLowerCase() === nomeClean.toLowerCase())) {
        toast.warning(`Já existe um favorito com o nome "${nomeClean}".`);
        return null;
      }

      const params = searchParams.toString();

      if (!userId) {
        const novo: RelatorioFavorito = {
          id: crypto.randomUUID(),
          nome: nomeClean,
          params,
          criadoEm: new Date().toISOString(),
        };
        const updated = [...favoritos, novo];
        setFavoritos(updated);
        saveLocal(updated);
        return novo;
      }

      const { data, error } = await insertRelatorioFavorito({ user_id: userId, nome: nomeClean, params });

      if (error || !data) {
        console.error("[useRelatoriosFavoritos] insert error", error);
        toast.error("Não foi possível salvar o favorito.");
        return null;
      }

      const novo = rowToFavorito(data);
      setFavoritos((prev) => [...prev, novo]);
      return novo;
    },
    [favoritos, userId],
  );

  const remover = useCallback(
    async (id: string): Promise<void> => {
      if (!userId) {
        setFavoritos((prev) => {
          const updated = prev.filter((f) => f.id !== id);
          saveLocal(updated);
          return updated;
        });
        return;
      }
      const { error } = await deleteRelatorioFavorito(id);
      if (error) {
        console.error("[useRelatoriosFavoritos] delete error", error);
        toast.error("Não foi possível remover o favorito.");
        return;
      }
      setFavoritos((prev) => prev.filter((f) => f.id !== id));
    },
    [userId],
  );

  const renomear = useCallback(
    async (id: string, novoNome: string): Promise<void> => {
      const nomeClean = novoNome.trim();
      if (!nomeClean) return;
      if (!userId) {
        setFavoritos((prev) => {
          const updated = prev.map((f) => (f.id === id ? { ...f, nome: nomeClean } : f));
          saveLocal(updated);
          return updated;
        });
        return;
      }
      const { error } = await renameRelatorioFavorito(id, nomeClean);
      if (error) {
        console.error("[useRelatoriosFavoritos] rename error", error);
        toast.error("Não foi possível renomear o favorito.");
        return;
      }
      setFavoritos((prev) => prev.map((f) => (f.id === id ? { ...f, nome: nomeClean } : f)));
    },
    [userId],
  );

  return { favoritos, salvar, remover, renomear };
}
