param(
  [int]$MaxBytes = 5000000,
  [string]$Txt = '',
  [string]$OutData = ''
)
$ErrorActionPreference = 'Stop'
# ============================================================
#  僧中词典 · 数据转换脚本
#  用法：powershell -ExecutionPolicy Bypass -File .\build_data.ps1
#        （或直接双击 build_data.cmd）
#  作用：读取 data\txt\dictionary.txt（TSV 底本）→ 生成 data\shard_*.js 分片
#        + data\manifest.js 分片清单 + data\extras.js 释义增强层
#  规则：每个分片文件 ≤ MaxBytes 字节（默认 5,000,000，即 5MB 以内）
# ============================================================

$base = $PSScriptRoot
if (-not $Txt) { $Txt = Join-Path $base 'data\txt\dictionary.txt' }
if (-not $OutData) { $OutData = Join-Path $base 'data' }
$extrasJson = Join-Path $base 'data\txt\extras.json'

if (-not (Test-Path $Txt)) { throw "找不到底本：$Txt" }
if (-not (Test-Path $OutData)) { New-Item -ItemType Directory -Path $OutData -Force | Out-Null }

$enc = New-Object System.Text.UTF8Encoding($false)
$utf8 = [System.Text.Encoding]::UTF8

function Esc-Json([string]$s) {
  if ($null -eq $s) { return '' }
  $s = [regex]::Replace($s, '[\x00-\x1F\u2028\u2029]', ' ')
  $s = $s.Replace('\', '\\').Replace('"', '\"')
  return $s
}

# 清理旧分片
Get-ChildItem $OutData -Filter 'shard_*.js' -ErrorAction SilentlyContinue | Remove-Item -Force

$reader = New-Object System.IO.StreamReader($Txt, $enc, $true)
$header = $reader.ReadLine()
if (-not $header) { throw '底本为空' }
$cols = $header.Split("`t")
if ($cols.Count -lt 3) { throw "底本表头应至少包含 en/si/type，实际：$header" }

$script:total = 0
$script:zh = 0
$script:verified = 0
$script:verifiedOnly = 0
$script:firstPass = 0
$script:mt = 0
$script:pending = 0
$script:shardRows = New-Object 'System.Collections.Generic.List[int]'
$script:shardFiles = New-Object 'System.Collections.Generic.List[string]'
$script:shardIndex = 0
$script:sb = New-Object System.Text.StringBuilder
$script:bytes = 0
$script:rowsInShard = 0

function Flush-Shard {
  if ($script:rowsInShard -eq 0) { return }
  $script:shardIndex++
  $name = ('shard_{0:d3}.js' -f $script:shardIndex)
  $head = "/* 僧中词典数据分片 $('{0:d3}' -f $script:shardIndex) · 本片 $($script:rowsInShard) 条 */`nwindow.DICT_ROWS = (window.DICT_ROWS || []).concat([`n"
  $tail = "`n]);`n"
  $path = Join-Path $OutData $name
  $sw = New-Object System.IO.StreamWriter($path, $false, $enc)
  $sw.Write($head); $sw.Write($script:sb.ToString()); $sw.Write($tail); $sw.Close()
  $script:shardFiles.Add('data/' + $name)
  $script:shardRows.Add($script:rowsInShard)
  $script:sb = New-Object System.Text.StringBuilder
  $script:bytes = 0
  $script:rowsInShard = 0
}

$lineNo = 0
$blankSkip = 0
$lastEn = ''
while ($null -ne ($line = $reader.ReadLine())) {
  $lineNo++        # 表头已在循环前读取
  if ($line.Length -eq 0) { $blankSkip++; continue }
  $f = $line.Split("`t")
  while ($f.Count -lt 6) { $f += '' }
  $en = Esc-Json $f[0]; $si = Esc-Json $f[1]; $ty = Esc-Json $f[2]
  $z = Esc-Json $f[3]; $st = Esc-Json $f[4]; $nt = Esc-Json $f[5]

  $script:total++
  $lastEn = $f[0]
  if ($z) {
    $script:zh++
    if ($st -eq '机翻待校') { $script:mt++ }
    else {
      $script:verified++
      if ($st -eq '初校') { $script:firstPass++ } else { $script:verifiedOnly++ }
    }
  } else { $script:pending++ }

  $row = if ($script:rowsInShard -eq 0) {
    ('["{0}","{1}","{2}","{3}","{4}","{5}"]' -f $en, $si, $ty, $z, $st, $nt)
  } else {
    (",`n" + ('["{0}","{1}","{2}","{3}","{4}","{5}"]' -f $en, $si, $ty, $z, $st, $nt))
  }
  $b = $utf8.GetByteCount($row)
  if (($script:bytes + $b) -gt ($MaxBytes - 512)) { Flush-Shard; $row = $row.TrimStart(",`n") }
  [void]$script:sb.Append($row)
  $script:bytes += $b
  $script:rowsInShard++
}
Flush-Shard
$readLines = $lineNo
$reader.Close()

# ---------- 分片清单 ----------
$stamp = (Get-Date -Format 'yyyy-MM-dd HH:mm')
$list = ($script:shardFiles | ForEach-Object { '"' + $_ + '"' }) -join ', '
$rowList = ($script:shardRows | ForEach-Object { $_ }) -join ', '
$mf = @"
/* 僧中词典 · 分片清单（由 build_data.ps1 自动生成，请勿手工编辑） */
window.DICT_MANIFEST = {
  "generated": "$stamp",
  "rows": $($script:total),
  "zh": $($script:zh),
  "verified": $($script:verified),
  "verifiedOnly": $($script:verifiedOnly),
  "firstPass": $($script:firstPass),
  "mt": $($script:mt),
  "pending": $($script:pending),
  "shards": [$list],
  "shardRows": [$rowList]
};
"@
[IO.File]::WriteAllText((Join-Path $OutData 'manifest.js'), $mf, $enc)

# ---------- 释义增强层 ----------
if (Test-Path $extrasJson) {
  $ex = [IO.File]::ReadAllText($extrasJson, $enc) | ConvertFrom-Json
  $js = "/* 僧中词典 · 释义增强层（由 build_data.ps1 从 data/txt/extras.json 生成） */`n"
  $js += 'window.ZH_ALTS = ' + ($ex.alts | ConvertTo-Json -Depth 8 -Compress) + ";`n"
  $js += 'window.ZH_SEMANTIC_NOTES = ' + ($ex.notes | ConvertTo-Json -Depth 8 -Compress) + ";`n"
  $js += 'window.ZH_EXAMPLES = ' + ($ex.examples | ConvertTo-Json -Depth 8 -Compress) + ";`n"
  [IO.File]::WriteAllText((Join-Path $OutData 'extras.js'), $js, $enc)
  Write-Output ("extras.js alts={0} notes={1} examples={2}" -f $ex.alts.PSObject.Properties.Count, $ex.notes.PSObject.Properties.Count, $ex.examples.PSObject.Properties.Count)
} else {
  Write-Output "WARN 未找到 extras.json，跳过释义增强层"
}

# ---------- 校验 ----------
$sumRows = 0
foreach ($n in $script:shardRows) { $sumRows += $n }
Write-Output ("TXT 词条 {0}；分片合计 {1}；一致：{2}（读入行数 {3}，空行跳过 {4}，末条 {5}）" -f $script:total, $sumRows, ($sumRows -eq $script:total), $readLines, $blankSkip, $lastEn)
Write-Output ("中文 {0}（已校 {1} / 机翻待校 {2} / 待补 {3}）" -f $script:zh, $script:verified, $script:mt, $script:pending)
$over = 0
for ($k = 0; $k -lt $script:shardFiles.Count; $k++) {
  $file = Join-Path $base ($script:shardFiles[$k] -replace '/', '\')
  $len = (Get-Item $file).Length
  if ($len -gt $MaxBytes) { $over++ }
  Write-Output ("  {0,-14} {1,10:N0} 字节  {2,8:N0} 条" -f (Split-Path $file -Leaf), $len, $script:shardRows[$k])
}
Write-Output ("分片数 {0}；超过上限的分片 {1}" -f $script:shardFiles.Count, $over)
if ($sumRows -ne $script:total) { throw '校验失败：分片条数与底本不一致' }
if ($over -gt 0) { throw '校验失败：存在超过 5MB 的分片' }
Write-Output 'BUILD OK'
