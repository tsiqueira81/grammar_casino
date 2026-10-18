Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force -Path 'build' | Out-Null

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Clear with transparent
$g.Clear([System.Drawing.Color]::Transparent)

# Outer Gold Rim
$outerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(202, 138, 4))
$g.FillEllipse($outerBrush, 6, 6, 244, 244)

# Inner Green Felt
$feltBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(7, 45, 24))
$g.FillEllipse($feltBrush, 16, 16, 224, 224)

# Inner Golden Ring
$goldPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(254, 240, 138), 3)
$g.DrawEllipse($goldPen, 26, 26, 204, 204)

# Dashed Casino Chip Accents
$dashPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(254, 240, 138), 6)
$dashPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
$g.DrawEllipse($dashPen, 10, 10, 236, 236)

# Main Text 'GC'
$font = New-Object System.Drawing.Font ('Georgia', [float]68, [System.Drawing.FontStyle]::Bold)
$textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(254, 240, 138))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center

$rect1 = New-Object System.Drawing.RectangleF 0, 52, 256, 100
$g.DrawString('GC', $font, $textBrush, $rect1, $format)

# Subtitle 'CASINO'
$subFont = New-Object System.Drawing.Font ('Arial', [float]18, [System.Drawing.FontStyle]::Bold)
$subBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(212, 175, 55))
$rect2 = New-Object System.Drawing.RectangleF 0, 155, 256, 35
$g.DrawString('CASINO', $subFont, $subBrush, $rect2, $format)

# Save PNG
$bmp.Save('build/icon.png', [System.Drawing.Imaging.ImageFormat]::Png)

# Save ICO
$iconHandle = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = [System.IO.File]::Create('build/icon.ico')
$icon.Save($stream)
$stream.Close()

$g.Dispose()
$bmp.Dispose()
Write-Output "Icons generated in build/icon.png and build/icon.ico"
