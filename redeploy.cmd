@echo off
rem Redeploy the LocalNail Salon website to DigitalOcean App Platform.
rem
rem The app is deployed from the public repo clone URL rather than a linked
rem GitHub account, so pushing to main does not redeploy on its own. Run this
rem after pushing code changes. Content edited in /admin needs no deploy.
rem
rem Double-click this file, or run it from Command Prompt:  redeploy.cmd

setlocal
cd /d "%~dp0"

if not exist "data\.do-token" (
  echo.
  echo   Missing data\.do-token
  echo   Put the DigitalOcean API token for localnailsalon@gmail.com in that file.
  echo.
  pause
  exit /b 1
)

set /p DIGITALOCEAN_ACCESS_TOKEN=<data\.do-token

echo Pushing the latest commit to GitHub...
git push origin main

echo.
echo Deploying... this usually takes about three minutes.
doctl apps create-deployment deca31a3-288d-4d54-885d-74615fc3e186 --wait --format Phase,Progress

echo.
echo Live at https://localnail-salon-87zlk.ondigitalocean.app
echo.
pause
endlocal
