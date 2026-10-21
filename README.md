# Wallet+

Plataforma de controle e educação financeira em português, executada inteiramente no navegador. Primeira versão funcional em HTML5, CSS3 e JavaScript ES6+, com IndexedDB e gráficos Chart.js. Sem framework, backend, banco remoto ou etapa de compilação.

## Rodar localmente no IntelliJ IDEA

1. Abra esta pasta como projeto no IntelliJ IDEA.
2. No terminal integrado, a partir da raiz do projeto, execute:

   ```powershell
   python -m http.server 5500 --bind 127.0.0.1
   ```

   É necessário ter Python 3 instalado. No Windows, também pode usar `py -m http.server 5500 --bind 127.0.0.1`.

3. Acesse **http://127.0.0.1:5500/**. Mantenha o terminal aberto; `Ctrl+C` encerra o servidor.
4. Escolha **Criar conta local** ou **Explorar demonstração**. Contas reais começam sem movimentações; a demonstração usa dados ilustrativos isolados.

Se sua instalação do IntelliJ oferece **Open in Browser / Abrir no navegador** para `index.html`, o servidor HTTP integrado também pode servir o projeto. Confira se a URL começa com `http://localhost:...`, em vez de `file://`.

Não abra o HTML diretamente pelo sistema de arquivos. Módulos JavaScript precisam de HTTP, e a Web Crypto API exige **localhost ou HTTPS**. Python serve apenas arquivos estáticos: não existe backend Python ou Node.js na aplicação.

Use sempre a mesma origem durante o desenvolvimento. `localhost`, `127.0.0.1`, portas diferentes e o endereço do GitHub Pages possuem armazenamentos distintos. Para levar seus dados de um endereço a outro, exporte/importe um backup.

## Publicar no GitHub Pages

1. Envie os arquivos para um repositório GitHub, preservando a estrutura de pastas. Faça você mesmo os commits e o push; nenhuma operação Git de publicação foi executada automaticamente.
2. No repositório, abra **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Selecione a branch com os arquivos, normalmente `main`, e a pasta **/ (root)**. Salve.
5. Aguarde a publicação e abra o endereço indicado, normalmente `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

Não é necessário `npm install`, `npm run build` ou servidor de aplicação. `index.html` deve estar na raiz publicada; o arquivo `.nojekyll` evita processamento Jekyll. Recursos internos usam caminhos relativos. As páginas usam navegação por hash, como `#transactions`, permitindo recarregar links no subdiretório do GitHub Pages sem regras de redirecionamento.

## Instalar como aplicativo (PWA)

O GitHub Pages hospeda o site. O **PWA** é a configuração que permite ao navegador instalar o Wallet+ como aplicativo e abrir suas telas sem internet após preparar o cache. Já estão incluídos `manifest.webmanifest`, `sw.js`, o registro em `js/services/pwa.js` e os ícones PNG em `assets/icons/`.

Para este repositório (`HarakkDev/WalletPlus`), depois de enviar os arquivos e habilitar **Settings → Pages → Deploy from a branch → main → / (root)**, o endereço esperado é **https://harakkdev.github.io/WalletPlus/**. Esta configuração e a publicação devem ser feitas por você; nenhum commit, push ou deploy foi executado automaticamente.

1. No IntelliJ, revise e faça o commit das alterações, incluindo os novos arquivos PWA e os ícones, e depois faça o push para `main`.
2. Habilite o GitHub Pages conforme a seção anterior. Aguarde o deploy aparecer como concluído no GitHub.
3. Abra o endereço publicado por **HTTPS**, com internet, e aguarde o primeiro carregamento terminar.
4. **Chrome/Edge no computador:** use o ícone de instalação na barra de endereços ou a opção de instalar aplicativo no menu do navegador.
5. **Android:** no Chrome, use **Instalar aplicativo** ou **Adicionar à tela inicial**, conforme a opção oferecida.
6. **iPhone/iPad:** no Safari, abra **Compartilhar → Adicionar à Tela de Início**. Os nomes exatos das opções podem variar conforme o navegador e a versão.

O aplicativo instalado continua usando dados locais: a instalação não cria backend nem sincroniza computadores e celulares. Exporte/importe o backup para mover informações. Contas criadas no localhost não aparecem automaticamente no endereço publicado.

Após o cache inicial, cadastro/login local, transações, contas, metas e relatórios funcionam offline. Os vídeos do YouTube continuam precisando de internet; sem Google Fonts, a interface usa uma fonte de sistema. Limpar os dados do site pode remover tanto o cache quanto os dados financeiros. A instalação não substitui o backup.

### Atualizações e desenvolvimento

- O service worker guarda apenas uma lista explícita de arquivos da aplicação; não armazena backups, páginas de teste ou respostas externas no cache. O IndexedDB continua responsável pelos dados financeiros.
- `start_url`, `scope` e caminhos dos ícones são relativos à pasta publicada. O cache é identificado pelo caminho da aplicação para não limpar caches de outros projetos na mesma origem.
- Ao publicar alterações no HTML, CSS, JavaScript ou ícones, **incremente `CACHE_VERSION` em `sw.js`** (por exemplo, `v1` para `v2`). Ao adicionar/remover arquivos necessários à aplicação, atualize também `APP_FILES`.
- A nova versão é preparada em segundo plano e espera as abas antigas fecharem. Salve o que estiver editando, feche todas as abas/janelas do Wallet+ e reabra. O sistema não força recarga durante formulários.
- Para desenvolver sem servir arquivos antigos, use **DevTools → Application → Service Workers → Bypass for network** ou remova somente o registro do service worker. Não use **Clear site data** para isso, pois essa opção também pode apagar seu histórico financeiro.

Verificação automatizada, com o servidor local ligado: `node tests/run-browser.mjs pwa`. O teste valida manifesto, dimensões dos ícones e escopo, corta a rede do navegador, recarrega a aplicação, cadastra uma receita e abre relatórios. Esse fluxo foi verificado na raiz e também no subdiretório `/WalletPlus/`.

Referências: [publicação no GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) e [instalação de PWAs — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Funcionalidades concluídas

- PWA com manifesto, ícones de instalação e cache local para uso offline após o primeiro acesso conectado.

- Boas-vindas, cadastro com nome/e-mail/senha, login demonstrativo local, sessão persistente e logout.
- Senhas derivadas com PBKDF2/SHA-256, salt aleatório de 16 bytes e 310.000 iterações via Web Crypto; nenhuma senha em texto puro é persistida.
- Dados separados por ID de conta e modo de demonstração independente, acessível em Explorar demonstração e identificado em Configurações. A faixa de aviso de demonstração foi removida; os dados de exemplo e a funcionalidade permanecem.
- Onboarding em cinco etapas: múltiplas rendas, despesas essenciais, assinaturas, metas opcionais e resumo. Revisão disponível em Configurações.
- Início somente para consulta, sem botões de cadastro. Os quatro cards mantêm a ordem Saldo/Metas e Entradas/Saídas. Saldo acumulado considera todo o histórico do Extrato; Metas é um controle independente. Esses escopos permanecem visíveis também no celular. Mês atual / 30 dias / 90 dias filtra somente entradas, saídas, gráficos e últimas transações. Links para o Extrato mantêm esse intervalo e cada transação abre o lançamento exato. O planejamento fica em Contas fixas, sem outro saldo previsto no Início. Contas a pagar mostra apenas pendências do mês, inclusive atrasadas.
- Extrato tem o mesmo nome no desktop e no celular e reúne apenas entradas recebidas e saídas pagas. Registrar entrada/Registrar saída já define o tipo; o cadastro básico pede somente descrição, valor e data. Categoria (Outros por padrão), pagamento, observações e troca de tipo ficam em Mais detalhes; lançamentos vinculados não permitem trocar o tipo. O período fica sempre visível, com 30/90 dias e intervalo personalizado; tipo e categoria da pesquisa ficam recolhidos. Paginação de 20, 50 ou 100, com totais de todos os resultados. Links contextuais respeitam datas, selecionam a página do registro e abrem os detalhes ou a edição uma única vez. Parâmetros inválidos e registros ausentes têm feedback sem alterar dados. CRUD preserva os filtros; tabela no desktop e lista por data no celular.
- Contas fixas mantém abas Despesas/Receitas, mês de referência e uma ação de cadastro por aba. A pagar/A receber fica aberto; Pagas/Recebidas e Pausadas ou de outros meses ficam recolhidos, com contagens. A abertura dos grupos é preservada durante as alterações, por conta, mês e aba. Cadastro básico pede nome, valor previsto e dia; classificação, frequência e primeiro mês ficam em Mais opções. Confirmar pede valor real e data efetiva, registra uma única transação e preserva a previsão dos próximos meses. Opções diferencia Editar previsão de Editar pagamento/recebimento e abre o lançamento exato. Pago/Recebido continuam permitindo desfazer. Links recebidos abrem a aba, referência e grupo da conta correspondente.
- Minhas metas mostra apenas Guardado nas metas, sem Saldo total ou Saldo livre. Cada objetivo apresenta Guardado nesta meta, Quero juntar e Falta guardar. Guardar e Retirar alteram somente o valor acompanhado naquela meta. Criar, editar ou excluir uma meta também não altera o saldo, as receitas, as despesas ou os relatórios do Extrato. Os registros de metas independem do saldo do Extrato, inclusive quando ele é zero ou negativo; uma retirada não pode exceder o valor guardado na própria meta. Nenhuma operação movimenta ou bloqueia dinheiro no banco. Ajuda recolhível explica o fluxo. Criação, edição, exclusão confirmada, histórico e indicação de conclusão permanecem disponíveis.
- Educação financeira com seis canais, fotos de perfil armazenadas localmente, identificação do YouTube, players 16:9 lazy e links diretos para canal/YouTube. Vídeos e ações se alinham entre cards da mesma linha; a abertura contém apenas um título e um texto, sem uma segunda introdução.
- Relatórios por mês, ano ou intervalo, com atualização automática dos filtros e caixa de tamanho estável nos três modos. Em Personalizado, clique no intervalo para escolher as datas em um modal. Resultado em destaque, gráficos comparativos, composição recorrente/variável e categorias detalhadas. A exportação CSV respeita o período aplicado.
- Configurações de nome/tema, categorias personalizadas, backup JSON validado, importação confirmada e exclusão apenas da conta atual.
- Menu lateral no desktop, navegação inferior no celular e cabeçalho mobile sempre visível durante a rolagem, com logo, tema e avatar. Tema escuro/claro, modais com suporte nativo a teclado e notificações sem `alert()`.
- Tipografia equilibrada: base de 14,5 px, textos auxiliares próximos de 13,5 px e campos de 16 px. Campos e seletores seguem a altura padrão de 48 px; ações compactas mantêm ao menos 44 px. Botões da mesma linha têm alturas iguais. A barra mobile segue a ordem Início, Extrato, Contas Fixas, Metas e Mais. Educação Financeira, Relatórios e Configurações ficam em Mais. Cabeçalhos internos não repetem slogans, e Configurações oferece uma única ação para criar categorias.

## Extrato ou Contas fixas?

- **Já aconteceu e não tem previsão cadastrada?** Use Extrato → Registrar entrada ou Registrar saída.
- **Ainda vai pagar ou receber?** Use Contas fixas → Cadastrar conta ou Cadastrar renda. Salvar previsão não muda o saldo.
- **A previsão aconteceu?** Confirme em Contas fixas e informe o valor realmente pago/recebido e a data real. A previsão dos próximos meses permanece igual. O lançamento aparece automaticamente no Extrato; não registre duas vezes. Se já lançou manualmente, não confirme de novo.
- **Confirmou por engano?** Abra Pagas ou Recebidas, clique em Pago/Recebido e confirme o desfazer. O lançamento sai do Extrato, mas a previsão permanece.

## Regras financeiras

- Todo valor é armazenado como **centavos inteiros**. A apresentação utiliza reais no padrão brasileiro e datas DD/MM/AAAA.
- Nos campos monetários, digite apenas números, começando pelos centavos: `3` → `0,03`, `30` → `0,30`, `300` → `3,00` e `300000` → `3.000,00`. Os separadores são automáticos em todos os formulários, inclusive ao editar valores existentes.
- **Saldo (Início)** = todas as receitas confirmadas − todas as despesas pagas do Extrato. Metas têm controle próprio e nunca são somadas ou descontadas deste saldo. Exemplo: R$ 4.500,00 de entradas e R$ 5.220,00 de saídas resultam em **−R$ 720,00**, independentemente do valor guardado nas metas.
- **Resultado previsto** = fontes de renda previstas menos contas previstas aplicáveis ao mês. Valores ainda não confirmados nunca alteram o saldo realizado.
- Uma renda pontual só pertence ao mês da data prevista e só pode ser confirmada uma vez.
- A confirmação pode ter valor diferente do previsto. Somente o valor efetivo entra no Extrato; a previsão e pagamentos de outros meses ficam intactos.
- Uma ocorrência recorrente é identificada por tipo, ID do cadastro e mês de referência. Escritas atômicas no IndexedDB impedem duplicação, inclusive em confirmações simultâneas.
- Em Contas fixas, os cards mostram nome, valor, categoria, vencimento e status. **Marcar como pago** ou **Pago** fica ao lado do menu **Opções**, que reúne histórico, edição, pausa e exclusão. As pendências aparecem primeiro. Após a confirmação, o controle vira **Pago** (ou **Recebido**): clique nele para desfazer, mediante confirmação, e voltar ao estado pendente. A data e o valor efetivo continuam visíveis. Ao desfazer, somente o lançamento vinculado é removido do histórico e do saldo realizado; a previsão permanece e pode ser confirmada novamente. Outros meses são preservados.
- **Data efetiva e mês de referência são diferentes**: uma conta de setembro paga em outubro pertence à referência de setembro e às despesas realizadas de outubro.
- Vencimentos nos dias 29, 30 ou 31 são ajustados ao último dia disponível nos meses mais curtos.
- Editar uma previsão não altera pagamentos anteriores. Excluir a previsão preserva os lançamentos já realizados. Excluir um lançamento vinculado torna a ocorrência novamente pendente, se a previsão ainda existir.
- Metas e Extrato são controles independentes. Valor inicial, Guardar, Retirar, edição e exclusão de metas nunca geram receitas ou despesas, nem transferem valores para o saldo do Extrato. O valor desejado é apenas um objetivo; o guardado é o valor inicial mais os registros de Guardar, menos os de Retirar. Retiradas não podem deixar a própria meta negativa e são verificadas dentro da atualização atômica do IndexedDB.
- Valores já guardados no onboarding ou em backups antigos são preservados, sem exigir uma receita correspondente no Extrato. Não há vínculo de cobertura com o saldo do dia a dia: metas podem ser acompanhadas mesmo sem transações ou com saldo negativo. A separação é apenas no Wallet+, sem integração ou bloqueio bancário.
- Transações e contribuições não aceitam datas futuras; previsões e prazos de metas podem estar no futuro. Formulários não aceitam valores monetários negativos; retiradas recebem um valor positivo e o domínio registra a redução.

## Organização do projeto

```text
index.html                    Entrada HTML e estrutura compartilhada
assets/wallet.svg             Identidade visual
assets/vendor/                Chart.js 4.4.8 e licença MIT
css/global.css                Tema, navegação, formulários e componentes
css/pages/                    Estilos específicos
js/app.js                     Inicialização, sessão e navegação
js/navigation.js              Links relativos e contexto entre páginas
js/components/                Modais, ícones SVG, notificações e gráficos
js/pages/                     Dashboard e módulos de cada página
js/domain/finance.js           Regras e cálculos financeiros puros
js/domain/validation.js        Validações básicas
js/services/repository.js     Acesso assíncrono e transacional ao IndexedDB
js/services/auth.js           Contas locais e derivação de senhas
js/services/backup.js         Schema e validação de importação/exportação
js/data/demo.js               Dados ilustrativos da conta de demonstração
js/data/education.js          Configuração única dos seis canais e vídeos
tests/                       Verificações de domínio e navegador
```

O HTML compartilhado carrega páginas implementadas em módulos independentes, evitando duplicar menus e componentes. As telas recebem um contexto com `data`, `update`, `updateAccount` e navegação; não acessam o IndexedDB diretamente.

Para uma futura API Java/Spring Boot, substitua os serviços de armazenamento e autenticação, adaptando o contexto que conecta as telas. Preserve as regras do domínio e a validação também no servidor. A API deverá implementar autorização por usuário, controle de concorrência e unicidade de ocorrências. O login local não deve ser reaproveitado como segurança de produção.

Os nomes internos antigos do banco (`walet-plus`), sessão e ID da demonstração são mantidos para preservar dados criados antes da correção do nome **Wallet+**. Novos backups usam `wallet-plus`, e a importação também aceita o identificador anterior.

## Armazenamento, segurança e backup

**O login é exclusivamente demonstrativo e não constitui autenticação segura para produção.** A sessão é um identificador local; quem controla o navegador ou dispositivo pode acessar/modificar os registros. Os dados financeiros não são criptografados. Não há recuperação de senha, verificação de e-mail, sincronização, servidor ou transferência bancária real. Use uma senha exclusiva para esta demonstração.

Limpar dados do site, remover o perfil, usar navegação privada ou trocar de navegador/dispositivo/origem pode fazer os dados desaparecerem ou ficarem indisponíveis. A persistência também depende da quota e das políticas do navegador. Faça backups regularmente em **Configurações → Exportar backup**.

O JSON inclui nome, tema, estado do onboarding e dados financeiros; não inclui e-mail, senha derivada, salt ou sessão. Para restaurar em outro navegador, crie uma conta local e importe o arquivo. A importação **substitui** o planejamento, o histórico e as preferências da conta atual, após validação e confirmação. Outras contas não são afetadas.

Limites desta versão: backup de até **5 MB**, até **10.000 registros por coleção** e validação de integridade, datas, centavos, IDs e duplicidades. Guarde o arquivo com cuidado: ele contém informações financeiras legíveis.

## Dependências e conteúdo educacional

Chart.js 4.4.8 é servido localmente em `assets/vendor/chart.umd.js`; sua licença está na mesma pasta. Os ícones são SVGs próprios, sem dependência adicional. Poppins é carregada do Google Fonts, com fonte de sistema alternativa.

Os seis conteúdos ficam em `js/data/education.js`: Primo Pobre, Nath Finanças, Me Poupe!, EconoMirna, Gustavo Cerbasi e Dinheiro Com Você (William Ribeiro). Para trocar um vídeo, altere `videoId`; para acrescentar um canal, siga o mesmo objeto de configuração. O player usa `https://www.youtube.com/embed/VIDEO_ID`, `loading="lazy"` e título acessível.

O sexto vídeo, [Por que NUNCA sobra DINHEIRO na sua casa!](https://www.youtube.com/watch?v=9QIfN6awHSo), foi pesquisado em 21/10/2026. A autoria e o endereço de incorporação foram confirmados pelo oEmbed oficial do YouTube, e a página informa permissão para incorporação. O [site do canal](https://dinheirocomvoce.com.br/) apresenta William Ribeiro e seus conteúdos de educação financeira. As fontes das fotos estão em `assets/channels/README.md`.

Google Fonts e YouTube precisam de internet. O proprietário do vídeo, restrições regionais, bloqueadores ou o próprio YouTube podem impedir a incorporação. Todos os cards oferecem **Assistir no YouTube** como alternativa. A configuração e os links foram verificados, mas a reprodução efetiva de cada vídeo não foi confirmada neste ambiente. Os textos em “Para aprender” são sugestões de aprendizagem, não títulos oficiais dos vídeos. As fotos dos canais ficam em `assets/channels/`, com fontes registradas no README dessa pasta, e são incluídas no cache offline.

Referências técnicas: [documentação Chart.js](https://www.chartjs.org/docs/latest/) e [incorporação oficial do YouTube](https://developers.google.com/youtube/player_parameters).

## Verificações executadas

- **4 testes de navegação**: links relativos, codificação de parâmetros, validação de destinos e consumo único de contexto sem criar histórico extra.
- **11 verificações de usabilidade no Chrome**: escopos do Início, período preservado, registros antigos, agrupamento de pendências, valor/data reais, bloqueio de inválidos e duplicação, edição de previsão versus pagamento, cadastros reduzidos, navegação até a origem, metas independentes e limpeza da conta de teste.

- **20 testes de domínio**: centavos, datas, períodos de 30/90 dias, agrupamento do fluxo, previsões, confirmação com valor real, idempotência, desfazer, competência versus data efetiva, preservação de previsões/metas, validação de valores, backups e demonstração.
- **9 verificações no Chrome real em modo headless**: PBKDF2/salt, login, isolamento, persistência, preferências, concorrência, rollback, backup e logout.
- **34 fluxos de interface no Chrome**: cadastro, cinco etapas, Início somente para consulta com filtros Mês atual/30/90 dias, extrato com nome e ações consistentes, atalhos para previsões, campos opcionais recolhidos e origem automática identificada (filtros, limites de 30/90 dias, datas personalizadas, paginação com 20/50/100 registros, intervalos inválidos, detalhes, edição, exclusão e referências recorrentes sem duplicação), cadastro único por aba de despesas/receitas, sugestão de categoria sem sobrescrever escolhas, resumos separados e seleção preservada, recorrências, metas independentes do saldo, criação/edição/exclusão sem alterar o Extrato, ações Guardar/Retirar e limites da própria meta, regressão de R$ 4.500,00 menos R$ 5.220,00 com metas de R$ 4.970,00, relatórios, educação, preferências, categorias, backup, navegação, recarregamento e demonstração sem faixa de aviso. Incluem verificação do cabeçalho mobile durante a rolagem, ordem dos cards, seletor em largura total, remoção dos textos solicitados, botões de cadastro fora dos painéis, resumo compacto, geometria de campos/botões/vídeos e estabilidade dos filtros de relatórios nos três modos.
- **6 verificações da máscara monetária**: digitação em centavos, exclusão, valores existentes, colagem, cursor e bloqueio de entradas inválidas.
- **11 verificações PWA**: manifesto, ícones, escopo, cache, persistência sem conexão, extrato, detalhes, relatórios, contas, metas, fotos dos canais e confirmação com valor real/navegação ao lançamento exato offline.
- Capturas visuais revisadas em celular, tablet e desktop, incluindo modais. As sete páginas principais foram verificadas em 320, 390, 768, 1024, 1440 e 1920 px, sem rolagem horizontal indevida ou sobreposição de ações. Nos relatórios, a caixa dos filtros mantém largura e altura ao alternar Mensal, Anual e Personalizado em todos esses tamanhos.

Para repetir os testes de domínio, use Node.js 24 ou superior **apenas como ferramenta de desenvolvimento**, sem instalar pacotes:

```powershell
node --test tests/domain.test.mjs tests/navigation.test.mjs
```

Com o servidor local ativo, abra `http://127.0.0.1:5500/tests/browser.html`, `http://127.0.0.1:5500/tests/ui.html` ou `http://127.0.0.1:5500/tests/usability.html`, ou execute o runner headless:

```powershell
node tests/run-browser.mjs browser ui usability pwa money-input
```

Para verificar a digitação monetária, exclusão de dígitos, seleção, colagem e valores existentes, execute `node tests/run-browser.mjs money-input` com o mesmo servidor ativo.

O runner usa a instalação padrão do Google Chrome no Windows. Para outro caminho, defina `CHROME_PATH`; para outra origem, defina `TEST_ORIGIN`. Ele cria um perfil temporário isolado e o remove ao concluir. As páginas de teste criam apenas contas temporárias e restauram a sessão anterior; use-as com outras abas do aplicativo ociosas. `CAPTURE_UI=1` gera capturas em `test-results/`, pasta ignorada pelo Git.

## Limitações conhecidas

- As previsões usam o cadastro recorrente atual, não versões históricas dos valores/ativação. Ao alterar uma previsão, a projeção de meses anteriores pode mudar; transações realizadas permanecem intactas.
- O rascunho do onboarding fica em memória até **Ir para meu painel**. Voltar entre etapas preserva os campos; recarregar ou sair antes da conclusão descarta as alterações não salvas.
- A conta de demonstração mantém as alterações feitas nela. Para recomeçar, exclua somente essa conta em Configurações e use novamente **Explorar demonstração**.
- Integrações bancárias, sincronização entre dispositivos e autenticação de produção ficam para a futura etapa com backend.
