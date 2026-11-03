#!/bin/bash
# release.sh VER PREV  — construye Mac+Windows, arma partes y unidores en outputs
set -e; V=$1; PREV=$2; P=/home/claude/portalfirma-propiedades; cd $P
rm -rf dist/mac dist/mac-arm64 dist/win-unpacked
npx electron-builder --win nsis --x64 > /tmp/claude-0/bwin.log 2>&1
npx electron-builder --mac dir --x64 --arm64 > /tmp/claude-0/bmac.log 2>&1
R=/home/claude/scratch/apple-codesign-0.29.0-x86_64-unknown-linux-musl/rcodesign
for a in dist/mac/"PortalFirma Asset.app" dist/mac-arm64/"PortalFirma Asset.app"; do $R sign "$a" > /tmp/claude-0/sign.log 2>&1; done
bash build/instalador/pkg-mac-dual.sh $V "$P/dist/mac-arm64/PortalFirma Asset.app" "$P/dist/mac/PortalFirma Asset.app" "$P/dist/Instalar PortalFirma Asset $V.pkg" > /tmp/claude-0/pkg.log 2>&1
O=/mnt/user-data/outputs/PortalFirma-Asset-$V; PKG="Instalar PortalFirma Asset $V.pkg"; EXE="Instalar PortalFirma Asset $V.exe"
rm -rf "$O"; mkdir -p "$O/Mac" "$O/Windows"
split -b 19922944 -d -a 2 "$P/dist/$PKG" "$O/Mac/$PKG.part"; NP=$(ls "$O/Mac" | wc -l); HP=$(sha256sum "$P/dist/$PKG" | cut -d' ' -f1)
J=/tmp/claude-0/j; A="$J/Armar instalador $V.app"; rm -rf "$A"; cp -r "$J/Armar instalador $PREV.app" "$A"
sed -i "s/${PREV//./\\.}/$V/g" "$A/Contents/Info.plist" "$A/Contents/MacOS/instalar"
sed -i "s/^VERSION=\"$V\"; N=[0-9]*; SHA=\"[0-9a-f]*\"/VERSION=\"$V\"; N=$NP; SHA=\"$HP\"/" "$A/Contents/MacOS/instalar"; grep -q "SHA=\"$HP\"" "$A/Contents/MacOS/instalar"
(cd $J && zip -qry "$O/Mac/Armar instalador $V.zip" "Armar instalador $V.app")
split -b 19922944 -d -a 1 "$P/dist/$EXE" "$O/Windows/$EXE.part"; NE=$(ls "$O/Windows" | wc -l); HE=$(sha256sum "$P/dist/$EXE" | cut -d' ' -f1)
python3 /tmp/claude-0/bat.py "$O/Windows/Armar instalador $V.bat" $V "$EXE" $NE $HE; grep -q "$HE" "$O/Windows/Armar instalador $V.bat"
tar --exclude=node_modules --exclude=dist --exclude='test/*.png' --exclude=test/fixtures --exclude=build/ia --exclude=build/google --exclude=build/mercadolibre/app.json --exclude='build/instalador/out*' -cJf "$O/PortalFirma-Asset-$V-codigo.tar.xz" .
echo "LISTO $NP $NE"
