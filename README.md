# Excalidraw FRZN

Aplicativo desktop para Windows com o motor oficial do Excalidraw, vários desenhos em abas e blocos de código que podem ser editados depois. Interface em português, arquivos locais e sem cadastro.

## Executar

Instale o **Node.js 24 LTS**. Na pasta do repositório:

```powershell
npm install
npm run dev
```

A primeira instalação precisa de internet para baixar os pacotes e o Electron. Depois de compilado, o editor, as fontes, o Monaco, seus workers e o realce de código são incluídos no aplicativo. Links externos e bibliotecas públicas do Excalidraw exigem conexão.

### Erro `Electron uninstall`

Esse erro indica que o pacote npm existe, mas o executável do Electron ou seu `path.txt` não foi instalado. O rebuild pode terminar com sucesso sem baixar nada se `ELECTRON_SKIP_BINARY_DOWNLOAD` estiver definida, inclusive com o valor `0`.

```powershell
npm run electron:repair
npm run dev
```

O reparo baixa o runtime usando `@electron/get`, confere o SHA-256 incluído no pacote Electron, extrai o ZIP e registra o executável somente após conferir os arquivos e a versão. Ele não executa `install.js`, cujas saídas antecipadas podem terminar sem instalar o runtime. Não altera variáveis permanentes do Windows nem apaga projetos. `npm run electron:check` faz somente a verificação; ela também roda antes de `dev`, `preview` e do smoke.

Se o download pelo Node falhar, o comando exibe o endereço do ZIP oficial para a versão e arquitetura instaladas. Baixe pelo navegador e informe o caminho completo:

```powershell
npm run electron:repair -- --zip "C:\Users\SEU_USUARIO\Downloads\electron-v39.8.10-win32-x64.zip"
npm run dev
```

O ZIP manual também tem seu SHA-256 validado antes da extração. Use exatamente a versão e arquitetura indicadas pelo comando.

No Windows, o reparo usa o `tar.exe` nativo e mostra os nomes dos arquivos durante a extração. O ZIP válido do cache é reutilizado nas novas tentativas. Se um reparo antigo ficar repetindo apenas `Reparo em andamento...`, interrompa com Ctrl+C e execute o comando atualizado. A extração nativa tem limite de três minutos e encerra o processo extrator em caso de timeout; Ctrl+C também cancela a operação. A instalação só é registrada depois que a extração termina e os arquivos são conferidos.

## O que está implementado

- Canvas oficial: desenho livre, formas, setas, texto, imagens e exportação do Excalidraw.
- Abas independentes, indicação de alterações e restauração dos arquivos abertos na próxima execução.
- Pasta de projetos padrão em `Documentos/ExcalidrawProjects`, com busca e navegação por subpastas. Você pode escolher outra pasta na barra lateral.
- Abertura de vários arquivos `.excalidraw`, inclusive arquivos de outras pastas pelo diálogo nativo.
- Autosave após um segundo sem alterações no desenho. O primeiro autosave cria um arquivo com nome exclusivo; **Salvar como** escolhe o nome e o destino.
- Ao fechar uma aba ou o aplicativo, as gravações pendentes são aguardadas. Uma falha de gravação mantém a janela aberta e apresenta o erro.
- Código editável em modal com Monaco, linguagem selecionável e cores geradas pelo Shiki. O canvas recebe um SVG e o elemento guarda `customData: { type: "frzn-code-block", language, rawCode, title }`.
- Duplo clique no card ou **Editar código** na seleção reabre o código original. Edições são inseridas no histórico de desfazer do canvas.
- Limite por card de 300 linhas e 60.000 caracteres; linhas longas quebram visualmente no SVG, preservando o texto original.
- Alternância de canvas claro/escuro e barra lateral retrátil.

Os `.excalidraw` incluem as imagens e os cards de código. Podem ser copiados, enviados e abertos no Excalidraw web; a edição especial dos cards é oferecida por este aplicativo. Os projetos ficam diretamente no disco, sem depender de localStorage. A sessão guarda caminhos, não uma segunda cópia dos desenhos.

## Atalhos

| Atalho | Ação |
| --- | --- |
| Ctrl+N | Novo desenho |
| Ctrl+O | Abrir desenhos |
| Ctrl+S | Salvar |
| Ctrl+Shift+S | Salvar como |
| Ctrl+W | Salvar alterações e fechar aba |
| Ctrl+Tab / Ctrl+Shift+Tab | Próxima / anterior aba |

Dentro do modal de código, os atalhos ficam a cargo do Monaco. Esc fecha o modal sem aplicar o texto ao canvas.

## Build e instalador

```powershell
npm run build         # compila e verifica TypeScript
npm run preview       # abre a versão compilada
npm run dist          # instalador NSIS Windows em release/
npm run dist:portable # executável portátil Windows em release/
npm run pack          # diretório do aplicativo sem instalador
```

Para fixar o aplicativo instalado, abra Excalidraw FRZN pelo menu Iniciar, clique com o botão direito no ícone da barra de tarefas e escolha **Fixar na barra de tarefas**. Uma tag de versão como `v0.1.0` aciona o workflow para anexar o instalador ao GitHub Releases depois dos testes.

O instalador associa a extensão `.excalidraw` ao aplicativo. O projeto não inclui certificado de assinatura; versões distribuídas publicamente devem configurar a assinatura do executável. O empacotamento para macOS/Linux não foi configurado nesta versão.

## Validação

```powershell
npm test             # testes de arquivos, acesso a pastas, validação de cenas e SVG; inclui regressão do canvas com Zustand instalado
npm run typecheck    # precisa das dependências instaladas
npm run test:smoke   # build e teste real do Electron com Playwright
```

O smoke usa uma pasta temporária isolada: insere dois cards, verifica o autosave e imagens nos JSONs, alterna abas, edita um card por duplo clique, fecha imediatamente e reabre para conferir a sessão. Guarda uma captura em `test-results/workspace.png`.

O workflow `Desktop Windows` executa essas verificações e gera o instalador como artifact em pushes, pull requests ou execução manual. Após a primeira instalação bem-sucedida, versione o `package-lock.json` gerado para fixar as versões transitivas e troque `npm install` por `npm ci` no workflow.

## Organização

```text
src/main/          janela Electron, diálogos e arquivos no disco
src/preload/       ponte IPC com funções específicas
src/shared/        contratos, validação e geração de SVG
src/renderer/src/  interface React, abas Zustand e integração do canvas
tests/             testes sem serviços externos
scripts/smoke.ts   teste da aplicação compilada
```

O renderer usa isolamento de contexto, sandbox e `nodeIntegration: false`. A ponte não expõe acesso genérico ao Node. Leituras por caminho ficam restritas à pasta escolhida ou aos arquivos previamente autorizados; saídas da pasta por links simbólicos são rejeitadas. O autosave substitui arquivos existentes por meio de gravação em temporário seguido de rename; novos projetos usam criação exclusiva para evitar sobrescrever nomes repetidos.

## Limites da primeira versão

- O histórico de desfazer pertence à instância ativa do Excalidraw e reinicia ao trocar de aba; o conteúdo, as imagens e o estado de visualização são mantidos em memória.
- Alterações em disco feitas por outro programa não são mescladas automaticamente. Evite editar simultaneamente o mesmo arquivo em dois programas.
- Autosave protege as alterações já gravadas. Encerramentos forçados podem perder a última janela de aproximadamente um segundo; não há histórico de backups.
- A lista de pastas é atualizada ao salvar, voltar à janela ou clicar em atualizar; não há observador contínuo de arquivos.
- A navegação de pastas alcança até nove níveis, ignora itens ocultos e links simbólicos. Projetos maiores que 100 MB são rejeitados.
- Colaboração em tempo real, sincronização em nuvem, plugins externos e editor interativo sobre o canvas não fazem parte desta versão.

Baseado nos projetos [Excalidraw](https://github.com/excalidraw/excalidraw), [electron-vite](https://electron-vite.org/), [Monaco](https://microsoft.github.io/monaco-editor/), [Shiki](https://shiki.style/) e [Zustand](https://zustand.docs.pmnd.rs/). Este repositório mantém a licença MIT original.
