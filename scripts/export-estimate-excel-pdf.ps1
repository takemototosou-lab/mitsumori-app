param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,

  [Parameter(Mandatory = $true)]
  [string]$PdfPath,

  [string]$SheetName = "裕吏建設"
)

$ErrorActionPreference = "Stop"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $resolvedWorkbookPath = (Resolve-Path -LiteralPath $WorkbookPath).Path
  $resolvedPdfPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PdfPath)

  $workbook = $excel.Workbooks.Open($resolvedWorkbookPath)
  try {
    $worksheet = $workbook.Worksheets.Item($SheetName)
  } catch {
    $worksheet = $workbook.ActiveSheet
  }

  $worksheet.Select($true) | Out-Null
  $worksheet.Calculate()
  $worksheet.ExportAsFixedFormat(0, $resolvedPdfPath)
  $workbook.Close($false)
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
