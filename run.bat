@echo off
chcp 65001 >nul
echo ========================================
echo   QuickBrain - 个人知识管理助手
echo ========================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo 正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo 安装失败，请检查网络或npm配置
        pause
        exit /b 1
    )
)

:: Check for config
if not exist "config.json" (
    echo.
    echo 提示: 请先配置 AI API
    echo 1. 复制 config.example.json 为 config.json
    echo 2. 填入你的 API Key
    echo.
)

echo 正在启动 QuickBrain...
echo 快捷键: Ctrl+Q (显示/隐藏) | Ctrl+A (快速添加)
echo.
start "" "node_modules\.bin\electron.cmd" .
echo 已启动！
pause
