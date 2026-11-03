# bat.py SALIDA VERSION EXE N SHA — arma el .bat que une las partes del instalador de Windows y verifica el SHA-256
import sys
out, v, exe, n, sha = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
partes = '+'.join(f'"{exe}.part{i}"' for i in range(n))
b = f'''@echo off
setlocal
title Armar instalador de PortalFirma Asset {v}
cd /d "%~dp0"
echo.
echo  PortalFirma Asset {v} para Windows (64 bits)
echo  ----------------------------------------------
echo  El instalador viene en {n} partes. Este archivo las une y abre el instalador.
for /L %%i in (0,1,{n-1}) do if not exist "{exe}.part%%i" (
  echo  Falta el archivo {exe}.part%%i
  echo  Deja las {n} partes en la misma carpeta que este archivo.
  pause
  exit /b 1
)
set "OUT=%~dp0{exe}"
copy /b {partes} "%OUT%" >nul 2>&1
if errorlevel 1 set "OUT=%TEMP%\\{exe}"
if not exist "%OUT%" copy /b {partes} "%OUT%" >nul
if errorlevel 1 (
  echo  No se pudieron unir las partes.
  pause
  exit /b 1
)
echo  Verificando el instalador...
set "HASH="
for /f "skip=1 delims=" %%h in ('certutil -hashfile "%OUT%" SHA256 ^| findstr /v /c:"CertUtil"') do if not defined HASH set "HASH=%%h"
set "HASH=%HASH: =%"
if /i not "%HASH%"=="{sha}" (
  echo  El instalador quedo danado. Vuelve a copiar todas las partes.
  del "%OUT%" >nul 2>&1
  pause
  exit /b 1
)
echo  Listo: "{exe}" quedo en esta carpeta. Abriendo el instalador...
start "" "%OUT%"
exit /b 0
'''
open(out, 'w', newline='\r\n').write(b)
