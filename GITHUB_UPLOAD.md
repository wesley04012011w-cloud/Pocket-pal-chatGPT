# Como usar este repositório

A automação está pronta para receber o arquivo `pocketpal-local-llm.zip`.

O ZIP contém o projeto React/Vite + Capacitor, a ponte JNI/C++, configuração do llama.cpp e os arquivos de documentação.

## Upload

Coloque o ZIP na raiz com exatamente este nome:

`pocketpal-local-llm.zip`

Depois abra **Actions → Build Android from project ZIP → Run workflow**.

O workflow valida o ZIP, extrai o projeto, instala o toolchain Android, baixa a versão de llama.cpp indicada no projeto e gera o APK Debug como artefato.

## Observação

A conexão GitHub usada aqui consegue criar/editar arquivos de texto, mas não oferece uma operação de upload binário de ZIP. Por isso o ZIP ainda precisa ser enviado pelo GitHub (ou por outro método de upload de arquivos) uma vez. O workflow foi deixado pronto para não exigir que os arquivos internos sejam enviados individualmente.
