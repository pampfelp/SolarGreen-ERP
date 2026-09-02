# Legado

Páginas standalone que já existiam antes da refatoração de arquitetura e da
migração pra Firestore — mantidas aqui só por referência/uso pontual, não
fazem parte da arquitetura nova (`index.html` + `css/` + `js/` na raiz).

- `dimensionamento_solar.html` — mini-app separado, instalável como PWA
  independente, ainda falando com o backend antigo (Google Apps Script).
- `proposta.html` — reconectado ao Firestore em 25/08 (commit `2b6c508`),
  fica aqui só por organização de pasta.
- `CODE GS.txt` — cópia do `Code.gs` do Apps Script antigo, só como
  referência de campos/regras de negócio ao migrar cada parte pro Firestore.
- `manifest-dimensionamento.json`, `manifest-proposta.json` — manifests de
  PWA dos mini-apps acima (ícones e service worker (`../sw.js`) continuam
  compartilhados com o resto do projeto, na raiz).

**Ponto eletrônico:** o antigo `Pontoeletronico.html` (que batia no Apps
Script) foi substituído em 2026-09-02 pelo app próprio `../ponto.html` na
raiz — Firebase Auth, grava direto na coleção `ponto` do Firestore, captura
horário + localização + foto. O manifest agora é `../manifest-ponto.json`.

Nenhum arquivo da arquitetura nova referencia nada dessa pasta.
