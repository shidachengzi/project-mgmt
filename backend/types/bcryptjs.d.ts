declare module 'bcryptjs' {
  export function hash(data: string | Buffer, saltOrRounds: string | number): Promise<string>
  export function hashSync(data: string | Buffer, saltOrRounds: string | number): string
  export function compare(data: string | Buffer, encrypted: string): Promise<boolean>
  export function compareSync(data: string | Buffer, encrypted: string): boolean

  const bcrypt: {
    hash: typeof hash
    hashSync: typeof hashSync
    compare: typeof compare
    compareSync: typeof compareSync
  }

  export default bcrypt
}
