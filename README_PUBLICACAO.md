# NEXUS v2.6.0 — Publicação no GitHub Pages

Envie os arquivos desta pasta diretamente para a raiz do branch publicado pelo GitHub Pages.

A raiz do repositório deve conter `index.html`, `app.js`, `styles.css`, `manifest.json` e `service-worker.js`.
Não envie a pasta `NEXUS_v2.6.0_GitHub_Pages` como uma subpasta se o Pages estiver configurado para publicar a raiz `/`.

No GitHub:

1. Abra o repositório.
2. Substitua os arquivos antigos pelos desta pasta.
3. Confirme o commit no branch `main`.
4. Abra Settings > Pages.
5. Em Source, selecione `Deploy from a branch`.
6. Selecione `main` e a pasta `/(root)`.
7. Salve.

Depois da publicação, abra o endereço do sistema e pressione Ctrl+F5 uma vez para atualizar o cache da versão anterior.

Os dados continuam no armazenamento local do navegador. Faça um backup antes da troca em Configurações > Exportar backup.
