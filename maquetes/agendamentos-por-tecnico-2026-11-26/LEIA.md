# Agendamentos por técnico

Conceito aprovado em 26/11/2026, com a orientação de implementar usando o design system existente do ERP. `conceito.jpg` é a referência de composição; `conceito.json` e `prompt.txt` preservam a geração Gemini.

`implementacao-desktop.png` (1440 px) e `implementacao-celular.png` (390 px) mostram a implementação com dados fictícios de teste. O código reutiliza cores, fontes, botões, alternância de visualização, KPIs, modal e fontes de dados do ERP. Não são capturas da agenda real.

Diferenças deliberadas em relação à imagem: jornada de agendamento contínua das 08h às 18h, como no formulário existente, sem almoço presumido; técnicos em ordem alfabética; tipografia, seleção, bordas e espaçamentos do design system atual. Horas livres são recalculadas a partir dos compromissos; os totais do exemplo mudam por não haver bloqueio fictício de almoço.

Ajuste solicitado em 26/11: a visão Por técnico mostra apenas os técnicos ativos, nos cards, no filtro e nos KPIs. Agendamentos de responsáveis inativos, desconhecidos ou sem responsável continuam acessíveis na Lista, mas não criam cards nesta visão. Mudanças de status do técnico atualizam os cards sem recarregar.

Por técnico é a visualização inicial dos Agendamentos, no dia atual. Lista continua disponível no seletor de visualização.

Conteúdo de cada compromisso, após ajuste de 26/11: cliente em caixa alta na primeira linha, serviço em negrito na segunda e vendedor responsável do cliente na terceira, mantendo o status existente. Quando o cache só tem nome/telefone, consulta o documento dos clientes exibidos após a autenticação e reaproveita o cache por ID. Ausência de vendedor ou falha na consulta são informadas sem inventar atribuição; a coleção inteira de clientes não é carregada para isso.

Conferência: 11 testes de cálculo/período; 15 cenários no navegador com Edge/Chromium, sem gravação em produção nem erros de JavaScript, incluindo teclado nas novas ações, viradas de data, cancelamento, sobreposição, serviços de vários dias, dados incompletos, filtro/busca, atualização ao vivo, texto longo e celular sem rolagem horizontal. `validacao-ui.json` registra o resultado. O teste pode ser repetido com `tests/agendamentos-ui.cjs` e playwright-core instalado no ambiente, ou indicado pela variável `PLAYWRIGHT_MODULE`.

PWA: verificador existente executado com Chrome e seletor adaptado, em uma cópia temporária, ao banner real `#sg-install-banner.show`. Passou service worker, manifest, instalabilidade Chromium, instruções iPhone e estado já instalado. A emulação não substitui teste de instalação em um iPhone físico.

Verificador geral: permanecem 38 ocorrências legadas de diálogos nativos em outros módulos e avisos já existentes. A ocorrência da agenda foi removida. Comparação automática com o conceito detecta as diferenças de composição, expediente e design system descritas acima; não representa equivalência de pixels.

Não validado: gravação de um agendamento autenticado em produção. O fluxo de gravação e a validação de conflitos existentes foram preservados; o novo botão somente preenche e abre o formulário.
