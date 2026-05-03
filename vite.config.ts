import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega .env / .env.<mode> para o escopo do config. Sem isto, `process.env`
  // não enxerga as vars do arquivo .env (Vite só popula `import.meta.env`),
  // o que fazia o `define` abaixo emitir strings vazias e quebrar
  // `isSupabaseConfigured` em runtime (bug observado no /login do preview).
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), "") };
  return {
  define: {
    // Sem fallback hardcoded: o ambiente DEVE prover essas envs.
    // O Lovable Cloud injeta automaticamente em preview/produção; em dev local,
    // copie .env.example para .env. `isSupabaseConfigured` em
    // src/integrations/supabase/client.ts trata o caso de envs ausentes.
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      env.VITE_SUPABASE_URL ?? "",
    ),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        env.VITE_SUPABASE_ANON_KEY ||
        "",
    ),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
      env.VITE_SUPABASE_PROJECT_ID ?? "",
    ),
    "import.meta.env.VITE_APP_URL": JSON.stringify(
      env.VITE_APP_URL ?? "",
    ),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  esbuild: {
    // Strip de console.* e debugger no bundle de produção.
    // Logs críticos em dev devem usar `@/lib/logger` para preservar rastreabilidade.
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // PWA leve: precache de assets do build, runtime cache para listas críticas
    // (clientes, fornecedores, produtos) e fontes do Google. SW só ativa em
    // produção — `devOptions.enabled = false` mantém o dev sem service worker
    // para evitar conflitos com HMR.
    VitePWA({
      // `autoUpdate` é crítico para PWA instalado em mobile: sem isto, um
      // bundle JS antigo (com envs vazias após mudança no .env, p.ex.) ficava
      // servido eternamente do precache porque o usuário nunca via o prompt
      // de "atualizar". Agora o SW novo assume sozinho na próxima navegação.
      registerType: "autoUpdate",
      injectRegister: false, // registramos manualmente em src/lib/pwa.ts
      includeAssets: ["favicon.ico", "robots.txt", "images/pwa-192.png", "images/pwa-512.png"],
      manifest: {
        name: "Sistema AviZee",
        short_name: "AviZee",
        description: "ERP AviZee - Sistema de Gestão Empresarial",
        // Cores oficiais da marca AviZee. Lembrete: theme_color e
        // background_color são "pinados" no momento da instalação — quem já
        // tem o app instalado precisa reinstalar para ver as novas cores.
        theme_color: "#b2592c",
        background_color: "#690500",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        lang: "pt-BR",
        icons: [
          { src: "/images/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/images/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/images/pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Remove precaches de versões antigas e ativa o SW novo imediatamente.
        // Sem isto, dispositivos ficavam presos a um bundle JS antigo onde
        // `import.meta.env.VITE_SUPABASE_URL` foi compilado como string vazia,
        // disparando "serviço de autenticação não foi carregado" no /login.
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Não interceptar Supabase realtime/auth nem edge functions — devem
        // sempre ir à rede para evitar payloads obsoletos em mutations.
        navigateFallbackDenylist: [/^\/api\//, /\/functions\/v1\//, /\/auth\/v1\//, /\/realtime\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Listas de leitura (clientes/fornecedores/produtos) — SWR de 5min.
            // Mutations (POST/PATCH/DELETE) NUNCA são cacheadas — Workbox só
            // intercepta GET por padrão.
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              /\/rest\/v1\/(clientes|fornecedores|produtos|app_configuracoes)/.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-listas",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  };
});
