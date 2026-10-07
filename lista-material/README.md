# Lista de Material Solar Green

Aplicativo estático para gerar, revisar, salvar e imprimir listas de material de instalação fotovoltaica. Usa o mesmo Firebase Auth e Firestore do ERP Solar Green. Arquivos da raiz são publicados no GitHub Pages; não há etapa de build.

## Uso

1. Entre com a conta já ativa no ERP.
2. Escolha um cliente ou abra o link da lista no detalhe de uma OS.
3. Confira as medidas importadas da vistoria, complete as que faltarem e gere a lista base.
4. Edite quantidades, descrições e observações, marque itens e adicione ou remova linhas.
5. Salve no cliente/OS. A lista reabre pelo mesmo vínculo.
6. Exporte pelo botão PDF, usando o destino “Salvar como PDF” do navegador.

O cálculo produz **sugestões de compra**, não projeto elétrico. Estrutura sem desenho dos blocos fica “conforme layout”. Corrente, tensão, proteção, cabo, string e fixação devem ser conferidos com manuais, projeto e vistoria.

### Critério CA adotado

- Usa a potência nominal e a **saída CA do inversor**, separadas do tipo de rede no padrão. O caso usual aqui é inversor monofásico 220 V entre duas fases de uma rede bifásica 127/220 V: o trecho CA tem L1, L2 e PE, com disjuntor bipolar dedicado; o padrão é conferido à parte. Um inversor monofásico 220 V não pode ser combinado no app com rede apenas monofásica 127 V. O fator de potência adotado é 0,9.
- Seleciona cabo de cobre com isolação PVC 70 °C, mínimo 6 mm², em eletroduto pelo método B1, a 35 °C e com um circuito. Confere `Ib ≤ In ≤ Iz` e queda de tensão máxima adotada de 4% no percurso informado. A reserva de compra é somada depois e não entra na queda de tensão.
- Usa capacidades da [tabela 02 da Corfio](https://www.corfio.com.br/pt/area-tecnica/tabela-02), fator térmico da [tabela 11](https://www.corfio.com.br/pt/area-tecnica/tabela-11) e queda de tensão em eletroduto PVC da [tabela 16](https://www.corfio.com.br/pt/area-tecnica/tabela-16), interpolada entre FP 0,8 e 0,95. Diâmetro do eletroduto é pré-seleção e precisa de conferência da ocupação e do cabo real.
- O disjuntor mostrado é uma estimativa do circuito do inversor. Corrente máxima de saída, proteção exigida pelo fabricante, agrupamento, temperatura real e exposição ao sol precisam ser conferidos no projeto. Para o **padrão de entrada**, a [NT.00001.EQTL, tabela 2](https://pi.equatorialenergia.com.br/wp-content/uploads/2025/12/NT.00001.EQTL-09-Fornecimento-de-Energia-Eletrica-em-Baixa-Tensao.pdf) usa a carga instalada total da unidade: em 127/220 V bifásico até 10 kW, indica 50 A e fase de 10 mm²; de 10,1 a 12 kW, 63 A e fase de 10 mm². O app não conhece a carga total da unidade e não dimensiona o disjuntor geral.
- A ligação dos bornes CA (L/N ou L1/L2) depende do modelo e deve seguir o manual do fabricante; a indicação de dois condutores energizados no circuito 220 V não define essa pinagem.

## Integração

- Firebase: projeto `solargreen-21313`.
- Leituras restritas ao cliente e OS selecionados, mais respostas e templates do serviço da OS.
- Escrita na coleção `listas_material`, ID `<clienteId>__<idAgendamento>` ou `<clienteId>__avulsa`.
- As regras de `listas_material` ficam em `firestore.rules` do repositório SolarGreen-ERP (este mesmo, na raiz).
- O painel de detalhe da OS abre este app com `?agendamentoId=<id>`.
- Fotos ficam em memória no navegador apenas durante a análise; só texto/itens revisados são salvos no Firestore.

## Análise de fotos por IA

O servidor em `backend/server.py` usa Gemini, depois GPT, depois Claude. Ele exige ID token Firebase válido e cadastro ativo em `vendedores`; chaves ficam só nas variáveis de ambiente do Render. O app está com a URL da API vazia até haver um serviço real verificado. **Não trocar pela URL de um serviço não conferido:** as fotos seriam enviadas a esse destino.

Para habilitar:

1. Entrar na conta Render proprietária do serviço, ou criar conta.
2. Implantar este repositório como Web Service usando `lista-material/render.yaml`.
3. Configurar `GEMINI_API_KEY`, `OPENAI_API_KEY` e `ANTHROPIC_API_KEY` no painel do Render. São chaves de API dos provedores, distintas da assinatura do Codex.
4. Conferir `/health` no domínio do serviço: `status: ok` e os três nomes em `providers`.
5. Colocar a URL exata e verificada em `API_URL` de `app.js`, habilitar o botão e publicar outra versão `?v=`/cache do PWA.
6. Testar uma foto real com consentimento do responsável e conferir os itens sugeridos.

O plano gratuito do Render pode hibernar após inatividade; a primeira requisição pode demorar. Não guardar fotos nem logs com dados de cliente no servidor.

## Verificação local

No Windows, dê duplo clique em `TESTAR - index.html.bat`. Ele inicia o servidor, abre `http://localhost:8765/index.html` no navegador padrão e encerra o servidor quando você pressiona uma tecla na janela do script. O app local usa o mesmo Firebase do ERP; salvar uma lista grava no banco real.

Testes automatizados com o servidor local aberto:

- `node scripts/check-rules.mjs`
- `node scripts/check-app.cjs` (usa Edge instalado, Playwright disponível no `NODE_PATH` e Firebase simulado; exige servidor na porta 8765)
- `node scripts/check-pwa.cjs https://pampfelp.github.io/SolarGreen-ERP/lista-material/` (perfil persistente do Edge, PWA no endereço público)
- `python -m unittest backend.test_server`

O teste simulado não confirma login real, regras em produção nem resposta dos provedores. Para esse fechamento, entrar com usuário real no endereço publicado e salvar/reabrir uma lista descartável de teste.
