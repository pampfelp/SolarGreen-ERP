# Exportar fotos — Vistoria de Diagnóstico

Script de uso único (roda localmente, no seu computador — não faz parte do
site publicado) para baixar todas as fotos do checklist do serviço
**"Vistoria de Diagnóstico"** para uma pasta no seu PC e, se você quiser,
também para uma pasta no seu Google Drive. Serve como acervo/portfólio para
o seu TCC.

Cada foto sai nomeada como:

```
Nome do cliente - DD-MM-AAAA - Nome do campo do checklist.jpg
```

Se duas fotos derem exatamente o mesmo nome (mesmo cliente, mesma data,
mesmo campo — normalmente porque a resposta foi editada mais de uma vez),
a segunda ganha um `(2)` no final pra não sobrescrever a primeira.

## Passo a passo

### 1. Gerar a chave de acesso temporária

1. Abra o [Console do Firebase](https://console.firebase.google.com/) →
   projeto do SolarGreen-ERP.
2. ⚙️ Configurações do projeto → aba **Contas de serviço**.
3. Clique em **Gerar nova chave privada** → confirme. Um arquivo `.json`
   será baixado.
4. Renomeie esse arquivo para `serviceAccountKey.json` e coloque **dentro
   desta pasta** (`_tools/exportar-fotos-vistoria/`).

Essa chave dá acesso de leitura/escrita ao projeto inteiro — é só pra
rodar o script uma vez. **Depois de usar, revogue essa chave** no mesmo
lugar onde você gerou (Contas de serviço → gerenciar chaves → excluir a
chave). Ela nunca vai pro GitHub (já está no `.gitignore` desta pasta).

### 2. (Opcional) Preparar a pasta no Google Drive

Se você também quer as fotos numa pasta do Drive, além do seu PC:

1. Crie uma pasta no seu Google Drive (ex: "Fotos TCC — Vistoria").
2. Abra a pasta e copie o ID dela na URL:
   `https://drive.google.com/drive/folders/`**`ESSE-PEDAÇO-AQUI`**
3. Compartilhe essa pasta (botão direito → Compartilhar) com o e-mail que
   está no campo `client_email` dentro do `serviceAccountKey.json`, dando
   permissão de **Editor**.
4. Abra `exportar-fotos.js`, ache a linha `const PASTA_DRIVE_ID = ''` perto
   do topo do arquivo, e cole o ID entre as aspas.

Se pular esse passo (deixar `PASTA_DRIVE_ID` vazio), o script só salva
localmente — sem erro nenhum.

### 3. Instalar e rodar

Abra um terminal **dentro desta pasta** (`_tools/exportar-fotos-vistoria/`)
e rode:

```bash
npm install
node exportar-fotos.js
```

O script mostra o progresso no terminal (quantos agendamentos achou,
quantas respostas com foto, e um aviso a cada 25 fotos exportadas). Ao
final, as fotos estarão em `fotos-vistoria-diagnostico/` (dentro desta
mesma pasta) — e também na pasta do Drive, se você configurou o passo 2.

### 4. Depois de terminar

- Revogue a chave de serviço (passo 1).
- Se quiser, apague a pasta `_tools/exportar-fotos-vistoria/node_modules/`
  (não precisa dela até rodar de novo).
- Essa pasta inteira (`_tools/`) não é parte do site publicado — pode
  ficar no repositório sem afetar o GitHub Pages.

## Se o nome do serviço não bater

O script procura, na coleção `servicos`, um documento cujo campo
`Nome Servico` seja exatamente "Vistoria de Diagnóstico" (ignorando
maiúsculas/minúsculas e acentos). Se não encontrar, ele lista no terminal
os nomes de serviço que existem no banco — copie o nome exato e ajuste a
constante `NOME_SERVICO_ALVO` no topo do `exportar-fotos.js`.
