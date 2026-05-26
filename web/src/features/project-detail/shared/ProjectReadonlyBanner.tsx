export type ProjectReadonlyBannerProps = {
  isProjectArchived: boolean
  isPublicProjectReadonlyBySystem: boolean
  isProjectReadonlyByRole: boolean
}

const bannerStyle = {
  marginBottom: 10,
  padding: '8px 12px',
  border: '1px solid #ffe58f',
  background: '#fffbe6',
  color: '#ad6800',
  borderRadius: 6,
} as const

/** 项目只读提示条（归档 / 公开项目非成员 / 只读角色） */
export function ProjectReadonlyBanner({
  isProjectArchived,
  isPublicProjectReadonlyBySystem,
  isProjectReadonlyByRole,
}: ProjectReadonlyBannerProps) {
  if (isProjectArchived) {
    return <div style={bannerStyle}>项目已归档，当前项目内信息为只读状态。</div>
  }
  if (isPublicProjectReadonlyBySystem) {
    return (
      <div style={bannerStyle}>
        公开项目所有人可查看；仅项目成员可编辑。您不是该项目成员，当前为只读。
      </div>
    )
  }
  if (isProjectReadonlyByRole) {
    return <div style={bannerStyle}>当前角色为只读成员，当前项目内信息为只读状态。</div>
  }
  return null
}
