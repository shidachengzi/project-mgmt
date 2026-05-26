export type AccountProfile = {
  name: string
  code: string
  email: string
  phone: string
  avatarDataUrl?: string
}

export type AccountLoginLog = {
  id: string
  location: string
  platform: string
  device: string
  time: string
}
