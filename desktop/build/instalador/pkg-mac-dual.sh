#!/bin/bash
# Instalador único para Mac (.pkg) con las dos versiones de la app: Apple Silicon (arm64) e Intel (x86_64).
# El asistente de macOS (Bienvenida → Términos → Destino → Instalar → Resumen) elige sola la que corresponde
# al equipo (sysctl hw.optional.arm64). Se arma en Linux con xar y mkbom (bomutils).
# Uso: pkg-mac-dual.sh VERSION "app arm64" "app x64" salida.pkg
set -eo pipefail
V="$1"; APP_ARM="$2"; APP_X64="$3"; OUT="$4"
D="$(cd "$(dirname "$0")" && pwd)"; T="${PKG_TOOLS:-/home/claude/scratch/pkgtools}"
XAR="$T/inst/bin/xar"; MKBOM="$T/bomutils/build/bin/mkbom"
ID="cl.portalfirma.asset"; NAME="PortalFirma Asset"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
python3 "$D/generar.py" "$V" >/dev/null

mkdir -p "$W/scripts" "$W/flat/Resources/es.lproj"
cat > "$W/scripts/preinstall" <<SH
#!/bin/sh
pkill -x "$NAME" 2>/dev/null; sleep 1
rm -rf "/Applications/$NAME.app"
exit 0
SH
cat > "$W/scripts/postinstall" <<SH
#!/bin/sh
xattr -dr com.apple.quarantine "/Applications/$NAME.app" 2>/dev/null
exit 0
SH
chmod 755 "$W/scripts/"*

componente() { # $1 = sufijo (arm64|x64)  $2 = ruta de la app
  local S="$1" A="$2" P="$W/flat/$1.pkg"
  mkdir -p "$W/root-$S/Applications" "$P"; cp -a "$A" "$W/root-$S/Applications/"
  local NF KB; NF=$(find "$W/root-$S" | wc -l); KB=$(du -sk "$W/root-$S" | cut -f1)
  python3 "$D/cpio_odc.py" "$W/root-$S" "$P/Payload"
  "$MKBOM" -u 0 -g 80 "$W/root-$S" "$P/Bom"
  python3 "$D/cpio_odc.py" "$W/scripts" "$P/Scripts"
  cat > "$P/PackageInfo" <<XML
<?xml version="1.0" encoding="utf-8"?>
<pkg-info format-version="2" identifier="$ID.$S" version="$V" install-location="/" auth="root" overwrite-permissions="true">
  <payload installKBytes="$KB" numberOfFiles="$NF"/>
  <scripts><preinstall file="./preinstall"/><postinstall file="./postinstall"/></scripts>
</pkg-info>
XML
  echo "$KB"
}
KB_ARM=$(componente arm64 "$APP_ARM"); KB_X64=$(componente x64 "$APP_X64")

for f in welcome.html license.html conclusion.html background.png background@2x.png; do
  cp "$D/gen/$f" "$W/flat/Resources/"; cp "$D/gen/$f" "$W/flat/Resources/es.lproj/"
done
cat > "$W/flat/Distribution" <<XML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>$NAME $V</title>
  <organization>cl.portalfirma</organization>
  <welcome file="welcome.html" mime-type="text/html"/>
  <license file="license.html" mime-type="text/html"/>
  <conclusion file="conclusion.html" mime-type="text/html"/>
  <background file="background.png" alignment="bottomleft" scaling="none" mime-type="image/png"/>
  <background-darkAqua file="background.png" alignment="bottomleft" scaling="none" mime-type="image/png"/>
  <options customize="never" require-scripts="false" hostArchitectures="x86_64,arm64" rootVolumeOnly="true"/>
  <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
  <volume-check><allowed-os-versions><os-version min="11.0"/></allowed-os-versions></volume-check>
  <script><![CDATA[
function esAppleSilicon() { try { return system.sysctl('hw.optional.arm64') == 1; } catch (e) { return false; } }
]]></script>
  <choices-outline><line choice="default"><line choice="apple"/><line choice="intel"/></line></choices-outline>
  <choice id="default" title="$NAME"/>
  <choice id="apple" visible="false" title="$NAME (Apple Silicon)" selected="esAppleSilicon()" enabled="false"><pkg-ref id="$ID.arm64"/></choice>
  <choice id="intel" visible="false" title="$NAME (Intel)" selected="!esAppleSilicon()" enabled="false"><pkg-ref id="$ID.x64"/></choice>
  <pkg-ref id="$ID.arm64" version="$V" onConclusion="none" installKBytes="$KB_ARM">#arm64.pkg</pkg-ref>
  <pkg-ref id="$ID.x64" version="$V" onConclusion="none" installKBytes="$KB_X64">#x64.pkg</pkg-ref>
</installer-gui-script>
XML
rm -f "$OUT"
( cd "$W/flat" && "$XAR" --compression none -cf "$OUT" Distribution Resources arm64.pkg x64.pkg )
ls -la "$OUT"
