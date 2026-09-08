# Materiais impressos — fluxo de trabalho (Missão Paraná)

App interno para rodar o fluxo: Entrada → Arte → Validação técnica (automática no upload) → Aprovação executiva e política → Envio para produção.

Stack: React (Vite) + Supabase (Postgres, Auth, Storage) + Vercel. O validador roda no navegador (pdf.js + pdf-lib), nenhum PDF passa por servidor próprio.

## 1. Supabase
1. Crie um projeto em supabase.com (região São Paulo).
2. SQL Editor → cole e rode `supabase/migrations/0001_init.sql`.
3. Authentication → Providers → Email: deixe "Confirm email" desligado (uso interno).
4. Authentication → Users → "Add user" para cada pessoa (e-mail + senha). O perfil é criado automaticamente.
5. Table Editor → `perfis`: mude o `papel` do Flávio para `coordenacao` (só ele aprova como coordenação).
6. Project Settings → API: copie a URL e a `anon` key.

## 2. Rodar local (macOS)
```bash
cp .env.example .env      # preencha com URL e anon key
npm install
npm run dev
```

## 3. Vercel
```bash
npm i -g vercel && vercel
```
Em Settings → Environment Variables adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Framework: Vite. `vercel.json` já trata as rotas do SPA.

## Como o fluxo funciona no app
| Etapa | Quem | O que acontece |
|---|---|---|
| Entrada | qualquer um | Cria a demanda (origem, candidato, peça, tamanho final, prazo, briefing) |
| Arte | designer | Assume, envia o PDF. A validação roda na hora: formato/sangria, CMYK, dpi efetivo, curvas, margem de segurança. Reprovado fica em Arte; OK vai para Aprovação |
| Aprovação | Flávio + candidato | Prova PNG com marcas é gerada. Flávio aprova no app; a resposta do candidato (via WhatsApp) é registrada pelo designer. "Ajustes" volta para Arte com o comentário |
| Fechamento | designer | Anexa o PDF/X-1a final e marca como enviado à gráfica |

Tudo fica no histórico da demanda (quem fez o quê e quando).

## Próximos passos possíveis
- Link público de aprovação para o candidato (sem login).
- Aviso no WhatsApp quando a prova estiver pronta.
- Geração automática do PDF/X-1a (Ghostscript numa Edge Function).
