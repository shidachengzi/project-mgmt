import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'pages')

const moves = [
  ['LoginPage.tsx', 'auth/LoginPage.tsx'],
  ['ForgotPasswordPage.tsx', 'auth/ForgotPasswordPage.tsx'],
  // LoginPage.css → styles/pages/login.css（见 importGlobalStyles）
  ['login/AnimatedCharacters.tsx', 'auth/AnimatedCharacters.tsx'],
  ['AllProjectsPage.tsx', 'projects/AllProjectsPage.tsx'],
  ['ProjectDetailPage.tsx', 'projects/ProjectDetailPage.tsx'],
  ['TaskManageEditorModal.tsx', 'projects/TaskManageEditorModal.tsx'],
  ['ActivityParticipantActivity.tsx', 'projects/ActivityParticipantActivity.tsx'],
  ['WorkbenchPage.tsx', 'work/WorkbenchPage.tsx'],
  ['MyTasksPage.tsx', 'work/MyTasksPage.tsx'],
  ['ReportsPage.tsx', 'work/ReportsPage.tsx'],
  ['CalendarPage.tsx', 'calendar/CalendarPage.tsx'],
  ['CalendarSettingsPage.tsx', 'calendar/CalendarSettingsPage.tsx'],
  ['ContactsPage.tsx', 'contacts/ContactsPage.tsx'],
  ['AccountSettingsPage.tsx', 'account/AccountSettingsPage.tsx'],
  ['AdminConsolePage.tsx', 'admin/AdminConsolePage.tsx'],
]

function deepenImports(content) {
  return content
    .replace(/from '\.\.\/entities\//g, "from '../../entities/")
    .replace(/from '\.\.\/features\//g, "from '../../features/")
    .replace(/from '\.\.\/shared\//g, "from '../../shared/")
    .replace(/from '\.\.\/data\//g, "from '../../entities/project/config/")
    .replace(/from '\.\/login\/AnimatedCharacters'/g, "from './AnimatedCharacters'")
    .replace(/from '\.\/AllProjectsPage'/g, "from '../../entities/project/model/types'")
    .replace(/import type \{ ProjectSummary \} from '\.\.\/\.\.\/entities\/project\/model\/types'/g, "import type { ProjectSummary } from '../../entities/project/model/types'")
    .replace(/from '\.\/ActivityParticipantActivity'/g, "from './ActivityParticipantActivity'")
    .replace(/from '\.\/TaskManageEditorModal'/g, "from './TaskManageEditorModal'")
    .replace(/from '\.\/ProjectDetailPage'/g, "from './ProjectDetailPage'")
    .replace(/import ['"]\.\.\/styles\//g, "import '../../styles/")
}

for (const [from, to] of moves) {
  const srcPath = path.join(root, from)
  const destPath = path.join(root, to)
  if (!fs.existsSync(srcPath)) {
    console.warn('skip missing', from)
    continue
  }
  const dir = path.dirname(destPath)
  fs.mkdirSync(dir, { recursive: true })
  let content = fs.readFileSync(srcPath, 'utf8')
  if (to.endsWith('.tsx')) content = deepenImports(content)
  fs.writeFileSync(destPath, content)
  const base = path.basename(from)
  const stubDir = path.dirname(path.join(root, from))
  const stubPath = path.join(stubDir, base)
  if (stubPath !== destPath) {
    if (base.endsWith('.tsx')) {
      const rel = './' + path.posix.join(path.dirname(to), base).replace(/\\/g, '/')
      const exportName = base.replace('.tsx', '')
      fs.writeFileSync(stubPath, `export { ${exportName} } from '${rel.replace(/\\/g, '/')}'\n`)
    } else if (base.endsWith('.css')) {
      fs.writeFileSync(stubPath, `@import './${path.posix.join(path.dirname(to), base).replace(/\\/g, '/')}';`)
    }
  }
}

// Fix ProjectSummary-only imports that became wrong
for (const sub of ['projects', 'work', 'contacts']) {
  const dir = path.join(root, sub)
  if (!fs.existsSync(dir)) continue
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.tsx')) continue
    const p = path.join(dir, f)
    let c = fs.readFileSync(p, 'utf8')
    if (c.includes("from '../../entities/project/model/types'") && !c.includes('ProjectSummary')) {
      // Reports imports ProjectDetailPage - ok
    }
    c = c.replace(
      /import type \{ ProjectSummary \} from '\.\.\/\.\.\/entities\/project\/model\/types'/g,
      "import type { ProjectSummary } from '../../entities/project/model/types'",
    )
    fs.writeFileSync(p, c)
  }
}

const reportsPath = path.join(root, 'work', 'ReportsPage.tsx')
if (fs.existsSync(reportsPath)) {
  let c = fs.readFileSync(reportsPath, 'utf8')
  c = c.replace("from './ProjectDetailPage'", "from '../projects/ProjectDetailPage'")
  fs.writeFileSync(reportsPath, c)
}

const loginAnimStub = path.join(root, 'login', 'AnimatedCharacters.tsx')
if (fs.existsSync(loginAnimStub)) {
  fs.writeFileSync(loginAnimStub, "export { AnimatedCharacters } from '../auth/AnimatedCharacters'\n")
}

console.log('done', moves.length)
