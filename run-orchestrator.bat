@echo off
title Claude Orchestrator - GenAI Study Assistant
cd /d "%~dp0"

echo ==========================================
echo  Claude Orchestrator - GenAI Study Assistant
echo ==========================================
echo.
echo Available commands:
echo   acpx claude "your prompt"          - Send task to Claude (orchestrator)
echo   acpx codex "your prompt"           - Send task to Codex (worker)
echo   acpx claude -s backend "prompt"    - Named session
echo   acpx codex -s frontend "prompt"    - Named session
echo   acpx sessions list                 - List all sessions
echo   acpx codex status                  - Check Codex status
echo   acpx claude --file ORCHESTRATOR.md - Load orchestrator prompt
echo.
echo Quick start:
echo   acpx claude --file ORCHESTRATOR.md
echo.

cmd /k
