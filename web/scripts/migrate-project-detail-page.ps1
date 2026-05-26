$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'src\pages\projects\ProjectDetailPage.tsx'
$dst = Join-Path $root 'src\features\project-detail\ProjectDetailPage.tsx'
$content = [System.IO.File]::ReadAllText($src, [System.Text.UTF8Encoding]::new($false))
$content = $content.Replace("from './ActivityParticipantActivity'", "from '../../pages/projects/ActivityParticipantActivity'")
$content = $content.Replace("from './TaskManageEditorModal'", "from '../../pages/projects/TaskManageEditorModal'")
$content = $content.Replace("from '../../features/project-detail/", "from './")
[System.IO.File]::WriteAllText($dst, $content, [System.Text.UTF8Encoding]::new($false))
$thin = @"
export { ProjectDetailPage } from '../../features/project-detail/ProjectDetailPage'
export type { TargetRecord, TargetStatus } from '../../features/project-detail/targets/targetTypes'
"@
[System.IO.File]::WriteAllText($src, $thin, [System.Text.UTF8Encoding]::new($false))
Write-Host "migrated: $dst"
Write-Host "re-export: $src"
