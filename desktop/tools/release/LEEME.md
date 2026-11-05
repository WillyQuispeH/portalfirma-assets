# Armar el instalador (desde Linux)
Herramientas (se reconstruyen si el espacio de trabajo se reinicia):
- rcodesign 0.29.0 (apple-codesign, release de GitHub) en /home/claude/scratch/apple-codesign-0.29.0-x86_64-unknown-linux-musl/
- bomutils (github.com/hogliux/bomutils, `make`) y xar (github.com/mackyle/xar; en configure.ac cambiar OpenSSL_add_all_ciphers por EVP_CIPHER_CTX_new; prefix /home/claude/scratch/pkgtools/inst) en /home/claude/scratch/pkgtools
- wine (apt) para el instalador de Windows
- Plantilla del armador de Mac: descomprimir «Armar instalador VERSION.zip» de la versión anterior en /tmp/claude-0/j
- Credenciales (no van en el respaldo de código): build/ia/clave.bin y build/google/oauth.json; se recuperan del instalador anterior (7z sobre el .exe → $PLUGINSDIR/app-64.7z → resources/).
Uso: copiar release.sh y bat.py a /tmp/claude-0/ y ejecutar `bash /tmp/claude-0/release.sh VERSION ANTERIOR`.
