@echo off
setlocal

echo =========================================================
echo  Filio -- CA Firm Work Management System
echo  Local Development Launcher
echo =========================================================
echo.

:: Check Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not on PATH.
    echo         Download it from https://nodejs.org  (v20 or higher)
    pause
    exit /b 1
)

:: Print Node and npm versions
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
for /f "tokens=*" %%v in ('npm --version') do set NPM_VER=%%v
echo Node: %NODE_VER%   npm: v%NPM_VER%
echo.

:: Check .env.local exists
if not exist ".env.local" (
    echo [WARN] .env.local not found.
    echo        Copy the template below into a new .env.local file and fill in your values:
    echo.
    echo   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
    echo   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
    echo   SUPABASE_SECRET_KEY=eyJ...
    echo   DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres
    echo   DATABASE_URL_DIRECT=postgresql://...supabase.co:5432/postgres
    echo   RESEND_API_KEY=re_...
    echo   CRON_SECRET=your-random-secret
    echo   NEXT_PUBLIC_APP_URL=http://localhost:3000
    echo.
    pause
    exit /b 1
)

:: Install dependencies if node_modules is missing
if not exist "node_modules" (
    echo [INFO] node_modules not found. Running npm install...
    echo.
    npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed. Check the output above.
        pause
        exit /b 1
    )
    echo.
)

echo [INFO] Starting Filio dev server at http://localhost:3000
echo        Press Ctrl+C to stop.
echo.
echo =========================================================
echo.

npm run dev

endlocal
