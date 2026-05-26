const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const src = path.join(root, 'src/pages/projects/TaskManageEditorModal.tsx')
const dst = path.join(root, 'src/features/project-detail/tasks/TaskManageEditorModal.tsx')
const pageReexport = path.join(root, 'src/pages/projects/TaskManageEditorModal.tsx')

let content = fs.readFileSync(src, 'utf8')

const replacements = [
  [
    "import { DEFAULT_TASK_STAGE_TITLES, getProjectTemplateConfig } from '../../entities/project/config/projectTemplates'",
    "import { DEFAULT_TASK_STAGE_TITLES, getProjectTemplateConfig } from '../../../entities/project/config/projectTemplates'"
  ],
  [
    "import { decodeTargetPayload, encodeTargetPayload, formatActivityFieldDisplay, isoDateToMonthDay } from '../../features/project-detail/tasks/projectTaskAdapter'",
    "import { decodeTargetPayload, encodeTargetPayload, formatActivityFieldDisplay, isoDateToMonthDay } from './projectTaskAdapter'"
  ],
  [
    "import { ActivityParticipantActivityBody, filterActivityFeedItems } from '../../features/project-detail/shared/activityParticipantActivity'",
    "import { ActivityParticipantActivityBody, filterActivityFeedItems } from '../shared/activityParticipantActivity'"
  ],
  [
    "import { ActivityParticipantActivityBody, filterActivityFeedItems } from './ActivityParticipantActivity'",
    "import { ActivityParticipantActivityBody, filterActivityFeedItems } from '../shared/activityParticipantActivity'"
  ],
  [
    "import { TargetFeedCommentComposer } from '../../features/project-detail/TargetFeedCommentComposer'",
    "import { TargetFeedCommentComposer } from '../TargetFeedCommentComposer'"
  ],
  [
    "import { PriorityWithMarks, TASK_PRIORITY_LEVELS, type TaskPriorityLevel } from '../../shared/ui/priorityWithMarks'",
    "import { PriorityWithMarks, TASK_PRIORITY_LEVELS, type TaskPriorityLevel } from '../../../shared/ui/priorityWithMarks'"
  ],
  [
    "import { UNIFIED_OWNER_AVATAR_CLASS, UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials, WorkflowStatusEditorRing } from '../../shared/ui/unifiedWorkflowStatusTag'",
    "import { UNIFIED_OWNER_AVATAR_CLASS, UnifiedWorkflowStatusTag, unifiedOwnerAvatarInitials, WorkflowStatusEditorRing } from '../../../shared/ui/unifiedWorkflowStatusTag'"
  ],
  [
    "import type { ProjectOverviewInfo } from '../../features/project-detail/overview/overviewTypes'",
    "import type { ProjectOverviewInfo } from '../overview/overviewTypes'"
  ],
  [
    "import type { TargetSideTab } from '../../features/project-detail/targets/targetTypes'",
    "import type { TargetSideTab } from '../targets/targetTypes'"
  ],
  [
    "import type { TaskEditorTab, TaskManageRecord } from '../../features/project-detail/tasks/taskTypes'",
    "import type { TaskEditorTab, TaskManageRecord } from './taskTypes'"
  ],
  [
    "import type { WorkspaceActivityRecord } from '../../features/project-detail/hooks/useProjectDetailWorkspace'",
    "import type { WorkspaceActivityRecord } from '../hooks/useProjectDetailWorkspace'"
  ],
  [
    "import type { TargetCommentRecord } from '../../entities/target-feed/model/useTargetFeedStore'",
    "import type { TargetCommentRecord } from '../../../entities/target-feed/model/useTargetFeedStore'"
  ]
]

for (const [from, to] of replacements) {
  content = content.split(from).join(to)
}

fs.mkdirSync(path.dirname(dst), { recursive: true })
fs.writeFileSync(dst, content, 'utf8')

fs.writeFileSync(
  pageReexport,
  `/** @deprecated Import from \`features/project-detail/tasks\` */\nexport {\n  TaskManageEditorModal,\n  type TaskManageEditorModalProps,\n  type PersonalDeskSubtaskKind,\n  type SubtaskCreateTaskType,\n  type TaskEditorSubtask,\n  type CreateSubtaskOptions\n} from '../../features/project-detail/tasks/TaskManageEditorModal'\n`,
  'utf8'
)

console.log('Migrated TaskManageEditorModal -> features/project-detail/tasks/')
