# Legado

Páginas standalone que já existiam antes da refatoração de arquitetura e da
migração pra Firestore — mantidas aqui só por referência/uso pontual, não
fazem parte da arquitetura nova (`index.html` + `css/` + `js/` na raiz).

- `Pontoeletronico.html`, `dimensionamento_solar.html`, `proposta.html` —
  mini-apps separados, cada um instalável como PWA independente, ainda
  falando com o backend antigo (Google Apps Script).
- `CODE GS.txt` — cópia do `Code.gs` do Apps Script antigo, só como
  referência de campos/regras de negócio ao migrar cada parte pro Firestore.
- `manifest-ponto.json`, `manifest-dimensionamento.json`,
  `manifest-proposta.json` — manifests de PWA de cada mini-app acima
  (ícones e service worker (`../sw.js`) continuam compartilhados com o
  resto do projeto, na raiz).

Nenhum arquivo da arquitetura nova referencia nada dessa pasta.
