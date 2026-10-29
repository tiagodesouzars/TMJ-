# TMJ Squad: Integração Supabase Storage & Upload Otimizado do Vault

Transição arquitetural do armazenamento de mídias do Vault para o **Supabase Storage** (bucket `tmj-media`), liberando espaço no banco de dados Firestore e garantindo alta performance com compressão inteligente no navegador e barra de progresso em tempo real.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> As seguintes decisões foram confirmadas com base no alinhamento das respostas:

- **Escopo do Supabase**: Fotos e vídeos postados no **Vault** serão enviados para o bucket `tmj-media` do Supabase Storage. O chat em tempo real permanece no Firestore com mensagens de texto e áudio otimizados.
- **Compressão Otimizada**: Imagens serão redimensionadas e comprimidas via Canvas no cliente (máx. 1600px na maior dimensão, 85% de qualidade JPEG), reduzindo arquivos de 4–8MB para ~200–350KB antes do envio, preservando a cota gratuita de 1GB do Supabase.
- **Feedback Visual de Upload**: Durante o envio para o Supabase, o modal exibirá uma barra de progresso visual com porcentagem precisa e aviso de upload ativo, impedindo envios duplicados.
- **Credenciais Supabase**: Configuração centralizada em `src/supabaseClient.ts` com a URL e chave anônima pública fornecidas.

---

## 1. Overview & Core Concept

- **O que faz**: Permite que os membros do trio TMJ (e novos usuários à medida que a comunidade crescer) enviem fotos de alta definição e vídeos sem sobrecarregar o limite de 1MB por documento do Firestore. A mídia física é enviada ao Supabase Storage e a URL pública gerada é gravada no documento do Firestore em `artifacts/triotmj-3187e/public/data/tmj_vault`.
- **Público-alvo**: O trio TMJ (Tiago, Jorge, Marcus) e convidados da cena streetwear / beats / skate.
- **Principal Benefício**: Uploads rápidos, armazenamento escalável no bucket Supabase sem custo de cartão de crédito e persistência em tempo real dos drops, reações e comentários no Firestore.

---

## 2. User Experience & Visual Design

- **Fluxo do Usuário no Upload**:
  1. O usuário clica no botão central **+ DROP** (ou seleciona mídia no Vault).
  2. Escolhe uma foto ou vídeo local do celular/desktop.
  3. A imagem é instantaneamente pré-visualizada e compactada em background pelo Canvas (1600px / 85%).
  4. Ao clicar em **PUBLICAR DROP**, o botão entra em estado de envio e uma barra de progresso estilizada (preto & acid yellow `#ccff00`) mostra o progresso do envio em tempo real `[ 0% ───> 100% ]`.
  5. Concluído o upload, a URL pública do Supabase é salva no Firestore e o card aparece instantaneamente no feed/grade do Vault.
- **Estética & Identidade Visual**:
  - Estilo Streetwear / Industrial / Skatepunk mantido integralmente.
  - Paleta com fundo Bunker/Asphalt escuro, tipografia de alta legibilidade, acentos em Acid Lime (`#ccff00`), Urban Orange (`#ff5500`) e Spray Cyan (`#00e5ff`).
  - Botões táteis com hitbox mínimo de 44px, feedback ativo com clique e micro-animações.
- **Estados de Erro & Resiliência**:
  - Tratamento visual caso o bucket `tmj-media` encontre erro ou falha de conexão (com mensagem clara e opção de tentar novamente).
  - Fallback suave para imagens do Vault com `referrerPolicy="no-referrer"` e container estilizado contra quebras.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Abordagem Híbrida (Supabase Storage + Firebase Firestore)**
  - *Escolhido*: Armazenar arquivos binários (imagens e vídeos) no bucket do Supabase e manter o banco de dados em tempo real, presença e autenticação no Firebase Firestore.
  - *Por que*: O plano Spark gratuito do Firestore não inclui Firebase Storage sem cartão de crédito, enquanto o Supabase oferece 1GB de storage gratuito e alta taxa de transferência. Essa divisão mantém a arquitetura 100% gratuita e robusta.
  - *Alternativas Descartadas*: Salvar imagens inteiras em base64 no Firestore (ultrapassa o limite de 1MB e satura o banco de dados) ou usar serviços de imagem temporários externos.

- **Decisão 2: Compressão no Navegador (Client-side Canvas)**
  - *Escolhido*: Redimensionamento proporcional (limite de 1600px) e conversão para JPEG 85% de qualidade antes do upload.
  - *Por que*: Reduz em até 90% os bytes transferidos pela rede móvel, acelera o upload para menos de 1 segundo e permite armazenar milhares de fotos nos 1GB do Supabase.

---

## 4. Technical Architecture & Data Strategy

```
┌───────────────────────────────────────────────────────────────┐
│                       TMJ WEB / PWA APP                       │
├───────────────────────────────┬───────────────────────────────┤
│    CLIENT-SIDE COMPRESSION    │     SUPABASE STORAGE CLIENT   │
│  • Canvas Resize (max 1600px) │  • uploadMediaToSupabase()    │
│  • JPEG 0.85 Quality Output   │  • Bucket: 'tmj-media'        │
│  • Blob conversion (<350KB)   │  • XMLHttpRequest Progress    │
└──────────────┬────────────────┴───────────────┬───────────────┘
               │                                │
      [Compressed Blob]               [Upload Binary Stream]
               │                                │
               ▼                                ▼
     ┌──────────────────┐             ┌───────────────────┐
     │  Preview Modal   │             │  Supabase Storage │
     │  & Progress Bar  │             │   ('tmj-media')   │
     └──────────────────┘             └─────────┬─────────┘
                                                │
                                        [Public URL String]
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │   Firebase Firestore  │
                                    │   • tmj_vault docs    │
                                    │   • Realtime listener │
                                    └───────────────────────┘
```

### Componentes e Módulos Afetados
1. **`package.json`**: Adição de `@supabase/supabase-js`.
2. **`src/supabaseClient.ts`**: Cliente Supabase configurado com a URL `https://fequekmlticzqxtzucdh.supabase.co` e a anon key do projeto.
3. **`src/utils/mediaUploader.ts`**:
   - `compressImageForUpload(file: File): Promise<Blob>`: Compressão e redimensionamento inteligente (1600px / 85%).
   - `uploadVaultMediaToSupabase(file: File | Blob, onProgress?: (pct: number) => void): Promise<string>`: Upload direto para o bucket `tmj-media` com nome único `${Date.now()}_${userId}.${ext}` e retorno da URL pública.
4. **`src/App.tsx` & `src/components/UploadModal.tsx`**:
   - Adição do estado de envio `isUploading`, `uploadProgressPercent`, e barra de progresso visual.
   - Substituição do salvamento de base64 cru no Firestore pelo upload no Supabase e gravação da URL pública no documento `tmj_vault`.
   - Limpeza de qualquer dependência residual de Firebase Storage.

---

## 5. Implementation Steps

1. **Instalação do Pacote**: Executar instalação do pacote `@supabase/supabase-js`.
2. **Criação do Cliente Supabase**: Criar `src/supabaseClient.ts` exportando a instância `supabase`.
3. **Criação do Utilitário de Mídia**: Criar `src/utils/mediaUploader.ts` com funções de compressão Canvas e upload com monitoramento de progresso.
4. **Atualização do Modal de Upload & App.tsx**: Integrar a chamada de upload no Supabase antes de gravar o documento no Firestore, incluindo a barra de progresso com porcentagem na UI.
5. **Verificação & Teste**: Executar `compile_applet` e garantir compilação limpa sem erros de TypeScript ou lint.
