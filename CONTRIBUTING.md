# Como contribuir com o stream95

Obrigado pelo interesse! Este guia explica o fluxo, as convenções e o nível de qualidade de toda
mudança em `frederico-kluser/stream95`. Ao participar, você concorda com o
[Código de Conduta](CODE_OF_CONDUCT.md).

## Preparando o ambiente

1. Faça um **fork** e clone:

   ```bash
   git clone https://github.com/<seu-usuario>/stream95.git
   cd stream95
   git remote add upstream https://github.com/frederico-kluser/stream95.git
   ```

2. Instale a partir do lockfile, com **Node.js 22.12+** (veja `.nvmrc`) e **npm**:

   ```bash
   npm ci
   cp .env.example .env
   ```

3. Confira que está tudo verde antes de mudar qualquer coisa:

   ```bash
   npm run check   # lint + typecheck + formatação + testes + build
   ```

Para desenvolver com recarga automática: `npm run dev` (servidor em `:1995`, Vite em `:5173`).
Sem chave da OpenRouter, a moderação usa só as regras locais e o Clippy fica mudo; os testes não
precisam de rede.

## Onde fica cada coisa

| Pasta                                | O que tem                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `apps/server`                        | Servidor Fastify: chat da Twitch, moderação, TTS, assistente, alertas, API |
| `apps/overlay`                       | Cenas, overlays e painel (React 19 + React95 + Vite)                       |
| `packages/shared`                    | Tipos, configurações (zod), eventos do WebSocket e geometria das cenas     |
| `obs`                                | Gerador da coleção de cenas do OBS                                         |
| `.agents/skills/react95-agent-skill` | Referência completa do React95 para agentes de código                      |

Antes de mexer em componentes visuais, leia a skill do React95: ela documenta as armadilhas do
framework (camadas de CSS, `Frame`, `Modal`, `Tabs`, ícones e Clippy).

## Ramificações

Nada entra direto em `main`: o GitHub recusa o push (ruleset) e o hook `pre-push` local também.
Trabalhe numa ramificação curta e abra um PR para `main`.

O nome segue `<tipo>/<slug>`, e o GitHub **rejeita** outros formatos:

| Tipo        | Uso                                    | Exemplo                    |
| ----------- | -------------------------------------- | -------------------------- |
| `feat/`     | Funcionalidade nova                    | `feat/alerta-hype-train`   |
| `fix/`      | Correção                               | `fix/fila-de-tts`          |
| `docs/`     | Documentação                           | `docs/guia-obs`            |
| `style/`    | Formatação, sem mudar lógica           | `style/biome`              |
| `refactor/` | Reestruturação sem mudar comportamento | `refactor/pipeline`        |
| `perf/`     | Desempenho                             | `perf/cache-de-veredictos` |
| `test/`     | Testes                                 | `test/regras-ptbr`         |
| `build/`    | Build e dependências                   | `build/vite-9`             |
| `ci/`       | Integração contínua                    | `ci/matriz-macos`          |
| `revert/`   | Reversões                              | `revert/alerta-hype-train` |
| `hotfix/`   | Correção urgente                       | `hotfix/token-twitch`      |
| `release/`  | Manutenção de versão antiga            | `release/1.4`              |

Ramificações de automação (`dependabot/*`, `renovate/*`, `release-please--*`) são as únicas exceções.

## Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/pt-br/): a mensagem vira o
changelog e decide a próxima versão.

```text
feat(chat): adiciona alerta de hype train
fix(tts): não lê links encurtados
docs: explica a montagem manual no OBS
feat!: troca o formato do arquivo de configurações
```

Tipos aceitos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`revert`. Cabeçalho com no máximo **72 caracteres**. O hook `commit-msg` recusa mensagens fora do
padrão; corrija com `git commit --amend` em vez de pular o hook.

## Qualidade

Tudo isto precisa passar antes do PR (o CI roda o mesmo, em Linux e Windows):

```bash
npm run lint          # Biome + TypeScript
npm run format:check  # formatação (npm run format corrige)
npm test              # Vitest
npm run build         # overlay (Vite) + servidor (tsup)
```

Toda mudança de comportamento traz teste; toda correção traz um teste que falharia sem ela.
Mudou a geometria de uma cena? O teste de layout garante que o Clippy não cubra câmera, captura ou
janelas e que a enquete caiba no espaço.

## Pull requests

1. **Título no formato Conventional Commits**: ele vira a mensagem do squash.
2. Explique **o quê** e **por quê** e ligue issues com `Closes #123`.
3. Mudança visual? Anexe um print antes/depois (use `?checker` na URL da cena).
4. O merge é sempre **squash**, com a ramificação apagada depois.

Regras do repositório: PR obrigatório, CI verde (`build` e `tests-ok`), ramificação atualizada com
`main`, conversas resolvidas e histórico linear. Enquanto o projeto tem um só mantenedor, aprovação
de revisão não é obrigatória; quando houver mais, ela passa a ser.

## Versões

A versão é calculada a partir dos commits (`feat` → minor, `fix` → patch, `!` → major). O
[release-please](https://github.com/googleapis/release-please) mantém um PR de release aberto com o
`CHANGELOG.md` gerado; publicar é fazer o merge desse PR.

O PR de release é aberto pelo token padrão do Actions, que não dispara outros workflows. Para o CI
rodar nele, feche e reabra o PR, ou configure um token próprio no secret `RELEASE_PLEASE_TOKEN`.

## Bugs, ideias e segurança

- Bugs: use o [modelo de bug](.github/ISSUE_TEMPLATE/bug_report.md), com passos para reproduzir.
- Ideias: use o [modelo de sugestão](.github/ISSUE_TEMPLATE/feature_request.md).
- **Vulnerabilidades nunca em issue pública**: siga o [SECURITY.md](SECURITY.md).

Obrigado por ajudar a deixar a live mais Windows 95!
