/**

 * Option A: copy ProjectDetailPage pages -> features with import transforms, then thin pages re-export.

 * Run from web/: node scripts/migrate-project-detail-page.cjs

 *

 * Safety: writes features first, verifies export, only then replaces pages with thin re-export.

 */

const fs = require('fs')

const path = require('path')

const { execSync } = require('child_process')



const webRoot = path.join(__dirname, '..')

const src = path.join(webRoot, 'src/pages/projects/ProjectDetailPage.tsx')

const dst = path.join(webRoot, 'src/features/project-detail/ProjectDetailPage.tsx')

const pageReexport = src



let content = fs.readFileSync(src, 'utf8')

const isThinReexport =

  content.includes("export { ProjectDetailPage } from '../../features/project-detail/ProjectDetailPage'") &&

  !content.includes('export function ProjectDetailPage({')

const isRecoveryStub = content.includes('ProjectDetailPage implementation missing')



if (isThinReexport || isRecoveryStub) {

  try {

    content = execSync('git show HEAD:web/src/pages/projects/ProjectDetailPage.tsx', {

      encoding: 'utf8',

      cwd: path.join(webRoot, '..'),

      maxBuffer: 32 * 1024 * 1024

    })

    console.log('Restored source from git HEAD')

  } catch (e) {

    console.error(

      'Source file is missing or already thin. Restore ~4500-line ProjectDetailPage.tsx first:\n' +

        '  - Cursor: open the file → Timeline / Local History → pick version before today\n' +

        '  - Or: git checkout HEAD -- web/src/pages/projects/ProjectDetailPage.tsx\n' +

        'Then re-run: node scripts/migrate-project-detail-page.cjs'

    )

    process.exit(1)

  }

}



if (!content.includes('export function ProjectDetailPage')) {

  console.error('Source does not contain export function ProjectDetailPage — aborting.')

  process.exit(1)

}



content = content.replace("from './ActivityParticipantActivity'", "from '../../pages/projects/ActivityParticipantActivity'")

content = content.replace("from './TaskManageEditorModal'", "from '../../pages/projects/TaskManageEditorModal'")

content = content.replaceAll("from '../../features/project-detail/", "from './")



fs.writeFileSync(dst, content, 'utf8')



const written = fs.readFileSync(dst, 'utf8')

if (!written.includes('export function ProjectDetailPage')) {

  console.error('Migration wrote features file but export is missing — pages file NOT modified.')

  process.exit(1)

}



const thin = `export { ProjectDetailPage } from '../../features/project-detail/ProjectDetailPage'

export type { TargetRecord, TargetStatus } from '../../features/project-detail/targets/targetTypes'

`

fs.writeFileSync(pageReexport, thin, 'utf8')



const lines = written.split(/\r?\n/).length

console.log('migrated:', dst)

console.log('re-export:', pageReexport)

console.log('lines:', lines)


