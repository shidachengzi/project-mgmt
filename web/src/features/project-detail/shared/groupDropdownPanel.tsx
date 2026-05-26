import { Checkbox, Divider } from 'antd'
import type { ReactNode } from 'react'

/** 分组下拉：菜单 +「显示空分组」置于同一白底面板内，避免 footer 溢出到弹层外 */
export function renderGroupDropdownPanel(menu: ReactNode, showEmpty: boolean, onShowEmptyChange: (checked: boolean) => void) {
  return (
    <div className="wt-target-group-dropdown-panel">
      <div className="wt-target-group-dropdown-panel__menu">{menu}</div>
      <Divider className="wt-target-group-dropdown-panel__divider" />
      <div className="wt-target-group-dropdown-panel__footer">
        <Checkbox checked={showEmpty} onChange={e => onShowEmptyChange(e.target.checked)}>
          显示空分组
        </Checkbox>
      </div>
    </div>
  )
}
