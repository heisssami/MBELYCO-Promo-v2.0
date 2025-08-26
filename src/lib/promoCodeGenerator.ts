export class PromoCodeGenerator {
  static generate(createdAt: Date = new Date()): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const r = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const YY = createdAt.getFullYear().toString().slice(-2)
    const MM = String(createdAt.getMonth() + 1).padStart(2, '0')
    const DD = String(createdAt.getDate()).padStart(2, '0')
    return `${r(4)}-${r(2)}${YY}-${r(2)}${MM}-${r(2)}${DD}`
  }
}
