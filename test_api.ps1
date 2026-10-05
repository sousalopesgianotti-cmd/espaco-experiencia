# 1. Upload de Foto
$fotoBytes = [System.Text.Encoding]::UTF8.GetBytes("dados_de_imagem_teste")
$fotoHeaders = @{ "X-Filename" = "painel_sensores.png" }
$resFoto = Invoke-RestMethod -Uri "http://localhost:3000/api/upload" -Method Post -Headers $fotoHeaders -Body $fotoBytes
Write-Host "1. Foto Upload OK:" $resFoto.success "-" $resFoto.url

# 2. Upload de Video
$vidBytes = [System.Text.Encoding]::UTF8.GetBytes("dados_de_video_mp4_teste")
$vidHeaders = @{ "X-Filename" = "demonstracao_esteira.mp4" }
$resVid = Invoke-RestMethod -Uri "http://localhost:3000/api/upload" -Method Post -Headers $vidHeaders -Body $vidBytes
Write-Host "2. Video Upload OK:" $resVid.success "-" $resVid.url

# 3. Teste de Download Estatico
$downFoto = Invoke-WebRequest -Uri "http://localhost:3000/$($resFoto.url)" -UseBasicParsing
$downVid = Invoke-WebRequest -Uri "http://localhost:3000/$($resVid.url)" -UseBasicParsing
Write-Host "3. Static Serving Foto:" $downFoto.StatusCode "Video:" $downVid.StatusCode

# 4. Atualizar Segmento com novas midias
$segmentos = Invoke-RestMethod -Uri "http://localhost:3000/api/segmentos"
$agro = $segmentos | Where-Object { $_.id -eq "totvs_agro" }
$agro.midias.fotos = @($agro.midias.fotos) + @([PSCustomObject]@{ titulo = "Painel de Sensores IoT"; url = $resFoto.url })
$agro.midias.videos = @($agro.midias.videos) + @([PSCustomObject]@{ titulo = "Demonstracao da Esteira Automatizada"; url = $resVid.url })

$bodyUpdate = @{
    segmento = $agro
    autor = @{ nome = "André Gianotti"; email = "andre.gianotti@totvs.com.br" }
    detalhes = "Teste de publicacao de midias via analista"
} | ConvertTo-Json -Depth 10

$putRes = Invoke-RestMethod -Uri "http://localhost:3000/api/segmentos/totvs_agro" -Method Put -ContentType "application/json; charset=utf-8" -Body $bodyUpdate
Write-Host "4. Segmento Update PUT:" $putRes.success

# 5. Conferir persistencia
$reloaded = Invoke-RestMethod -Uri "http://localhost:3000/api/segmentos"
$agroReloaded = $reloaded | Where-Object { $_.id -eq "agro" }
Write-Host "5. Fotos no Agro:" $agroReloaded.midias.fotos.Count
Write-Host "   Videos no Agro:" $agroReloaded.midias.videos.Count

# 6. Conferir Auditoria
$audits = Invoke-RestMethod -Uri "http://localhost:3000/api/logs/audit"
$lastAudit = $audits[0]
Write-Host "6. Ultimo Log de Auditoria:" $lastAudit.analista_nome "-" $lastAudit.detalhes


