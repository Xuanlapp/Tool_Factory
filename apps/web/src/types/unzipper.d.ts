declare module 'unzipper' {
  type ZipEntry = { type: string; path: string; buffer(): Promise<Buffer> };
  export const Open: { buffer(input: Buffer): Promise<{ files: ZipEntry[] }> };
}
