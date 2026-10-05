# Servidor HTTP & API REST Nativo em PowerShell para Espaço Experiência TOTVS
# Porta padrao: 3000 (ou configuravel via parametro)
param(
    [int]$Port = 3000
)

$ErrorActionPreference = "Continue"
$BaseDir = $PSScriptRoot
if (-not $BaseDir) { $BaseDir = (Get-Location).Path }

# Garantir diretorios necessarios
$DataDir = Join-Path $BaseDir "data"
$UploadsDir = Join-Path $BaseDir "uploads"
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
if (-not (Test-Path $UploadsDir)) { New-Item -ItemType Directory -Path $UploadsDir -Force | Out-Null }

$SegmentosFile = Join-Path $DataDir "segmentos.json"
$AccessLogsFile = Join-Path $DataDir "access_logs.json"
$AuditLogsFile = Join-Path $DataDir "audit_logs.json"
$UsuariosFile = Join-Path $DataDir "usuarios.json"

# Tipos MIME
$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".mp4"  = "video/mp4"
    ".webm" = "video/webm"
    ".ico"  = "image/x-icon"
}

# Inicializar Listener
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  TOTVS Espaco Experiencia - Servidor Iniciado com Sucesso" -ForegroundColor Green
    Write-Host "  URL: $prefix" -ForegroundColor Yellow
    Write-Host "  Diretorio Base: $BaseDir" -ForegroundColor Gray
    Write-Host "  Pressione Ctrl+C para encerrar o servidor." -ForegroundColor DarkGray
    Write-Host "==========================================================" -ForegroundColor Cyan
} catch {
    Write-Host "Erro ao iniciar servidor na porta ${Port}: $_" -ForegroundColor Red
    exit 1
}

function Send-JsonResponse($response, $data, [int]$statusCode = 200) {
    $json = if ($data -is [System.Collections.IEnumerable] -and -not ($data -is [string]) -and -not ($data -is [System.Collections.IDictionary])) {
        if ($data.Count -eq 0) {
            "[]"
        } elseif ($data.Count -eq 1) {
            "[" + ($data[0] | ConvertTo-Json -Depth 10 -Compress) + "]"
        } else {
            $data | ConvertTo-Json -Depth 10 -Compress
        }
    } else {
        $data | ConvertTo-Json -Depth 10 -Compress
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

function Send-FileResponse($response, $request, $filePath) {
    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
    $mime = if ($MimeTypes.ContainsKey($ext)) { $MimeTypes[$ext] } else { "application/octet-stream" }
    
    $fileInfo = New-Object System.IO.FileInfo($filePath)
    $totalLength = $fileInfo.Length
    
    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Accept-Ranges", "bytes")
    $response.ContentType = $mime

    # Suporte a HEAD sem corpo
    if ($request.HttpMethod -eq "HEAD") {
        $response.StatusCode = 200
        $response.ContentLength64 = $totalLength
        $response.OutputStream.Close()
        return
    }

    # Suporte a Range para streaming suave de videos MP4
    $rangeHeader = $request.Headers["Range"]
    if ($rangeHeader -and $rangeHeader.StartsWith("bytes=") -and $ext -in @(".mp4", ".webm")) {
        $range = $rangeHeader.Substring(6).Split("-")
        $start = [int64]$range[0]
        $end = if ($range[1] -ne "") { [int64]$range[1] } else { $totalLength - 1 }
        if ($end -ge $totalLength) { $end = $totalLength - 1 }
        $length = $end - $start + 1

        $response.StatusCode = 206 # Partial Content
        $response.AddHeader("Content-Range", "bytes $start-$end/$totalLength")
        $response.ContentLength64 = $length

        $stream = [System.IO.File]::OpenRead($filePath)
        try {
            $stream.Seek($start, [System.IO.SeekOrigin]::Begin) | Out-Null
            $buffer = New-Object byte[] 65536
            $bytesRemaining = $length
            while ($bytesRemaining -gt 0) {
                $bytesToRead = [Math]::Min($buffer.Length, $bytesRemaining)
                $read = $stream.Read($buffer, 0, $bytesToRead)
                if ($read -le 0) { break }
                $response.OutputStream.Write($buffer, 0, $read)
                $bytesRemaining -= $read
            }
        } finally {
            $stream.Close()
        }
    } else {
        $response.StatusCode = 200
        $response.ContentLength64 = $totalLength
        $stream = [System.IO.File]::OpenRead($filePath)
        try {
            $buffer = New-Object byte[] 65536
            while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $response.OutputStream.Write($buffer, 0, $read)
            }
        } finally {
            $stream.Close()
        }
    }
    $response.OutputStream.Close()
}

# Loop principal de requisicoes
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        $method = $request.HttpMethod

        # Preflight CORS
        if ($method -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
            $response.OutputStream.Close()
            continue
        }

        try {
            # --- API ROUTES ---
            if ($urlPath -eq "/api/segmentos" -and $method -eq "GET") {
                if (Test-Path $SegmentosFile) {
                    $json = Get-Content -Path $SegmentosFile -Raw -Encoding UTF8
                    $data = $json | ConvertFrom-Json
                    Send-JsonResponse $response $data
                } else {
                    Send-JsonResponse $response @()
                }
                continue
            }

            if ($urlPath -match "^/api/segmentos/([^/]+)$" -and $method -eq "PUT") {
                $segId = $matches[1]
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd() | ConvertFrom-Json

                if (Test-Path $SegmentosFile) {
                    $json = Get-Content -Path $SegmentosFile -Raw -Encoding UTF8
                    $segmentos = $json | ConvertFrom-Json
                    
                    for ($i = 0; $i -lt $segmentos.Count; $i++) {
                        if ($segmentos[$i].id -eq $segId) {
                            $segmentos[$i] = $body.segmento
                            break
                        }
                    }
                    $segmentos | ConvertTo-Json -Depth 10 | Set-Content -Path $SegmentosFile -Encoding UTF8
                }

                # Registrar Auditoria
                if ($body.autor) {
                    $novoAudit = [PSCustomObject]@{
                        id = "aud-" + (Get-Date -Format "yyyyMMddHHmmss")
                        analista_nome = $body.autor.nome
                        analista_email = $body.autor.email
                        segmento_id = $segId
                        segmento_nome = $body.segmento.nome
                        acao = "Edicao do card com validacao manual"
                        data_formatada = (Get-Date -Format "dd/MM/yyyy")
                        horario_formatado = (Get-Date -Format "HH:mm:ss")
                        timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
                        detalhes = if ($body.detalhes) { $body.detalhes } else { "Atualizacao de informacoes do segmento realizada pelo especialista." }
                    }
                    $auditLista = [System.Collections.ArrayList]::new()
                    [void]$auditLista.Add($novoAudit)
                    if (Test-Path $AuditLogsFile) {
                        $existentes = Get-Content -Path $AuditLogsFile -Raw -Encoding UTF8 | ConvertFrom-Json
                        foreach ($it in $existentes) { [void]$auditLista.Add($it) }
                    }
                    $auditLista | ConvertTo-Json -Depth 10 | Set-Content -Path $AuditLogsFile -Encoding UTF8
                }

                Send-JsonResponse $response @{ success = $true; message = "Segmento atualizado com sucesso!" }
                continue
            }

            if ($urlPath -eq "/api/upload" -and $method -eq "POST") {
                $rawFileName = $request.Headers["X-Filename"]
                if (-not $rawFileName) {
                    $rawFileName = $request.QueryString["filename"]
                }
                if (-not $rawFileName) {
                    $rawFileName = "upload_" + (Get-Date -Format "yyyyMMddHHmmss") + ".bin"
                }

                $rawFileName = [System.Uri]::UnescapeDataString($rawFileName)
                $ext = [System.IO.Path]::GetExtension($rawFileName)
                if (-not $ext) { $ext = ".bin" }
                $nameWithoutExt = [System.IO.Path]::GetFileNameWithoutExtension($rawFileName)
                $cleanName = ($nameWithoutExt -replace '[^a-zA-Z0-9_\-]', '_').ToLower()
                if (-not $cleanName) { $cleanName = "midia" }
                if ($cleanName.Length -gt 40) { $cleanName = $cleanName.Substring(0, 40) }

                $uniqueFileName = "media_" + (Get-Date -Format "yyyyMMdd_HHmmss") + "_" + $cleanName + $ext
                $destFilePath = Join-Path $UploadsDir $uniqueFileName

                $fileStream = [System.IO.File]::Create($destFilePath)
                try {
                    $request.InputStream.CopyTo($fileStream)
                } finally {
                    $fileStream.Flush()
                    $fileStream.Close()
                }

                $fileInfo = Get-Item $destFilePath
                $relUrl = "uploads/" + $uniqueFileName

                Send-JsonResponse $response @{
                    success = $true
                    url = $relUrl
                    filename = $uniqueFileName
                    tamanho_bytes = $fileInfo.Length
                }
                continue
            }

            if ($urlPath -eq "/api/access" -and $method -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd() | ConvertFrom-Json

                $novoAcesso = [PSCustomObject]@{
                    id = "acc-" + (Get-Date -Format "yyyyMMddHHmmss")
                    analista_nome = if ($body.nome) { $body.nome } else { "Analista TOTVS" }
                    analista_email = if ($body.email) { $body.email } else { "analista@totvs.com.br" }
                    perfil = if ($body.perfil) { $body.perfil } else { "Analista de Segmentos" }
                    data_formatada = (Get-Date -Format "dd/MM/yyyy")
                    horario_formatado = (Get-Date -Format "HH:mm:ss")
                    timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
                    ip_dispositivo = if ($body.dispositivo) { $body.dispositivo } else { "Dispositivo Conectado" }
                    acao = "Sessao no Espaco Experiencia"
                }

                $accessLista = [System.Collections.ArrayList]::new()
                [void]$accessLista.Add($novoAcesso)
                if (Test-Path $AccessLogsFile) {
                    $existentes = Get-Content -Path $AccessLogsFile -Raw -Encoding UTF8 | ConvertFrom-Json
                    foreach ($it in $existentes) { [void]$accessLista.Add($it) }
                }
                $accessLista | ConvertTo-Json -Depth 10 | Set-Content -Path $AccessLogsFile -Encoding UTF8

                Send-JsonResponse $response @{ success = $true; log = $novoAcesso }
                continue
            }

            if ($urlPath -eq "/api/logs/access" -and $method -eq "GET") {
                if (Test-Path $AccessLogsFile) {
                    $json = Get-Content -Path $AccessLogsFile -Raw -Encoding UTF8
                    $data = $json | ConvertFrom-Json
                    Send-JsonResponse $response $data
                } else {
                    Send-JsonResponse $response @()
                }
                continue
            }

            if ($urlPath -eq "/api/logs/audit" -and $method -eq "GET") {
                if (Test-Path $AuditLogsFile) {
                    $json = Get-Content -Path $AuditLogsFile -Raw -Encoding UTF8
                    $data = $json | ConvertFrom-Json
                    Send-JsonResponse $response $data
                } else {
                    Send-JsonResponse $response @()
                }
                continue
            }

            if ($urlPath -eq "/api/usuarios" -and $method -eq "GET") {
                if (Test-Path $UsuariosFile) {
                    $json = Get-Content -Path $UsuariosFile -Raw -Encoding UTF8
                    $data = $json | ConvertFrom-Json
                    Send-JsonResponse $response $data
                } else {
                    Send-JsonResponse $response @()
                }
                continue
            }

            if ($urlPath -eq "/api/usuarios" -and $method -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd() | ConvertFrom-Json

                $novoUsuario = [PSCustomObject]@{
                    id = "usr-" + (Get-Date -Format "yyyyMMddHHmmss")
                    nome = $body.nome
                    email = $body.email
                    segmento_principal = if ($body.segmento_principal) { $body.segmento_principal } else { "Analista de Segmentos" }
                    pin = if ($body.pin) { $body.pin } else { "" }
                    criado_em = (Get-Date -Format "dd/MM/yyyy HH:mm")
                }

                $userLista = [System.Collections.ArrayList]::new()
                [void]$userLista.Add($novoUsuario)
                if (Test-Path $UsuariosFile) {
                    $existentes = Get-Content -Path $UsuariosFile -Raw -Encoding UTF8 | ConvertFrom-Json
                    foreach ($it in $existentes) { [void]$userLista.Add($it) }
                }
                $userLista | ConvertTo-Json -Depth 10 | Set-Content -Path $UsuariosFile -Encoding UTF8

                Send-JsonResponse $response @{ success = $true; usuario = $novoUsuario }
                continue
            }

            if ($urlPath -match "^/api/usuarios/([^/]+)$" -and $method -eq "DELETE") {
                $usrId = $matches[1]
                if (Test-Path $UsuariosFile) {
                    $existentes = Get-Content -Path $UsuariosFile -Raw -Encoding UTF8 | ConvertFrom-Json
                    $userLista = [System.Collections.ArrayList]::new()
                    foreach ($it in $existentes) {
                        if ($it.id -ne $usrId) { [void]$userLista.Add($it) }
                    }
                    if ($userLista.Count -eq 0) {
                        "[]" | Set-Content -Path $UsuariosFile -Encoding UTF8
                    } elseif ($userLista.Count -eq 1) {
                        "[" + ($userLista[0] | ConvertTo-Json -Depth 10) + "]" | Set-Content -Path $UsuariosFile -Encoding UTF8
                    } else {
                        $userLista | ConvertTo-Json -Depth 10 | Set-Content -Path $UsuariosFile -Encoding UTF8
                    }
                }
                Send-JsonResponse $response @{ success = $true; message = "Usuario removido." }
                continue
            }

            # --- ARQUIVOS ESTATICOS ---
            $cleanRelPath = $urlPath.TrimStart("/").Replace("/", "\")
            if ($cleanRelPath -eq "") { $cleanRelPath = "index.html" }
            $targetFilePath = Join-Path $BaseDir $cleanRelPath

            if (Test-Path $targetFilePath -PathType Leaf) {
                Send-FileResponse $response $request $targetFilePath
            } else {
                $response.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Nao Encontrado: $urlPath")
                $response.OutputStream.Write($msg, 0, $msg.Length)
                $response.OutputStream.Close()
            }
        } catch {
            Write-Host "Erro na requisicao [$method $urlPath]: $_" -ForegroundColor Red
            try {
                $response.StatusCode = 500
                $msg = [System.Text.Encoding]::UTF8.GetBytes("500 Erro Interno: $_")
                $response.OutputStream.Write($msg, 0, $msg.Length)
                $response.OutputStream.Close()
            } catch {}
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "Servidor finalizado." -ForegroundColor Yellow
}
